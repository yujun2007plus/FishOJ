import './github-markdown.min.css';
import './problem_ide.css';
import './problem_ide_markdown.css';

if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
}

import { $, addPage, NamedPage } from '@hydrooj/ui-default';
import { initAlgTagToggle } from './algTags';
import { setupPretestCases } from './cases';
import type { TestCase } from './constants';
import { setupIdeDrawer } from './drawer';
import { applyProblemModeTags, setupMonacoEditor } from './editor';
import { initExpMode } from './expMode';
import { setupJudgeSession } from './judge/session';
import { resolveUserCodeTemplateString } from './codeTemplate';
import { installProblemIdeHost } from './learningHost';
import { loadMonacoEditor } from './monaco';
import { setupIdePsetDrawer } from './psetDrawer';
import { layoutStatementSamples } from './samples';
import { setupIdeSectionSwitcher } from './sectionSwitcher';
import { initGutter, restoreIdeSplit } from './splitLayout';
import { injectStatementHeading } from './statementHeading';
import { initStatementToc } from './statementToc';
import { initProblemTabs } from './tabs';
import { initAssistantSettingsToggle } from './assistantSettings';
import { initTimer } from './timer';

declare const UiContext: {
    codeLang?: string;
    codeTemplate?: Record<string, string> | string;
    problemIdeLoginRequired?: boolean;
    problemIdeCanSubmit?: boolean;
    problemId?: string;
    problemNumId?: number;
    pdoc?: { config?: Record<string, unknown> };
};

declare global {
    interface Window {
        __problemIdeLangRange?: Record<string, string>;
        __problemIdeConfig?: { login_required?: boolean; can_submit?: boolean };
        showSignInDialog?: () => void;
    }
}

addPage(new NamedPage(['problem_ide'], async () => {
    const loaderEl = document.getElementById('problemIdePageLoader');
    const rootEl = document.getElementById('problemIdeRoot');
    const revealStatement = () => {
        rootEl?.classList.remove('problem-ide-root--boot');
        rootEl?.classList.add('problem-ide-root--ready', 'problem-ide-root--ide-pending');
        loaderEl?.classList.add('problem-ide-page-loader--hidden');
        window.setTimeout(() => loaderEl?.remove(), 400);
    };
    const revealIde = () => {
        rootEl?.classList.remove('problem-ide-root--ide-pending');
        document.getElementById('problemIdeRightPending')?.remove();
    };

    const langEl = document.getElementById('problemIdeLang') as HTMLSelectElement | null;
    const monacoEl = document.getElementById('problemIdeMonaco');
    const runBtn = document.getElementById('problemIdeRunBtn') as HTMLButtonElement | null;
    const submitBtn = document.getElementById('problemIdeSubmitBtn') as HTMLButtonElement | null;
    const inputEl = document.getElementById('problemIdeInput') as HTMLTextAreaElement | null;
    const expectedEl = document.getElementById('problemIdeExpected') as HTMLTextAreaElement | null;
    const outputEl = document.getElementById('problemIdeOutput');
    const statusEl = document.getElementById('problemIdeStatus');
    const passRateEl = document.getElementById('problemIdePassRate');
    const historyEl = document.getElementById('problemIdeHistory');
    const leftPanel = document.getElementById('problemIdeLeft');
    const gutterEl = document.getElementById('problemIdeGutter');
    const rightPanel = document.getElementById('problemIdeRight');
    const drawer = document.getElementById('problemIdeDrawer');
    const drawerToggle = document.getElementById('problemIdeDrawerToggle');
    const drawerResize = document.getElementById('problemIdeDrawerResize');
    const fontInput = document.getElementById('problemIdeFontSize') as HTMLInputElement | null;
    const themeSelect = document.getElementById('problemIdeThemeSelect') as HTMLSelectElement | null;
    const settingsBtn = document.getElementById('problemIdeSettingsBtn');
    const settingsPanel = document.getElementById('problemIdeSettingsPanel');
    const resetBtn = document.getElementById('problemIdeResetCodeBtn') as HTMLButtonElement | null;

    if (!langEl || !monacoEl || !runBtn || !submitBtn || !inputEl || !outputEl || !rootEl) {
        revealStatement();
        return;
    }

    const langRange = window.__problemIdeLangRange;
    if (!langRange || !Object.keys(langRange).length) {
        revealStatement();
        return;
    }

    injectStatementHeading();
    layoutStatementSamples();
    window.setTimeout(() => layoutStatementSamples(), 400);
    initAlgTagToggle();
    initProblemTabs($('.problem-ide-left'));
    initStatementToc();
    setupIdePsetDrawer();
    setupIdeSectionSwitcher();
    initTimer();
    initAssistantSettingsToggle();
    initExpMode(rootEl);
    revealStatement();
    const monacoPromise = loadMonacoEditor();

    const langKeys = Object.keys(langRange);
    langEl.innerHTML = '';
    for (const k of langKeys) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = langRange[k] || k;
        langEl.appendChild(opt);
    }

    const pid = String(UiContext.problemId || UiContext.problemNumId || '');
    const codeKey = (lang: string) => `problem_ide_code_${pid}_${lang}`;
    const langKey = `problem_ide_lang_${pid}`;
    const casesKey = `problem_ide_cases_${pid}`;
    const ideCanSubmit = UiContext.problemIdeCanSubmit === true
        || window.__problemIdeConfig?.can_submit === true;
    const ideLoginRequired = UiContext.problemIdeLoginRequired === true;

    const savedLang = localStorage.getItem(langKey);
    const preferredLangs = ['cc.cc14', 'cc', 'cc.cc14o2', 'py.py3', 'c'];
    const fromUser = UiContext.codeLang && langKeys.includes(UiContext.codeLang)
        && !/^bash/i.test(UiContext.codeLang)
        ? UiContext.codeLang
        : '';
    const defaultLang = (savedLang && langKeys.includes(savedLang))
        ? savedLang
        : (fromUser || preferredLangs.find((k) => langKeys.includes(k)) || langKeys[0]);
    langEl.value = defaultLang;

    let cases: TestCase[] = [];
    try {
        const raw = localStorage.getItem(casesKey);
        if (raw) cases = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!cases.length) cases = [{ input: '', expected: '' }];

    const { saveCases } = setupPretestCases({
        inputEl,
        expectedEl,
        drawer,
        casesKey,
        getCases: () => cases,
        setCases: (next) => { cases = next; },
    });

    let monaco: typeof import('monaco-editor');
    try {
        monaco = await monacoPromise;
    } catch {
        const pending = document.getElementById('problemIdeRightPending');
        if (pending) {
            const text = pending.querySelector('.problem-ide-right__pending-text');
            if (text) text.textContent = '编辑器加载失败，请刷新页面重试';
        }
        return;
    }

    const editor = setupMonacoEditor({
        monaco, monacoEl, langEl, fontInput, themeSelect, settingsBtn, settingsPanel,
        resetBtn, defaultLang, codeKey, langKey,
    });
    installProblemIdeHost({
        pid,
        editor,
        langEl,
        getCases: () => cases,
        templateFor: (lang) => {
            if (!UiContext.codeTemplate) return '';
            return resolveUserCodeTemplateString(lang, UiContext.codeTemplate) || '';
        },
        persistCode: (lang, code) => localStorage.setItem(codeKey(lang), code),
    });
    revealIde();
    const cfg = (UiContext.pdoc?.config || window.__problemIdeConfig || {}) as Record<string, unknown>;
    applyProblemModeTags(cfg);

    const layoutEditor = () => { editor.layout(); };
    if (leftPanel && gutterEl && rightPanel) {
        restoreIdeSplit(leftPanel, gutterEl, rightPanel, rootEl, layoutEditor);
        initGutter(gutterEl, leftPanel, rightPanel, rootEl, layoutEditor);
    }
    const expandBtn = document.getElementById('problemIdeStatementExpandBtn');
    const collapseBtn = document.getElementById('problemIdeStatementCollapseBtn');
    expandBtn?.addEventListener('click', () => {
        const on = rootEl.classList.toggle('problem-ide-root--statement-expanded');
        rootEl.classList.remove('problem-ide-root--statement-collapsed');
        if (on && leftPanel) leftPanel.style.flex = '1 1 100%';
        else if (leftPanel && gutterEl && rightPanel) restoreIdeSplit(leftPanel, gutterEl, rightPanel, rootEl, layoutEditor);
        layoutEditor();
        try { window.dispatchEvent(new CustomEvent('problem-ide:layout-changed')); } catch { /* ignore */ }
    });
    collapseBtn?.addEventListener('click', () => {
        const on = rootEl.classList.toggle('problem-ide-root--statement-collapsed');
        rootEl.classList.remove('problem-ide-root--statement-expanded');
        if (on && leftPanel) leftPanel.style.flex = '0 0 5%';
        else if (leftPanel && gutterEl && rightPanel) restoreIdeSplit(leftPanel, gutterEl, rightPanel, rootEl, layoutEditor);
        layoutEditor();
        try { window.dispatchEvent(new CustomEvent('problem-ide:layout-changed')); } catch { /* ignore */ }
    });

    setupIdeDrawer({ drawer, drawerToggle, drawerResize, layoutEditor });
    setupJudgeSession({
        rootEl, langEl, runBtn, submitBtn, outputEl, statusEl, passRateEl, historyEl,
        drawer, editor, langRange, ideCanSubmit, ideLoginRequired,
        getCases: () => cases, saveCases,
    });

    $(window).on('resize', () => editor.layout());
}));
