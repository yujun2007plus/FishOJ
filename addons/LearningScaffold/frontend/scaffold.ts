import { Notification, request } from '@hydrooj/ui-default';

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
            hasMeaningfulCode: () => boolean;
        };
    }
}

const MODE_KEY = (pid: string) => `fish_scaffold_mode_${pid}`;

function getLearningConfig() {
    const ctx = (window as any).UiContext;
    if (!ctx) return null;
    if (typeof ctx === 'string') {
        try {
            return JSON.parse(ctx).learning;
        } catch {
            return null;
        }
    }
    return ctx.learning;
}

function applyCode(code: string, force = false) {
    document.dispatchEvent(new CustomEvent('problem-ide-apply-code', {
        detail: { code, force },
    }));
}

function currentLang() {
    return (document.getElementById('problemIdeLang') as HTMLSelectElement | null)?.value || 'py.py3';
}

function hasHostCode() {
    return window.FishOJProblemIde?.hasMeaningfulCode?.() === true;
}

export function initLearningScaffold() {
    const cfg = getLearningConfig();
    if (!cfg?.scaffoldEnabled || !cfg.scaffold?.pid) return;

    const pid = cfg.scaffold.pid;

    const mount = document.createElement('div');
    mount.innerHTML = `
      <div class="fish-scaffold-modal" id="fishScaffoldModal" hidden>
        <div class="fish-scaffold-modal__mask" data-role="dismiss"></div>
        <div class="fish-scaffold-modal__card" role="dialog" aria-labelledby="fishScaffoldTitle">
          <h2 class="fish-scaffold-modal__title" id="fishScaffoldTitle">这次想怎么挑战？</h2>
          <p class="fish-scaffold-modal__sub">选一种开始方式。已经写好的代码不会被悄悄覆盖。</p>
          <div class="fish-scaffold-modal__opts">
            <button type="button" class="fish-scaffold-opt" data-mode="0">
              <span class="fish-scaffold-opt__emoji">🚀</span>
              <span><span class="fish-scaffold-opt__title">自己挑战</span>
              <div class="fish-scaffold-opt__desc">从头开始，我想自己想办法</div></span>
            </button>
            <button type="button" class="fish-scaffold-opt" data-mode="1">
              <span class="fish-scaffold-opt__emoji">🧩</span>
              <span><span class="fish-scaffold-opt__title">给我一点框架</span>
              <div class="fish-scaffold-opt__desc">帮我搭好程序的大致结构</div></span>
            </button>
            <button type="button" class="fish-scaffold-opt" data-mode="2">
              <span class="fish-scaffold-opt__emoji">🤝</span>
              <span><span class="fish-scaffold-opt__title">陪我一步一步做</span>
              <div class="fish-scaffold-opt__desc">先帮我完成基础部分，我完成最重要的地方</div></span>
            </button>
          </div>
        </div>
      </div>
      <div class="fish-scaffold-diff" id="fishScaffoldDiff" hidden>
        <div class="fish-scaffold-modal__mask" data-role="close-diff"></div>
        <div class="fish-scaffold-diff__card">
          <p>我们可以帮你补上框架，不会删除你已经写好的代码。确认后会<strong>整段替换为脚手架</strong>（请先自行备份需要的部分）。</p>
          <pre id="fishScaffoldDiffPre"></pre>
          <div class="fish-scaffold-diff__actions">
            <button type="button" class="problem-ide-toolbar__btn" data-role="close-diff">先不改</button>
            <button type="button" class="problem-ide-btn problem-ide-btn--run" id="fishScaffoldDiffApply">应用脚手架</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(mount);

    const modal = document.getElementById('fishScaffoldModal');
    const diff = document.getElementById('fishScaffoldDiff');
    const diffPre = document.getElementById('fishScaffoldDiffPre');
    let pendingCode = '';

    const closeDiff = () => diff?.setAttribute('hidden', '');
    mount.querySelectorAll('[data-role="close-diff"]').forEach((el) => {
        el.addEventListener('click', closeDiff);
    });

    async function selectMode(mode: number, opts?: { force?: boolean }) {
        try {
            const res = await request.post('/learning-scaffold/select', {
                pid,
                mode,
                language: currentLang(),
            }) as { ok?: boolean; code?: string; error?: string };
            if (!res?.ok) {
                Notification.error(res?.error || '无法获取脚手架');
                return;
            }
            localStorage.setItem(MODE_KEY(pid), String(mode));
            const code = String(res.code || '');
            const force = opts?.force === true;
            if (!force && hasHostCode()) {
                pendingCode = code;
                if (diffPre) diffPre.textContent = code;
                diff?.removeAttribute('hidden');
                return;
            }
            applyCode(code, true);
            Notification.success('已套用学习方式');
        } catch (e) {
            Notification.error(e instanceof Error ? e.message : '脚手架请求失败');
        }
    }

    document.getElementById('fishScaffoldDiffApply')?.addEventListener('click', () => {
        applyCode(pendingCode, true);
        closeDiff();
        Notification.success('已应用脚手架');
    });

    modal?.querySelectorAll('.fish-scaffold-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = Number((btn as HTMLElement).dataset.mode);
            modal.setAttribute('hidden', '');
            void selectMode(mode);
        });
    });

    document.addEventListener('problem-ide-scaffold-request', ((ev: Event) => {
        const detail = (ev as CustomEvent<{ mode?: number }>).detail || {};
        if (typeof detail.mode === 'number') void selectMode(detail.mode);
        else modal?.removeAttribute('hidden');
    }) as EventListener);

    document.addEventListener('problem-ide-apply-code-blocked', ((ev: Event) => {
        const requested = (ev as CustomEvent<{ requested?: string }>).detail?.requested || '';
        pendingCode = requested;
        if (diffPre) diffPre.textContent = requested;
        diff?.removeAttribute('hidden');
    }) as EventListener);

    const scaffoldBtn = document.getElementById('problemIdeScaffoldBtn');
    const openModal = () => {
        modal?.removeAttribute('hidden');
        modal?.querySelectorAll('.fish-scaffold-opt').forEach((opt) => {
            opt.classList.remove('fish-scaffold-opt--selected');
            const mode = Number((opt as HTMLElement).dataset.mode);
            if (String(localStorage.getItem(MODE_KEY(pid))) === String(mode)) {
                opt.classList.add('fish-scaffold-opt--selected');
            }
        });
    };
    if (scaffoldBtn) {
        scaffoldBtn.removeAttribute('hidden');
        scaffoldBtn.addEventListener('click', openModal);
    } else {
        const resetBtn = document.getElementById('problemIdeResetCodeBtn');
        if (resetBtn?.parentElement) {
            const changeBtn = document.createElement('button');
            changeBtn.type = 'button';
            changeBtn.className = 'problem-ide-toolbar__btn';
            changeBtn.textContent = '学习方式';
            changeBtn.title = '重新选择这次怎么挑战';
            changeBtn.addEventListener('click', openModal);
            resetBtn.insertAdjacentElement('afterend', changeBtn);
        }
    }
}
