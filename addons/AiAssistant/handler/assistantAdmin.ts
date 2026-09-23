import { Handler, param, PRIV, Types } from 'hydrooj';
import { ASSISTANT_RATE_LIMIT } from '../backend/config/assistant-rate-limit.config';
import { getStoredAssistantSettings, saveAssistantSettings } from '../lib/assistantSettings';

export class AiAssistantAdminHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get() {
        const stored = getStoredAssistantSettings();
        let conversationCount = 0;
        try {
            conversationCount = await this.ctx.db.collection('note_assistant_conversation').countDocuments({});
        } catch {
            conversationCount = 0;
        }
        const storedApiKey = String(stored.apiKey || '').trim();
        let envKey = '';
        try {
            envKey = String(process.env.DEEPSEEK_API_KEY || process.env.BUILTIN_API_KEY || '').trim();
        } catch {
            envKey = '';
        }
        const llmConfigured = Boolean(storedApiKey || envKey);
        const apiKeyMasked = storedApiKey
            ? `${storedApiKey.slice(0, 6)}****${storedApiKey.slice(-4)}`
            : '';
        this.response.template = 'manage_ai_assistant.html';
        this.response.body = {
            page_name: 'manage_ai_assistant',
            stored,
            rateLimit: ASSISTANT_RATE_LIMIT,
            conversationCount,
            llmConfigured,
            apiKeyMasked,
            apiKeySource: storedApiKey ? 'panel' : envKey ? 'env' : 'none',
            llmNote: '密钥优先级：本页填写的 Key ＞ 环境变量 DEEPSEEK_API_KEY / BUILTIN_API_KEY。留空则回退到环境变量。FishOJ 暂无点数钱包，助教侧仅全站开关 + 内存限频。',
        };
    }

    @param('enabled', Types.Boolean, true)
    async post(_domainId: string, _enabled?: boolean) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const a = this.args as Record<string, unknown>;
        const enabled = a.enabled === '1' || a.enabled === true || a.enabled === 'on';
        // 密码框留空表示不改已保存密钥（表单总会提交该字段）
        const rawApiKey = typeof a.api_key === 'string' ? a.api_key.trim() : '';
        await saveAssistantSettings({
            enabled,
            ...(rawApiKey ? { apiKey: rawApiKey } : {}),
        });
        this.back();
    }
}
