import './scaffold.css';
import { addPage, NamedPage } from '@hydrooj/ui-default';
import { initLearningScaffold } from './scaffold';

if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-loaded');
}

addPage(new NamedPage(['problem_ide'], async () => {
    initLearningScaffold();
}));
