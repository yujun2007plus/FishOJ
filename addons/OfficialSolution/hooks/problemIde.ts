import { Context, PERM, PRIV } from 'hydrooj';
import { getTextSolution, listParentIdsWithTextSolution } from '../lib/ProblemSolutionUtils';

function excerpt(text: string, max = 360): string {
    const t = String(text || '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
}

export function bindOfficialSolutionOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        const template = String(that.response.template || '');
        const domainId = that.args?.domainId;
        try {
            if (template === 'problem_ide.html' || body.page_name === 'problem_ide') {
                const pdoc = body.pdoc;
                if (!domainId || !pdoc?.docId) return;
                const textSol = await getTextSolution(domainId, pdoc);
                if (textSol) pdoc.textSol = textSol;
                const u = that.user;
                body.canEditProblem = !!(u && (
                    u.hasPriv?.(PRIV.PRIV_EDIT_SYSTEM)
                    || u.hasPerm?.(PERM.PERM_EDIT_PROBLEM)
                    || u.own?.(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)
                ));
                return;
            }
            if (template === 'manage_coding_assist.html') {
                const items = body.items;
                if (!domainId || !Array.isArray(items)) return;
                const hasSol = await listParentIdsWithTextSolution(domainId);
                for (const it of items) {
                    const docId = Number(it.docId);
                    it.hasTextSol = Number.isFinite(docId) && hasSol.has(docId);
                }
                return;
            }
            if (
                template === 'manage_coding_assist_problem.html'
                || template === 'scaffold_admin.html'
            ) {
                const pdoc = body.pdoc;
                if (!domainId || !pdoc?.docId) return;
                const textSol = await getTextSolution(domainId, pdoc);
                body.hasTextSol = !!textSol;
                body.solPreview = excerpt(textSol);
            }
        } catch {
            /* 题解查询失败不影响做题或脚手架配置 */
        }
    });
}
