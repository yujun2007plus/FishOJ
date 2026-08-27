import { Context } from 'hydrooj';
import { ScaffoldConfigHandler, ScaffoldSelectHandler } from './handler/scaffold';
import { ScaffoldAdminHandler } from './handler/scaffoldAdmin';
import { bindScaffoldOnProblemIde } from './hooks/problemIde';
import { problemColl, scaffoldColl, choiceColl } from './model/learning';
import './types';

export function apply(ctx: Context) {
    ctx.inject(['db'], async (c) => {
        await problemColl(c).createIndex({ domainId: 1, pid: 1 }, { unique: true });
        await scaffoldColl(c).createIndex(
            { domainId: 1, pid: 1, language: 1, level: 1 },
            { unique: true },
        );
        await choiceColl(c).createIndex({ uid: 1, domainId: 1, pid: 1 }, { unique: true });
    });
    ctx.Route('learning_scaffold_config', '/learning-scaffold/config/:pid', ScaffoldConfigHandler);
    ctx.Route('learning_scaffold_select', '/learning-scaffold/select', ScaffoldSelectHandler);
    ctx.Route('learning_scaffold_admin', '/learning-scaffold/admin/:pid', ScaffoldAdminHandler);
    ctx.i18n.load('zh', { learning_scaffold_admin: '教学脚手架' });
    ctx.i18n.load('en', { learning_scaffold_admin: 'Learning Scaffold' });
    bindScaffoldOnProblemIde(ctx);
}
