import { Notification } from '@hydrooj/ui-default';
import { MAX_CASES } from './constants';
import type { TestCase } from './constants';

function getVisibleStatementRoot(): HTMLElement | null {
    const active = document.querySelector('#problemIdeProblemTabs .section__tab-header-item.tab--active') as HTMLElement | null;
    const type = active?.getAttribute('data-type') || '';
    if (type && type !== 'aiAnalysis' && type !== 'textSol') {
        const panel = document.getElementById(`content-${type}`);
        if (panel) return panel;
    }
    return document.getElementById('content-zh')
        || document.getElementById('content-en')
        || document.getElementById('problemIdeProblemContent');
}

export function extractFencePairsFromProblemRoot(root: HTMLElement): TestCase[] {
    const blocks = [...root.querySelectorAll('pre')].map((pre) => {
        const t = (pre.textContent || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
        return t;
    }).filter((t) => t.length);
    const pairs: TestCase[] = [];
    for (let i = 0; i + 1 < blocks.length; i += 2) {
        pairs.push({ input: blocks[i], expected: blocks[i + 1] });
    }
    return pairs;
}

export function getCasePreviewFid(tc: any, origI: number): number {
    const n = Number(tc?.id ?? tc?.fid ?? origI + 1);
    return Number.isFinite(n) && n > 0 ? n : origI + 1;
}

export function setupPretestCases(opts: {
    inputEl: HTMLTextAreaElement;
    expectedEl: HTMLTextAreaElement | null;
    drawer: HTMLElement | null;
    casesKey: string;
    getCases: () => TestCase[];
    setCases: (next: TestCase[]) => void;
}) {
    const { inputEl, expectedEl, drawer, casesKey } = opts;
    const saveCases = () => {
        const cases = opts.getCases();
        const idx = Number(inputEl.dataset.caseIndex || '0') || 0;
        if (cases[idx]) {
            cases[idx].input = inputEl.value;
            cases[idx].expected = expectedEl?.value || '';
        }
        localStorage.setItem(casesKey, JSON.stringify(cases));
    };
    const renderCaseTabs = () => {
        const cases = opts.getCases();
        const tabs = document.getElementById('problemIdeCaseTabs');
        if (!tabs) return;
        const cur = Number(inputEl.dataset.caseIndex || '0') || 0;
        tabs.innerHTML = cases.map((_, i) => (
            `<button type="button" class="problem-ide-case-tab${i === cur ? ' problem-ide-case-tab--active' : ''}" data-i="${i}">用例 ${i + 1}</button>`
        )).join('');
        tabs.querySelectorAll('.problem-ide-case-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                saveCases();
                const i = Number((btn as HTMLElement).dataset.i);
                inputEl.dataset.caseIndex = String(i);
                inputEl.value = cases[i]?.input || '';
                if (expectedEl) expectedEl.value = cases[i]?.expected || '';
                renderCaseTabs();
            });
        });
    };
    inputEl.dataset.caseIndex = '0';
    inputEl.value = opts.getCases()[0].input;
    if (expectedEl) expectedEl.value = opts.getCases()[0].expected;
    renderCaseTabs();
    document.getElementById('problemIdeCaseAdd')?.addEventListener('click', () => {
        const cases = opts.getCases();
        if (cases.length >= MAX_CASES) return;
        saveCases();
        cases.push({ input: '', expected: '' });
        inputEl.dataset.caseIndex = String(cases.length - 1);
        inputEl.value = '';
        if (expectedEl) expectedEl.value = '';
        renderCaseTabs();
        saveCases();
    });
    document.getElementById('problemIdeCaseFillSamples')?.addEventListener('click', () => {
        const root = getVisibleStatementRoot();
        const pairs = root ? extractFencePairsFromProblemRoot(root) : [];
        if (!pairs.length) {
            Notification.info('题面中未识别到样例');
            return;
        }
        opts.setCases(pairs.slice(0, MAX_CASES));
        inputEl.dataset.caseIndex = '0';
        inputEl.value = opts.getCases()[0].input;
        if (expectedEl) expectedEl.value = opts.getCases()[0].expected;
        renderCaseTabs();
        saveCases();
        Notification.success(`已填入 ${opts.getCases().length} 组样例`);
    });
    document.addEventListener('problem-ide-fill-pretest-case', ((ev: Event) => {
        const cases = opts.getCases();
        const detail = (ev as CustomEvent<{ input?: string; expected?: string }>).detail || {};
        const input = String(detail.input ?? '');
        const expected = String(detail.expected ?? '');
        const idx = Number(inputEl.dataset.caseIndex || '0') || 0;
        if (!cases[idx]) cases[idx] = { input: '', expected: '' };
        cases[idx].input = input;
        cases[idx].expected = expected;
        inputEl.value = input;
        if (expectedEl) expectedEl.value = expected;
        saveCases();
        document.querySelectorAll('.problem-ide-tab').forEach((t) => {
            t.classList.toggle('problem-ide-tab--active', (t as HTMLElement).dataset.tab === 'run');
        });
        document.querySelectorAll('.problem-ide-panel').forEach((p) => {
            (p as HTMLElement).hidden = (p as HTMLElement).dataset.panel !== 'run';
        });
        drawer?.classList.remove('problem-ide-drawer--collapsed');
        Notification.success('已填充到自测');
    }) as EventListener);
    return { saveCases, renderCaseTabs };
}
