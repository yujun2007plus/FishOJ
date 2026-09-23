import { Handler, PERM, PRIV, ProblemModel } from 'hydrooj';
import { getTextSolution } from '../../OfficialSolution/lib/ProblemSolutionUtils';
import { readProblemStatement } from '../../OfficialSolution/lib/statement';
import { generateScaffoldJson } from '../lib/llmClient';
import { buildScaffoldSystemPrompt, buildScaffoldUserPrompt, intersectGenLangs } from '../lib/scaffoldPrompts';
import { parseAndValidateScaffold } from '../lib/scaffoldParse';

/**
 * POST /learning-scaffold/generate
 * 依据题面 + 官方题解（可选）生成三档渐进脚手架。
 * 只生成、不落库：返回 payload 由前端回填到管理表单，人工确认后经现有 postSave 保存。
 */
export class ScaffoldGenerateHandler extends Handler {
    async prepare() {
        if (this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) return;
        this.checkPerm(PERM.PERM_EDIT_PROBLEM);
    }

    async post() {
        this.response.type = 'application/json';
        const domainId = this.args.domainId as string;
        const pid = String((this.args as Record<string, unknown>).pid || '').trim();
        if (!pid) {
            this.response.body = { ok: false, error: '缺少题目编号' };
            return;
        }

        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) {
            this.response.body = { ok: false, error: '题目不存在' };
            return;
        }

        const statement = readProblemStatement(pdoc.content);
        if (!statement.trim()) {
            this.response.body = { ok: false, error: '题面为空，无法生成脚手架' };
            return;
        }

        const langs = intersectGenLangs((pdoc.config as { langs?: string[] } | undefined)?.langs);

        let solution = '';
        try {
            solution = await getTextSolution(domainId, pdoc);
        } catch {
            solution = '';
        }

        let content: string;
        try {
            const res = await generateScaffoldJson({
                system: buildScaffoldSystemPrompt(),
                user: buildScaffoldUserPrompt({ statement, solution, langs }),
            });
            content = res.content;
        } catch (e) {
            this.response.body = {
                ok: false,
                error: e instanceof Error ? e.message : '脚手架生成失败',
            };
            return;
        }

        const validated = parseAndValidateScaffold(content);
        if (!validated.ok) {
            this.response.body = { ok: false, error: `生成结果不合规：${validated.error}` };
            return;
        }

        this.response.body = {
            ok: true,
            hasSolution: !!solution.trim(),
            payload: validated.payload,
        };
    }
}
