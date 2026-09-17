// FishOjTheme 全局主题：导入深海鎏金样式表。
// 该 CSS 会被 Hydro 前端构建收集进全局 entry.js，对整站所有页面生效。
// 首屏关键色已在 layout/html5.html 内联，这里补齐其余规则，不再用隐藏 body 防 FOUC。
import './theme.css';

if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
}
