import { Handler, param, PRIV, Types } from 'hydrooj';
import {
    getEffectiveScaffoldSettings,
    getStoredScaffoldSettings,
    maskApiKey,
    saveScaffoldSettings,
} from '../lib/scaffoldSettings';

/** 脚手架生成器 LLM 配置管理页（对齐 AiTutor 的 manage_ai_tutor） */
export class ScaffoldSettingsHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get() {
        const stored = getStoredScaffoldSettings();
        const effective = getEffectiveScaffoldSettings();
        this.response.template = 'manage_scaffold.html';
        this.response.body = {
            page_name: 'manage_scaffold',
            stored,
            apiKeyMasked: maskApiKey(stored.apiKey),
            apiKeySet: !!stored.apiKey,
            fromEnv: effective.fromEnv,
            effectiveModel: effective.model,
            effectiveBase: effective.base,
        };
    }

    @param('api_key', Types.String, true)
    @param('base_url', Types.String, true)
    @param('model', Types.String, true)
    async post(_domainId: string, apiKey = '', baseUrl = '', model = '') {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await saveScaffoldSettings({ apiKey, baseUrl, model });
        this.back();
    }
}
