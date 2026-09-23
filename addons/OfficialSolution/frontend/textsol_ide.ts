/** 官方题解：多语言代码收成一张语言页签卡片。任何异常不得打断 problem_ide afterLoading。 */

const LANG_LABEL: Record<string, string> = {
    python: 'Python',
    py: 'Python',
    python3: 'Python',
    java: 'Java',
    cpp: 'C++',
    'c++': 'C++',
    cc: 'C++',
    cxx: 'C++',
    c: 'C',
    javascript: 'JavaScript',
    js: 'JavaScript',
    typescript: 'TypeScript',
    ts: 'TypeScript',
};

const LANG_HEADING = /^(python|java|c\+\+|cpp|javascript|js|c|typescript)$/i;
const PREF_KEY = 'fishoj-textsol-lang';

function normalizeLang(raw: unknown): string {
    const k = String(raw || '').trim().toLowerCase().split('.')[0];
    if (['py', 'python3', 'py3', 'python'].includes(k)) return 'python';
    if (['c++', 'cc', 'cxx', 'cpp', 'c++11', 'c++14', 'c++17'].includes(k)) return 'cpp';
    if (['js', 'node', 'javascript'].includes(k)) return 'javascript';
    if (['ts', 'typescript'].includes(k)) return 'typescript';
    return k;
}

function langFromCode(codeEl: HTMLElement, pre: HTMLElement): string {
    const cls = `${codeEl.className} ${pre.className}`;
    const m = cls.match(/\blanguage-([a-z0-9+#-]+)\b/i);
    if (m) return normalizeLang(m[1]);
    const prev = previousMeaningful(pre);
    const title = (prev?.textContent || '').trim();
    if (prev && /^H[1-6]$/.test(prev.tagName) && LANG_HEADING.test(title)) {
        return normalizeLang(title);
    }
    return 'code';
}

function languageLabel(key: string): string {
    const k = String(key || 'code');
    return LANG_LABEL[k] || k.replace(/^[a-z]/, (c) => c.toUpperCase()) || '代码';
}

function previousMeaningful(el: Element | null): HTMLElement | null {
    let n = el?.previousElementSibling || null;
    while (n) {
        if (!(n instanceof HTMLElement)) {
            n = n.previousElementSibling;
            continue;
        }
        if (n.tagName === 'BR' || (n.tagName === 'P' && !(n.textContent || '').trim())) {
            n = n.previousElementSibling;
            continue;
        }
        return n;
    }
    return null;
}

function onlyHeadingOrBlankBetween(a: Element, b: Element): boolean {
    let n = a.nextElementSibling;
    while (n && n !== b) {
        if (!(n instanceof HTMLElement)) return false;
        const blankP = n.tagName === 'P' && !(n.textContent || '').trim();
        const heading = /^H[1-6]$/.test(n.tagName) && LANG_HEADING.test((n.textContent || '').trim());
        if (!blankP && n.tagName !== 'BR' && !heading) return false;
        n = n.nextElementSibling;
    }
    return n === b;
}

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fall through */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

function unwrapHydroPrism(root: HTMLElement) {
    root.querySelectorAll('.line-numbers-rows').forEach((el) => el.remove());
    root.querySelectorAll('pre.line-numbers').forEach((pre) => pre.classList.remove('line-numbers'));
    root.querySelectorAll('.code-toolbar').forEach((tb) => {
        const pre = tb.querySelector('pre');
        if (pre) tb.replaceWith(pre);
        else tb.remove();
    });
}

function preferredLang(available: string[]): string {
    if (!available.length) return 'python';
    try {
        const saved = normalizeLang(localStorage.getItem(PREF_KEY) || '');
        if (saved && available.includes(saved)) return saved;
    } catch { /* ignore */ }
    try {
        const hint = normalizeLang((window as any).UiContext?.codeLang || '');
        if (hint && available.includes(hint)) return hint;
    } catch { /* ignore */ }
    return available[0];
}

function mountSwitcher(pres: HTMLPreElement[]) {
    if (!pres.length || pres.some((p) => p.closest('.fish-sol-switcher'))) return;
    const parent = pres[0].parentNode;
    if (!parent) return;

    const items = pres.map((pre) => {
        const code = (pre.querySelector('code') || pre) as HTMLElement;
        const lang = langFromCode(code, pre);
        return { pre, code, lang, label: languageLabel(lang) };
    });
    const headings: HTMLElement[] = [];
    for (const { pre } of items) {
        const prev = previousMeaningful(pre);
        if (prev && /^H[1-6]$/.test(prev.tagName) && LANG_HEADING.test((prev.textContent || '').trim())) {
            headings.push(prev);
        }
    }

    const card = document.createElement('div');
    card.className = 'fish-sol-switcher';
    const bar = document.createElement('div');
    bar.className = 'fish-sol-switcher__bar';
    const tabs = document.createElement('div');
    tabs.className = 'fish-sol-switcher__tabs';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'fish-sol-switcher__copy';
    copyBtn.textContent = 'Copy';
    const body = document.createElement('div');
    body.className = 'fish-sol-switcher__body';

    const available = items.map((it) => it.lang);
    let active = preferredLang(available);

    const apply = (lang: string) => {
        active = lang;
        try { localStorage.setItem(PREF_KEY, lang); } catch { /* ignore */ }
        tabs.querySelectorAll('.fish-sol-switcher__tab').forEach((btn) => {
            btn.classList.toggle('is-active', (btn as HTMLElement).dataset.lang === lang);
        });
        items.forEach((it) => {
            const on = it.lang === lang;
            it.pre.classList.toggle('is-active', on);
            it.pre.hidden = !on;
        });
    };

    items.forEach((it) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'fish-sol-switcher__tab';
        tab.dataset.lang = it.lang;
        tab.textContent = it.label;
        tab.addEventListener('click', () => apply(it.lang));
        tabs.appendChild(tab);
        it.pre.classList.add('fish-sol-switcher__panel');
        body.appendChild(it.pre);
    });

    copyBtn.addEventListener('click', () => {
        const cur = items.find((it) => it.lang === active) || items[0];
        void (async () => {
            const ok = await copyText(cur.code.textContent ?? '');
            const prev = copyBtn.textContent;
            copyBtn.textContent = ok ? 'Copied' : 'Failed';
            setTimeout(() => { copyBtn.textContent = prev; }, ok ? 1600 : 2200);
        })();
    });

    bar.append(tabs, copyBtn);
    card.append(bar, body);
    try {
        parent.insertBefore(card, parent.contains(pres[0]) ? pres[0] : null);
    } catch {
        parent.appendChild(card);
    }
    headings.forEach((h) => {
        try { h.remove(); } catch { /* ignore */ }
    });
    apply(active);
}

function groupAndMount(root: HTMLElement) {
    const pres = [...root.querySelectorAll('pre')].filter((pre) => !pre.closest('.fish-sol-switcher')) as HTMLPreElement[];
    const groups: HTMLPreElement[][] = [];
    let cur: HTMLPreElement[] = [];
    for (const pre of pres) {
        if (!pre.querySelector('code') && !(pre.textContent || '').trim()) continue;
        if (!cur.length) {
            cur = [pre];
            continue;
        }
        const last = cur[cur.length - 1];
        if (onlyHeadingOrBlankBetween(last, pre)) cur.push(pre);
        else {
            groups.push(cur);
            cur = [pre];
        }
    }
    if (cur.length) groups.push(cur);
    groups.forEach((g) => mountSwitcher(g));
}

export function enhanceOfficialTextSol() {
    try {
        const root = document.getElementById('content-textSol');
        if (!root) return;
        root.classList.add('markdown-body', 'record-ai-stream-md', 'problem-ide-textsol');
        unwrapHydroPrism(root);
        groupAndMount(root);
    } catch {
        /* 题解增强失败不能拖垮 IDE */
    }
}

export function watchOfficialTextSol() {
    try {
        enhanceOfficialTextSol();
        [0, 200, 600].forEach((ms) => setTimeout(() => {
            try { enhanceOfficialTextSol(); } catch { /* ignore */ }
        }, ms));
        window.addEventListener('problem-ide:tab-changed', ((ev: Event) => {
            try {
                const type = (ev as CustomEvent<{ type?: string }>).detail?.type;
                if (type === 'textSol') enhanceOfficialTextSol();
            } catch { /* ignore */ }
        }) as EventListener);
    } catch {
        /* ignore */
    }
}
