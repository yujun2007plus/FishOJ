import { Context } from 'hydrooj';
import { attachDiscussCreateGuard } from './handler/discussionCreateAlias';

export function apply(ctx: Context) {
    const attach = (server: any) => attachDiscussCreateGuard(server);
    attach((ctx as any).server);
    ctx.inject(['server'], (c: any) => attach(c.server || c));
}
