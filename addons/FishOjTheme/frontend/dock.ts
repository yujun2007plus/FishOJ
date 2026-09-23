// FishOJ AI Dock —— 全局悬浮入口（小方块 → 中等浮窗）
// 纯前端：只调用三个插件已开放的接口，不新增也不修改任何后端逻辑。
import './dock.css';
import { request } from '@hydrooj/ui-default';

interface IdeSnapshot {
    pid?: string;
    language?: string;
    code?: string;
}

declare global {
    interface Window {
        FishOJProblemIde?: {
            getSnapshot?: () => IdeSnapshot & Record<string, any>;
        };
    }
}

type TabKey = 'assistant' | 'analysis' | 'tutor';

const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'assistant', label: 'AI 助教' },
    { key: 'analysis', label: 'AI 分析' },
    { key: 'tutor', label: 'AI 教练' },
];

function readIdeSnapshot(): IdeSnapshot {
    try {
        const snap = window.FishOJProblemIde?.getSnapshot?.();
        if (snap && snap.pid) return { pid: String(snap.pid), language: snap.language || '', code: snap.code || '' };
    } catch { /* 无快照时退回 URL 解析 */ }
    return {};
}

function pidFromUrl(): string {
    const m = window.location.pathname.match(/\/(?:ide|p)\/(\d+)/);
    return m ? m[1] : '';
}

function ridFromUrl(): string {
    const m = window.location.pathname.match(/\/record\/([0-9a-fA-F]{24})/);
    return m ? m[1] : '';
}

function el(tag: string, cls: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
}

function esc(s: string): string {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
}

// SSE 读取：兼容各插件不同的事件字段命名
async function readSse(res: Response, onText: (chunk: string) => void, onError: (msg: string) => void) {
    const reader = res.body?.getReader();
    if (!reader) { onError('当前浏览器不支持流式响应'); return; }
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
            const line = block.split('\n').find((l) => l.trim().startsWith('data:'));
            if (!line) continue;
            const raw = line.replace(/^\s*data:\s*/, '').trim();
            if (!raw || raw === '[DONE]') continue;
            try {
                const data = JSON.parse(raw);
                if (data.error) { onError(String(data.error)); continue; }
                const chunk = data.delta ?? data.content ?? data.text ?? data.html ?? data.message ?? '';
                if (chunk) onText(String(chunk));
            } catch { /* 非 JSON 片段直接当文本 */ if (raw) onText(raw); }
        }
    }
}

// ---------- 拖拽：所有 AI 浮动入口都能挪位置并记住 ----------
function readPos(node: HTMLElement): { right: number; bottom: number } {
    const r = node.getBoundingClientRect();
    return {
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
    };
}

function applyRightBottom(node: HTMLElement, right: number, bottom: number) {
    const maxRight = Math.max(4, window.innerWidth - node.offsetWidth - 4);
    const maxBottom = Math.max(4, window.innerHeight - node.offsetHeight - 4);
    node.style.left = 'auto';
    node.style.top = 'auto';
    node.style.right = `${Math.min(Math.max(4, right), maxRight)}px`;
    node.style.bottom = `${Math.min(Math.max(4, bottom), maxBottom)}px`;
}

function attachDraggable(handle: HTMLElement, target: HTMLElement, key: string, onMoveCb?: () => void) {
    let startX = 0, startY = 0, baseRight = 0, baseBottom = 0, dragging = false;

    const onMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragging && Math.abs(dx) + Math.abs(dy) < 5) return;
        if (!dragging) { dragging = true; handle.classList.add('is-dragging'); }
        applyRightBottom(target, baseRight - dx, baseBottom - dy);
        if (onMoveCb) onMoveCb();
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('is-dragging');
        const pos = readPos(target);
        try { localStorage.setItem(key, JSON.stringify(pos)); } catch { /* 隐私模式下忽略 */ }
        // 拖完不要把这一次当成点击
        const suppress = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
        handle.addEventListener('click', suppress, { capture: true, once: true } as any);
        setTimeout(() => handle.removeEventListener('click', suppress, { capture: true } as any), 0);
    };

    const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement)?.closest('input, textarea, button:not(.cf-assistant-launcher):not(.fish-tutor__fab)')) return;
        const pos = readPos(target);
        baseRight = pos.right;
        baseBottom = pos.bottom;
        startX = e.clientX;
        startY = e.clientY;
        dragging = false;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', onDown);
}

function restoreSaved(key: string, node: HTMLElement, cb?: () => void) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (typeof p?.right === 'number' && typeof p?.bottom === 'number') {
            applyRightBottom(node, p.right, p.bottom);
            if (cb) cb();
        }
    } catch { /* 忽略损坏数据 */ }
}

// 观察动态插入的 AI 浮动入口（助教 / 教练），出现即挂上拖拽
function watchExternals() {
    const specs: Array<[string, string, string]> = [
        ['.cf-assistant-root', '.cf-assistant-launcher', 'fishoj.dock.assistant'],
        ['.fish-tutor', '.fish-tutor__fab', 'fishoj.dock.tutor'],
    ];
    const marks = new WeakSet<HTMLElement>();

    const tryAttach = () => {
        for (const [rootSel, handleSel, key] of specs) {
            const root = document.querySelector<HTMLElement>(rootSel);
            if (!root || marks.has(root)) continue;
            const handle = root.querySelector<HTMLElement>(handleSel) || root;
            marks.add(root);
            handle.style.cursor = 'grab';
            attachDraggable(handle, root, key);
            restoreSaved(key, root);
        }
    };

    tryAttach();
    const mo = new MutationObserver(tryAttach);
    mo.observe(document.body, { childList: true, subtree: true });
}

// 首页要留给「智能双引擎」卡片展示，浮窗不抢戏；后台管理页也不需要。
// 题目相关页面（题库 /p、题目 /p/:pid、做题 /ide/:pid、评测记录 /record）都正常出现。
function shouldHideDock(): boolean {
    const raw = (window.location.pathname || '/').replace(/\/+$/, '');
    const p = raw || '/';
    if (p === '/') return true;                                  // 首页
    if (/^\/d\/[^/]+$/.test(p)) return true;                     // 域首页
    if (/^\/(?:manage|login|register|logout)(\/|$)/.test(p)) return true;
    if (/^\/d\/[^/]+\/(?:manage|login)(\/|$)/.test(p)) return true;
    return false;
}

export function initFishDock() {
    if (typeof document === 'undefined') return;
    if (shouldHideDock()) return;
    if (document.getElementById('fish-dock-launcher')) return;

    const launcher = el('div', 'fish-dock-launcher');
    launcher.id = 'fish-dock-launcher';
    launcher.title = 'FishOJ AI 助手';
    launcher.appendChild(el('span', 'fish-dock-launcher__emoji', '\u{1F4AC}'));
    document.body.appendChild(launcher);

    const panel = el('div', 'fish-dock-panel');
    panel.id = 'fish-dock-panel';

    const head = el('div', 'fish-dock-panel__head');
    const title = el('div', 'fish-dock-panel__title', 'FishOJ AI 助手');
    const closeBtn = el('button', 'fish-dock-panel__close', '×');
    closeBtn.setAttribute('aria-label', '收起');
    head.appendChild(title);
    head.appendChild(closeBtn);

    const tabs = el('div', 'fish-dock-tabs');
    const tabBtns: Record<string, HTMLElement> = {};
    for (const t of TABS) {
        const btn = el('button', 'fish-dock-tab', t.label);
        btn.setAttribute('data-tab', t.key);
        tabBtns[t.key] = btn;
        tabs.appendChild(btn);
    }

    const body = el('div', 'fish-dock-body');
    const foot = el('div', 'fish-dock-foot');
    const input = document.createElement('textarea');
    input.className = 'fish-dock-input';
    input.placeholder = '输入你的问题…';
    input.rows = 1;
    const sendBtn = el('button', 'fish-dock-send', '发送');
    foot.appendChild(input);
    foot.appendChild(sendBtn);

    panel.appendChild(head);
    panel.appendChild(tabs);
    panel.appendChild(body);
    panel.appendChild(foot);

    const resizer = el('div', 'fish-dock-resizer');
    resizer.title = '拖动调整大小，双击恢复默认';
    panel.appendChild(resizer);
    document.body.appendChild(panel);

    // 面板尺寸自由调节：宽高各自独立，不锁比例，尺寸会记住
    const SIZE_KEY = 'fishoj.dock.size';
    const MIN_W = 320;
    const MIN_H = 320;
    const setPanelSize = (w: number, h: number) => {
        const cw = Math.min(Math.max(MIN_W, w), window.innerWidth - 32);
        const ch = Math.min(Math.max(MIN_H, h), window.innerHeight - 100);
        panel.style.width = `${cw}px`;
        panel.style.height = `${ch}px`;
    };
    try {
        const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
        if (saved?.width && saved?.height) setPanelSize(saved.width, saved.height);
    } catch { /* 数据损坏就用默认尺寸 */ }

    let resizing = false;
    let rsX = 0, rsY = 0, rsW = 0, rsH = 0;
    const onResizeMove = (e: MouseEvent) => {
        setPanelSize(rsW + (e.clientX - rsX), rsH + (e.clientY - rsY));
    };
    const onResizeUp = () => {
        if (!resizing) return;
        resizing = false;
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeUp);
        const r = panel.getBoundingClientRect();
        try {
            localStorage.setItem(SIZE_KEY, JSON.stringify({
                width: Math.round(r.width),
                height: Math.round(r.height),
            }));
        } catch { /* 隐私模式下忽略 */ }
    };
    resizer.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const r = panel.getBoundingClientRect();
        rsX = e.clientX;
        rsY = e.clientY;
        rsW = r.width;
        rsH = r.height;
        resizing = true;
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeUp);
    });
    resizer.addEventListener('dblclick', () => {
        panel.style.width = '';
        panel.style.height = '';
        try { localStorage.removeItem(SIZE_KEY); } catch { /* 忽略 */ }
    });

    let current: TabKey = 'assistant';
    let busy = false;

    const setBusy = (v: boolean) => {
        busy = v;
        sendBtn.disabled = v;
        sendBtn.textContent = v ? '思考中' : '发送';
    };

    const addMsg = (text: string, kind: 'user' | 'ai' | 'error' = 'ai') => {
        const node = el('div', `fish-dock-msg fish-dock-msg--${kind}`);
        node.textContent = text;
        body.appendChild(node);
        body.scrollTop = body.scrollHeight;
        return node;
    };

    const addHtml = (html: string) => {
        const node = el('div', 'fish-dock-msg fish-dock-msg--ai');
        node.innerHTML = html;
        body.appendChild(node);
        body.scrollTop = body.scrollHeight;
        return node;
    };

    const showHint = (text: string) => {
        body.innerHTML = '';
        const node = el('div', 'fish-dock-hint');
        node.innerHTML = text;
        body.appendChild(node);
    };

    const render = () => {
        for (const t of TABS) tabBtns[t.key].classList.toggle('is-active', t.key === current);
        const snap = readIdeSnapshot();
        const pid = snap.pid || pidFromUrl();
        const rid = ridFromUrl();

        if (current === 'assistant') {
            foot.classList.remove('is-hidden');
            body.innerHTML = '';
            if (!pid) {
                showHint('AI 助教需要题目上下文。<br>请打开一道题的做题页（/ide/题目号），小助手就能针对这道题回答你。');
            } else {
                addMsg(`已进入题目 ${esc(pid)} 的上下文，直接问吧：思路、复杂度、为什么 WA，都可以。`, 'ai');
            }
        } else if (current === 'tutor') {
            foot.classList.remove('is-hidden');
            body.innerHTML = '';
            if (!pid) {
                showHint('AI 教练需要你的代码。<br>请在做题页（/ide/题目号）打开，教练会根据你当前代码给分级提示，不直接给答案。');
            } else {
                addMsg(`教练已就位（题目 ${esc(pid)}）。点「发送」获取一条提示，卡住时再来一条。`, 'ai');
            }
        } else {
            foot.classList.add('is-hidden');
            body.innerHTML = '';
            if (!rid) {
                showHint('AI 分析针对一次提交记录：先做题提交一次，或直接打开某条评测记录，分析会告诉你错在哪、怎么改。');
                const uid = Number((window as any).UiContext?.user?._id || 0);
                const goto = el('button', 'fish-dock-send', '查看我的提交记录');
                goto.style.width = '100%';
                goto.style.padding = '8px 12px';
                goto.style.marginTop = '8px';
                goto.onclick = () => { window.location.href = uid ? `/record?uid=${uid}` : '/record'; };
                body.appendChild(goto);
            } else {
                addMsg(`已定位到提交记录 ${esc(rid.slice(0, 8))}…，点下方按钮开始分析。`, 'ai');
                const btn = el('button', 'fish-dock-send', '开始分析');
                btn.style.width = '100%';
                btn.style.padding = '8px 12px';
                btn.onclick = () => runAnalysis(rid, btn);
                body.appendChild(btn);
            }
        }
    };

    async function runAnalysis(rid: string, btn: HTMLElement) {
        if (busy) return;
        setBusy(true);
        btn.disabled = true;
        btn.textContent = '分析中…';
        const target = addMsg('', 'ai');
        try {
            const res = await fetch('/ai-analysis/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rid }),
            });
            if (!res.ok && !res.body) { target.textContent = `分析失败（${res.status}）`; return; }
            const ctype = res.headers.get('content-type') || '';
            if (ctype.includes('text/event-stream')) {
                await readSse(res, (chunk) => {
                    if (chunk.trim().startsWith('<')) target.innerHTML = esc(target.textContent) + chunk;
                    else target.textContent += chunk;
                }, (msg) => { target.className = 'fish-dock-msg fish-dock-msg--error'; target.textContent = msg; });
            } else {
                const data = await res.json().catch(() => ({} as any));
                if (data.error) { target.className = 'fish-dock-msg fish-dock-msg--error'; target.textContent = String(data.error); }
                else target.textContent = data.content || data.html || '分析完成';
            }
        } catch (e: any) {
            target.className = 'fish-dock-msg fish-dock-msg--error';
            target.textContent = `请求失败：${e?.message || e}`;
        } finally {
            setBusy(false);
            btn.disabled = false;
            btn.textContent = '重新分析';
        }
    }

    async function send() {
        if (busy) return;
        const snap = readIdeSnapshot();
        const pid = snap.pid || pidFromUrl();
        if (!pid) { addMsg('请先打开一道题的做题页，AI 助教需要题目上下文。', 'error'); return; }

        const question = input.value.trim();
        if (current === 'assistant' && !question) return;
        input.value = '';

        if (current === 'assistant') {
            addMsg(question, 'user');
            setBusy(true);
            const target = addMsg('', 'ai');
            try {
                const res = await fetch('/ai-assistant/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question,
                        clientContext: { abbreviation: 'acm', pid, scene: 'acm-problem', mode: 'learning' },
                    }),
                });
                if (!res.body) { target.textContent = '请求未返回内容'; setBusy(false); return; }
                await readSse(res, (chunk) => { target.textContent += chunk; }, (msg) => {
                    target.className = 'fish-dock-msg fish-dock-msg--error';
                    target.textContent = msg;
                });
            } catch (e: any) {
                target.className = 'fish-dock-msg fish-dock-msg--error';
                target.textContent = `请求失败：${e?.message || e}`;
            } finally {
                setBusy(false);
            }
            return;
        }

        if (current === 'tutor') {
            addMsg(question || '给我一条提示', 'user');
            setBusy(true);
            const target = addMsg('正在看你的代码…', 'ai');
            try {
                const res = await request.post('/ai-tutor/hint', {
                    pid,
                    language: snap.language || '',
                    code: snap.code || '',
                    trigger: 'dock',
                }) as any;
                if (!res?.ok) {
                    target.className = 'fish-dock-msg fish-dock-msg--error';
                    target.textContent = res?.error || '教练暂时没给出提示，先看看样例和运行结果吧。';
                } else {
                    target.textContent = res.message || '';
                }
            } catch (e: any) {
                target.className = 'fish-dock-msg fish-dock-msg--error';
                target.textContent = `请求失败：${e?.message || e}`;
            } finally {
                setBusy(false);
            }
        }
    }

    for (const t of TABS) {
        tabBtns[t.key].addEventListener('click', () => { current = t.key; render(); });
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    const toggle = (force?: boolean) => {
        const open = typeof force === 'boolean' ? force : !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', open);
        launcher.classList.toggle('is-open', open);
        if (open) render();
    };
    launcher.addEventListener('click', () => toggle());
    closeBtn.addEventListener('click', () => toggle(false));

    // AI 分析独立浮动入口：点了直接打开浮窗并停在「AI 分析」页签
    const analysisBtn = el('div', 'fish-analysis-launcher');
    analysisBtn.id = 'fish-analysis-launcher';
    analysisBtn.title = 'AI 分析';
    analysisBtn.appendChild(el('span', 'fish-analysis-launcher__emoji', '\u{1F4CA}'));
    document.body.appendChild(analysisBtn);
    analysisBtn.addEventListener('click', () => {
        // 已经开着且停在分析页签时，再点一次要收起
        const alreadyOpen = panel.classList.contains('is-open') && current === 'analysis';
        if (alreadyOpen) { toggle(false); return; }
        current = 'analysis';
        toggle(true);
    });
    attachDraggable(analysisBtn, analysisBtn, 'fishoj.dock.analysis');
    restoreSaved('fishoj.dock.analysis', analysisBtn);

    // 拖拽：launcher 可自由摆放，面板跟随其上方
    attachDraggable(launcher, launcher, 'fishoj.dock.launcher', () => {
        const pos = readPos(launcher);
        panel.style.right = `${pos.right}px`;
        panel.style.bottom = `${pos.bottom + 60}px`;
    });
    restoreSaved('fishoj.dock.launcher', launcher, () => {
        const pos = readPos(launcher);
        panel.style.right = `${pos.right}px`;
        panel.style.bottom = `${pos.bottom + 60}px`;
    });

    render();

    // 让题目页另外两个 AI 入口也能拖动并可记忆位置
    watchExternals();
}
