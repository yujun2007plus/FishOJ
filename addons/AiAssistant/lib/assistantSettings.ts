import { SystemModel } from 'hydrooj';

export const ASSISTANT_SETTING_KEYS = {
    enabled: 'fishoj.aiassistant.enabled',
    apiKey: 'fishoj.aiassistant.api_key',
} as const;

function stored(key: string): string {
    try {
        return String(SystemModel.get(key) || '');
    } catch {
        return '';
    }
}

export function getStoredAssistantSettings() {
    const raw = stored(ASSISTANT_SETTING_KEYS.enabled);
    return {
        /** 未写入或为空时默认开启 */
        enabled: raw !== '0' && raw !== 'false',
        apiKey: stored(ASSISTANT_SETTING_KEYS.apiKey),
    };
}

export async function saveAssistantSettings(patch: { enabled?: boolean; apiKey?: string }) {
    const tasks: Array<Promise<unknown>> = [];
    if (patch.enabled != null) {
        tasks.push(SystemModel.set(ASSISTANT_SETTING_KEYS.enabled, patch.enabled ? '1' : '0'));
    }
    if (patch.apiKey != null) {
        tasks.push(SystemModel.set(ASSISTANT_SETTING_KEYS.apiKey, String(patch.apiKey).trim()));
    }
    await Promise.all(tasks);
}

/**
 * 读取管理员在「AI 助教管理」面板中填写的大模型 API Key。
 * aiChatClient 用它作为最高优先级的密钥来源。
 */
export function resolveStoredAssistantApiKey(): string {
    return stored(ASSISTANT_SETTING_KEYS.apiKey);
}

export function isAssistantEnabledFromSettings(): boolean {
    return getStoredAssistantSettings().enabled;
}
