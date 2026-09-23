import { Context } from 'hydrooj';
import { getTextSolution } from '../lib/ProblemSolutionUtils';

/** 官方编辑页注入题解状态，供 problem_edit.html 显示入口 */
export function bindOfficialSolutionOnProblemEdit(ctx: Context) {
    const attach = async (that: any) => {
        const pdoc = that.response?.body?.pdoc;
        const domainId = that.domain?._id || that.args?.domainId;
        if (!pdoc?.docId || !domainId) return;
        try {
            const textSol = await getTextSolution(domainId, pdoc);
            that.response.body.hasTextSol = !!textSol;
            pdoc.hasTextSol = !!textSol;
        } catch {
            that.response.body.hasTextSol = false;
        }
    };
    ctx.on('handler/after/ProblemEdit#get', attach);
    ctx.on('handler/after/ProblemCreate#get', attach);
}
