/**
 * Hydro 官方先注册了 /discuss/:did，@koa/router 先匹配到它。
 * /discuss/create 的 did="create" 过不了 ObjectId，会 ValidationError。
 * 本层挂在路由之前，把误链 302 到 /discuss/node/<节点>/create。
 */
export async function fishojDiscussCreateLayer(c: any, next: () => Promise<void>) {
    const path = String(c.path || c.request?.path || '');
    if (!/\/discuss\/create\/?$/.test(path)) {
        await next();
        return;
    }
    const domainId = String(c.domainId || 'system');
    let name = '';
    try {
        const discussion = require('hydrooj/src/model/discussion');
        const nodes = await discussion.getNodes(domainId);
        if (Array.isArray(nodes) && nodes[0]?.docId != null) {
            name = String(nodes[0].docId);
        }
    } catch {
        name = '';
    }
    if (!name) name = 'news';
    const dest = `/discuss/node/${encodeURIComponent(name)}/create`;
    const orig = String(c.originalPath || '');
    const prefix = orig.startsWith('/d/') ? `/d/${domainId}` : '';
    c.status = 302;
    c.redirect(`${prefix}${dest}`);
}

export function attachDiscussCreateGuard(server: any) {
    if (!server || typeof server.addServerLayer !== 'function') return;
    if (server.__fishojDiscussCreateGuard) return;
    server.addServerLayer('fishoj-discuss-create', fishojDiscussCreateLayer);
    server.__fishojDiscussCreateGuard = true;
}
