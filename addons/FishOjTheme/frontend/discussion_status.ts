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

/** 依据节点名称挑一个彩色图标 */
function pickNodeIcon(name: string): string {
    const n = name || '';
    if (/题解|题|解|代码|ac\b|acm/i.test(n)) return '📘';
    if (/求助|问|帮|wa|bug|错误|错/i.test(n)) return '🙋';
    if (/比赛|赛|contest|复盘/i.test(n)) return '🏆';
    if (/公告|通知|announce|站务/i.test(n)) return '📢';
    if (/灌水|闲聊|水|闲|摸鱼|日常/i.test(n)) return '☕';
    return '💬';
}

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
    return quick.length ? createUrl('node', quick[0][0]) : null;
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
        <div class="fish-guide-bubble">💬</div>
        <h3 class="fish-guide-title">讨论区还是一片深海静水</h3>
        <p class="fish-guide-sub">发第一条讨论，让这里热闹起来！按下面三步走就行：</p>
        <div class="fish-guide-steps">
            <div class="fish-step">
                <span class="fish-step-n">1</span>
                <div class="fish-step-ic">🏗</div>
                <b class="fish-step-title">管理员建节点</b>
                <span class="fish-step-desc">讨论节点需由管理员在后台创建，分类如：题解分享、求助、公告、灌水</span>
                <span class="fish-step-go fish-step-go--muted">节点标识建议用英文，如 solutions</span>
            </div>
            <div class="fish-step">
                <span class="fish-step-n">2</span>
                <div class="fish-step-ic">✍️</div>
                <b class="fish-step-title">点击「创建讨论」</b>
                <span class="fish-step-desc">选一个节点，写好标题和内容，支持 Markdown</span>
                ${createUrl
                    ? `<a class="fish-step-go" href="${createUrl}">前往创建 →</a>`
                    : `<span class="fish-step-go fish-step-go--muted">需先有讨论节点</span>`}
            </div>
            <div class="fish-step">
                <span class="fish-step-n">3</span>
                <div class="fish-step-ic">🎉</div>
                <b class="fish-step-title">邀请同学来回复</b>
                <span class="fish-step-desc">分享链接到群里，第一条回复就会浮出水面</span>
                <span class="fish-step-go fish-step-go--muted">把链接甩进班级群即可 🚀</span>
            </div>
        </div>
        ${createUrl
            ? `<a class="fish-guide-btn" href="${createUrl}">✍️ 立即创建第一条讨论</a>`
            : `<p class="fish-guide-hint">目前还没有讨论节点，先请管理员创建一个吧～</p>`}
        <p class="fish-guide-hint">不是管理员？先 @ 一下管理员建好节点，再来发帖～</p>
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
        action = `<a class="fish-create-card__btn" href="${createUrl(cur.type, cur.name)}">开始创建 →</a>`;
    } else if (quick.length) {
        action = `<div class="fish-create-chips">${quick
            .slice(0, 6)
            .map(([id, name]) => `<a class="fish-create-chip" href="${createUrl('node', id)}">在「${escapeHtml(name)}」下创建</a>`)
            .join('')}</div>`;
    } else {
        action = `<p class="fish-create-card__desc">还没有讨论节点，请管理员先创建一个。</p>`;
    }
    const card = document.createElement('div');
    card.className = 'fish-create-card';
    card.innerHTML = `
        <h4 class="fish-create-card__title">✍️ 创建讨论</h4>
        <p class="fish-create-card__desc">有问题？有题解想分享？选一个节点开始发言。</p>
        ${action}
    `;
    container!.insertAdjacentElement('afterbegin', card);
}

/** ③ 节点磁贴加彩色图标 + 计数徽标 */
function enhanceNodes(): void {
    const nodeItems = Array.from(
        document.querySelectorAll<HTMLElement>(
            'body.page--discussion_main .group-list > *, body.page--discussion_main .section__list__item',
        ),
    );
    for (const item of nodeItems) {
        if (item.querySelector('.fish-node-ic')) continue;
        const link = item.querySelector<HTMLElement>('a') || item;
        const name = (link.textContent || '').trim();
        const icon = pickNodeIcon(name);
        const ic = document.createElement('span');
        ic.className = 'fish-node-ic';
        ic.textContent = icon;
        link.insertAdjacentElement('afterbegin', ic);

        // 计数徽标：若名称里含有 (12) / 12 篇 之类的数字，提取并徽标化
        const m = name.match(/[（(]?\s*(\d+)\s*(篇|条|个|帖)?\s*[）)]?/);
        if (m) {
            const cnt = document.createElement('span');
            cnt.className = 'fish-node-cnt';
            cnt.textContent = m[1];
            link.insertAdjacentElement('beforeend', cnt);
        }
    }
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
        <a class="fish-sort-tab fish-sort-tab--on" href="/discuss?sort=reply">🔥 最新回复</a>
        <a class="fish-sort-tab" href="/discuss?sort=time">✨ 最新发布</a>
        <a class="fish-sort-tab" href="/discuss?sort=hot">🏆 精华</a>
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
