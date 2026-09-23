// ============================================================
// FishOJ · 深海鎏金 · 讨论页状态增强（discussion_status.ts）
// 落点：theme 插件全局注入，仅对讨论页（/discuss*）生效。
// 三大创新（与预览一致，不改内核、零额外请求）：
//   ① 空状态三步上手指引（页面越空越有用，当前主菜）
//   ② 右侧栏鎏金「创建讨论」卡（附加 CTA，安全插入，不依赖现有按钮）
//   ③ 节点磁贴加彩色图标 + 计数徽标（页面已有数据则显示）
//   ④ 有内容后：列表卡片化 + 排序 Tab（未来-proof，仅当存在列表时注入）
// 防御式实现：多重选择器 + 文本内容检测 + 已处理守卫 + MutationObserver 兜底 SPA。
// ============================================================

const FISH_DISCUSS_FLAG = 'data-fish-discuss';

/** 找到空状态占位（Hydro 的 .nothing 组件或中文文案） */
function findEmptyState(): HTMLElement | null {
    const byClass = document.querySelector<HTMLElement>(
        'body.page--discussion_main .nothing, body.page--discussion_main .empty-line, .nothing, .empty-line',
    );
    if (byClass) return byClass;
    // 文本兜底：抓取包含「没有讨论」且短小的叶子节点
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('*'));
    for (const el of candidates) {
        const txt = (el.textContent || '').trim();
        if (/目前没有讨论|暂无讨论|还没有讨论|没有讨论|暂无内容/i.test(txt) && txt.length < 60 && el.children.length <= 1) {
            return el;
        }
    }
    return null;
}

const DISCUSS_TYPES = 'node|problem|contest|training|homework';

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch] || ch));
}

function domainPrefix(): string {
    return location.pathname.match(/^(\/d\/[^/]+)/)?.[1] || '';
}

function isBrokenCreatePath(path: string): boolean {
    return /(?:^|\/)discuss\/create\/?$/.test(path.split(/[?#]/)[0]);
}

function createUrl(type: string, name: string): string {
    return `${domainPrefix()}/discuss/${type}/${encodeURIComponent(name)}/create`;
}

function nodeFromPath(): { type: string; name: string } | null {
    const p = location.pathname.replace(/^\/d\/[^/]+/, '');
    const m = new RegExp(`^/discuss/(${DISCUSS_TYPES})/([^/]+)(?:/|$)`).exec(p);
    if (!m || m[2] === 'create') return null;
    return { type: m[1], name: decodeURIComponent(m[2]) };
}

/** 收集页面上的讨论节点（来自「讨论节点」组件里的链接），返回 [id, 显示名]
 *  只取以 /discuss/node/<id> 结尾的链接，排除 /create */
function nodeQuickLinks(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const as = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/discuss/node/"]'));
    for (const a of as) {
        const href = (a.getAttribute('href') || '').split(/[?#]/)[0];
        const m = /\/discuss\/node\/([^/]+)\/?$/.exec(href);
        if (!m || m[1] === 'create') continue;
        const id = decodeURIComponent(m[1]);
        if (out.some(([i]) => i === id)) continue;
        out.push([id, (a.textContent || '').trim() || id]);
    }
    return out;
}

/** Hydro 只认 /discuss/:type/:name/create；/discuss/create 会被当成帖子 id。 */
function resolveCreateUrl(): string | null {
    const cur = nodeFromPath();
    if (cur) return createUrl(cur.type, cur.name);
    const quick = nodeQuickLinks();
    if (quick.length) return createUrl('node', quick[0][0]);
    return createUrl('node', 'news');
}

function rewriteBrokenCreateLinks(): void {
    const fallback = resolveCreateUrl();
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (!isBrokenCreatePath(href)) return;
        if (fallback) a.setAttribute('href', fallback);
        else {
            a.setAttribute('href', `${domainPrefix()}/discuss`);
            a.classList.add('disabled');
        }
    });
}

/** ① 空状态三步引导 */
function enhanceEmptyState(): void {
    if (document.querySelector('.fish-discuss-guide')) return;
    const empty = findEmptyState();
    if (!empty) return;

    const createUrl = resolveCreateUrl();

    const guide = document.createElement('div');
    guide.className = 'fish-discuss-guide';
    guide.innerHTML = `
        <h3 class="fish-guide-title">还没有讨论</h3>
        <p class="fish-guide-sub">选择节点后即可发帖。</p>
        ${createUrl
            ? `<a class="fish-guide-btn" href="${createUrl}">创建讨论</a>`
            : `<p class="fish-guide-hint">请管理员先创建讨论节点。</p>`}
    `;
    empty.insertAdjacentElement('afterend', guide);
    // 原始空状态已被引导卡取代：标记隐藏，避免两个元素在 flex 父级里挤成一行
    empty.classList.add('fish-empty-replaced');
}

/** ② 右侧栏鎏金创建卡（附加 CTA，安全插入） */
function enhanceCreateCard(): void {
    if (document.querySelector('.fish-create-card')) return;
    const side = document.querySelector<HTMLElement>('.side, [class*="side"], body.page--discussion_main .section__body');
    if (!side) return;
    // 找到右侧栏容器：优先 .side，否则取讨论页最后一个 section 作为侧栏
    let container: HTMLElement | null = side;
    if (!side.classList.contains('side') && !/side/.test(side.className)) {
        const sections = document.querySelectorAll<HTMLElement>('body.page--discussion_main .section');
        container = sections[sections.length - 1] || side;
    }
    const cur = nodeFromPath();
    const quick = nodeQuickLinks();
    let action: string;
    if (cur) {
        action = `<a class="fish-create-card__btn" href="${createUrl(cur.type, cur.name)}">发帖</a>`;
    } else if (quick.length) {
        action = `<div class="fish-create-chips">${quick
            .slice(0, 6)
            .map(([id, name]) => `<a class="fish-create-chip" href="${createUrl('node', id)}">${escapeHtml(name)}</a>`)
            .join('')}</div>`;
    } else {
        action = `<p class="fish-create-card__desc">暂无节点</p>`;
    }
    const card = document.createElement('div');
    card.className = 'fish-create-card';
    card.innerHTML = `
        <h4 class="fish-create-card__title">创建讨论</h4>
        <p class="fish-create-card__desc">选择节点</p>
        ${action}
    `;
    container!.insertAdjacentElement('afterbegin', card);
}

function enhanceNodes(): void {
    /* 不再往节点名上叠图标，保持列表干净 */
}

/** ④ 有内容后：列表卡片化 + 排序 Tab（未来-proof） */
function enhanceListAndSort(): void {
    const listItems = document.querySelectorAll<HTMLElement>(
        'body.page--discussion_main .discussion__item, body.page--discussion_main [class*="discussion"] > [class*="item"]',
    );
    if (listItems.length === 0) return; // 当前为空，不注入
    if (document.querySelector('.fish-sort-tabs')) return;
    const listWrap = listItems[0].parentElement;
    if (!listWrap) return;
    const tabs = document.createElement('div');
    tabs.className = 'fish-sort-tabs';
    tabs.innerHTML = `
        <a class="fish-sort-tab fish-sort-tab--on" href="/discuss?sort=reply">最新回复</a>
        <a class="fish-sort-tab" href="/discuss?sort=time">最新发布</a>
        <a class="fish-sort-tab" href="/discuss?sort=hot">精华</a>
    `;
    listWrap.insertAdjacentElement('beforebegin', tabs);
}

function runDiscussionEnhance(): void {
    try {
        rewriteBrokenCreateLinks();
        enhanceEmptyState();
        enhanceCreateCard();
        enhanceNodes();
        enhanceListAndSort();
    } catch {
        /* 单页异常不影响整站 */
    }
}

/** SPA 路由切换兜底 */
function observeDiscussion(): void {
    if (typeof MutationObserver === 'undefined') return;
    let timer: number | null = null;
    const debounced = () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(runDiscussionEnhance, 200);
    };
    const mo = new MutationObserver(debounced);
    mo.observe(document.body, { childList: true, subtree: true });
}

export function initDiscussionStatus(): void {
    if (typeof document === 'undefined') return;
    const isDiscuss =
        /^\/discuss(\/|$)/.test(location.pathname) ||
        !!document.querySelector('body.page--discussion_main, .group-list, [class*="discussion_main"]');
    if (!isDiscuss) return;
    if (document.documentElement.getAttribute(FISH_DISCUSS_FLAG)) {
        // 已初始化过，仅做一次增量增强（如 SPA 回到本页）
        runDiscussionEnhance();
        return;
    }
    document.documentElement.setAttribute(FISH_DISCUSS_FLAG, '1');
    const mount = () => {
        runDiscussionEnhance();
        observeDiscussion();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
}
