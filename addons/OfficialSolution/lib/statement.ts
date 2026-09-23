/** 读取 Hydro 题面为中文 Markdown（兼容纯文本 / JSON / 多语言对象） */
export function readProblemStatement(content: unknown): string {
    if (content == null) return '';
    if (typeof content === 'object') {
        const o = content as Record<string, unknown>;
        const zh = o.zh ?? o.en;
        return zh == null ? '' : String(zh);
    }
    const raw = String(content);
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && /"zh"\s*:/.test(trimmed)) {
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            return String(parsed.zh ?? parsed.en ?? '');
        } catch {
            return raw;
        }
    }
    return raw;
}

export function writeProblemStatement(prev: unknown, zh: string): unknown {
    if (prev && typeof prev === 'object') {
        return { ...(prev as Record<string, unknown>), zh };
    }
    if (typeof prev === 'string' && prev.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(prev) as Record<string, unknown>;
            return JSON.stringify({ ...parsed, zh });
        } catch {
            /* 按纯文本写回 */
        }
    }
    return zh;
}
