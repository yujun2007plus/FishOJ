import './home.css';
import { addPage, NamedPage } from '@hydrooj/ui-default';

// 首页模板 page_name 为 "homepage"，同时兼容 "home" 避免遗漏
addPage(new NamedPage(['homepage', 'home'], () => {
    // 首页交互占位：后续可在此扩展打字机效果、统计数字滚动等
}));
