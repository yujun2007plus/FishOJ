import { DocumentModel, SolutionModel } from 'hydrooj';
import { getPublisherUids } from './solutionSettings';

function stringifyPlainText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        const maybeContent = (value as { content?: unknown }).content;
        if (maybeContent != null) return stringifyPlainText(maybeContent);
        const maybeZh = (value as { zh?: unknown }).zh;
        if (typeof maybeZh === 'string') return maybeZh;
    }
    return String(value);
}

async function findOfficialSolutionDocs(domainId: string, problemDocId: number) {
    const uids = getPublisherUids();
    return DocumentModel.getMulti(
        domainId,
        DocumentModel.TYPE_PROBLEM_SOLUTION,
        {
            parentType: DocumentModel.TYPE_PROBLEM,
            parentId: problemDocId,
            owner: { $in: uids },
        },
    ).toArray();
}

/** 读取官方文字题解（Mongo document，owner 在发布者 UID 列表内） */
export async function getTextSolution(domainId: string, pdoc: { docId: number }): Promise<string> {
    const psdocs = await findOfficialSolutionDocs(domainId, pdoc.docId);
    if (!psdocs.length) return '';
    return stringifyPlainText(psdocs[0]?.content).trim();
}

/** 域内已有非空官方文字题解的题目 parentId（Problem.docId） */
export async function listParentIdsWithTextSolution(domainId: string): Promise<Set<number>> {
    const uids = getPublisherUids();
    const psdocs = await DocumentModel.getMulti(
        domainId,
        DocumentModel.TYPE_PROBLEM_SOLUTION,
        {
            parentType: DocumentModel.TYPE_PROBLEM,
            owner: { $in: uids },
        },
    ).toArray();
    const ids = new Set<number>();
    for (const doc of psdocs) {
        if (stringifyPlainText(doc?.content).trim()) ids.add(Number(doc.parentId));
    }
    return ids;
}

/** 保存官方文字题解；无则新建，有则更新（与 CodeFun upload_sol API 一致） */
export async function saveTextSolution(
    domainId: string,
    pdoc: { docId: number },
    solContent: string,
): Promise<number> {
    const uids = getPublisherUids();
    const ownerUid = uids[0] ?? 2;
    const psdocs = await findOfficialSolutionDocs(domainId, pdoc.docId);
    if (!psdocs.length) {
        return SolutionModel.add(domainId, pdoc.docId, ownerUid, solContent);
    }
    await SolutionModel.edit(domainId, psdocs[0].docId, solContent);
    return psdocs[0].docId;
}
