import {
    Handler, param, PERM, ProblemModel, Types,
} from 'hydrooj';
import { DEMO_META, DEMO_SCAFFOLDS } from '../lib/demoTemplates';
import {
    getLearningProblem, listScaffolds, upsertLearningProblem, upsertScaffold,
} from '../model/learning';

function parseLines(s: string): string[] {
    return String(s || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
}

export class ScaffoldAdminHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM.PERM_EDIT_PROBLEM);
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
        this.response.template = 'scaffold_admin.html';
        this.response.body = {
            page_name: 'learning_scaffold_admin',
            pdoc,
            pid: key,
            meta,
            scaffolds,
            py,
            cpp,
        };
    }

    @param('pid', Types.String)
    async postFillDemo(domainId: string, pid: string) {
        this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        await upsertLearningProblem(this.ctx, domainId, key, {
            enabled: true,
            tutorEnabled: true,
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
        this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const a = this.args as Record<string, unknown>;
        const flag = (k: string) => a[k] === 'on' || a[k] === true || a[k] === '1';
        const str = (k: string) => String(a[k] ?? '');
        const pdoc = await ProblemModel.get(domainId, pid);
        const key = String(pdoc?.pid || pdoc?.docId || pid);
        const stageRows = parseLines(str('stages')).map((line) => {
            const [id, ...rest] = line.split('|');
            return { id: (id || '').trim(), title: rest.join('|').trim() || (id || '').trim() };
        }).filter((s) => s.id);
        await upsertLearningProblem(this.ctx, domainId, key, {
            enabled: flag('enabled'),
            tutorEnabled: flag('tutorEnabled'),
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
            await upsertScaffold(this.ctx, {
                domainId, pid: key, language, level, code,
            });
        }
        this.back();
    }
}
