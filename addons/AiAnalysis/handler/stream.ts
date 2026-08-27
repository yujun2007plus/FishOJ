import { PassThrough } from 'stream';
import {
    DocumentModel,
    Handler,
    ObjectId,
    PRIV,
    ProblemModel,
    RecordModel,
    SettingModel,
} from 'hydrooj';
import { aiChatClient, type ChatRequest } from '../lib/api';
import { getAiAnalysisCacheIfValid, setAiAnalysisCache } from '../lib/cache';
import { formatRecordJudgeResultPromptText } from '../lib/judgeResultPrompt';
import { renderMdSafe } from '../lib/markdown';
import { buildRecordAiAnalysisUserPrompt } from '../lib/prompts';
import { finalizeRecordAiRepairMarkdown } from '../lib/repairProtocol';
import {
    AiAnalysisStreamClientClosedError,
    formatAiAnalysisQuotaForbiddenMessage,
    resolveAiAnalysisQuota,
    shouldRollbackAfterOfficialStreamFailure,
    peekAiAnalysisRemaining,
    rollbackAiAnalysisConsume,
    tryConsumeAiAnalysis,
} from '../lib/quota';

const STREAM_HTML_EMIT_MS = 120;

type AiProvider = 'deepseek' | 'kimi' | 'zhipu' | 'tongyi-qianwen' | 'doubao';

function sseWrite(stream: PassThrough, payload: Record<string, unknown>): void {
    if (stream.writableEnded || stream.destroyed) {
        throw new AiAnalysisStreamClientClosedError('sse stream ended or destroyed');
    }
    try {
        stream.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (cause: unknown) {
        throw new AiAnalysisStreamClientClosedError('sse write failed', cause);
    }
}

function resolveAiProviderAndModel(requestedProviderRaw: string, requestedModelRaw: string): {
    provider: AiProvider;
    model: string;
} {
    const requestedProvider = String(requestedProviderRaw || '').trim().toLowerCase();
    const requestedModel = String(requestedModelRaw || '').trim();
    const getDefaultModel = (provider: AiProvider): string => {
        switch (provider) {
            case 'kimi': return 'moonshot-v1-8k';
            case 'zhipu': return 'glm-4-flash';
            case 'tongyi-qianwen': return 'qwen-plus';
            case 'doubao': return 'doubao-seed-1-6-250615';
            default: return 'deepseek-v4-flash';
        }
    };
    const normalize = (raw: string): AiProvider | null => {
        if (raw === 'deepseek' || raw === 'kimi' || raw === 'zhipu' || raw === 'tongyi-qianwen' || raw === 'doubao') {
            return raw;
        }
        return null;
    };
    const explicit = normalize(requestedProvider);
    if (explicit) {
        return { provider: explicit, model: requestedModel || getDefaultModel(explicit) };
    }
    const n = requestedModel.toLowerCase();
    if (!requestedModel || n === 'deepseek-v4-flash') {
        return { provider: 'deepseek', model: getDefaultModel('deepseek') };
    }
    if (n === 'kimi' || n === 'zhipu' || n === 'tongyi-qianwen' || n === 'doubao') {
        return { provider: n, model: getDefaultModel(n) };
    }
    return { provider: 'deepseek', model: requestedModel };
}

function stringifyPlainText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((item) => stringifyPlainText(item)).filter(Boolean).join('\n');
    if (typeof value === 'object') {
        const maybeContent = (value as any).content;
        if (typeof maybeContent === 'string') return maybeContent;
        if (maybeContent != null) return stringifyPlainText(maybeContent);
        const maybeZh = (value as any).zh;
        if (typeof maybeZh === 'string') return maybeZh;
    }
    return '';
}

async function fetchOfficialSol(domainId: string, problemDocId: number): Promise<string> {
    try {
        const psdocs = await DocumentModel.getMulti(
            domainId,
            DocumentModel.TYPE_PROBLEM_SOLUTION,
            {
                parentType: DocumentModel.TYPE_PROBLEM,
                parentId: problemDocId,
            },
        ).limit(20).toArray();
        if (!psdocs.length) return '';
        // 优先空 owner 过滤跳过：取最新一条作为参考题解（FishOJ 无固定管理员 UID 列表）
        psdocs.sort((a: any, b: any) => b._id.getTimestamp().getTime() - a._id.getTimestamp().getTime());
        return stringifyPlainText(psdocs[0]?.content) || '';
    } catch {
        return '';
    }
}

type PromptVars = {
    problem_content: string;
    submit_code: string;
    judge_result: string;
    problem_textsol: string;
};

function renderPromptTemplate(template: string, vars: PromptVars): string {
    return String(template || '').replace(
        /\{\{\s*(problem_content|submit_code|judge_result|problem_textsol)\s*\}\}/g,
        (_, key) => vars[String(key) as keyof PromptVars] ?? '',
    );
}

/**
 * POST `/ai-analysis/stream` — SSE 流式分析
 */
export class AiAnalysisStreamHandler extends Handler {
    async post() {
        const reqBody = (this.request.body as {
            rid?: string;
            apiKey?: string;
            provider?: string;
            model?: string;
            promptTemplate?: string;
            ideCode?: string;
            disableCache?: boolean;
        }) || {};
        const rid = String(reqBody.rid || '').trim();
        const customApiKey = String(reqBody.apiKey || '').trim();
        const resolvedModel = resolveAiProviderAndModel(
            String(reqBody.provider || ''),
            String(reqBody.model || ''),
        );
        const isDefaultModel = resolvedModel.provider === 'deepseek' && resolvedModel.model === 'deepseek-v4-flash';
        const promptTemplate = typeof reqBody.promptTemplate === 'string' ? reqBody.promptTemplate : '';
        const ideCode = typeof reqBody.ideCode === 'string' ? reqBody.ideCode : '';
        const disableCache = Boolean(reqBody.disableCache);
        const useCustomApiKey = customApiKey.length > 0;

        if (!rid) {
            this.response.body = { error: '缺少提交记录 id' };
            return;
        }
        const uid = Number(this.user._id);
        if (!uid) {
            this.response.body = { error: '请先登录后再使用 AI 分析' };
            return;
        }

        let rdoc: any;
        try {
            rdoc = await RecordModel.get(new ObjectId(rid));
        } catch {
            this.response.body = { error: '记录不存在' };
            return;
        }
        if (!rdoc) {
            this.response.body = { error: '记录不存在' };
            return;
        }
        const submitCode = String(rdoc.code || '').trim();
        if (!submitCode) {
            this.response.body = { error: '提交代码为空，无法分析' };
            return;
        }
        if (Number(rdoc.uid) !== uid && !this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
            this.response.body = { error: '无权分析该提交记录' };
            return;
        }

        let pdoc: any;
        try {
            pdoc = await ProblemModel.get(rdoc.domainId, rdoc.pid);
        } catch {
            this.response.body = { error: '题目不存在或已删除' };
            return;
        }
        if (!pdoc?.docId) {
            this.response.body = { error: '题目不存在或已删除' };
            return;
        }

        const codeAiQuota = resolveAiAnalysisQuota(this.user as any);
        const canCustomize = (() => {
            if (this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) return true;
            const role = String((this.user as any)?.role || '').toLowerCase();
            if (role === 'vip') return true;
            const roles = (this.user as any)?.roles;
            return Array.isArray(roles) && roles.some((r: unknown) => String(r).toLowerCase() === 'vip');
        })();
        if (useCustomApiKey && !canCustomize) {
            this.response.body = { error: '自定义 API Key 仅限会员或管理员使用' };
            return;
        }
        if (!isDefaultModel && !canCustomize) {
            this.response.body = { error: '自定义模型仅限会员或管理员使用' };
            return;
        }
        if (resolvedModel.provider !== 'deepseek' && !useCustomApiKey) {
            this.response.body = { error: '切换到其它供应商时请填写对应 API Key' };
            return;
        }

        const recordOid = new ObjectId(rid);
        let aiQuotaReserved: { limited: boolean; remaining: number; dailyLimit: number } | null = null;

        const cached = disableCache ? null : await getAiAnalysisCacheIfValid(this.ctx, recordOid);
        if (cached) {
            const stream = new PassThrough();
            this.response.template = null as any;
            this.response.type = 'text/event-stream; charset=utf-8';
            this.response.body = stream;
            (this.context as any).compress = false;
            this.context.set('Cache-Control', 'no-cache');
            this.context.set('X-Accel-Buffering', 'no');

            (async () => {
                try {
                    if (cached.contentHtml) {
                        sseWrite(stream, { type: 'html', html: cached.contentHtml });
                    }
                    const donePayload: Record<string, unknown> = {
                        type: 'done',
                        contentHtml: cached.contentHtml,
                        success: true,
                        fromCache: true,
                    };
                    if (codeAiQuota.applyQuota && !useCustomApiKey) {
                        const peek = await peekAiAnalysisRemaining(this.ctx, uid, codeAiQuota.dailyLimit);
                        donePayload.aiQuota = {
                            limited: true,
                            remaining: peek.remaining,
                            dailyLimit: peek.dailyLimit,
                            source: 'daily_count',
                        };
                    } else if (codeAiQuota.unlimited) {
                        donePayload.aiQuota = {
                            limited: false,
                            remaining: 0,
                            dailyLimit: null,
                            unlimited: true,
                            source: 'daily_count',
                        };
                    }
                    sseWrite(stream, donePayload);
                } catch (e: any) {
                    try {
                        sseWrite(stream, {
                            type: 'error',
                            error: e?.message ? `读取缓存失败：${e.message}` : '读取缓存失败，请稍后重试',
                        });
                    } catch { /* client closed */ }
                } finally {
                    stream.end();
                }
            })();
            return;
        }

        if (codeAiQuota.applyQuota && !useCustomApiKey) {
            const peek = await peekAiAnalysisRemaining(this.ctx, uid, codeAiQuota.dailyLimit);
            if (peek.remaining <= 0) {
                this.response.body = {
                    error: formatAiAnalysisQuotaForbiddenMessage(codeAiQuota.dailyLimit),
                    code: 'QUOTA_EXCEEDED',
                };
                return;
            }
        }

        let userPrompt: string;
        try {
            const langKey = String(rdoc?.lang || '').trim();
            const langLabel = (langKey && SettingModel.langs[langKey]?.display) || langKey || '-';
            const judgeResult = formatRecordJudgeResultPromptText(rdoc, { langLabel });
            if (promptTemplate.trim()) {
                const vars: PromptVars = {
                    problem_content: stringifyPlainText(pdoc?.content),
                    submit_code: String(rdoc?.code || ''),
                    judge_result: judgeResult,
                    problem_textsol: '',
                };
                userPrompt = renderPromptTemplate(promptTemplate, vars);
            } else {
                const officialSol = await fetchOfficialSol(rdoc.domainId, pdoc.docId);
                userPrompt = buildRecordAiAnalysisUserPrompt({
                    problemContent: stringifyPlainText(pdoc.content),
                    submitCode: String(rdoc.code || ''),
                    ideCode,
                    officialSol,
                    judgeResult,
                    status: Number(rdoc.status) || 0,
                });
            }
        } catch (e: any) {
            this.response.body = { error: e?.message || '构建分析上下文失败' };
            return;
        }

        let didConsumeQuota = false;
        if (codeAiQuota.applyQuota && !useCustomApiKey) {
            const consumed = await tryConsumeAiAnalysis(this.ctx, uid, codeAiQuota.dailyLimit);
            if (!consumed.ok) {
                this.response.body = {
                    error: formatAiAnalysisQuotaForbiddenMessage(codeAiQuota.dailyLimit),
                    code: 'QUOTA_EXCEEDED',
                };
                return;
            }
            didConsumeQuota = true;
            aiQuotaReserved = {
                limited: true,
                remaining: consumed.remaining,
                dailyLimit: consumed.dailyLimit,
            };
        }

        const chatReq: ChatRequest = {
            provider: resolvedModel.provider,
            model: resolvedModel.model,
            messages: [
                {
                    role: 'system',
                    content:
                        '你是一位信息学奥赛与算法竞赛的优秀助教，擅长阅读 C++/Python/Java 等代码、分析评测结果并给出可操作的修改建议。请使用 Markdown 输出，条理清晰。',
                },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            excludeReasoningFromStream: true,
            ...(customApiKey ? { apiKey: customApiKey } : {}),
        };

        const stream = new PassThrough();
        this.response.template = null as any;
        this.response.type = 'text/event-stream; charset=utf-8';
        this.response.body = stream;
        (this.context as any).compress = false;
        this.context.set('Cache-Control', 'no-cache');
        this.context.set('X-Accel-Buffering', 'no');

        (async () => {
            try {
                let fullMd = '';
                let lastHtmlEmit = Date.now() - STREAM_HTML_EMIT_MS;
                await aiChatClient.chatStream(chatReq, async (_delta: string, full: string) => {
                    fullMd = full;
                    if (!String(full || '').trim()) return;
                    const now = Date.now();
                    if (now - lastHtmlEmit < STREAM_HTML_EMIT_MS) return;
                    lastHtmlEmit = now;
                    const html = renderMdSafe(full);
                    if (html) sseWrite(stream, { type: 'html', html });
                });
                const raw = fullMd.trim();
                if (!raw) throw new Error('empty ai response');
                const finalized = finalizeRecordAiRepairMarkdown(raw, submitCode);
                const contentHtml = renderMdSafe(finalized);
                await setAiAnalysisCache(this.ctx, recordOid, contentHtml);
                const donePayload: Record<string, unknown> = {
                    type: 'done',
                    contentHtml,
                    success: true,
                    fromCache: false,
                };
                if (aiQuotaReserved) {
                    donePayload.aiQuota = { ...aiQuotaReserved, source: 'daily_count' };
                } else if (codeAiQuota.unlimited) {
                    donePayload.aiQuota = {
                        limited: false,
                        remaining: 0,
                        dailyLimit: null,
                        unlimited: true,
                        source: 'daily_count',
                    };
                }
                sseWrite(stream, donePayload);
            } catch (e: any) {
                if (didConsumeQuota && shouldRollbackAfterOfficialStreamFailure(e)) {
                    try {
                        await rollbackAiAnalysisConsume(this.ctx, uid);
                    } catch { /* ignore */ }
                }
                try {
                    sseWrite(stream, {
                        type: 'error',
                        error: e?.message ? `AI 分析失败：${e.message}` : 'AI 分析失败，请稍后重试',
                    });
                } catch { /* client closed */ }
            } finally {
                stream.end();
            }
        })();
    }
}
