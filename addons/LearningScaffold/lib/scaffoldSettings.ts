import { SystemModel } from 'hydrooj';

/** 脚手架生成器 LLM 配置键（与 AiTutor / AiAnalysis 的 fishoj.* 设置同风格，独立开关） */
export const SCAFFOLD_SETTING_KEYS = {
    apiKey: 'fishoj.scaffold.api_key',
    baseUrl: 'fishoj.scaffold.base_url',
    model: 'fishoj.scaffold.model',
} as const;

export const SCAFFOLD_SETTING_DEFAULTS = {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-flash',
};

function stored(key: string): string {
    try {
        return String(SystemModel.get(key) || '');
    } catch {
        return '';
    }
}

/** 管理面板表单只读库里的值，不受环境变量覆盖。 */
export function getStoredScaffoldSettings() {
    return {
        apiKey: stored(SCAFFOLD_SETTING_KEYS.apiKey),
        baseUrl: stored(SCAFFOLD_SETTING_KEYS.baseUrl) || SCAFFOLD_SETTING_DEFAULTS.baseUrl,
        model: stored(SCAFFOLD_SETTING_KEYS.model) || SCAFFOLD_SETTING_DEFAULTS.model,
    };
}

/** 实际调用 LLM 用的配置：环境变量优先于面板，避免把密钥写进网页设置。 */
export function getEffectiveScaffoldSettings() {
    const env = process.env;
    const saved = getStoredScaffoldSettings();
    const key = env.FISHOJ_AI_API_KEY
        || env.OPENAI_API_KEY
        || env.DEEPSEEK_API_KEY
        || env.BUILTIN_API_KEY
        || saved.apiKey;
    const base = (env.FISHOJ_AI_BASE_URL || saved.baseUrl).replace(/\/$/, '');
    const model = env.FISHOJ_AI_MODEL || saved.model;
    const fromEnv = {
        apiKey: !!(env.FISHOJ_AI_API_KEY || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY || env.BUILTIN_API_KEY),
        baseUrl: !!env.FISHOJ_AI_BASE_URL,
        model: !!env.FISHOJ_AI_MODEL,
    };
    return { key, base, model, fromEnv };
}

export function maskApiKey(key: string): string {
    const s = String(key || '');
    if (!s) return '';
    if (s.length <= 4) return '****';
    return `****${s.slice(-4)}`;
}

export async function saveScaffoldSettings(patch: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}) {
    const tasks: Array<Promise<unknown>> = [];
    if (patch.apiKey != null && patch.apiKey !== '') {
        tasks.push(SystemModel.set(SCAFFOLD_SETTING_KEYS.apiKey, patch.apiKey));
    }
    if (patch.baseUrl != null) {
        const base = patch.baseUrl.trim() || SCAFFOLD_SETTING_DEFAULTS.baseUrl;
        tasks.push(SystemModel.set(SCAFFOLD_SETTING_KEYS.baseUrl, base.replace(/\/$/, '')));
    }
    if (patch.model != null) {
        const model = patch.model.trim() || SCAFFOLD_SETTING_DEFAULTS.model;
        tasks.push(SystemModel.set(SCAFFOLD_SETTING_KEYS.model, model));
    }
    await Promise.all(tasks);
}
