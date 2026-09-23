import { Context, PRIV } from 'hydrooj';
import { MarkdownEditHandler } from './handler/markdownEdit';
import { SolutionEditHandler, SolutionManageHandler } from './handler/solutionEdit';
import { bindOfficialSolutionOnProblemEdit } from './hooks/problemEdit';
import { bindOfficialSolutionOnProblemIde } from './hooks/problemIde';

export function apply(ctx: Context) {
    ctx.Route('manage_problem_solution', '/manage/problem-solution', SolutionManageHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_problem_solution_edit', '/manage/problem-solution/:pid', SolutionEditHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('markdown_edit', '/markdown_edit', MarkdownEditHandler);
    ctx.injectUI('ControlPanel', 'manage_problem_solution', { icon: 'file', after: 'manage_ai_analysis' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.i18n.load('zh', {
        manage_problem_solution: '题解编辑',
        markdown_edit: '编辑题面与题解',
        TextSol: '官方题解',
    });
    ctx.i18n.load('en', {
        manage_problem_solution: 'Problem Solutions',
        markdown_edit: 'Edit statement and solution',
        TextSol: 'Official solution',
    });
    bindOfficialSolutionOnProblemIde(ctx);
    bindOfficialSolutionOnProblemEdit(ctx);
}
