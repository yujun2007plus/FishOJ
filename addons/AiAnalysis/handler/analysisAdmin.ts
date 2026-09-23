import { Handler, PRIV } from 'hydrooj';
import { RECORD_AI_ANALYSIS_CACHE_TTL_MS } from '../lib/cache';
import {
    AI_ANALYSIS_DAILY_LIMIT_DEFAULT,
    getStoredAnalysisSettings,
    saveAnalysisSettings,
} from '../lib/analysisSettings';

function localTodayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class AiAnalysisAdminHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get() {
        const stored = getStoredAnalysisSettings();
        const cacheCount = await this.ctx.db.collection('fish_ai_analysis_cache').countDocuments({});
        const logCount = await this.ctx.db.collection('fish_ai_analysis_log').countDocuments({});
        const todayUsage = await this.ctx.db.collection('fish_ai_analysis_daily').aggregate([
            { $match: { date: localTodayStr() } },
            { $group: { _id: null, total: { $sum: '$count' } } },
        ]).toArray();
        const todayTotal = todayUsage[0]?.total ?? 0;
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
        this.response.template = 'manage_ai_analysis.html';
        this.response.body = {
            page_name: 'manage_ai_analysis',
            stored,
            defaultDailyLimit: AI_ANALYSIS_DAILY_LIMIT_DEFAULT,
            cacheCount,
            logCount,
            todayTotal,
            cacheTtlHours: Math.round(RECORD_AI_ANALYSIS_CACHE_TTL_MS / 3600000),
            llmConfigured,
            apiKeyMasked,
            apiKeySource: storedApiKey ? 'panel' : envKey ? 'env' : 'none',
            llmNote: '密钥优先级：本页填写的 Key ＞ 环境变量 DEEPSEEK_API_KEY / BUILTIN_API_KEY。留空则回退到环境变量。',
        };
    }

    async post() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const a = this.args as Record<string, unknown>;
        const op = String(a.operation || 'save');
        if (op === 'clear_cache') {
            await this.ctx.db.collection('fish_ai_analysis_cache').deleteMany({});
            this.back();
            return;
        }
        const enabled = a.enabled === '1' || a.enabled === true || a.enabled === 'on';
        const rawLimit = Number(a.daily_limit);
        // 密码框留空表示不改已保存密钥（表单总会提交该字段）
        const rawApiKey = typeof a.api_key === 'string' ? a.api_key.trim() : '';
        await saveAnalysisSettings({
            enabled,
            dailyLimit: Number.isFinite(rawLimit) && rawLimit > 0
                ? rawLimit
                : getStoredAnalysisSettings().dailyLimit,
            ...(rawApiKey ? { apiKey: rawApiKey } : {}),
        });
        this.back();
    }
}
