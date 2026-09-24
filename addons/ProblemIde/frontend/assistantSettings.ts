/**
 * IDE 右上角设置面板 ↔ AI 助教 / 编程小助手 显示开关。
 * 通过 window CustomEvent 与 AiAssistant / AiTutor 通信，禁止 import 对方模块。
 */

declare const UiContext: {
    aiAssistant?: {
        enabled?: boolean;
        scene?: string;
    };
    learning?: {
        tutorEnabled?: boolean;
    };
};

const ASSISTANT_DISMISSED_CHANGE = 'cf-assistant-dismissed-change';
const ASSISTANT_SET_DISMISSED = 'cf-assistant-set-dismissed';

const TUTOR_ENABLED_CHANGE = 'cf-tutor-enabled-change';
const TUTOR_SET_ENABLED = 'cf-tutor-set-enabled';

const TUTOR_ENABLED_STORAGE_KEY = 'fishoj.tutor.enabled';

function readTutorEnabled(): boolean {
    try {
        const raw = window.localStorage.getItem(TUTOR_ENABLED_STORAGE_KEY);
        if (raw === '0' || raw === 'false') return false;
    } catch {
        /* ignore */
    }
    return true;
}

function writeTutorEnabled(enabled: boolean): void {
    try {
        if (enabled) window.localStorage.removeItem(TUTOR_ENABLED_STORAGE_KEY);
        else window.localStorage.setItem(TUTOR_ENABLED_STORAGE_KEY, '0');
    } catch {
        /* ignore */
    }
}

export function initAssistantSettingsToggle(): void {
    const assistantEnabled = UiContext.aiAssistant?.enabled === true;
    const tutorEnabled = UiContext.learning?.tutorEnabled === true;

    // —— AI 助教开关 ——
    if (assistantEnabled) {
        const toggle = document.getElementById('problemIdeAssistantToggle') as HTMLInputElement | null;
        if (toggle) {
            const scene = UiContext.aiAssistant.scene || 'acm-problem';
            const syncFromAssistant = (dismissed: boolean) => {
                toggle.checked = !dismissed;
            };
            window.addEventListener(ASSISTANT_DISMISSED_CHANGE, ((ev: Event) => {
                const d = (ev as CustomEvent<{ scene?: string; dismissed?: boolean }>).detail;
                if (d?.scene !== scene || typeof d.dismissed !== 'boolean') return;
                syncFromAssistant(d.dismissed);
            }) as EventListener);
            toggle.addEventListener('change', () => {
                window.dispatchEvent(new CustomEvent(ASSISTANT_SET_DISMISSED, {
                    detail: { scene, dismissed: !toggle.checked },
                }));
            });
        }
    }

    // —— 编程小助手开关 ——
    if (tutorEnabled) {
        const toggle = document.getElementById('problemIdeTutorToggle') as HTMLInputElement | null;
        if (toggle) {
            // 初始化：从 localStorage 读取用户偏好
            toggle.checked = readTutorEnabled();
            // 触发一次同步，让 AiTutor 在初始挂载时遵循开关
            window.dispatchEvent(new CustomEvent(TUTOR_ENABLED_CHANGE, {
                detail: { enabled: toggle.checked },
            }));

            toggle.addEventListener('change', () => {
                const next = toggle.checked === true;
                writeTutorEnabled(next);
                window.dispatchEvent(new CustomEvent(TUTOR_ENABLED_CHANGE, {
                    detail: { enabled: next },
                }));
            });
        }
    }
}
