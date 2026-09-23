// FishOjTheme 全局主题：导入深海鎏金样式表。
// 该 CSS 会被 Hydro 前端构建收集进全局 entry.js，对整站所有页面生效。
// 首屏关键色已在 layout/html5.html 内联，这里补齐其余规则，不再用隐藏 body 防 FOUC。
import './theme.css';
import './tags_sidebar.css';
import './pages_gilded.css';
import './train_gilded.css';
import './contest_gilded.css';
import './homework_gilded.css';
import './discussion_gilded.css';
import './manage_gilded.css';
// 讨论页状态增强（空状态三步引导/鎏金创建卡/节点磁贴/排序Tab）
import { initDiscussionStatus } from './discussion_status';
import { initFishDock } from './dock';
// 比赛列表页状态增强（三态徽标/倒计时/赛制分色/RATED火焰/人数热门）
import { initContestStatus } from './contest_status';
// 训练列表页状态增强（元信息徽标/规模分级/三态进度/右栏鎏金/筛选Tab）
import { initTrainStatus } from './train_status';
// 题库标签三维分组（来源/赛事/知识点）自注册到 problem_main / problem_category
import './tags_sidebar';

// 主题样式已注入，移除 FOUC 防护（保留 v3 基线逻辑）
if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
    // /discuss/create 会被官方当成帖子 id，点到即 ValidationError
    document.addEventListener('click', (ev) => {
        const a = (ev.target as Element | null)?.closest?.('a');
        if (!a) return;
        const path = (a.getAttribute('href') || '').split(/[?#]/)[0];
        if (!/(?:^|\/)discuss\/create\/?$/.test(path)) return;
        const prefix = location.pathname.match(/^(\/d\/[^/]+)/)?.[1] || '';
        const node = document.querySelector<HTMLAnchorElement>('a[href*="/discuss/node/"]');
        const href = node?.getAttribute('href') || '';
        const m = /\/discuss\/node\/([^/]+)\/?$/.exec(href.split(/[?#]/)[0]);
        ev.preventDefault();
        if (m && m[1] !== 'create') {
            window.location.href = `${prefix}/discuss/node/${encodeURIComponent(decodeURIComponent(m[1]))}/create`;
            return;
        }
        window.location.href = `${prefix}/discuss`;
    }, true);
}

// 全局 AI 悬浮入口（小方块 → 中等浮窗），全站可见
if (typeof document !== 'undefined') {
    const mountFishDock = () => {
        try { initFishDock(); } catch { /* dock 异常不影响整站渲染 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFishDock);
    else mountFishDock();
}

// 比赛列表页状态增强（倒计时 / LIVE 进度条 / 赛制分色等），全站注入后自动对 .contest__item 生效
if (typeof document !== 'undefined') {
    const mountContestStatus = () => {
        try { initContestStatus(); } catch { /* 比赛状态增强异常不影响整站渲染 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountContestStatus);
    else mountContestStatus();
}

// 训练列表页状态增强（徽标 / 状态 / 进度条 / 右栏 / 筛选Tab），全站注入后自动对 .training__item 生效
if (typeof document !== 'undefined') {
    const mountTrainStatus = () => {
        try { initTrainStatus(); } catch { /* 训练状态增强异常不影响整站渲染 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountTrainStatus);
    else mountTrainStatus();
}

// 讨论页状态增强（空状态引导 / 创建卡 / 节点磁贴 / 排序Tab），全站注入后自动对 /discuss* 生效
if (typeof document !== 'undefined') {
    const mountDiscussionStatus = () => {
        try { initDiscussionStatus(); } catch { /* 讨论状态增强异常不影响整站渲染 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDiscussionStatus);
    else mountDiscussionStatus();
}
