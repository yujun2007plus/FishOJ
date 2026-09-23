import { Context, PRIV } from 'hydrooj';
import { ScaffoldConfigHandler, ScaffoldSelectHandler } from './handler/scaffold';
import { ScaffoldAdminHandler } from './handler/scaffoldAdmin';
import { ScaffoldGenerateHandler } from './handler/scaffoldGenerate';
import { ScaffoldSettingsHandler } from './handler/scaffoldSettings';
import {
    ScaffoldAdminLegacyRedirectHandler,
    ScaffoldManageHandler,
    ScaffoldManageProblemHandler,
} from './handler/scaffoldManage';
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
    ctx.Route('learning_scaffold_generate', '/learning-scaffold/generate', ScaffoldGenerateHandler);
    ctx.Route('learning_scaffold_admin', '/learning-scaffold/admin/:pid', ScaffoldAdminHandler);
    ctx.Route('manage_coding_assist', '/manage/coding-assist', ScaffoldManageHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_scaffold', '/manage/scaffold', ScaffoldSettingsHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route(
        'manage_coding_assist_problem',
        '/manage/coding-assist/:pid',
        ScaffoldManageProblemHandler,
        PRIV.PRIV_EDIT_SYSTEM,
    );
    ctx.Route(
        'learning_scaffold_admin_redirect',
        '/learning-scaffold/manage/:pid',
        ScaffoldAdminLegacyRedirectHandler,
        PRIV.PRIV_EDIT_SYSTEM,
    );
    ctx.injectUI('ControlPanel', 'manage_coding_assist', { icon: 'code', before: 'manage_ai_tutor' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.injectUI('ControlPanel', 'manage_scaffold', { icon: 'wrench', after: 'manage_coding_assist' }, PRIV.PRIV_EDIT_SYSTEM);
    ctx.i18n.load('zh', {
        learning_scaffold_admin: '教学脚手架',
        manage_coding_assist: '辅助编码管理',
        manage_coding_assist_problem: '辅助编码题目配置',
        manage_scaffold: '脚手架生成设置',
    });
    ctx.i18n.load('en', {
        learning_scaffold_admin: 'Learning Scaffold',
        manage_coding_assist: 'Coding Assist',
        manage_coding_assist_problem: 'Coding Assist Problem',
        manage_scaffold: 'Scaffold Generation',
    });
    bindScaffoldOnProblemIde(ctx);
}
