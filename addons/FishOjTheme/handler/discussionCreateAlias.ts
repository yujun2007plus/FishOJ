import { Handler } from 'hydrooj';

/**
 * Hydro 把 /discuss/:did 当成帖子详情，did 必须是 ObjectId。
 * /discuss/create 会变成 did="create"，校验失败「字段 did 验证失败」。
 * 官方创建路由是 /discuss/:type/:name/create，这里把误链 302 过去。
 */
export class DiscussionCreateAliasHandler extends Handler {
    async get() {
        const domainId = String(this.args?.domainId || this.domain?._id || 'system');
        let name: string | undefined;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const discussion = require('hydrooj/src/model/discussion');
            const nodes = await discussion.getNodes(domainId);
            const first = Array.isArray(nodes) ? nodes[0] : null;
            name = first?.docId != null ? String(first.docId) : undefined;
        } catch {
            name = undefined;
        }
        if (name) {
            this.response.redirect = this.url('discussion_create', { type: 'node', name });
            return;
        }
        this.response.redirect = this.url('discussion_main');
    }
}
