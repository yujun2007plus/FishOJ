import { SystemModel } from 'hydrooj';

export const AI_ANALYSIS_DAILY_LIMIT_DEFAULT = 20;

export const ANALYSIS_SETTING_KEYS = {
    enabled: 'fishoj.aianalysis.enabled',
    dailyLimit: 'fishoj.aianalysis.daily_limit',
    apiKey: 'fishoj.aianalysis.api_key',
} as const;

function stored(key: string): string {
    try {
        return String(SystemModel.get(key) || '');
    } catch {
        return '';
    }
}

export function getStoredAnalysisSettings() {
    const rawLimit = stored(ANALYSIS_SETTING_KEYS.dailyLimit);
    const n = Number(rawLimit);
    const dailyLimit = Number.isFinite(n) && n > 0
        ? Math.floor(n)
        : AI_ANALYSIS_DAILY_LIMIT_DEFAULT;
    const rawEnabled = stored(ANALYSIS_SETTING_KEYS.enabled);
    return {
        enabled: rawEnabled !== '0' && rawEnabled !== 'false',
        dailyLimit,
        apiKey: stored(ANALYSIS_SETTING_KEYS.apiKey),
    };
}

export async function saveAnalysisSettings(
    patch: { enabled?: boolean; dailyLimit?: number; apiKey?: string },
) {
    const tasks: Array<Promise<unknown>> = [];
    if (patch.enabled != null) {
        tasks.push(SystemModel.set(ANALYSIS_SETTING_KEYS.enabled, patch.enabled ? '1' : '0'));
    }
    if (patch.dailyLimit != null) {
        const n = Math.max(1, Math.floor(Number(patch.dailyLimit) || AI_ANALYSIS_DAILY_LIMIT_DEFAULT));
        tasks.push(SystemModel.set(ANALYSIS_SETTING_KEYS.dailyLimit, String(n)));
    }
    if (patch.apiKey != null) {
        tasks.push(SystemModel.set(ANALYSIS_SETTING_KEYS.apiKey, String(patch.apiKey).trim()));
    }
    await Promise.all(tasks);
}

/**
 * 读取管理员在「AI 分析管理」面板中填写的大模型 API Key。
 * aiChatClient 用它作为最高优先级的密钥来源。
 */
export function resolveStoredAnalysisApiKey(): string {
    return stored(ANALYSIS_SETTING_KEYS.apiKey);
}

export function isAnalysisEnabledFromSettings(): boolean {
    return getStoredAnalysisSettings().enabled;
}

export function configuredDailyAnalysisLimit(): number {
    return getStoredAnalysisSettings().dailyLimit;
}
