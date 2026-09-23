import { getEffectiveScaffoldSettings } from './scaffoldSettings';

/**
 * 脚手架生成器专用 LLM 客户端（非流式）。
 * 精简自 AiAnalysis/lib/aiChatClient.ts 的 chat()：OpenAI 兼容 /chat/completions，
 * 强制 JSON 输出，60s 超时，错误转成对用户友好的中文提示。
 * 不与其它插件共享 key：独立 fishoj.scaffold.* 配置。
 */

const TIMEOUT_MS = 60_000;

export interface ScaffoldChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ScaffoldChatResult {
    content: string;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}

export class ScaffoldLlmError extends Error {
    public readonly code?: string;
    constructor(message: string, code?: string) {
        super(message);
        this.name = 'ScaffoldLlmError';
        if (code) this.code = code;
    }
}

function friendlyError(status: number, upstream: string): ScaffoldLlmError {
    const snippet = String(upstream || '').trim().slice(0, 300);
    switch (status) {
        case 401:
            return new ScaffoldLlmError('脚手架生成鉴权失败：服务密钥无效或已失效，请联系管理员更新配置。', 'SCAFFOLD_LLM_401');
        case 402:
            return new ScaffoldLlmError('脚手架生成失败：模型账户余额不足，请联系管理员。', 'SCAFFOLD_LLM_402');
        case 429:
            return new ScaffoldLlmError('脚手架生成请求过于频繁，请稍后再试。', 'SCAFFOLD_LLM_429');
        case 500:
        case 503:
            return new ScaffoldLlmError('脚手架生成服务暂时异常，请稍后重试。', 'SCAFFOLD_LLM_5XX');
        default:
            return new ScaffoldLlmError(
                `脚手架生成失败（HTTP ${status}）。${snippet ? `上游：${snippet}` : ''}`,
                'SCAFFOLD_LLM_HTTP',
            );
    }
}

function extractContent(data: any): string {
    return String(
        data?.choices?.[0]?.message?.content
        ?? data?.choices?.[0]?.text
        ?? '',
    );
}

/**
 * 调用 LLM，强制 JSON 输出。
 * opts.system / opts.user 为提示词；本函数负责拼 message、注入密钥、解析返回。
 */
export async function generateScaffoldJson(opts: {
    system: string;
    user: string;
}): Promise<ScaffoldChatResult> {
    const { key, base, model } = getEffectiveScaffoldSettings();
    if (!key) {
        throw new ScaffoldLlmError(
            '未配置脚手架生成模型密钥。请在环境变量设置 FISHOJ_AI_API_KEY / DEEPSEEK_API_KEY，或在控制面板保存 API Key。',
            'SCAFFOLD_LLM_NO_KEY',
        );
    }
    const url = `${base.replace(/\/$/, '')}/chat/completions`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        let res: Response;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: opts.system },
                        { role: 'user', content: opts.user },
                    ],
                }),
                signal: controller.signal,
            });
        } catch (e: unknown) {
            const name = String((e as any)?.name || '');
            if (name === 'AbortError' || /aborted|timeout/i.test(String((e as any)?.message || ''))) {
                throw new ScaffoldLlmError('脚手架生成超时，请稍后重试。', 'SCAFFOLD_LLM_TIMEOUT');
            }
            throw new ScaffoldLlmError('无法连接脚手架生成服务，请检查网络或 base_url 配置后重试。', 'SCAFFOLD_LLM_NETWORK');
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw friendlyError(res.status, body);
        }

        const data = await res.json().catch(() => ({}));
        const content = extractContent(data);
        if (!content) {
            throw new ScaffoldLlmError('脚手架生成模型返回了空内容，请稍后重试。', 'SCAFFOLD_LLM_EMPTY');
        }
        return {
            content,
            usage: data?.usage
                ? {
                    prompt_tokens: Number(data.usage.prompt_tokens) || 0,
                    completion_tokens: Number(data.usage.completion_tokens) || 0,
                }
                : undefined,
        };
    } finally {
        clearTimeout(timer);
    }
}
