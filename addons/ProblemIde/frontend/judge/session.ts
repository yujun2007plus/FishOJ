import { Notification, request } from '@hydrooj/ui-default';
import { getCasePreviewFid } from '../cases';
import { DONE, LABEL, PROGRESS, SN, SUBMIT_HTTP_TIMEOUT_MS } from '../constants';
import { escapeHtml } from '../html';
import { getWsPrefix, promiseWithTimeout } from '../http';
import type { TestCase } from '../constants';
import { switchIdeDrawerTab } from '../drawer';

declare const UiContext: {
    postSubmitUrl?: string;
    pretestConnUrl?: string;
    tdoc?: { docId: string };
    getRecordDetailUrl?: string;
    getSubmissionsUrl?: string;
};

export function setupJudgeSession(opts: {
    rootEl: HTMLElement;
    langEl: HTMLSelectElement;
    runBtn: HTMLButtonElement;
    submitBtn: HTMLButtonElement;
    outputEl: HTMLElement;
    statusEl: HTMLElement | null;
    passRateEl: HTMLElement | null;
    historyEl: HTMLElement | null;
    drawer: HTMLElement | null;
    editor: { getValue: () => string };
    langRange: Record<string, string>;
    ideCanSubmit: boolean;
    ideLoginRequired: boolean;
    getCases: () => TestCase[];
    saveCases: () => void;
}) {
    const {
        rootEl, langEl, runBtn, submitBtn, outputEl, statusEl, passRateEl, historyEl,
        drawer, editor, langRange, ideCanSubmit, ideLoginRequired, getCases, saveCases,
    } = opts;

    const emitJudge = (name: string, detail: Record<string, unknown>) => {
        try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ }
    };
    const expandDrawer = () => drawer?.classList.remove('problem-ide-drawer--collapsed');

    const snapshotFromPretest = (i: number) => {
        const cases = getCases();
        const rdoc = pretestResults[i];
        const caseData = cases[i];
        const st = rdoc ? getRecordStatus(rdoc) : 0;
        const tc0 = rdoc?.testCases?.[0];
        const stdout = tc0?.message != null ? String(tc0.message) : '';
        const compiler = rdoc?.compilerText || rdoc?.compilerTexts;
        const stderr = Array.isArray(compiler) ? compiler.filter(Boolean).join('\n') : (compiler ? String(compiler) : '');
        const expected = caseData?.expected || '';
        const match = expected
            ? normalizeOutputForCompare(stdout) === normalizeOutputForCompare(expected)
            : st === 1;
        let status = SN[st] || String(st);
        if (st === 1 && expected && !match) status = 'WRONG_ANSWER';
        return {
            type: 'pretest' as const,
            input: caseData?.input || '',
            expected,
            stdout,
            stderr,
            status,
            time: rdoc?.time ?? tc0?.time,
            memory: rdoc?.memory ?? tc0?.memory,
        };
    };
    const setStatus = (text: string, type: 'ok' | 'err' | 'pending') => {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = `problem-ide-status problem-ide-status--${type}`;
        statusEl.hidden = !text;
    };
    const setPassRate = (text: string, type?: 'ok' | 'err') => {
        if (!passRateEl) return;
        passRateEl.textContent = text;
        passRateEl.hidden = !text;
        passRateEl.className = `problem-ide-pass-rate${type ? ` problem-ide-pass-rate--${type}` : ''}`;
    };

    let runBusy = false;
    let submitBusy = false;
    const syncBtns = () => {
        if (!ideCanSubmit) {
            runBtn.disabled = true;
            submitBtn.disabled = true;
            runBtn.textContent = '▶ 登录后自测';
            submitBtn.textContent = '登录后提交';
            return;
        }
        runBtn.disabled = runBusy || submitBusy;
        submitBtn.disabled = submitBusy || runBusy;
        if (!runBusy) runBtn.textContent = '▶ 自测运行';
        if (!submitBusy) submitBtn.textContent = '提交';
    };
    syncBtns();

    const finishBusy = (kind: 'run' | 'submit') => {
        if (kind === 'run') runBusy = false;
        else submitBusy = false;
        syncBtns();
    };

    const normalizeRid = (v: unknown) => String(v ?? '').trim();
    const recordIdStr = (rdoc: { _id?: unknown }) => {
        const id = rdoc?._id;
        if (id == null) return '';
        if (typeof id === 'string') return id.trim();
        if (typeof id === 'object' && id !== null && typeof (id as { toString?: () => string }).toString === 'function') {
            const s = (id as { toString: () => string }).toString();
            if (/^[a-f0-9]{24}$/i.test(s)) return s;
        }
        return String(id).trim();
    };
    const HISTORY_AI_BTN = (rid: string) => (
        `<button type="button" class="history-ai-btn" data-rid="${escapeHtml(rid)}">`
        + '<span class="history-ai-btn__ico" aria-hidden="true">'
        + '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">'
        + '<path d="M12 3l1.35 4.42L18 8.5l-4.65 1.08L12 14l-1.35-4.42L6 8.5l4.65-1.08L12 3zm6 9l.9 2.95 3.1 1.05-3.1 1.05L18 21l-2.1-3.95L12 17.1l3.9-1.15L18 12z"/></svg>'
        + '</span>AI分析</button>'
    );
    const getRecordStatus = (rdoc: any) => (typeof rdoc?.status === 'number' ? rdoc.status : parseInt(String(rdoc?.status), 10));
    const getRecordDetailUrl = (rid: string) =>
        UiContext.getRecordDetailUrl?.replace('%7Brid%7D', rid).replace('{rid}', rid) || `/record/${rid}`;
    const normalizeOutputForCompare = (s: string) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');

    let pretestRidMap = new Map<string, number>();
    let pretestResults: (any | null)[] = [];
    let pretestTotal = 0;
    let pretestSubmitting = false;
    let pretestBatchSingleRid: string | null = null;
    let submitRid: string | null = null;
    let ws: WebSocket | null = null;

    const renderPretestResults = () => {
        const cases = getCases();
        setPassRate('');
        saveCases();
        let html = '<div class="pretest-multi-results">';
        let allPassed = true;
        for (let i = 0; i < pretestTotal; i++) {
            const rdoc = pretestResults[i];
            const caseData = cases[i];
            if (!rdoc) {
                html += `<div class="pretest-case-result"><div class="pretest-case-header"><span class="result-badge result-badge--pending">运行中</span><span class="pretest-case-title">用例 ${i + 1}</span></div></div>`;
                allPassed = false;
                continue;
            }
            const st = getRecordStatus(rdoc);
            const lb = LABEL[SN[st] || ''] || SN[st] || String(st);
            const tc0 = rdoc.testCases?.[0];
            const stdout = tc0?.message != null ? String(tc0.message) : '';
            const expected = caseData?.expected?.trim();
            const match = expected ? normalizeOutputForCompare(stdout) === normalizeOutputForCompare(caseData.expected) : true;
            if (st !== 1 || (expected && !match)) allPassed = false;
            const badge = st === 1 && match ? 'result-badge--ac' : (DONE.has(st) ? 'result-badge--err' : 'result-badge--pending');
            const badgeText = st === 1 && expected ? (match ? '输出一致' : '输出不一致') : escapeHtml(lb);
            html += `<div class="pretest-case-result"><div class="pretest-case-header"><span class="result-badge ${badge}">${badgeText}</span><span class="pretest-case-title">用例 ${i + 1}</span></div>`;
            html += '<div class="pretest-case-body">';
            if (expected) {
                html += '<div class="pretest-compare">';
                html += `<div class="pretest-section"><div class="pretest-section__label">实际输出</div><pre class="pretest-pre">${escapeHtml(stdout || '(无输出)')}</pre></div>`;
                html += `<div class="pretest-section"><div class="pretest-section__label">预期输出</div><pre class="pretest-pre">${escapeHtml(expected)}</pre></div>`;
                html += '</div>';
            } else {
                html += `<div class="pretest-section"><div class="pretest-section__label">输出</div><pre class="pretest-pre">${escapeHtml(stdout || '(无输出)')}</pre></div>`;
            }
            html += '</div></div>';
        }
        html += '</div>';
        outputEl.innerHTML = html;
        if (pretestRidMap.size > 0) {
            const done = pretestResults.filter((r) => r != null && DONE.has(getRecordStatus(r))).length;
            setStatus(`运行中 (${done}/${pretestTotal})…`, 'pending');
        } else {
            setStatus(allPassed ? '全部通过 ✓' : '存在未通过的用例 ✗', allPassed ? 'ok' : 'err');
        }
    };

    const hydrateBatch = (rdoc: any) => {
        const tcs = Array.isArray(rdoc?.testCases) ? rdoc.testCases : [];
        if (!tcs.length) { pretestResults[0] = rdoc; return; }
        for (let i = 0; i < Math.min(tcs.length, pretestTotal); i++) {
            const tc = tcs[i];
            pretestResults[i] = {
                ...rdoc,
                status: tc.status ?? rdoc.status,
                time: tc.time ?? rdoc.time,
                memory: tc.memory ?? rdoc.memory,
                testCases: [tc],
            };
        }
    };

    const finalizePretest = () => {
        renderPretestResults();
        finishBusy('run');
        const firstFail = pretestResults.findIndex((r, i) => {
            if (!r) return true;
            const snap = snapshotFromPretest(i);
            return snap.status !== 'ACCEPTED';
        });
        const idx = firstFail >= 0 ? firstFail : 0;
        emitJudge('problem-ide-run-result', snapshotFromPretest(idx));
    };

    const fetchRecordByRid = async (rid: string): Promise<any | null> => {
        if (!rid) return null;
        try {
            const detail = await request.get(getRecordDetailUrl(rid)) as any;
            return detail?.rdoc ?? detail ?? null;
        } catch {
            return null;
        }
    };

    const buildFormalResultDetailHtml = (rdoc: any, rid: string): string => {
        const status: number = typeof rdoc.status === 'number' ? rdoc.status : parseInt(rdoc.status, 10);
        const name = SN[status] || `STATUS_${status}`;
        const label = LABEL[name] || name;
        const isAc = status === 1;
        const exam = rootEl.classList.contains('problem-ide-root--exam');
        let html = '<div class="result-detail">';
        html += '<div class="result-summary">';
        html += `<span class="result-badge ${isAc ? 'result-badge--ac' : 'result-badge--err'}">${escapeHtml(label)}</span>`;
        const parts: string[] = [];
        if (rdoc.score != null) parts.push(`分数: ${rdoc.score}`);
        if (rdoc.time != null) parts.push(`用时: ${rdoc.time}ms`);
        if (rdoc.memory != null) parts.push(`内存: ${(rdoc.memory / 1024).toFixed(1)}MB`);
        if (parts.length) html += `<span class="result-meta">${parts.join(' | ')}</span>`;
        html += '</div>';
        const ct = rdoc.compilerText || rdoc.compilerTexts;
        if (ct) {
            const ctStr = Array.isArray(ct) ? ct.filter(Boolean).join('\n') : String(ct);
            if (ctStr.trim()) html += `<div class="result-compiler"><pre>${escapeHtml(ctStr.trim())}</pre></div>`;
        }
        if (!exam && rdoc.testCases?.length) {
            const indexed = rdoc.testCases.map((tc: any, i: number) => ({ tc, i }));
            indexed.sort((a, b) => getCasePreviewFid(a.tc, a.i) - getCasePreviewFid(b.tc, b.i));
            html += '<table class="result-cases"><thead><tr><th>#</th><th>状态</th><th>用时</th><th>内存</th><th>分数</th><th>测试数据</th></tr></thead><tbody>';
            indexed.forEach(({ tc, i: origI }) => {
                const tcSt: number = typeof tc.status === 'number' ? tc.status : parseInt(tc.status, 10);
                const tcName = SN[tcSt] || 'UNKNOWN';
                const tcLabel = LABEL[tcName] || tcName;
                const tcAc = tcSt === 1;
                const caseNo = getCasePreviewFid(tc, origI);
                html += `<tr><td>${caseNo}</td>`;
                html += `<td class="${tcAc ? 'result-ac' : 'result-err'}">${escapeHtml(tcLabel)}</td>`;
                html += `<td>${tc.time != null ? `${tc.time}ms` : '-'}</td>`;
                html += `<td>${tc.memory != null ? `${(tc.memory / 1024).toFixed(1)}MB` : '-'}</td>`;
                html += `<td>${tc.score != null ? tc.score : '-'}</td>`;
                html += rid
                    ? `<td><a class="result-case-preview-btn" href="${escapeHtml(getRecordDetailUrl(rid))}" target="_blank" rel="noopener">预览</a></td>`
                    : '<td>—</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
        }
        html += '</div>';
        return html;
    };

    const renderSubmitResult = (rdoc: any) => {
        const rid = String(rdoc._id ?? '');
        const st = getRecordStatus(rdoc);
        const lb = LABEL[SN[st] || ''] || SN[st] || String(st);
        outputEl.innerHTML = buildFormalResultDetailHtml(rdoc, rid);
        const tcs = Array.isArray(rdoc?.testCases) ? rdoc.testCases : [];
        if (tcs.length) {
            const passed = tcs.filter((tc: any) => {
                const tcStatus = typeof tc?.status === 'number' ? tc.status : parseInt(String(tc?.status), 10);
                return tcStatus === 1;
            }).length;
            setPassRate(`通过率: ${Math.round((passed / tcs.length) * 100)}%`, st === 1 ? 'ok' : 'err');
        } else {
            setPassRate(st === 1 ? '通过率: 100%' : '通过率: 0%', st === 1 ? 'ok' : 'err');
        }
        setStatus(lb, st === 1 ? 'ok' : 'err');
        const compiler = rdoc.compilerText || rdoc.compilerTexts;
        emitJudge('problem-ide-submit-result', {
            type: 'submit',
            rid,
            rdoc,
            status: SN[st] || String(st),
            stdout: rdoc.testCases?.[0]?.message != null ? String(rdoc.testCases[0].message) : '',
            stderr: Array.isArray(compiler) ? compiler.filter(Boolean).join('\n') : (compiler ? String(compiler) : ''),
            time: rdoc.time,
            memory: rdoc.memory,
        });
    };

    const handleWsMsg = (rdoc: any) => {
        if (!rdoc?._id) return;
        const rid = normalizeRid(rdoc._id);
        const status = getRecordStatus(rdoc);
        if (pretestRidMap.has(rid)) {
            const idx = pretestRidMap.get(rid)!;
            if (PROGRESS.has(status)) {
                if (pretestBatchSingleRid === rid) hydrateBatch(rdoc);
                else pretestResults[idx] = rdoc;
                renderPretestResults();
                return;
            }
            if (DONE.has(status)) {
                pretestRidMap.delete(rid);
                if (pretestBatchSingleRid === rid) {
                    hydrateBatch(rdoc);
                    pretestBatchSingleRid = null;
                    finalizePretest();
                    return;
                }
                pretestResults[idx] = rdoc;
                if (pretestRidMap.size === 0 && !pretestSubmitting) finalizePretest();
                else renderPretestResults();
            }
            return;
        }
        if (submitRid && rid === submitRid && DONE.has(status)) {
            const captured = rid;
            submitRid = null;
            void (async () => {
                const full = await fetchRecordByRid(captured);
                renderSubmitResult(full || rdoc);
                finishBusy('submit');
                void loadHistory();
            })();
        }
    };

    const connectWs = () => {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
        const path = UiContext.pretestConnUrl;
        if (!path) return;
        try {
            const socket = new WebSocket(`${getWsPrefix()}${path}`);
            ws = socket;
            socket.onmessage = (ev) => {
                if (ev.data === 'ping') { try { socket.send('pong'); } catch { /* ignore */ } return; }
                try {
                    const parsed = JSON.parse(ev.data as string);
                    handleWsMsg(parsed.rdoc || parsed);
                } catch { /* ignore */ }
            };
            socket.onclose = () => { if (ws === socket) ws = null; };
        } catch { /* ignore */ }
    };
    connectWs();

    const collectRids = (res: Record<string, unknown>) => {
        const out: string[] = [];
        const push = (v: unknown) => { const r = normalizeRid(v); if (r) out.push(r); };
        push(res.rid);
        if (Array.isArray((res as { rids?: unknown }).rids)) {
            for (const r of (res as { rids: unknown[] }).rids) push(r);
        }
        return [...new Set(out)];
    };

    const requireLogin = () => {
        if (!ideCanSubmit) {
            if (typeof window.showSignInDialog === 'function') window.showSignInDialog();
            else Notification.info('请先登录');
            return true;
        }
        return false;
    };

    runBtn.addEventListener('click', async () => {
        const cases = getCases();
        if (requireLogin() || !UiContext.postSubmitUrl || runBtn.disabled) return;
        saveCases();
        const code = editor.getValue();
        if (!code.trim()) {
            switchIdeDrawerTab('result'); expandDrawer();
            setStatus('请先输入代码', 'err');
            outputEl.textContent = '';
            return;
        }
        runBusy = true; syncBtns();
        switchIdeDrawerTab('result'); expandDrawer();
        emitJudge('problem-ide-run-start', {
            type: 'pretest',
            language: langEl.value,
            code,
            input: cases[0]?.input || '',
        });
        pretestRidMap.clear();
        pretestBatchSingleRid = null;
        pretestTotal = cases.length;
        pretestResults = new Array(cases.length).fill(null);
        setStatus('正在运行自测…', 'pending');
        setPassRate('');
        outputEl.textContent = '';
        try {
            pretestSubmitting = true;
            const payload: Record<string, unknown> = {
                lang: langEl.value, code, pretest: true,
                input: cases.map((c) => c.input || '\n'),
            };
            if (UiContext.tdoc?.docId) payload.tid = UiContext.tdoc.docId;
            const res = await promiseWithTimeout(
                request.post(UiContext.postSubmitUrl, payload) as Promise<Record<string, unknown>>,
                SUBMIT_HTTP_TIMEOUT_MS, '自测请求',
            );
            const rids = collectRids(res);
            if (rids.length === cases.length) {
                rids.forEach((rid, i) => pretestRidMap.set(rid, i));
            } else if (rids.length === 1) {
                pretestBatchSingleRid = rids[0];
                pretestRidMap.set(rids[0], 0);
            }
            pretestSubmitting = false;
            connectWs();
            if (pretestRidMap.size === 0) {
                setStatus('异常响应', 'err');
                outputEl.textContent = `服务器未返回 rid\n${JSON.stringify(res, null, 2)}`;
                finishBusy('run');
            } else setStatus(`运行中 (0/${pretestTotal})…`, 'pending');
        } catch (e: unknown) {
            pretestSubmitting = false;
            setStatus('请求失败', 'err');
            outputEl.textContent = e instanceof Error ? e.message : String(e);
            finishBusy('run');
        }
    });

    submitBtn.addEventListener('click', async () => {
        if (requireLogin() || !UiContext.postSubmitUrl || submitBtn.disabled) return;
        const code = editor.getValue();
        if (!code.trim()) {
            switchIdeDrawerTab('result'); expandDrawer();
            setStatus('请先输入代码', 'err');
            outputEl.textContent = '';
            return;
        }
        submitBusy = true; syncBtns();
        switchIdeDrawerTab('result'); expandDrawer();
        setStatus('提交中…', 'pending');
        setPassRate('');
        outputEl.innerHTML = '';
        try {
            const payload: Record<string, unknown> = { lang: langEl.value, code, pretest: false };
            if (UiContext.tdoc?.docId) payload.tid = UiContext.tdoc.docId;
            const res = await promiseWithTimeout(
                request.post(UiContext.postSubmitUrl, payload) as Promise<Record<string, unknown>>,
                SUBMIT_HTTP_TIMEOUT_MS, '提交请求',
            );
            const rid = collectRids(res)[0];
            if (rid) {
                submitRid = rid;
                connectWs();
                setStatus('评测中…', 'pending');
            } else {
                setStatus('提交失败', 'err');
                outputEl.textContent = JSON.stringify(res, null, 2);
                finishBusy('submit');
            }
        } catch (e: unknown) {
            setStatus('请求失败', 'err');
            outputEl.textContent = e instanceof Error ? e.message : String(e);
            finishBusy('submit');
        }
    });

    const HISTORY_PAGE_SIZE = 10;
    let historyListPage = 0;
    let historyListHasMore = true;
    let historyListLoading = false;
    const historyRdocByRid = new Map<string, any>();

    const buildSubmissionsListUrl = (page: number): string => {
        const raw = UiContext.getSubmissionsUrl!;
        try {
            const u = new URL(raw, window.location.href);
            u.searchParams.set('page', String(page));
            return `${u.pathname}${u.search}${u.hash}`;
        } catch {
            const sep = raw.includes('?') ? '&' : '?';
            return `${raw}${sep}page=${encodeURIComponent(String(page))}`;
        }
    };

    const renderHistoryTableHeadHtml = (): string => {
        let h = '<thead><tr>';
        h += '<th>提交时间</th><th>状态</th><th>分数</th><th>用时</th><th>内存</th><th>语言</th>';
        if (ideCanSubmit) h += '<th>AI分析</th>';
        h += '</tr></thead>';
        return h;
    };

    const renderHistoryRowHtml = (r: any): string => {
        const st = getRecordStatus(r);
        const sn = SN[st] || `STATUS_${st}`;
        const lb = LABEL[sn] || sn;
        const ac = st === 1;
        const t = r.judgeAt ? new Date(r.judgeAt).toLocaleString('zh-CN') : '-';
        const done = DONE.has(st);
        const rid = recordIdStr(r);
        let row = `<tr class="history-row" data-rid="${escapeHtml(rid)}">`;
        row += `<td>${escapeHtml(t)}</td>`;
        row += `<td class="${ac ? 'result-ac' : 'result-err'}">${escapeHtml(lb)}</td>`;
        row += `<td>${r.score ?? '-'}</td>`;
        row += `<td>${r.time != null ? `${r.time}ms` : '-'}</td>`;
        row += `<td>${r.memory != null ? `${(r.memory / 1024).toFixed(1)}MB` : '-'}</td>`;
        row += `<td>${escapeHtml(langRange[r.lang] || r.lang || '-')}</td>`;
        if (ideCanSubmit) {
            row += `<td class="history-ai-cell">${done && rid ? HISTORY_AI_BTN(rid) : '-'}</td>`;
        }
        row += '</tr>';
        return row;
    };

    const syncHistoryListFooter = (): void => {
        if (!historyEl) return;
        const loadMore = historyEl.querySelector('.history-load-more') as HTMLElement | null;
        const end = historyEl.querySelector('.history-end') as HTMLElement | null;
        const tbody = historyEl.querySelector('#problemIdeHistoryTbody');
        if (loadMore) {
            const showLoadingMore = historyListLoading && historyListPage >= 1;
            loadMore.hidden = !showLoadingMore;
        }
        if (end) {
            const hasRows = Boolean(tbody?.querySelector('tr'));
            end.hidden = historyListHasMore || !hasRows || historyListLoading;
        }
    };

    const appendHistoryPage = async (): Promise<void> => {
        if (!historyEl || !UiContext.getSubmissionsUrl) return;
        if (!historyListHasMore || historyListLoading) return;
        historyListLoading = true;
        syncHistoryListFooter();
        try {
            const nextPage = historyListPage + 1;
            const res = await request.get(buildSubmissionsListUrl(nextPage)) as any;
            const rdocs: any[] = res.rdocs || [];
            historyListPage = nextPage;
            historyListHasMore = rdocs.length >= HISTORY_PAGE_SIZE;
            const tbody = historyEl.querySelector('#problemIdeHistoryTbody');
            if (tbody) {
                for (const r of rdocs) {
                    historyRdocByRid.set(recordIdStr(r), r);
                    tbody.insertAdjacentHTML('beforeend', renderHistoryRowHtml(r));
                }
            }
        } catch {
            Notification.error('加载更多失败');
        } finally {
            historyListLoading = false;
            syncHistoryListFooter();
        }
    };

    const ensureHistoryPanelInfiniteScroll = (): void => {
        const panel = document.querySelector('.problem-ide-panel[data-panel="history"]') as HTMLElement | null;
        if (!panel || panel.dataset.ideHistoryScroll === '1') return;
        panel.dataset.ideHistoryScroll = '1';
        panel.addEventListener('scroll', () => {
            if (!historyListHasMore || historyListLoading) return;
            const gap = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
            if (gap > 72) return;
            void appendHistoryPage();
        });
    };

    const ensureHistoryClickDelegation = (): void => {
        if (!historyEl || historyEl.dataset.ideHistoryClick === '1') return;
        historyEl.dataset.ideHistoryClick = '1';
        historyEl.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const aiBtn = target.closest('.history-ai-btn');
            if (ideCanSubmit && aiBtn && historyEl!.contains(aiBtn)) {
                e.stopPropagation();
                e.preventDefault();
                const rid = (aiBtn as HTMLElement).dataset.rid;
                if (!rid) return;
                const rdoc = historyRdocByRid.get(String(rid));
                if (rdoc) emitJudge('problem-ide-ai-analysis-open', { rid, rdoc });
                return;
            }
            const row = target.closest('.history-row') as HTMLElement | null;
            if (!row || !historyEl!.contains(row)) return;
            const rid = row.dataset.rid;
            if (rid) window.open(getRecordDetailUrl(rid), '_blank', 'noopener,noreferrer');
        });
    };

    async function loadHistory() {
        if (!historyEl) return;
        if (ideLoginRequired) {
            historyEl.innerHTML = '<div class="history-empty">登录后查看自己的提交记录</div>';
            return;
        }
        if (!UiContext.getSubmissionsUrl) return;
        historyListLoading = true;
        historyListPage = 0;
        historyListHasMore = true;
        historyRdocByRid.clear();
        historyEl.innerHTML = '<div class="history-loading">加载中…</div>';
        try {
            const res = await request.get(buildSubmissionsListUrl(1)) as any;
            const rdocs: any[] = res.rdocs || [];
            historyListPage = 1;
            historyListHasMore = rdocs.length >= HISTORY_PAGE_SIZE;
            if (!rdocs.length) {
                historyEl.innerHTML = '<div class="history-empty">暂无提交记录</div>';
                historyListLoading = false;
                return;
            }
            for (const r of rdocs) historyRdocByRid.set(recordIdStr(r), r);
            const rows = rdocs.map(renderHistoryRowHtml).join('');
            let html = '<table class="history-table">';
            html += renderHistoryTableHeadHtml();
            html += `<tbody id="problemIdeHistoryTbody">${rows}</tbody></table>`;
            html += '<div class="history-footer">';
            html += '<div class="history-load-more" hidden>加载中…</div>';
            html += '<div class="history-end" hidden>没有更多记录了</div>';
            html += '</div>';
            historyEl.innerHTML = html;
            historyListLoading = false;
            syncHistoryListFooter();
            ensureHistoryClickDelegation();
            ensureHistoryPanelInfiniteScroll();
        } catch (e) {
            historyListLoading = false;
            historyEl.innerHTML = `<div class="history-empty">加载失败: ${escapeHtml(e instanceof Error ? e.message : String(e))}</div>`;
        }
    }

    document.querySelectorAll('.problem-ide-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const n = (tab as HTMLElement).dataset.tab;
            if (n) {
                switchIdeDrawerTab(n);
                if (n === 'history') void loadHistory();
            }
        });
    });

    document.addEventListener('problem-ide-run-request', () => {
        if (!runBusy && !submitBusy && !runBtn.disabled) runBtn.click();
    });

    return { loadHistory };
}
