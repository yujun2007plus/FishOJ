import {
    Handler, param, PERM, PRIV, ProblemModel, Types,
} from 'hydrooj';
import { getTextSolution, saveTextSolution } from '../lib/ProblemSolutionUtils';
import { readProblemStatement, writeProblemStatement } from '../lib/statement';

/** 对齐 CodeFun MarkdownEdit：同一页编辑题面与官方题解 */
export class MarkdownEditHandler extends Handler {
    async prepare() {
        if (this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) return;
        this.checkPerm(PERM.PERM_EDIT_PROBLEM);
    }

    @param('pid', Types.String, true)
    async get(domainId: string, pid?: string) {
        const key = String(pid || this.request.query.pid || '').trim();
        if (!key) {
            this.response.redirect = this.url('manage_problem_solution');
            return;
        }
        const pdoc = await ProblemModel.get(domainId, key);
        if (!pdoc) {
            this.response.body = { message: `${key} not found` };
            return;
        }
        const solContent = await getTextSolution(domainId, pdoc);
        this.response.template = 'markdown_edit.html';
        this.response.body = {
            page_name: 'markdown_edit',
            pid: String(pdoc.pid || pdoc.docId),
            pdoc,
            content: readProblemStatement(pdoc.content),
            solContent,
            hasTextSol: !!solContent,
        };
    }

    @param('pid', Types.String)
    @param('content', Types.String, true)
    @param('solContent', Types.String, true)
    async post(domainId: string, pid: string, content?: string, solContent?: string) {
        const pdoc = await ProblemModel.get(domainId, pid);
        if (!pdoc) {
            this.response.status = 400;
            this.response.body = { error: '题目不存在' };
            return;
        }
        if (typeof content === 'string') {
            await ProblemModel.edit(domainId, pdoc.docId, {
                content: writeProblemStatement(pdoc.content, content) as any,
            });
        }
        if (typeof solContent === 'string') {
            await saveTextSolution(domainId, pdoc, solContent);
        }
        this.response.status = 200;
        this.response.body = { ok: true };
    }
}
