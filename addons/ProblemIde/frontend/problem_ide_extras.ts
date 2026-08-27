import { Notification, request } from '@hydrooj/ui-default';

export function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function getCasePreviewFid(tc: any, origI: number): number {
    const n = Number(tc?.id ?? tc?.fid ?? origI + 1);
    return Number.isFinite(n) && n > 0 ? n : origI + 1;
}

export function injectStatementHeading() {
    const host = document.getElementById('problemIdeProblemContent');
    host?.querySelectorAll('.typo').forEach((el) => {
        el.classList.remove('typo');
        el.classList.add('markdown-body');
    });
    const tpl = document.getElementById('problemIdeStatementHeadingTpl') as HTMLTemplateElement | null;
    if (!tpl?.content) return;
    const html = tpl.innerHTML.trim();
    if (!html) return;
    document.querySelectorAll('#problemIdeProblemContent .problem_content').forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        el.classList.add('markdown-body');
        if (el.querySelector('.problem-ide-statement-title')) return;
        el.insertAdjacentHTML('afterbegin', html);
    });
    if (host && !host.querySelector('.problem-ide-statement-title')) {
        const body = host.querySelector('.section__body, .problem-content, .markdown-body') || host;
        body.insertAdjacentHTML('afterbegin', html);
    }
}

function samplePreText(pre: Element | null): string {
    if (!pre) return '';
    const code = pre.querySelector('code');
    return (code?.textContent ?? pre.textContent ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '');
}

function localizeSampleHeading(h2: Element) {
    const raw = (h2.textContent || '').replace(/\s+/g, ' ').trim();
    const input = raw.match(/^(?:Sample\s+)?(?:Input|样例输入|输入数据)(?:\s+#?)?(\d+)$/i);
    const output = raw.match(/^(?:Sample\s+)?(?:Output|样例输出|输出数据)(?:\s+#?)?(\d+)$/i);
    if (input) h2.textContent = `输入数据 ${input[1]}`;
    else if (output) h2.textContent = `输出数据 ${output[1]}`;
    else if (/^Sample\s+Input$/i.test(raw) || raw === '样例输入') h2.textContent = '输入数据';
    else if (/^Sample\s+Output$/i.test(raw) || raw === '样例输出') h2.textContent = '输出数据';
}

function stripSampleChrome(col: HTMLElement) {
    col.classList.remove('code-toolbar', 'medium-6', 'medium-12', 'small-12', 'columns');
    col.classList.add('sample');
}

function flattenSampleGrid(host: HTMLElement) {
    host.querySelectorAll('.row, .problem-ide-sample-row').forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        if (row.classList.contains('problem-ide-sample-stack')) return;
        const samples = Array.from(row.querySelectorAll(':scope > .sample')) as HTMLElement[];
        if (!samples.length) return;
        const stack = document.createElement('div');
        stack.className = 'problem-ide-sample-stack';
        for (const col of samples) {
            stripSampleChrome(col);
            stack.appendChild(col);
        }
        row.replaceWith(stack);
    });
    host.querySelectorAll('.sample').forEach((el) => {
        if (el instanceof HTMLElement) stripSampleChrome(el);
    });
}

function decorateSampleToolbar(col: HTMLElement) {
    const h2 = col.querySelector(':scope > h2, :scope > .problem-ide-sample-head > h2');
    if (h2) localizeSampleHeading(h2);
    if (col.querySelector('.problem-ide-sample-toolbar')) return;
    if (!h2) return;

    const head = document.createElement('div');
    head.className = 'problem-ide-sample-head';
    const bar = document.createElement('div');
    bar.className = 'problem-ide-sample-toolbar';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'problem-ide-sample-toolbar__btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const text = samplePreText(col.querySelector('pre'));
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            Notification.success('已复制');
        } catch {
            Notification.error('复制失败');
        }
    });

    const fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.className = 'problem-ide-sample-toolbar__btn';
    fillBtn.textContent = '填充到自测';
    fillBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = col.closest('.problem-ide-sample-stack, .problem-ide-sample-row, .row');
        const cols = row
            ? Array.from(row.querySelectorAll(':scope > .sample'))
            : [col];
        const inCol = cols[0] instanceof HTMLElement ? cols[0] : col;
        const outCol = cols[1] instanceof HTMLElement ? cols[1] : null;
        document.dispatchEvent(new CustomEvent('problem-ide-fill-pretest-case', {
            detail: {
                input: samplePreText(inCol.querySelector('pre')),
                expected: samplePreText(outCol?.querySelector('pre') ?? null),
            },
        }));
    });

    bar.append(copyBtn, fillBtn);
    h2.replaceWith(head);
    head.append(h2, bar);
}

/** Hydro highlighter：```input1 / ```output1 样例框（输入在上、输出在下，边框对齐） */
export function layoutStatementSamples() {
    const host = document.getElementById('problemIdeProblemContent');
    if (!host) return;

    const codes = Array.from(host.querySelectorAll('pre code'));
    for (const code of codes) {
        const m = (code.getAttribute('class') || '').match(/language-input(\d+)/);
        if (!m) continue;
        const id = m[1];
        const inPre = code.closest('pre');
        if (!inPre || inPre.closest('.sample, .problem-ide-sample-stack, .problem-ide-sample-row')) continue;

        const outCode = host.querySelector(`pre code.language-output${id}`);
        const outPre = (outCode?.closest('pre') || host.querySelector(`pre.language-output${id}`)) as HTMLElement | null;
        if (!outPre || outPre.closest('.sample, .problem-ide-sample-stack, .problem-ide-sample-row')) continue;

        const stack = document.createElement('div');
        stack.className = 'problem-ide-sample-stack';
        const inCol = document.createElement('div');
        inCol.className = 'sample';
        const inH = document.createElement('h2');
        inH.textContent = `输入数据 ${id}`;
        const outCol = document.createElement('div');
        outCol.className = 'sample';
        const outH = document.createElement('h2');
        outH.textContent = `输出数据 ${id}`;
        inPre.parentNode?.insertBefore(stack, inPre);
        inCol.append(inH, inPre);
        outCol.append(outH, outPre);
        stack.append(inCol, outCol);
    }

    flattenSampleGrid(host);
    host.querySelectorAll('.sample').forEach((el) => {
        if (el instanceof HTMLElement) decorateSampleToolbar(el);
    });
    host.querySelectorAll('.toolbar').forEach((el) => {
        if (el.closest('.problem-ide-sample-toolbar')) return;
        el.remove();
    });
}

export function initAlgTagToggle() {
    document.addEventListener('click', (ev) => {
        const t = ev.target as HTMLElement | null;
        const btn = t?.closest?.('[name="show_tags"]');
        if (!btn) return;
        ev.preventDefault();
        btn.closest('.problem-ide-alg-tags-block')?.classList.toggle('problem-ide-alg-expanded');
    });
}

const STATEMENT_TOC_DRAWER_MQ = '(max-width: 1299px)';

function isStatementTocDrawerMode(): boolean {
    try { return window.matchMedia(STATEMENT_TOC_DRAWER_MQ).matches; } catch { return false; }
}

function setStatementTocDrawerOpen(open: boolean) {
    const rootEl = document.getElementById('problemIdeRoot');
    const btn = document.getElementById('problemIdeStatementTocDrawerBtn') as HTMLButtonElement | null;
    const backdrop = document.getElementById('problemIdeStatementTocBackdrop');
    if (!rootEl) return;
    rootEl.classList.toggle('problem-ide-root--statement-toc-drawer-open', open);
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    backdrop?.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function closeStatementTocDrawer() { setStatementTocDrawerOpen(false); }

export function initStatementToc() {
    const tocEl = document.getElementById('problemIdeStatementToc') as HTMLElement | null;
    const shellEl = document.getElementById('problemIdeStatementTocShell') as HTMLElement | null;
    const rootEl = document.getElementById('problemIdeRoot');
    const scrollEl = document.querySelector('.problem-ide-left__scroll') as HTMLElement | null;
    if (!tocEl || !rootEl || !scrollEl) return;
    const titleEl = tocEl.querySelector('.problem-ide-statement-toc__title') as HTMLElement | null;
    const listEl = tocEl.querySelector('.problem-ide-statement-toc__list') as HTMLElement | null;
    if (!titleEl || !listEl) return;

    const btn = document.getElementById('problemIdeStatementTocDrawerBtn');
    const backdrop = document.getElementById('problemIdeStatementTocBackdrop');
    btn?.addEventListener('click', () => {
        setStatementTocDrawerOpen(!rootEl.classList.contains('problem-ide-root--statement-toc-drawer-open'));
    });
    backdrop?.addEventListener('click', () => closeStatementTocDrawer());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeStatementTocDrawer();
    });

    const excluded = new Set(['videoSol', 'myNote', 'aiAnalysis']);
    let currentLinks: HTMLAnchorElement[] = [];
    let currentHeadings: HTMLElement[] = [];

    const getActiveType = () => {
        const active = document.querySelector('#problemIdeProblemTabs .section__tab-header-item.tab--active') as HTMLElement | null;
        return active?.getAttribute('data-type') || null;
    };
    const updateActiveLink = () => {
        if (tocEl.hidden || !currentLinks.length) return;
        const containerScrollTop = scrollEl.scrollTop;
        const containerRect = scrollEl.getBoundingClientRect();
        let activeId = '';
        for (const h of currentHeadings) {
            const r = h.getBoundingClientRect();
            const offset = r.top - containerRect.top + containerScrollTop;
            if (containerScrollTop >= offset - 80) activeId = h.id;
        }
        if (!activeId && currentHeadings[0]) activeId = currentHeadings[0].id;
        for (const a of currentLinks) {
            a.classList.toggle('problem-ide-statement-toc__link--active', a.getAttribute('href') === `#${activeId}`);
        }
    };
    const refresh = () => {
        const reset = () => {
            tocEl.hidden = true;
            shellEl?.classList.add('problem-ide-statement-toc-shell--empty');
            closeStatementTocDrawer();
            currentLinks = [];
            currentHeadings = [];
        };
        if (!rootEl.classList.contains('problem-ide-root--statement-expanded')) { reset(); return; }
        const type = getActiveType();
        if (!type || excluded.has(type)) { reset(); return; }
        const panel = document.getElementById(`content-${type}`);
        if (!panel) { reset(); return; }
        const headings = Array.from(panel.querySelectorAll('h1, h2, h3')) as HTMLElement[];
        if (!headings.length) { reset(); return; }
        titleEl.textContent = (window as any).UiContext?.pdoc?.title || '目录';
        listEl.innerHTML = '';
        currentLinks = [];
        currentHeadings = [];
        headings.forEach((h, idx) => {
            if (h.closest('.sample')) return;
            if (!h.id) h.id = `problem-ide-toc-${type}-${idx}`;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${h.id}`;
            a.textContent = (h.textContent || '').trim();
            a.className = `problem-ide-statement-toc__link problem-ide-statement-toc__link--${h.tagName.toLowerCase()}`;
            a.addEventListener('click', (ev) => {
                ev.preventDefault();
                const target = document.getElementById(h.id);
                if (!target) return;
                const cRect = scrollEl.getBoundingClientRect();
                const tRect = target.getBoundingClientRect();
                scrollEl.scrollTo({ top: Math.max(0, tRect.top - cRect.top + scrollEl.scrollTop - 12), behavior: 'smooth' });
                if (isStatementTocDrawerMode()) closeStatementTocDrawer();
            });
            li.appendChild(a);
            listEl.appendChild(li);
            currentLinks.push(a);
            currentHeadings.push(h);
        });
        shellEl?.classList.remove('problem-ide-statement-toc-shell--empty');
        tocEl.hidden = false;
        requestAnimationFrame(() => updateActiveLink());
    };
    scrollEl.addEventListener('scroll', () => updateActiveLink(), { passive: true });
    window.addEventListener('problem-ide:tab-changed', refresh);
    window.addEventListener('problem-ide:layout-changed', refresh);
    refresh();
}

export function initTimer() {
    const display = document.getElementById('problemIdeTimerDisplay') as HTMLButtonElement | null;
    const panel = document.getElementById('problemIdeTimerPanel');
    const startBtn = document.getElementById('problemIdeTimerStartPauseBtn') as HTMLButtonElement | null;
    const resetBtn = document.getElementById('problemIdeTimerResetBtn') as HTMLButtonElement | null;
    if (!display || !panel || !startBtn || !resetBtn) return;
    let running = false;
    let acc = 0;
    let startedAt = 0;
    let tick: number | null = null;
    const fmt = (ms: number) => {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
    };
    const nowVal = () => acc + (running ? Date.now() - startedAt : 0);
    const render = () => { display.textContent = fmt(nowVal()); };
    startBtn.addEventListener('click', () => {
        if (running) {
            acc = nowVal();
            running = false;
            if (tick) window.clearInterval(tick);
            tick = null;
            startBtn.textContent = '开始';
        } else {
            startedAt = Date.now();
            running = true;
            startBtn.textContent = '暂停';
            tick = window.setInterval(render, 250);
        }
        render();
    });
    resetBtn.addEventListener('click', () => {
        running = false;
        acc = 0;
        if (tick) window.clearInterval(tick);
        tick = null;
        startBtn.textContent = '开始';
        render();
    });
    display.addEventListener('click', () => {
        panel.classList.toggle('problem-ide-settings--hidden');
        display.setAttribute('aria-expanded', panel.classList.contains('problem-ide-settings--hidden') ? 'false' : 'true');
    });
}

export function initExpMode(rootEl: HTMLElement) {
    const practice = document.getElementById('problemIdeModePractice');
    const exam = document.getElementById('problemIdeModeExam');
    const apply = (mode: string) => {
        practice?.classList.toggle('problem-ide-exp-mode__btn--active', mode === 'practice');
        exam?.classList.toggle('problem-ide-exp-mode__btn--active', mode === 'exam');
        rootEl.classList.toggle('problem-ide-root--exam', mode === 'exam');
        localStorage.setItem('problem_ide_exp_mode_v1', mode);
    };
    practice?.addEventListener('click', () => apply('practice'));
    exam?.addEventListener('click', () => apply('exam'));
    const saved = localStorage.getItem('problem_ide_exp_mode_v1');
    if (saved === 'exam') apply('exam');
}

type IdePsetItem = {
    index?: number; pid: string | number; title: string; difficulty?: number | string | null;
    accepted?: boolean; href: string; current?: boolean; sectionTitle?: string;
};

/** 题库/章节点击：始终本页打开 /ide/:pid，不新开标签、不进详情页。 */
function idePathForItem(pid: string | number, href?: string): string {
    const fromHref = String(href || '').match(/\/(?:ide|p)\/([^/?#]+)/);
    const id = fromHref?.[1] || String(pid || '').trim();
    if (!id) return '/ide/';
    const keep = new URLSearchParams(window.location.search);
    const q = keep.toString();
    return `/ide/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
}

function goIdeSameTab(path: string) {
    window.location.assign(path);
}

function bindSamePageIdeLinks(root: HTMLElement, selector: string) {
    root.addEventListener('click', (ev) => {
        const el = (ev.target as HTMLElement | null)?.closest?.(selector) as HTMLElement | null;
        if (!el || !root.contains(el)) return;
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const path = el.getAttribute('data-ide-path') || (el as HTMLAnchorElement).getAttribute?.('href');
        if (path) goIdeSameTab(path);
    }, true);
}

export function setupIdePsetDrawer() {
    const btn = document.getElementById('problemIdePsetDrawerBtn');
    const overlay = document.getElementById('problemIdePsetOverlay') as HTMLElement | null;
    const listEl = document.getElementById('problemIdePsetList');
    const footerEl = document.getElementById('problemIdePsetFooter');
    const titleEl = document.getElementById('problemIdePsetTitle');
    const subtitleEl = document.getElementById('problemIdePsetSubtitle');
    const progressEl = document.getElementById('problemIdePsetProgress');
    if (!btn || !overlay || !listEl || !footerEl) return;
    const pid = String((window as any).UiContext?.problemId ?? (window as any).UiContext?.problemNumId ?? '').trim();
    const close = () => { overlay.hidden = true; };
    overlay.querySelectorAll('[data-role="close"]').forEach((el) => el.addEventListener('click', close));
    const load = async () => {
        titleEl && (titleEl.textContent = '题库');
        subtitleEl && (subtitleEl.textContent = '');
        progressEl && (progressEl.textContent = '');
        listEl.innerHTML = '';
        footerEl.textContent = '加载中…';
        try {
            const resp = await request.get(`/api/problem/ide-pset-list?pid=${encodeURIComponent(pid)}&offset=0&limit=50`) as any;
            const items: IdePsetItem[] = Array.isArray(resp?.items) ? resp.items : [];
            if (titleEl) titleEl.textContent = resp?.psName || '题库';
            if (!items.length) {
                footerEl.textContent = '当前题目未关联题库。题库上线后，这里会列出同套题目并可跳转。';
                return;
            }
            const total = Number(resp.total) || items.length;
            const acceptedTotal = Number(resp.acceptedTotal) || 0;
            if (progressEl) progressEl.textContent = `完成进度 ${acceptedTotal} / ${total}`;
            listEl.innerHTML = items.map((item) => {
                const cls = [
                    'problem-ide-pset-item',
                    item.current ? 'problem-ide-pset-item--current' : '',
                    item.accepted ? 'problem-ide-pset-item--ac' : '',
                ].filter(Boolean).join(' ');
                const path = idePathForItem(item.pid, item.href);
                return `<button type="button" class="${cls}" data-ide-path="${escapeHtml(path)}"><span class="problem-ide-pset-item__idx">${escapeHtml(String(item.index ?? ''))}</span><span class="problem-ide-pset-item__title">${escapeHtml(item.title || String(item.pid))}</span></button>`;
            }).join('');
            footerEl.textContent = '点击题目在本页切换';
        } catch {
            footerEl.textContent = '当前还没有题库服务。创建题库并接上 /api/problem/ide-pset-list 后，这里会自动列出题目。';
        }
    };
    bindSamePageIdeLinks(listEl, '.problem-ide-pset-item[data-ide-path]');
    btn.addEventListener('click', () => {
        overlay.hidden = false;
        void load();
    });
}

export function setupIdeSectionSwitcher() {
    const root = document.getElementById('problemIdeSectionSwitcher') as HTMLElement | null;
    const btn = document.getElementById('problemIdeSectionSwitcherBtn') as HTMLButtonElement | null;
    const menu = document.getElementById('problemIdeSectionSwitcherMenu') as HTMLElement | null;
    const titleEl = document.getElementById('problemIdeSectionSwitcherTitle');
    const listEl = document.getElementById('problemIdeSectionSwitcherList');
    if (!root || !btn || !menu || !titleEl || !listEl) return;
    const pid = String((window as any).UiContext?.problemId ?? (window as any).UiContext?.problemNumId ?? '').trim();
    let open = false;
    const setOpen = (v: boolean) => {
        open = v;
        menu.hidden = !v;
        btn.setAttribute('aria-expanded', v ? 'true' : 'false');
        if (v && menu.parentElement !== document.body) document.body.appendChild(menu);
        if (v) {
            const rect = btn.getBoundingClientRect();
            const width = Math.min(360, window.innerWidth * 0.72);
            menu.style.position = 'fixed';
            menu.style.zIndex = '100010';
            menu.style.width = `${width}px`;
            menu.style.left = `${Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)}px`;
            menu.style.top = `${rect.bottom + 6}px`;
        }
    };
    const renderEmpty = (msg: string) => {
        titleEl.textContent = '当前节点';
        listEl.innerHTML = `<div class="problem-ide-section-switcher__empty">${escapeHtml(msg)}</div>`;
    };
    const load = async () => {
        listEl.innerHTML = '<div class="problem-ide-section-switcher__loading">加载中…</div>';
        try {
            const resp = await request.get(`/api/problem/ide-pset-section?pid=${encodeURIComponent(pid)}`) as any;
            const items = Array.isArray(resp?.items) ? resp.items : [];
            titleEl.textContent = resp?.sectionTitle || '当前节点';
            if (!items.length) {
                renderEmpty('尚未关联章节。题库上线后可在此切换同节点题目。');
                return;
            }
            listEl.innerHTML = items.map((item: any) => {
                const path = idePathForItem(item.pid, item.href);
                const cur = item.current ? ' problem-ide-section-switcher__item--current' : '';
                return `<button type="button" class="problem-ide-section-switcher__item${cur}" data-ide-path="${escapeHtml(path)}" role="menuitem">${escapeHtml(item.title || String(item.pid))}</button>`;
            }).join('');
        } catch {
            renderEmpty('章节接口尚未接入。题库上线后，这里会列出同节点题目。');
        }
    };
    bindSamePageIdeLinks(listEl, '.problem-ide-section-switcher__item[data-ide-path]');
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
        if (open) void load();
    });
    document.addEventListener('mousedown', (e) => {
        if (!open) return;
        const t = e.target as Node;
        if (root.contains(t) || menu.contains(t)) return;
        setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && open) setOpen(false);
    });
}
