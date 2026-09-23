import { normalizeLangKey } from './policy';

/** 生成器输出的语言：v1 只做 python + cpp（与现有管理表单六个 textarea 对齐） */
export const SCAFFOLD_GEN_LANGS = ['python', 'cpp'] as const;
export const SCAFFOLD_LEVELS = ['0', '1', '3'] as const;
export const SCAFFOLD_FENCE_LANG = 'scaffold-def';

/** 题目侧可用语言 ∩ 生成器支持语言 */
export function intersectGenLangs(langs: unknown): string[] {
    const list = Array.isArray(langs) ? langs.map((x) => String(x)) : [];
    if (!list.length) return [...SCAFFOLD_GEN_LANGS];
    const out: string[] = [];
    for (const l of SCAFFOLD_GEN_LANGS) {
        if (list.some((k) => normalizeLangKey(k) === l)) out.push(l);
    }
    return out.length ? out : [...SCAFFOLD_GEN_LANGS];
}

function truncate(text: string, maxLen: number): string {
    const s = String(text || '').trim();
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}…(已截断)`;
}

/** 教学脚手架生成 system prompt：角色、代码风格、挖空约定、三档递进规则、输出契约 */
export function buildScaffoldSystemPrompt(): string {
    return [
        '你是面向少儿编程培训的「教学脚手架生成器」。',
        '你根据题目与参考解，为同一道题生成三套 Python 与 C++ 代码模板，代码完成度逐档递进，用于规范学生的解题代码结构。',
        '',
        '【代码风格（严格遵循）】',
        '- ACM 风格：输入输出写在主函数里，题目要实现的功能写在外部函数里。',
        '- 语法简洁，不用高级特性、不用 lambda 技巧、不压缩代码。',
        '- 每段代码带中文注释，关键步骤必须加注释。',
        '- 变量名清晰（如 max_value、answer），不要用 a、x 这类无意义单字母（题目本身约定除外）。',
        '- 默认输入数据合法，不必写输入校验。',
        '',
        '【挖空约定（必须遵守，这是本功能的核心）】',
        '- 表达式级挖空：用连续至少 6 个下划线 `______` 表示「填一个值/条件/步长/比较对象」。',
        '- 语句块级挖空：用 `# TODO(n): 提示`（Python）或 `// TODO(n): 提示`（C++）占位整段逻辑，其中 n 为从 1 递增的序号，提示用简短中文说明这一块要做什么。',
        '- 已写出的 import、变量声明、控制流骨架、函数签名、注释属于「非必要部分」，应保留（规范代码用）。',
        '- 挖空只针对「解题的核心算法步骤」，不要挖输入输出、不要挖函数声明。',
        '',
        '【三档递进规则】',
        '先生成一份完整正确的参考解，再从参考解派生三档：',
        '- S0（空白模版）：只保留 IO / 入口 / 类与函数声明，以及每一步的中文注释；全部算法逻辑挖空（核心处用 TODO 整块挖空，其余用 ______ 表达式挖空）。S0 里不得出现任何完整算法逻辑。',
        '- S1（结构模版）：补上变量声明、控制流骨架（if/for 框架）、函数签名，但条件、步长、比较、更新等关键位置仍挖空（______）。',
        '- S3（基础完成）：只把最关键的 1~3 处核心步骤（见 protectedStages）挖空，其余全部补全。',
        '- 三档的挖空数量必须满足：S0 > S1 >= S3 >= 1。',
        '',
        '【protectedStages】',
        '- 把「解题思路」中的核心算法步骤（如比较、更新最大值、状态转移、递归出口、贪心选择）列进 protectedStages（用 stages 里的 id）。',
        '- 这些步骤即使到了 S3 也必须保留挖空，绝不直接写出答案。',
        '',
        '【输出格式｜只输出 JSON，不要 Markdown，不要解释】',
        '只输出一个 JSON 对象，不要用 ``` 围栏包裹，字段如下：',
        '{',
        '  "langs": ["python","cpp"],',
        '  "stages": [{"id":"read_input","title":"读取输入"}, ...],',
        '  "protectedStages": ["compare_b", "compare_c"],',
        '  "concepts": ["条件判断", "最大值变量"],',
        '  "commonMistakes": ["max_value 初始化为 0"],',
        '  "templates": {',
        '    "python": {"0":"S0 代码", "1":"S1 代码", "3":"S3 代码"},',
        '    "cpp":    {"0":"S0 代码", "1":"S1 代码", "3":"S3 代码"}',
        '  }',
        '}',
        '- stages 每项是 {id,title}，id 用下划线英文（如 read_input / compare_b）。',
        '- templates 里每个语言的 0/1/3 三档代码都必须是非空字符串，代码内可包含换行。',
        '- 不要输出 JSON 以外的任何文字。',
    ].join('\n');
}

export interface ScaffoldPromptInput {
    statement: string;
    solution: string;
    langs: string[];
}

/** 拼装 user prompt：题面 + 参考解（有无两档材料策略）+ 语言清单 */
export function buildScaffoldUserPrompt(input: ScaffoldPromptInput): string {
    const blocks: string[] = [];
    blocks.push(`【题目】\n${truncate(input.statement, 8000)}`);

    if (input.solution.trim()) {
        blocks.push(`【官方题解｜作参考解】\n${truncate(input.solution, 8000)}`);
        blocks.push('【材料策略】以官方题解为正确思路来源，参考解即模板母本，三档从它派生挖空。');
    } else {
        blocks.push('【官方题解】（无）');
        blocks.push('【材料策略】本题暂无官方题解：请先自行确定解题思路并写出完整参考解，再从参考解派生三档。若无法确定算法，请明确降低模板质量并优先给出最简单的可行解法。');
    }

    blocks.push(`【可用语言】${input.langs.join('、')}`);
    blocks.push('请按 system 要求生成三档递进脚手架，只输出 JSON。');
    return blocks.join('\n\n');
}
