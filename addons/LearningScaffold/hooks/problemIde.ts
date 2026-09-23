import { Context, PRIV } from 'hydrooj';
import { getChoice, getLearningProblem } from '../model/learning';

export function bindScaffoldOnProblemIde(ctx: Context) {
    ctx.on('handler/after', async (that: any) => {
        const body = that.response?.body;
        if (!body) return;
        if (that.response.template !== 'problem_ide.html' && body.page_name !== 'problem_ide') return;
        body.learning = body.learning || { scaffoldEnabled: false, tutorEnabled: false };
        // 管理员可在题面标签栏看到「辅助编码」入口（脚手架按题配置，需 PRIV_EDIT_SYSTEM）
        try {
            body.canManageScaffold = !!(
                that.user
                && typeof that.user.hasPriv === 'function'
                && that.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
            );
        } catch {
            body.canManageScaffold = false;
        }
        try {
            const pdoc = body.pdoc;
            const pid = String(pdoc?.pid || pdoc?.docId || '');
            const domainId = that.args?.domainId;
            if (!pid || !domainId) return;
            const meta = await getLearningProblem(ctx, domainId, pid);
            if (!meta || meta.enabled !== true) return;
            const uid = that.user?._id || 0;
            const choice = uid ? await getChoice(ctx, uid, domainId, pid) : null;
            body.learning.scaffoldEnabled = true;
            body.learning.scaffold = {
                pid,
                domainId,
                hasChoice: !!choice,
                mode: choice?.mode ?? null,
                scaffoldLevel: choice?.scaffoldLevel ?? null,
                selectUrl: '/learning-scaffold/select',
                configUrl: `/learning-scaffold/config/${encodeURIComponent(pid)}`,
                concepts: meta?.concepts || [],
            };
        } catch {
            /* 脚手架挂掉时 IDE 退化为普通 OJ */
        }
    });
}
