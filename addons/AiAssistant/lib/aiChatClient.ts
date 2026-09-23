// ai-service.ts
// AI 服务模块：封装与 DeepSeek API 的交互逻辑

import { resolveStoredAssistantApiKey } from './assistantSettings';

// ===================== 配置与常量 =====================
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
/** OpenAI SDK 用的 baseURL（不含 /chat/completions） */
const DEEPSEEK_OPENAI_BASE_URL = 'https://api.deepseek.com/v1';
const MOONSHOT_API_URL = 'https://api.moonshot.cn/v1/chat/completions';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const TIMEOUT_MS = 60_000;
const MODERATION_BLOCK_MESSAGE = '内容疑似包含违法或不良信息，已被系统拦截。请调整后重试。';

/**
 * 主站平台 DeepSeek Key 回退：不再硬编码真实密钥，仅作为空占位符。
 * 运行时优先读取 DEEPSEEK_API_KEY / BUILTIN_API_KEY；未配置时返回空字符串，
 * 由调用方在请求前抛出明确错误，避免把泄露密钥同步到仓库。
 */
const PLATFORM_API_KEY_FALLBACK = '';

export type PlatformLlmConfig = {
  apiKey: string;
  /** OpenAI 兼容 baseURL，如 https://api.deepseek.com/v1 */
  baseUrl: string;
  /** fetch 直连 chat/completions 完整 URL */
  chatCompletionsUrl: string;
  model: string;
  provider: 'deepseek';
  source: 'env' | 'builtin' | 'panel';
};

/**
 * 主站平台 LLM 回退（env / 内置 Key）。
 * 按服务分别配置请用 AiQuota：`AiLlmApiConfigService.resolve(serviceId)`
 * （管理页 /ai-quota/admin#llm-api）。
 */
export function resolvePlatformLlmConfig(): PlatformLlmConfig {
  // 优先级：管理面板填写的 Key > 环境变量 > 内置占位符。
  // 面板 Key 由「AI 助教管理」页保存，管理员改密钥不必再动服务器环境变量。
  const panelKey = String(resolveStoredAssistantApiKey() || '').trim();
  const envKey = String(
    process.env.DEEPSEEK_API_KEY
    || process.env.BUILTIN_API_KEY
    || '',
  ).trim();
  return {
    apiKey: panelKey || envKey || PLATFORM_API_KEY_FALLBACK,
    baseUrl: DEEPSEEK_OPENAI_BASE_URL,
    chatCompletionsUrl: DEEPSEEK_API_URL,
    model: DEFAULT_MODEL,
    provider: 'deepseek',
    source: panelKey ? 'panel' : envKey ? 'env' : 'builtin',
  };
}

interface ModerationRule {
  category: string;
  patterns: RegExp[];
}

const MODERATION_RULES: ModerationRule[] = [
  {
    category: 'violence',
    patterns: [
      /(?:制作|制造|获取).{0,10}(?:炸药|炸弹|爆炸物|燃烧瓶)/i,
      /(?:枪支|枪械|弹药).{0,10}(?:改装|组装|自制|购买)/i,
      /(?:杀人|行凶|袭击|恐袭|恐怖袭击|爆破)/i,
      /(?:how\s+to\s+make\s+a\s+bomb|mass\s+shooting|terrorist\s+attack)/i,
    ],
  },
  {
    category: 'pornography',
    patterns: [
      /(?:未成年|儿童|幼女|幼童).{0,10}(?:色情|性行为|裸照|成人视频)/i,
      /(?:强奸|迷奸|轮奸|乱伦|兽交|嫖娼|色情网)/i,
      /(?:porn|child\s+porn|rape|incest|bestiality)/i,
    ],
  },
  {
    category: 'national_security',
    patterns: [
      /(?:分裂国家|颠覆国家政权|恐怖组织|极端组织|煽动暴乱|发动政变)/i,
      /(?:泄露|窃取|出售).{0,12}(?:国家机密|军事机密|涉密文件)/i,
      /(?:weaponize|overthrow\s+government|state\s+secrets)/i,
    ],
  },
];

interface ModerationMatch {
  category: string;
  matchedPattern: string;
}

class ContentModerationError extends Error {
  public readonly phase: 'input' | 'output';
  public readonly match: ModerationMatch;

  constructor(phase: 'input' | 'output', match: ModerationMatch) {
    super(MODERATION_BLOCK_MESSAGE);
    this.name = 'ContentModerationError';
    this.phase = phase;
    this.match = match;
  }
}

function scanUnsafeText(text: string): ModerationMatch | null {
  const source = (text || '').trim();
  if (!source) return null;
  for (const rule of MODERATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(source)) {
        return { category: rule.category, matchedPattern: pattern.toString() };
      }
    }
  }
  return null;
}

function assertInputSafe(req: ChatRequest): void {
  for (const message of req.messages || []) {
    if (message.role !== 'user') continue;
    const hit = scanUnsafeText(message.content);
    if (hit) {
      throw new ContentModerationError('input', hit);
    }
  }
}

function assertOutputSafe(text: string): void {
  const hit = scanUnsafeText(text);
  if (hit) {
    throw new ContentModerationError('output', hit);
  }
}

/** 获取 API Key：请求内 BYOK > 主站平台 Key（env / 内置回退） */
function requireApiKey(req?: ChatRequest): string {
  const key = req?.apiKey?.trim() || resolvePlatformLlmConfig().apiKey;
  if (!key) {
    throw new Error(
      'LLM API Key 未配置。请设置 DEEPSEEK_API_KEY 或 BUILTIN_API_KEY 环境变量。',
    );
  }
  return key;
}

/**
 * DeepSeek 方向错误：统一成对用户友好的中文提示，避免把上游 JSON 原文抛给前端。
 * 其他供应商仍保留原始 API error 文本，便于排查。
 */
function toFriendlyDeepseekError(status: number): Error {
  let message = 'AI 助教暂时不可用，请稍后重试。';
  let code = `DEEPSEEK_${status || 'UNKNOWN'}`;
  switch (status) {
    case 400:
    case 422:
      message = 'AI 助教请求参数异常，请稍后重试；若持续出现请联系管理员。';
      break;
    case 401:
      message = 'AI 助教鉴权失败，服务密钥无效或已失效，请联系管理员更新配置。';
      break;
    case 402:
      message = 'AI 助教账户余额不足，请联系管理员。';
      break;
    case 429:
      message = 'AI 助教当前请求过于频繁，请稍等片刻再试。';
      break;
    case 500:
      message = 'AI 助教服务端暂时异常，请稍后重试。';
      break;
    case 503:
      message = 'AI 助教服务繁忙，请稍后重试；高峰期可稍后再来。';
      break;
    default:
      if (status > 0) {
        message = `AI 助教暂时不可用（错误码 ${status}），请稍后重试。`;
      }
      break;
  }
  const err = new Error(message) as Error & { code?: string; status?: number };
  err.code = code;
  err.status = status;
  return err;
}

function throwProviderApiError(
  provider: string,
  status: number,
  statusText: string,
  bodyText: string,
): never {
  if (provider === 'deepseek') {
    console.log(
      `[LLM] deepseek API error status=${status} ${statusText} body=${String(bodyText || '').slice(0, 300)}`,
    );
    const err = toFriendlyDeepseekError(status) as Error & { upstream?: string };
    err.upstream = String(bodyText || '').trim().slice(0, 500);
    throw err;
  }
  throw new Error(`${provider} API error: ${status} ${statusText} ${bodyText}`);
}

function throwProviderNetworkError(provider: string, error: unknown): never {
  const name = String((error as any)?.name || '');
  const msg = String((error as any)?.message || error || '');
  if (provider === 'deepseek') {
    if (name === 'AbortError' || /aborted|timeout/i.test(msg)) {
      const err = new Error('AI 助教响应超时，请稍后重试。') as Error & { code?: string };
      err.code = 'DEEPSEEK_TIMEOUT';
      throw err;
    }
    console.log(`[LLM] deepseek network error: ${msg.slice(0, 300)}`);
    const err = new Error('无法连接 AI 助教服务，请检查网络后重试。') as Error & { code?: string };
    err.code = 'DEEPSEEK_NETWORK';
    throw err;
  }
  throw error instanceof Error ? error : new Error(msg || 'LLM request failed');
}

// ===================== 类型声明 =====================
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunkMeta {
  reasoningText?: string;
  contentText?: string;
  hasReasoningDelta?: boolean;
  hasContentDelta?: boolean;
}

export interface ChatRequest {
  model?: string;
  provider?: 'deepseek' | 'kimi' | 'zhipu' | 'tongyi-qianwen' | 'doubao';
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  apiKey?: string;
  /** 覆盖默认提供方 URL（如百炼工作空间 compatible-mode） */
  apiUrl?: string;
  /** 流式回调中不把 reasoning_content 计入 fullText（仅面向用户的 content） */
  excludeReasoningFromStream?: boolean;
  /** DeepSeek V4 思考模式 */
  thinking?: { type: 'enabled' | 'disabled' };
  reasoning_effort?: 'high' | 'max';
  /** 客户端断开/用户停止时中止上游请求 */
  abortSignal?: AbortSignal;
}

export type ChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
};

export interface ChatResponse {
  content: string;
  raw: any;
  usage?: ChatUsage;
}

// ===================== 流式处理回调类型 =====================
export type StreamCallback = (chunk: string, fullText: string, meta?: StreamChunkMeta) => void | Promise<void>;

function resolveProvider(req: ChatRequest): ChatRequest['provider'] {
  if (req.provider) return req.provider;
  const model = String(req.model || '').toLowerCase().trim();
  if (!model) return 'deepseek';
  if (model === 'kimi' || model.startsWith('moonshot')) return 'kimi';
  if (model === 'zhipu' || model.startsWith('glm')) return 'zhipu';
  if (model === 'tongyi-qianwen' || model.startsWith('qwen')) return 'tongyi-qianwen';
  if (model === 'doubao' || model.startsWith('doubao')) return 'doubao';
  return 'deepseek';
}

function resolveProviderApiUrl(provider: NonNullable<ChatRequest['provider']>, req: ChatRequest): string {
  if (req.apiUrl?.trim()) return req.apiUrl.trim();
  switch (provider) {
    case 'kimi':
      return MOONSHOT_API_URL;
    case 'zhipu':
      return ZHIPU_API_URL;
    case 'tongyi-qianwen':
      return QWEN_API_URL;
    case 'doubao':
      return DOUBAO_API_URL;
    case 'deepseek':
    default:
      return DEEPSEEK_API_URL;
  }
}

// ===================== DeepSeek API 调用（非流式） =====================
async function chat(req: ChatRequest): Promise<ChatResponse> {
  assertInputSafe(req);
  const apiKey = requireApiKey(req);
  const provider = resolveProvider(req);
  const apiUrl = resolveProviderApiUrl(provider, req);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body = {
    model: req.model ?? DEFAULT_MODEL,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.max_tokens ?? 1024,
    ...(req.response_format && { response_format: req.response_format }),
    ...(req.thinking && { thinking: req.thinking }),
    ...(req.reasoning_effort && { reasoning_effort: req.reasoning_effort }),
  };

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throwProviderNetworkError(provider, error);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throwProviderApiError(provider, res.status, res.statusText, text);
  }

  const data = await res.json();

  // 兼容 OpenAI 风格：choices[0].message.content（并兼容 reasoning 字段）
  const content: string =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.message?.reasoning_content ??
    data?.choices?.[0]?.delta?.content ??
    data?.choices?.[0]?.delta?.reasoning_content ??
    '';
  assertOutputSafe(content);

  const usageRaw = data?.usage;
  const usage: ChatUsage | undefined = usageRaw
    ? {
      prompt_tokens: Number(usageRaw.prompt_tokens) || 0,
      completion_tokens: Number(usageRaw.completion_tokens) || 0,
      cached_tokens:
        Number(usageRaw.prompt_tokens_details?.cached_tokens)
        || Number(usageRaw.prompt_cache_hit_tokens)
        || 0,
    }
    : undefined;

  return { content, raw: data, usage };
}

function extractUsageFromChunk(json: any): ChatUsage | undefined {
  const usageRaw = json?.usage;
  if (!usageRaw || typeof usageRaw !== 'object') return undefined;
  return {
    prompt_tokens: Number(usageRaw.prompt_tokens) || 0,
    completion_tokens: Number(usageRaw.completion_tokens) || 0,
    cached_tokens:
      Number(usageRaw.prompt_tokens_details?.cached_tokens)
      || Number(usageRaw.prompt_cache_hit_tokens)
      || 0,
  };
}

// ===================== DeepSeek API 调用（流式） =====================
async function chatStream(
  req: ChatRequest,
  onChunk: StreamCallback
): Promise<ChatResponse> {
  assertInputSafe(req);
  const apiKey = requireApiKey(req);
  const provider = resolveProvider(req);
  const apiUrl = resolveProviderApiUrl(provider, req);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onExternalAbort = () => {
    try { controller.abort(); } catch { /* ignore */ }
  };
  if (req.abortSignal) {
    if (req.abortSignal.aborted) onExternalAbort();
    else req.abortSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const body = {
    model: req.model ?? DEFAULT_MODEL,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.max_tokens ?? 1024,
    stream: true, // 启用流式
    stream_options: { include_usage: true },
    ...(req.response_format && { response_format: req.response_format }),
    ...(req.thinking && { thinking: req.thinking }),
    ...(req.reasoning_effort && { reasoning_effort: req.reasoning_effort }),
  };

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    // 仅客户端主动中止退额度；超时仍走网络错误路径
    if (req.abortSignal?.aborted) {
      const err = new Error('CLIENT_ABORTED') as Error & { code?: string; name?: string };
      err.code = 'CLIENT_ABORTED';
      err.name = 'AbortError';
      throw err;
    }
    throwProviderNetworkError(provider, error);
  } finally {
    clearTimeout(t);
    req.abortSignal?.removeEventListener?.('abort', onExternalAbort);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throwProviderApiError(provider, res.status, res.statusText, text);
  }

  // 处理流式响应
  const reader = res.body?.getReader();
  if (!reader) {
    if (provider === 'deepseek') {
      const err = new Error('AI 助教响应异常，请稍后重试。') as Error & { code?: string };
      err.code = 'DEEPSEEK_EMPTY_BODY';
      throw err;
    }
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let fullReasoning = '';
  let fullContent = '';
  let buffer = '';
  let lastUsage: ChatUsage | undefined;
  const excludeReasoning = req.excludeReasoningFromStream === true;

  try {
    while (true) {
      if (req.abortSignal?.aborted) {
        try { controller.abort(); } catch { /* ignore */ }
        const err = new Error('CLIENT_ABORTED') as Error & { code?: string; name?: string };
        err.code = 'CLIENT_ABORTED';
        err.name = 'AbortError';
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) break;

      // 解码当前块
      buffer += decoder.decode(value, { stream: true });
      
      // 按行分割（SSE 格式）
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后一个不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^data:\s*\[DONE\]\s*$/i.test(trimmed)) continue;
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.replace(/^data:\s*/, '');
        if (!payload) continue;

        let json: any;
        try {
          json = JSON.parse(payload);
        } catch (parseError) {
          // 仅在 JSON 真正无法解析时记录该日志，避免误吞业务/回调异常。
          console.warn('Failed to parse SSE line:', trimmed, parseError);
          continue;
        }

        const chunkUsage = extractUsageFromChunk(json);
        if (chunkUsage) lastUsage = chunkUsage;

        const reasoningDelta =
          json?.choices?.[0]?.delta?.reasoning_content
          || json?.choices?.[0]?.message?.reasoning_content
          || '';
        const contentDelta =
          json?.choices?.[0]?.delta?.content
          || json?.choices?.[0]?.message?.content
          || '';

        if (!reasoningDelta && !contentDelta) continue;

        if (reasoningDelta) fullReasoning += reasoningDelta;
        if (contentDelta) fullContent += contentDelta;

        fullText = excludeReasoning ? fullContent : fullReasoning + fullContent;
        const delta = excludeReasoning ? contentDelta : (contentDelta || reasoningDelta);

        try {
          assertOutputSafe(fullText || fullReasoning);
        } catch (error) {
          if (error instanceof ContentModerationError) {
            controller.abort();
          }
          throw error;
        }

        // 回调异常应直接向上抛出，由上层判断是客户端断开还是上游失败。
        await onChunk(delta, fullText, {
          reasoningText: fullReasoning,
          contentText: fullContent,
          hasReasoningDelta: Boolean(reasoningDelta),
          hasContentDelta: Boolean(contentDelta),
        });
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullText, raw: { fullText, usage: lastUsage }, usage: lastUsage };
}

export const deepseekModel = { chat, chatStream };

// 挂载到全局对象（可选）
// @ts-ignore
global.Hydro = global.Hydro || {};
// @ts-ignore
global.Hydro.model = global.Hydro.model || {};
// @ts-ignore
global.Hydro.model.deepseek = deepseekModel;

// ===================== 类型声明扩展 =====================
declare module 'hydrooj' {
  interface Model {
    deepseek: typeof deepseekModel;
  }
}