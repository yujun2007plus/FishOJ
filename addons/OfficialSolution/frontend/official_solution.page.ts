import './official_solution.css';
import { addPage, NamedPage } from '@hydrooj/ui-default';

addPage(new NamedPage(['problem_edit', 'problem_create', 'markdown_edit'], async () => {
    document.documentElement.classList.add('fish-cf-edit');
}));
