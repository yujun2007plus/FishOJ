import { addPage, NamedPage } from '@hydrooj/ui-default';
import { initScaffoldGenerate } from './scaffoldGenerate';

addPage(new NamedPage(['manage_coding_assist_problem'], () => {
    initScaffoldGenerate();
}));
