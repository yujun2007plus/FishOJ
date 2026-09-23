import './textsol_ide.css';
import { addPage, NamedPage } from '@hydrooj/ui-default';
import { watchOfficialTextSol } from './textsol_ide';

addPage(new NamedPage(['problem_ide'], async () => {
    try {
        watchOfficialTextSol();
    } catch {
        /* 不得让 OfficialSolution 拖垮 problem_ide afterLoading */
    }
}));
