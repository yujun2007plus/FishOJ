import { request } from '@hydrooj/ui-default';
import { formatRecordStatusLabelZh } from '../lib/judgeResultPrompt';
import {
    DEFAULT_AI_MODEL,
    defaultProblemIdeAiPromptTemplate,
    recordAiStreamRequestOptionsFromSavedSettings,
} from '../lib/settings';
import {
    RECORD_AI_PAUSE_OR_LEAVE_NON_REFUND_HINT_ZH,
    RECORD_AI_STREAM_MD_CLASS,
    buildAiQuotaWalletBarHtml,
    codeAiQuotaBarTailHtml,
    codeAiQuotaExhaustedMessageHtml,
    ensureGithubMarkdownForRecordAi,
    fetchRecordAiAnalysisCache,
    isAiQuotaExhaustedErrorText,
    isAiQuotaWalletRef,
    parseAiAnalysisQuotaRef,
    renderRecordAiCachedAnalysisIntoStreamRoot,
    runRecordAiAnalysisStream,
    type AiAnalysisQuotaRef,
} from '../lib/streamClient';
import { getReviewModalStyles } from './reviewModalStyles';

declare const UiContext: {
    aiAnalysis?: {
        enabled?: boolean;
        streamUrl?: string;
        cacheUrl?: string;
        quotaUrl?: string;
        quota?: AiAnalysisQuotaRef;
    };
    problemId?: string;
    problemNumId?: number;
    getRecordDetailUrl?: string;
};

declare global {
    interface Window {
        FishOJProblemIde?: {
            getSnapshot: () => { language: string; code: string };
        };
        __problemIdeLangRange?: Record<string, string>;
    }
}

const AI_ANALYSIS_OPEN = 'problem-ide-ai-analysis-open';

function normalizeRecordId(raw: unknown): string {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'object' && raw !== null && typeof (raw as { toString?: () => string }).toString === 'function') {
        const s = (raw as { toString: () => string }).toString();
        if (/^[a-f0-9]{24}$/i.test(s)) return s;
    }
    return String(raw).trim();
}

function recordStatusNum(rdoc: any): number {
    const st = rdoc?.status;
    if (typeof st === 'number' && Number.isFinite(st)) return st;
    return parseInt(String(st ?? ''), 10);
}

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showProblemTab(type: string) {
    const left = document.querySelector('.problem-ide-left');
    if (!left) return;
    left.querySelectorAll('.section__tab-header-item').forEach((el) => el.classList.remove('tab--active'));
    left.querySelector(`.section__tab-header-item[data-type="${type}"]`)?.classList.add('tab--active');
    left.querySelectorAll('.problem_content').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
    });
    const panel = document.getElementById(`content-${type}`);
    if (panel) panel.style.display = '';
    document.getElementById('problemIdeRoot')
        ?.classList.toggle('problem-ide-root--ai-analysis-tab', type === 'aiAnalysis');
    try {
        window.dispatchEvent(new CustomEvent('problem-ide:tab-changed', { detail: { type } }));
    } catch { /* ignore */ }
}

function getRecordDetailUrl(rid: string): string {
    const id = normalizeRecordId(rid);
    return UiContext.getRecordDetailUrl?.replace('%7Brid%7D', id).replace('{rid}', id) || `/record/${id}`;
}

function showEmptyAiPanel(metaEl: HTMLElement | null, streamRoot: HTMLElement | null) {
    if (metaEl) {
        metaEl.innerHTML = '<span class="problem-ide-ai-panel__meta-empty">请从「运行结果」或「历史提交」选择一条记录</span>';
    }
    if (streamRoot) {
        streamRoot.classList.add('record-ai-stream-panel--await-start');
        streamRoot.classList.remove('is-result', 'is-loading');
        streamRoot.innerHTML = '<div class="record-ai-await-start"><span>选择提交后开始分析</span></div>';
    }
}

type IdeAiSessionSnap = {
    rid: string;
    rdoc: {
        _id?: string;
        status?: unknown;
        score?: unknown;
        time?: unknown;
        memory?: unknown;
        lang?: unknown;
        judgeAt?: unknown;
    };
};

type OpenAiAnalysisOpts = {
    forceRefresh?: boolean;
    switchTab?: boolean;
    autoStartIfNoCache?: boolean;
};

export function initAiAnalysis() {
    const cfg = UiContext.aiAnalysis;
    if (!cfg?.enabled) return;
    if (document.getElementById('content-aiAnalysis') == null) return;

    const pid = String(UiContext.problemId || UiContext.problemNumId || '');
    const langRange = window.__problemIdeLangRange || {};
    let quotaRef: AiAnalysisQuotaRef | null = parseAiAnalysisQuotaRef(cfg.quota) || (
        cfg.quota ? { ...cfg.quota } as AiAnalysisQuotaRef : null
    );

    const aiMetaEl = document.getElementById('problemIdeAiSubmitMeta');
    const aiRerunBtn = document.getElementById('problemIdeAiRerunBtn') as HTMLButtonElement | null;
    let aiStreamRoot = document.getElementById('problemIdeAiStreamRoot') as HTMLElement | null;
    const submitResultAiBtn = document.getElementById('problemIdeSubmitResultAiBtn') as HTMLButtonElement | null;
    if (aiStreamRoot) aiStreamRoot.id = 'recordAiStreamRoot';

    const ensureRecordAiStylesInjected = () => {
        if (document.getElementById('record-ai-reviewmodal-styles')) return;
        const s = document.createElement('style');
        s.id = 'record-ai-reviewmodal-styles';
        s.textContent = getReviewModalStyles();
        document.head.appendChild(s);
        ensureGithubMarkdownForRecordAi();
    };

    const platformAiStreamOptions = () => recordAiStreamRequestOptionsFromSavedSettings({
        apiKey: '',
        modelPreset: DEFAULT_AI_MODEL,
        customModel: '',
        promptTemplate: defaultProblemIdeAiPromptTemplate(),
    }, false);

    const ideAiSessionKey = () => `problem_ide_ai_session_${pid}`;
    const ideAiHtmlKey = () => `problem_ide_ai_html_${pid}`;

    const persistIdeAiSession = (rid: string, rdoc: any, contentHtml?: string | null) => {
        if (!pid || !rid) return;
        try {
            const snap: IdeAiSessionSnap = {
                rid: String(rid),
                rdoc: {
                    _id: rdoc?._id != null ? String(rdoc._id) : String(rid),
                    status: rdoc?.status,
                    score: rdoc?.score,
                    time: rdoc?.time,
                    memory: rdoc?.memory,
                    lang: rdoc?.lang,
                    judgeAt: rdoc?.judgeAt,
                },
            };
            sessionStorage.setItem(ideAiSessionKey(), JSON.stringify(snap));
            if (typeof contentHtml === 'string' && contentHtml.trim()) {
                sessionStorage.setItem(ideAiHtmlKey(), JSON.stringify({
                    rid: String(rid),
                    contentHtml,
                    savedAt: Date.now(),
                }));
            }
        } catch { /* ignore */ }
    };

    const readIdeAiSession = (): IdeAiSessionSnap | null => {
        if (!pid) return null;
        try {
            const raw = sessionStorage.getItem(ideAiSessionKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw) as IdeAiSessionSnap;
            if (!parsed?.rid) return null;
            return parsed;
        } catch {
            return null;
        }
    };

    const readIdeAiLocalHtml = (rid: string): string => {
        if (!pid || !rid) return '';
        try {
            const raw = sessionStorage.getItem(ideAiHtmlKey());
            if (!raw) return '';
            const parsed = JSON.parse(raw) as { rid?: string; contentHtml?: string };
            if (String(parsed?.rid || '') !== String(rid)) return '';
            return typeof parsed.contentHtml === 'string' ? parsed.contentHtml : '';
        } catch {
            return '';
        }
    };

    const applyQuotaFromApi = (payload: { aiQuota?: AiAnalysisQuotaRef | null }) => {
        const parsed = parseAiAnalysisQuotaRef(payload?.aiQuota) || payload?.aiQuota;
        if (parsed) quotaRef = parsed as AiAnalysisQuotaRef;
    };

    const renderQuotaBar = () => {
        const barEl = document.getElementById('aiAnalysisQuotaBar');
        if (!barEl) return;
        const ref = quotaRef;
        if (!ref) {
            barEl.hidden = true;
            barEl.innerHTML = '';
            return;
        }
        if (isAiQuotaWalletRef(ref)) {
            barEl.hidden = false;
            barEl.classList.toggle('ai-analysis-quota-bar--low', !ref.unlimited && ref.canUsePaidAnalysis === false);
            barEl.innerHTML = buildAiQuotaWalletBarHtml(ref, { wrapClass: 'ai-analysis-quota-bar__inner' });
            return;
        }
        if (!ref.limited) {
            barEl.hidden = true;
            barEl.innerHTML = '';
            return;
        }
        if (ref.unlimited) {
            barEl.hidden = false;
            barEl.innerHTML = '<div class="ai-analysis-quota-bar__inner">今日 AI：不限</div>';
            return;
        }
        barEl.hidden = false;
        barEl.classList.remove('ai-analysis-quota-bar--low');
        const tail = codeAiQuotaBarTailHtml(ref.dailyLimit, { limitTiers: ref.limitTiers, quotaRef: ref });
        barEl.innerHTML = `<div class="ai-analysis-quota-bar__inner">今日 AI：<span class="ai-analysis-quota-bar__num">${ref.remaining}</span> / ${ref.dailyLimit} 次${tail}</div>`;
    };
    renderQuotaBar();

    const refreshQuotaFromServer = async () => {
        if (!pid) return;
        try {
            const base = cfg.quotaUrl || '/api/problem/ide-ai-quota';
            const sep = base.includes('?') ? '&' : '?';
            const res = await request.get(`${base}${sep}pid=${encodeURIComponent(pid)}`) as {
                error?: string;
                aiQuota?: AiAnalysisQuotaRef | null;
            };
            if (res?.error) return;
            if (res?.aiQuota && (res.aiQuota.limited || res.aiQuota.unlimited || res.aiQuota.source === 'ai_quota')) {
                applyQuotaFromApi({ aiQuota: res.aiQuota });
            } else {
                quotaRef = null;
            }
            renderQuotaBar();
        } catch { /* ignore */ }
    };

    const showAiQuotaExhaustedInPanel = () => {
        aiStreamRoot = document.getElementById('recordAiStreamRoot') as HTMLElement | null;
        const html = codeAiQuotaExhaustedMessageHtml(quotaRef?.dailyLimit, {
            limitTiers: quotaRef?.limitTiers,
            quotaRef,
        });
        if (aiStreamRoot) {
            aiStreamRoot.classList.remove('is-result', 'record-ai-stream-panel--await-start');
            aiStreamRoot.classList.add('is-loading');
            aiStreamRoot.innerHTML = `<div class="loading-text problem-ide-ai-quota-msg" style="color:#cf1322;text-align:center;padding:16px;line-height:1.7;">${html}</div>`;
        }
        renderQuotaBar();
    };

    const isIdePaidAnalysisBlocked = (): boolean => {
        const ref = quotaRef;
        if (!ref) return false;
        if (isAiQuotaWalletRef(ref)) {
            if (ref.unlimited) return false;
            return ref.canUsePaidAnalysis === false
                || (ref.estimatedCostPoints != null
                    && ref.balancePoints != null
                    && Number(ref.balancePoints) < Number(ref.estimatedCostPoints))
                || (ref.balancePoints != null && Number(ref.balancePoints) <= 0 && ref.estimatedCostPoints == null);
        }
        return !!ref.limited && !ref.unlimited && Number(ref.remaining) <= 0;
    };

    let aiCurrentTarget: { rid: string; rdoc: any; code: string } | null = null;
    let lastSubmitRid: string | null = null;
    let lastSubmitRdoc: any = null;
    let aiIsStreaming = false;
    let aiStreamAbort: AbortController | null = null;
    let aiAnalysisSessionGen = 0;

    window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
        if (!aiIsStreaming) return;
        e.preventDefault();
        e.returnValue = RECORD_AI_PAUSE_OR_LEAVE_NON_REFUND_HINT_ZH;
    });

    const syncAiRerunBtnUi = () => {
        if (!aiRerunBtn) return;
        const show = !!aiCurrentTarget && !aiIsStreaming;
        aiRerunBtn.hidden = !show;
        aiRerunBtn.disabled = !show;
    };

    const renderMeta = (rdoc: any, rid: string) => {
        if (!aiMetaEl) return;
        const lang = langRange[rdoc.lang] || rdoc.lang || '-';
        const timeCost = rdoc.time != null ? `${rdoc.time}ms` : '-';
        const mem = rdoc.memory != null ? `${(Number(rdoc.memory) / 1024).toFixed(1)}MB` : '-';
        const judgeAt = rdoc.judgeAt ? new Date(rdoc.judgeAt).toLocaleString('zh-CN') : '-';
        aiMetaEl.innerHTML = [
            `<span class="problem-ide-ai-panel__meta-item">状态: ${escapeHtml(formatRecordStatusLabelZh(rdoc.status))}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">分数: ${escapeHtml(String(rdoc.score ?? '-'))}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">耗时: ${escapeHtml(timeCost)}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">内存: ${escapeHtml(mem)}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">语言: ${escapeHtml(String(lang))}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">提交时间: ${escapeHtml(judgeAt)}</span>`,
            `<span class="problem-ide-ai-panel__meta-item">记录ID: ${escapeHtml(rid)}</span>`,
        ].join('');
    };

    const startAiAnalysisStream = async () => {
        aiStreamRoot = document.getElementById('recordAiStreamRoot') as HTMLElement | null;
        if (!aiCurrentTarget || !aiStreamRoot) return;
        if (aiIsStreaming) return;
        if (isIdePaidAnalysisBlocked()) {
            showAiQuotaExhaustedInPanel();
            syncAiRerunBtnUi();
            return;
        }
        const snap = window.FishOJProblemIde?.getSnapshot?.();
        aiIsStreaming = true;
        syncAiRerunBtnUi();
        const streamSessionGen = aiAnalysisSessionGen;
        aiStreamRoot.classList.remove('record-ai-stream-panel--await-start', 'is-result');
        aiStreamRoot.classList.add('is-loading');
        aiStreamRoot.innerHTML = '<span class="spinner" aria-hidden="true"></span><p class="loading-text">AI思考中，请稍候</p>';
        const liveId = 'recordAiStreamLive';
        aiStreamRoot.classList.remove('is-loading');
        aiStreamRoot.classList.add('is-result');
        aiStreamRoot.innerHTML = `<div id="${liveId}" class="markdown-body reviewmodal__ai-live ${RECORD_AI_STREAM_MD_CLASS}" style="min-height:4em;line-height:1.55;"></div>`;
        const liveEl = aiStreamRoot.querySelector(`#${liveId}`) as HTMLElement | null;
        if (!liveEl) {
            aiIsStreaming = false;
            syncAiRerunBtnUi();
            return;
        }
        aiStreamAbort = new AbortController();
        const streamOutcome = await runRecordAiAnalysisStream(aiCurrentTarget.rid, liveEl, {
            signal: aiStreamAbort.signal,
            streamUrl: cfg.streamUrl,
            cacheUrl: cfg.cacheUrl,
            ...platformAiStreamOptions(),
            ideCode: snap?.code,
            submitCode: aiCurrentTarget.code,
            submitLanguage: String(aiCurrentTarget.rdoc?.lang || snap?.language || ''),
            disableCache: true,
            autoScroll: false,
        });
        aiStreamAbort = null;
        aiIsStreaming = false;
        if (streamSessionGen !== aiAnalysisSessionGen) return;
        syncAiRerunBtnUi();
        if (streamOutcome.ok) {
            if (streamOutcome.aiQuota) {
                applyQuotaFromApi({ aiQuota: streamOutcome.aiQuota });
            } else {
                void refreshQuotaFromServer();
            }
            persistIdeAiSession(
                aiCurrentTarget.rid,
                aiCurrentTarget.rdoc,
                streamOutcome.contentHtml || null,
            );
            renderQuotaBar();
            return;
        }
        const errMsg = streamOutcome.error ?? '';
        if (!errMsg) {
            void refreshQuotaFromServer();
            return;
        }
        if (quotaRef && (isAiQuotaExhaustedErrorText(errMsg) || /403/.test(errMsg))) {
            if (isAiQuotaWalletRef(quotaRef)) {
                const balMatch = errMsg.match(/当前余额\s*(\d+)\s*点/);
                quotaRef = {
                    ...quotaRef,
                    canUsePaidAnalysis: false,
                    remaining: balMatch ? Number(balMatch[1]) : 0,
                    balancePoints: balMatch ? Number(balMatch[1]) : 0,
                    reason: 'AI_QUOTA_INSUFFICIENT',
                };
            } else {
                quotaRef = { ...quotaRef, remaining: 0 };
            }
            showAiQuotaExhaustedInPanel();
            syncAiRerunBtnUi();
            return;
        }
        aiStreamRoot.classList.remove('is-result');
        aiStreamRoot.classList.add('is-loading');
        aiStreamRoot.innerHTML = `<p class="loading-text" style="color:#f5222d;text-align:center;padding:16px;">${escapeHtml(errMsg)}</p>`;
    };

    const openAIAnalysis = async (ridRaw: string, rdoc: any, opts?: OpenAiAnalysisOpts) => {
        aiStreamRoot = document.getElementById('recordAiStreamRoot') as HTMLElement | null;
        if (!aiStreamRoot) return;
        const rid = normalizeRecordId(ridRaw || rdoc?._id);
        if (!rid) return;
        const forceRefresh = !!opts?.forceRefresh;
        const switchTab = opts?.switchTab !== false;
        const autoStartIfNoCache = opts?.autoStartIfNoCache !== false;
        ensureRecordAiStylesInjected();
        renderQuotaBar();
        document
            .querySelector('#problemIdeProblemTabs .section__tab-header-item[data-type="aiAnalysis"]')
            ?.removeAttribute('hidden');
        if (switchTab) showProblemTab('aiAnalysis');
        aiAnalysisSessionGen += 1;
        aiStreamAbort?.abort();
        aiIsStreaming = false;
        aiCurrentTarget = null;
        syncAiRerunBtnUi();
        aiStreamRoot.classList.remove('is-result', 'is-loading');
        aiStreamRoot.classList.add('record-ai-stream-panel--await-start');
        aiStreamRoot.innerHTML = '<div class="record-ai-await-start"><span>正在读取提交代码...</span></div>';
        renderMeta(rdoc, rid);
        persistIdeAiSession(rid, rdoc);
        try {
            const cacheUrl = cfg.cacheUrl;
            const [detail, cachePeek] = await Promise.all([
                request.get(getRecordDetailUrl(rid)) as Promise<any>,
                forceRefresh || !cacheUrl
                    ? Promise.resolve({ hasCache: false as const })
                    : fetchRecordAiAnalysisCache(rid, cacheUrl),
            ]);
            const mergedRdoc = detail?.rdoc ? { ...rdoc, ...detail.rdoc } : rdoc;
            const codeText = String(detail?.rdoc?.code || '');
            aiCurrentTarget = { rid, rdoc: mergedRdoc, code: codeText };
            renderMeta(mergedRdoc, rid);
            persistIdeAiSession(rid, mergedRdoc);

            if (!forceRefresh) {
                const cachedHtml = cachePeek.hasCache && cachePeek.contentHtml?.trim()
                    ? cachePeek.contentHtml
                    : readIdeAiLocalHtml(rid);
                if (cachedHtml?.trim()) {
                    renderRecordAiCachedAnalysisIntoStreamRoot(aiStreamRoot, cachedHtml, {
                        submitCode: codeText,
                        language: String(mergedRdoc?.lang || ''),
                    });
                    persistIdeAiSession(rid, mergedRdoc, cachedHtml);
                    syncAiRerunBtnUi();
                    return;
                }
                if (!autoStartIfNoCache) {
                    aiStreamRoot.classList.remove('is-loading', 'is-result');
                    aiStreamRoot.classList.add('record-ai-stream-panel--await-start');
                    aiStreamRoot.innerHTML = '<div class="record-ai-await-start"><span>暂无已保存的分析，可点击右上角「重新AI分析」</span></div>';
                    syncAiRerunBtnUi();
                    return;
                }
            }
            await startAiAnalysisStream();
            syncAiRerunBtnUi();
        } catch (e) {
            aiStreamRoot.innerHTML = `<p class="loading-text" style="color:#f5222d;text-align:center;padding:16px;">读取提交代码失败：${escapeHtml(e instanceof Error ? e.message : String(e))}</p>`;
            syncAiRerunBtnUi();
        }
    };

    aiRerunBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!aiCurrentTarget || aiIsStreaming) return;
        void openAIAnalysis(aiCurrentTarget.rid, aiCurrentTarget.rdoc, { forceRefresh: true });
    });

    const bootFromUrl = () => {
        const usp = new URLSearchParams(window.location.search);
        if (usp.get('tab') !== 'aiAnalysis') return false;
        const rid = String(usp.get('rid') || '').trim();
        if (!rid) return false;
        usp.delete('tab');
        usp.delete('rid');
        const q = usp.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
        void (async () => {
            try {
                const detail = await request.get(getRecordDetailUrl(rid)) as any;
                if (detail?.rdoc) await openAIAnalysis(rid, detail.rdoc, { switchTab: true });
            } catch { /* ignore */ }
        })();
        return true;
    };

    const bootFromSession = () => {
        const session = readIdeAiSession();
        if (!session?.rid) return;
        const activeTab = document.querySelector('#problemIdeProblemTabs .section__tab-header-item.tab--active') as HTMLElement | null;
        const onAiTab = activeTab?.getAttribute('data-type') === 'aiAnalysis';
        void openAIAnalysis(session.rid, session.rdoc || {}, {
            forceRefresh: false,
            switchTab: onAiTab,
            autoStartIfNoCache: false,
        });
    };

    if (!bootFromUrl()) {
        bootFromSession();
    }

    document.addEventListener(AI_ANALYSIS_OPEN, ((ev: Event) => {
        const d = (ev as CustomEvent<{ rid?: string; rdoc?: any }>).detail || {};
        const rid = normalizeRecordId(d.rid || d.rdoc?._id);
        if (!rid) return;
        void openAIAnalysis(rid, d.rdoc || { _id: rid });
    }) as EventListener);

    document.addEventListener('problem-ide-submit-result', ((ev: Event) => {
        const d = (ev as CustomEvent<{ rid?: string; status?: string; rdoc?: any }>).detail || {};
        const rid = normalizeRecordId(d.rid || d.rdoc?._id);
        if (!rid || !submitResultAiBtn) return;
        const st = recordStatusNum(d.rdoc || {});
        if (st === 1) {
            submitResultAiBtn.hidden = true;
            return;
        }
        lastSubmitRid = rid;
        lastSubmitRdoc = d.rdoc || { _id: rid, status: d.status };
        submitResultAiBtn.hidden = false;
        submitResultAiBtn.onclick = () => {
            void openAIAnalysis(rid, lastSubmitRdoc || { _id: rid });
        };
    }) as EventListener);

    window.addEventListener('problem-ide:tab-changed', ((ev: Event) => {
        const type = (ev as CustomEvent<{ type?: string }>).detail?.type;
        if (type !== 'aiAnalysis') return;
        if (aiCurrentTarget) return;
        showEmptyAiPanel(aiMetaEl, aiStreamRoot);
        syncAiRerunBtnUi();
    }) as EventListener);

    showEmptyAiPanel(aiMetaEl, aiStreamRoot);
    syncAiRerunBtnUi();

    const syncExam = () => {
        const root = document.getElementById('problemIdeRoot');
        const exam = root?.classList.contains('problem-ide-root--exam');
        const tab = document.querySelector('#problemIdeProblemTabs .section__tab-header-item[data-type="aiAnalysis"]') as HTMLElement | null;
        if (tab && exam) tab.hidden = true;
        else if (tab && !exam && cfg.enabled) tab.hidden = false;
    };
    syncExam();
    const rootEl = document.getElementById('problemIdeRoot');
    if (rootEl) {
        new MutationObserver(syncExam).observe(rootEl, { attributes: true, attributeFilter: ['class'] });
    }
}
