import { request } from '@hydrooj/ui-default';

declare const UiContext: {
    learning?: {
        tutorEnabled?: boolean;
        tutor?: { hintUrl?: string; pid?: string };
    };
    aiAssistant?: {
        enabled?: boolean;
    };
};

declare global {
    interface Window {
        FishOJProblemIde?: {
            getSnapshot: () => {
                pid: string;
                language: string;
                code: string;
                cases: Array<{ input: string; expected: string }>;
                lastRun?: {
                    type: string;
                    input?: string;
                    expected?: string;
                    stdout?: string;
                    stderr?: string;
                    status?: string;
                };
            };
        };
    }
}

const TUTOR_ENABLED_CHANGE = 'cf-tutor-enabled-change';
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

function examplesFromDom() {
    const host = document.getElementById('problemIdeProblemContent');
    if (!host) return [] as Array<{ input: string; output: string }>;
    const stacks = host.querySelectorAll('.problem-ide-sample-stack');
    const out: Array<{ input: string; output: string }> = [];
    stacks.forEach((stack) => {
        const cols = stack.querySelectorAll(':scope > .sample');
        const pre = (el: Element | undefined) => (el?.querySelector('pre')?.textContent || '').replace(/\n$/, '');
        if (cols[0]) out.push({ input: pre(cols[0]), output: pre(cols[1]) });
    });
    return out.slice(0, 4);
}

/**
 * 编程小助手 AiTutor 全局单例管理器。
 * 提供 mount / unmount 接口，方便 IDE 右上角开关停用。
 * 全局事件监听只在控制器构造时安装一次，避免反复挂卸造成的内存/事件泄漏。
 */
class AiTutorController {
    private mounted = false;
    private root: HTMLDivElement | null = null;
    private hintUrl = '';
    private pid = '';
    private busy = false;
    private failStreak = 0;
    private lastCode = '';
    private quietUntil = 0;
    /** 等待挂载的提示请求：用于在编程小助手关闭时被灯泡按钮强制打开后再请求提示 */
    private pendingHintRequest = false;

    /** DOM 节点 ref：仅在 mounted 时有效 */
    private panel: HTMLElement | null = null;
    private body: HTMLElement | null = null;
    private meta: HTMLElement | null = null;
    private fab: HTMLButtonElement | null = null;
    private offer: HTMLElement | null = null;

    constructor() {
        this.installGlobalListeners();
    }

    /** 用户启用了编程小助手 */
    mount(): boolean {
        if (this.mounted) return true;
        if (!readTutorEnabled()) return false;

        const root = document.createElement('div');
        root.className = 'fish-tutor';
        root.innerHTML = `
          <div class="fish-tutor-offer" id="fishTutorOffer" hidden>
            <div>好像在同一个地方遇到了一点麻烦。需要一个小线索吗？</div>
            <div class="fish-tutor__actions" style="padding:10px 0 0">
              <button type="button" class="fish-tutor__btn" id="fishTutorOfferNo">我再试试</button>
              <button type="button" class="fish-tutor__btn fish-tutor__btn--primary" id="fishTutorOfferYes">给我一个提示</button>
            </div>
          </div>
          <div class="fish-tutor__panel" id="fishTutorPanel" hidden>
            <div class="fish-tutor__head">
              <span>编程小助手</span>
              <button type="button" class="fish-tutor__close" id="fishTutorClose" aria-label="关闭">×</button>
            </div>
            <div class="fish-tutor__body" id="fishTutorBody">需要提示时点下面按钮，我会用简单的话问你一个问题。</div>
            <div class="fish-tutor__meta" id="fishTutorMeta"></div>
            <div class="fish-tutor__actions">
              <button type="button" class="fish-tutor__btn" id="fishTutorDismiss">我再想想</button>
              <button type="button" class="fish-tutor__btn fish-tutor__btn--primary" id="fishTutorMore">给我提示</button>
            </div>
            <div class="fish-tutor__ask">
              <input id="fishTutorAsk" placeholder="你也可以问我……" maxlength="200" />
            </div>
          </div>
          <button type="button" class="fish-tutor__fab" id="fishTutorFab" data-state="idle" title="编程小助手">🤖</button>
        `;
        document.body.appendChild(root);
        this.root = root;

        const embedInAssistant = UiContext.aiAssistant?.enabled === true;
        if (embedInAssistant) {
            root.classList.add('fish-tutor--fab-hidden');
        }

        this.panel = document.getElementById('fishTutorPanel');
        this.body = document.getElementById('fishTutorBody');
        this.meta = document.getElementById('fishTutorMeta');
        this.fab = document.getElementById('fishTutorFab') as HTMLButtonElement | null;
        this.offer = document.getElementById('fishTutorOffer');

        this.bindInnerEvents();
        this.mounted = true;

        // 若 mount 是因外部「请我打开」触发，挂载完立即请求一次提示
        if (this.pendingHintRequest) {
            this.pendingHintRequest = false;
            window.setTimeout(() => void this.askHint('auto_reopen'), 0);
        }

        return true;
    }

    /** 用户关闭了编程小助手 */
    unmount(): void {
        if (!this.mounted) return;
        try {
            this.root?.remove();
        } catch {
            /* ignore */
        }
        this.root = null;
        this.panel = null;
        this.body = null;
        this.meta = null;
        this.fab = null;
        this.offer = null;
        this.mounted = false;
    }

    isMounted(): boolean {
        return this.mounted;
    }

    /** 由右上角开关事件分发 */
    applyEnabled(enabled: boolean): void {
        if (enabled) {
            const mounted = this.mount();
            if (!mounted) {
                // mount 失败（例如开关读取失败）：下次开关再次开启时再尝试
            }
        } else {
            this.unmount();
        }
    }

    private setState(s: string): void {
        if (this.fab) this.fab.dataset.state = s;
    }

    private openPanel(): void {
        this.panel?.removeAttribute('hidden');
    }

    private closePanel(): void {
        this.panel?.setAttribute('hidden', '');
    }

    private bindInnerEvents(): void {
        this.fab?.addEventListener('click', () => {
            if (this.panel?.hasAttribute('hidden')) this.openPanel();
            else this.closePanel();
        });
        document.getElementById('fishTutorClose')?.addEventListener('click', () => this.closePanel());
        document.getElementById('fishTutorDismiss')?.addEventListener('click', () => this.closePanel());

        document.getElementById('fishTutorMore')?.addEventListener('click', () => void this.askHint('user_help'));
        document.getElementById('fishTutorAsk')?.addEventListener('keydown', (ev) => {
            if ((ev as KeyboardEvent).key === 'Enter') void this.askHint('user_help');
        });
        document.getElementById('fishTutorOfferYes')?.addEventListener('click', () => {
            this.offer?.setAttribute('hidden', '');
            void this.askHint('user_help');
        });
        document.getElementById('fishTutorOfferNo')?.addEventListener('click', () => {
            this.offer?.setAttribute('hidden', '');
            this.quietUntil = Date.now() + 3 * 60 * 1000;
            this.setState('idle');
        });
    }

    private installGlobalListeners(): void {
        document.addEventListener('problem-ide-hint-request', () => {
            if (!readTutorEnabled() || !this.mounted) return;
            void this.askHint('user_help');
        });

        document.addEventListener('problem-ide-tutor-open', ((ev: Event) => {
            const d = (ev as CustomEvent<{ requestHint?: boolean }>).detail || {};
            if (!readTutorEnabled()) {
                // 用户在右上角关闭了编程小助手，但上游仍派发了 open。
                // 我们让 AiAssistant 的灯泡按钮提前把开关恢复了，这里直接当作没启用处理。
                return;
            }
            if (!this.mounted) {
                // 极端 race：开关被设为 enabled 但 mount 还没完成（来自 AiAssistant 灯泡按钮的 auto-enable）。
                this.pendingHintRequest = d.requestHint !== false;
                return;
            }
            this.openPanel();
            if (d.requestHint !== false) void this.askHint('user_help');
        }) as EventListener);

        document.addEventListener('problem-ide-run-result', ((ev: Event) => {
            if (!readTutorEnabled() || !this.mounted) return;
            const d = (ev as CustomEvent<{ status?: string; stdout?: string }>).detail || {};
            const st = (d.status || '').toUpperCase();
            const snap = window.FishOJProblemIde?.getSnapshot?.();
            const code = snap?.code || '';
            const similar = this.lastCode && code.replace(/\s+/g, '') === this.lastCode.replace(/\s+/g, '');
            this.lastCode = code;
            if (st.includes('ACCEPT')) {
                this.failStreak = 0;
                this.setState('ok');
                void this.askHint('accepted');
                return;
            }
            if (!st || st.includes('WAITING') || st.includes('JUDGING')) return;
            this.failStreak = similar ? this.failStreak + 1 : 1;
            this.setState('watch');
            if (this.failStreak >= 3 && Date.now() > this.quietUntil) {
                this.offer?.removeAttribute('hidden');
                this.setState('hint');
            }
        }) as EventListener);

        document.addEventListener('problem-ide-submit-result', ((ev: Event) => {
            if (!readTutorEnabled() || !this.mounted) return;
            const d = (ev as CustomEvent<{ status?: string }>).detail || {};
            if ((d.status || '').toUpperCase().includes('ACCEPT')) {
                this.setState('ok');
                void this.askHint('accepted');
            }
        }) as EventListener);
    }

    private async askHint(trigger: string): Promise<void> {
        if (this.busy) return;
        if (!readTutorEnabled() || !this.mounted) return;
        const snap = window.FishOJProblemIde?.getSnapshot?.();
        if (!snap) {
            if (this.body) this.body.textContent = '编辑器还没准备好。';
            this.openPanel();
            return;
        }
        this.busy = true;
        this.setState('busy');
        if (this.body) this.body.textContent = '正在看你的代码和运行结果…';
        this.openPanel();
        try {
            const res = await request.post(this.hintUrl, {
                pid: snap.pid || this.pid,
                language: snap.language,
                code: snap.code,
                trigger,
                runType: snap.lastRun?.type || '',
                runInput: snap.lastRun?.input || '',
                runExpected: snap.lastRun?.expected || '',
                runStdout: snap.lastRun?.stdout || '',
                runStderr: snap.lastRun?.stderr || '',
                runStatus: snap.lastRun?.status || '',
                examplesJson: JSON.stringify(examplesFromDom().length ? examplesFromDom() : snap.cases.map((c) => ({
                    input: c.input, output: c.expected,
                }))),
            }) as {
                ok?: boolean;
                message?: string;
                level?: number;
                category?: string;
                progressSummary?: string;
                error?: string;
            };
            if (!res?.ok) {
                if (this.body) this.body.textContent = res?.error || '小助手暂时没有生成提示，你可以先看看样例输入和自己的运行结果。';
                this.setState('idle');
                return;
            }
            if (this.body) this.body.textContent = res.message || '';
            if (this.meta) {
                this.meta.textContent = res.level ? `提示 H${res.level}` : '';
            }
            this.setState((snap.lastRun?.status || '').toUpperCase().includes('ACCEPT') ? 'ok' : 'hint');
        } catch {
            if (this.body) this.body.textContent = '小助手暂时没有生成提示，你可以先看看样例输入和自己的运行结果。';
            this.setState('idle');
        } finally {
            this.busy = false;
        }
    }
}

let controller: AiTutorController | null = null;
let toggleListenerInstalled = false;

function getController(): AiTutorController {
    if (!controller) controller = new AiTutorController();
    return controller;
}

function installToggleListener() {
    if (toggleListenerInstalled) return;
    toggleListenerInstalled = true;
    window.addEventListener(TUTOR_ENABLED_CHANGE, ((ev: Event) => {
        const detail = (ev as CustomEvent<{ enabled?: boolean }>).detail;
        if (!detail || typeof detail.enabled !== 'boolean') return;
        getController().applyEnabled(detail.enabled);
    }) as EventListener);
}

export function initAiTutor() {
    const cfg = UiContext.learning;
    if (!cfg?.tutorEnabled || !cfg.tutor?.hintUrl) return;
    installToggleListener();
    const ctrl = getController();
    ctrl.hintUrl = cfg.tutor.hintUrl;
    ctrl.pid = cfg.tutor.pid || '';
    // 初始按开关状态挂载：开关关闭时不会渲染 UI，全局事件监听已在 controller 构造时挂上
    if (readTutorEnabled()) {
        ctrl.mount();
    }
}
