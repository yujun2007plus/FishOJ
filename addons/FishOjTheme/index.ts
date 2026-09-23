import { Context } from 'hydrooj';
import { DiscussionCreateAliasHandler } from './handler/discussionCreateAlias';

export function apply(ctx: Context) {
    // /discuss/create 会被官方 /discuss/:did 吃掉并 ValidationError，必须先注册静态别名。
    ctx.Route('fishoj_discussion_create_alias', '/discuss/create', DiscussionCreateAliasHandler);
}
