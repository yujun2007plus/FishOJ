import { SCAFFOLD_FENCE_LANG, SCAFFOLD_GEN_LANGS, SCAFFOLD_LEVELS } from './scaffoldPrompts';

export type ScaffoldStage = { id: string; title: string };

export type ScaffoldPayload = {
    langs: string[];
    stages: ScaffoldStage[];
    protectedStages: string[];
    concepts: string[];
    commonMistakes: string[];
    /** language -> level("0"|"1"|"3") -> code */
    templates: Record<string, Record<string, string>>;
};

export type ScaffoldHoleCount = { expression: number; block: number; total: number };

export type ScaffoldValidation =
    | { ok: true; payload: ScaffoldPayload }
    | { ok: false; error: string };

const FENCE_RE = new RegExp(
    `\`\`\`(?:${SCAFFOLD_FENCE_LANG}|json)?\\s*\\n([\\s\\S]*?)\\n?\\s*\`\`\``,
    'i',
);
const EXPR_HOLE_RE = /_{6,}/g;
const BLOCK_HOLE_RE = /(?:\/\/|#)\s*TODO\s*\(\s*\d+\s*\)/gi;

/** 模型可能包 fence 也可能带散文，这里尽力抠出首个 JSON 对象。 */
export function extractScaffoldJson(text: string): string {
    const raw = String(text || '').trim();
    if (!raw) return '';

    // 首选：命中的围栏内容（scaffold-def / json）
    const fence = raw.match(FENCE_RE);
    if (fence && fence[1]) {
        const inner = fence[1].trim();
        if (inner) return inner;
    }

    // 退而求其次：包了任意 ``` 围栏
    const anyFence = raw.match(/```[\s\S]*?```/);
    if (anyFence) {
        const inner = anyFence[0].replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '').trim();
        if (inner) return inner;
    }

    // 最后：整体首尾花括号截取
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return raw.slice(start, end + 1);
    return raw;
}

function asStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x ?? '').trim()).filter(Boolean);
}

function asStages(v: unknown): ScaffoldStage[] {
    if (!Array.isArray(v)) return [];
    const out: ScaffoldStage[] = [];
    for (const item of v) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const id = String(o.id ?? '').trim();
        if (!id) continue;
        out.push({ id, title: String(o.title ?? id).trim() || id });
    }
    return out;
}

export function parseScaffoldPayload(rawJson: string): ScaffoldPayload | null {
    let data: unknown;
    try {
        data = JSON.parse(rawJson);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object') return null;
    const o = data as Record<string, unknown>;

    const templatesIn = (o.templates && typeof o.templates === 'object' ? o.templates : {}) as Record<string, unknown>;
    const templates: Record<string, Record<string, string>> = {};
    for (const lang of SCAFFOLD_GEN_LANGS) {
        const lv = templatesIn[lang];
        if (!lv || typeof lv !== 'object') continue;
        const map: Record<string, string> = {};
        for (const level of SCAFFOLD_LEVELS) {
            const code = (lv as Record<string, unknown>)[level];
            if (typeof code === 'string' && code.trim()) map[level] = code;
        }
        if (Object.keys(map).length) templates[lang] = map;
    }

    return {
        langs: asStrArray(o.langs),
        stages: asStages(o.stages),
        protectedStages: asStrArray(o.protectedStages),
        concepts: asStrArray(o.concepts),
        commonMistakes: asStrArray(o.commonMistakes),
        templates,
    };
}

export function countHoles(code: string): ScaffoldHoleCount {
    const s = String(code || '');
    const expression = (s.match(EXPR_HOLE_RE) || []).length;
    const block = (s.match(BLOCK_HOLE_RE) || []).length;
    return { expression, block, total: expression + block };
}

/** 校验三档递进与防泄漏；返回规范后的 payload 或错误。 */
export function validateScaffold(payload: ScaffoldPayload): ScaffoldValidation {
    if (!Object.keys(payload.templates).length) {
        return { ok: false, error: '模型未返回任何语言模板' };
    }

    for (const [lang, levels] of Object.entries(payload.templates)) {
        if (!(SCAFFOLD_GEN_LANGS as readonly string[]).includes(lang)) {
            return { ok: false, error: `不支持的语言：${lang}` };
        }
        for (const level of SCAFFOLD_LEVELS) {
            const code = levels[level];
            if (!code || !String(code).trim()) {
                return { ok: false, error: `${lang} 的 S${level} 模板为空` };
            }
            levels[level] = String(code).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        }
        const s0 = countHoles(levels['0']).total;
        const s1 = countHoles(levels['1']).total;
        const s3 = countHoles(levels['3']).total;
        if (!(s0 > s1 && s1 >= s3 && s3 >= 1)) {
            return {
                ok: false,
                error: `${lang} 三档挖空数量不满足 S0>S1>=S3>=1（当前 S0=${s0} S1=${s1} S3=${s3}）`,
            };
        }
        if (s0 < 2) {
            return { ok: false, error: `${lang} 的 S0 空白模版挖空过少（${s0}），疑似把答案写出来了` };
        }
    }

    if (!payload.stages.length) {
        return { ok: false, error: '模型未返回解题阶段 stages' };
    }

    return { ok: true, payload };
}

/** 主入口：文本 → 校验通过的 payload，或错误描述。 */
export function parseAndValidateScaffold(text: string): ScaffoldValidation {
    const rawJson = extractScaffoldJson(text);
    if (!rawJson) return { ok: false, error: '模型输出为空' };
    const payload = parseScaffoldPayload(rawJson);
    if (!payload) return { ok: false, error: '模型输出不是合法 JSON' };
    return validateScaffold(payload);
}
