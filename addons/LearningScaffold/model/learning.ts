import { Context } from 'hydrooj';
import type { LearningChoiceDoc, LearningProblemDoc, LearningScaffoldDoc } from '../types';

export function problemColl(ctx: Context) {
    return ctx.db.collection('fish_learning_problem');
}
export function scaffoldColl(ctx: Context) {
    return ctx.db.collection('fish_learning_scaffold');
}
export function choiceColl(ctx: Context) {
    return ctx.db.collection('fish_learning_choice');
}

export async function getLearningProblem(ctx: Context, domainId: string, pid: string) {
    return problemColl(ctx).findOne({ domainId, pid });
}

export async function upsertLearningProblem(
    ctx: Context,
    domainId: string,
    pid: string,
    patch: Partial<LearningProblemDoc>,
) {
    const now = new Date();
    const existing = await getLearningProblem(ctx, domainId, pid);
    const doc: LearningProblemDoc = {
        domainId,
        pid,
        enabled: patch.enabled ?? existing?.enabled ?? false,
        objectives: patch.objectives ?? existing?.objectives ?? [],
        secondarySkills: patch.secondarySkills ?? existing?.secondarySkills ?? [],
        concepts: patch.concepts ?? existing?.concepts ?? [],
        stages: patch.stages ?? existing?.stages ?? [],
        protectedStages: patch.protectedStages ?? existing?.protectedStages ?? [],
        commonMistakes: patch.commonMistakes ?? existing?.commonMistakes ?? [],
        maxHintLevel: patch.maxHintLevel ?? existing?.maxHintLevel ?? 4,
        tutorEnabled: patch.tutorEnabled ?? existing?.tutorEnabled ?? true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    };
    await problemColl(ctx).updateOne(
        { domainId, pid },
        { $set: doc },
        { upsert: true },
    );
    return doc;
}

export async function getScaffold(
    ctx: Context,
    domainId: string,
    pid: string,
    language: string,
    level: number,
) {
    return scaffoldColl(ctx).findOne({ domainId, pid, language, level });
}

export async function listScaffolds(ctx: Context, domainId: string, pid: string) {
    return scaffoldColl(ctx).find({ domainId, pid }).toArray();
}

export async function upsertScaffold(ctx: Context, doc: Omit<LearningScaffoldDoc, 'version'> & { version?: number }) {
    const prev = await getScaffold(ctx, doc.domainId, doc.pid, doc.language, doc.level);
    const next: LearningScaffoldDoc = {
        ...doc,
        version: (prev?.version || 0) + 1,
    };
    await scaffoldColl(ctx).updateOne(
        { domainId: doc.domainId, pid: doc.pid, language: doc.language, level: doc.level },
        { $set: next },
        { upsert: true },
    );
    return next;
}

export async function getChoice(ctx: Context, uid: number, domainId: string, pid: string) {
    if (!uid) return null;
    return choiceColl(ctx).findOne({ uid, domainId, pid });
}

export async function saveChoice(ctx: Context, doc: Omit<LearningChoiceDoc, 'updatedAt'>) {
    const next = { ...doc, updatedAt: new Date() };
    await choiceColl(ctx).updateOne(
        { uid: doc.uid, domainId: doc.domainId, pid: doc.pid },
        { $set: next },
        { upsert: true },
    );
    return next;
}
