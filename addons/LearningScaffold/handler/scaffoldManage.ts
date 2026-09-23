import {
    Handler, param, PRIV, ProblemModel, Types,
} from 'hydrooj';
import { DEMO_META, DEMO_SCAFFOLDS } from '../lib/demoTemplates';
import {
    getLearningProblem, listLearningProblems, listScaffolds, upsertLearningProblem, upsertScaffold,
} from '../model/learning';

function parseLines(s: string): string[] {
    return String(s || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
}

async function saveProblemEdit(
    ctx: any,
    domainId: string,
    key: string,
    a: Record<string, unknown>,
) {
    const flag = (k: string) => a[k] === 'on' || a[k] === true || a[k] === '1';
    const str = (k: string) => String(a[k] ?? '');
    const stageRows = parseLines(str('stages')).map((line) => {
        const [id, ...rest] = line.split('|');
        return { id: (id || '').trim(), title: rest.join('|').trim() || (id || '').trim() };
    }).filter((s) => s.id);
    await upsertLearningProblem(ctx, domainId, key, {
        enabled: flag('enabled'),
        tutorEnabled: flag('tutorEnabled'),
        assistantEnabled: flag('assistantEnabled'),
        analysisEnabled: flag('analysisEnabled'),
        objectives: parseLines(str('objectives')),
        concepts: parseLines(str('concepts')),
        commonMistakes: parseLines(str('commonMistakes')),
        stages: stageRows,
        protectedStages: parseLines(str('protectedStages')),
    });
    const pairs: Array<[string, number, string]> = [
        ['python', 0, str('py0')], ['python', 1, str('py1')], ['python', 3, str('py3')],
        ['cpp', 0, str('cpp0')], ['cpp', 1, str('cpp1')], ['cpp', 3, str('cpp3')],
    ];
    for (const [language, level, code] of pairs) {
        await upsertScaffold(ctx, {
            domainId, pid: key, language, level, code,
        });
    }
}

export class ScaffoldManageHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    async get(domainId: string) {
        const rows = await listLearningProblems(this.ctx, domainId);
        const items: Array<{
            pid: string;
            title: string;
            enabled: boolean;
            tutorEnabled: boolean;
            assistantEnabled: boolean;
            analysisEnabled: boolean;
        }> = [];
        for (const row of rows) {
            const pdoc = await ProblemModel.get(domainId, row.pid);
            items.push({
                pid: row.pid,
                docId: pdoc?.docId,
                title: pdoc?.title || row.pid,
                enabled: row.enabled === true,
                tutorEnabled: row.tutorEnabled !== false,
                assistantEnabled: row.assistantEnabled !== false,
                analysisEnabled: row.analysisEnabled !== false,
            });
        }
        this.response.template = 'manage_coding_assist.html';
        this.response.body = {
            page_name: 'manage_coding_assist',
            items,
        };
    }

    @param('pid', Types.String)
    async postOpen(_domainId: string, pid: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        this.response.redirect = this.url('manage_coding_assist_problem', { pid: String(pid).trim() });
    }
}

export class ScaffoldManageProblemHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    @param('pid', Types.String)
    async get(domainId: string, pid: string) {
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        const meta = await getLearningProblem(this.ctx, domainId, key);
        const scaffolds = await listScaffolds(this.ctx, domainId, key);
        const py: Record<number, string> = {};
        const cpp: Record<number, string> = {};
        for (const sc of scaffolds) {
            if (sc.language === 'python') py[sc.level] = sc.code;
            if (sc.language === 'cpp') cpp[sc.level] = sc.code;
        }
        this.response.template = 'manage_coding_assist_problem.html';
        this.response.body = {
            page_name: 'manage_coding_assist_problem',
            pdoc,
            pid: key,
            meta,
            py,
            cpp,
        };
    }

    @param('pid', Types.String)
    async postFillDemo(domainId: string, pid: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        await upsertLearningProblem(this.ctx, domainId, key, {
            enabled: true,
            tutorEnabled: true,
            assistantEnabled: true,
            analysisEnabled: true,
            ...DEMO_META,
        });
        for (const [language, levels] of Object.entries(DEMO_SCAFFOLDS)) {
            for (const [lv, code] of Object.entries(levels)) {
                await upsertScaffold(this.ctx, {
                    domainId, pid: key, language, level: Number(lv), code,
                });
            }
        }
        this.back();
    }

    @param('pid', Types.String)
    async postSave(domainId: string, pid: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        await saveProblemEdit(this.ctx, domainId, key, this.args as Record<string, unknown>);
        this.back();
    }
}

export class ScaffoldAdminLegacyRedirectHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    @param('pid', Types.String)
    async get(_domainId: string, pid: string) {
        this.response.redirect = this.url('manage_coding_assist_problem', { pid });
    }
}
