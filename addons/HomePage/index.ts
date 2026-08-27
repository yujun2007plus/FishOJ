import { Context } from 'hydrooj';

// HomePage 插件：通过模板同名覆盖接管首页
// - templates/main.html 覆盖 ui-default 的默认首页模板（只有首页使用 main.html）
// - frontend/home.page.ts 注册页面级交互与样式（自动被 Hydro 前端构建收集）
export function apply(ctx: Context) {
    // 预留：后续如需首页动态数据（公告、统计），可在此监听 handler 钩子注入
}
