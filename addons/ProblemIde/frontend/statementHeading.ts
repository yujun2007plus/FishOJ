export function injectStatementHeading() {
    const host = document.getElementById('problemIdeProblemContent');
    host?.querySelectorAll('.typo').forEach((el) => {
        el.classList.remove('typo');
        el.classList.add('markdown-body');
    });
    const tpl = document.getElementById('problemIdeStatementHeadingTpl') as HTMLTemplateElement | null;
    if (!tpl?.content) return;
    const html = tpl.innerHTML.trim();
    if (!html) return;
    document.querySelectorAll('#problemIdeProblemContent .problem_content').forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (el.id === 'content-aiAnalysis' || el.id === 'content-textSol') return;
        el.classList.add('markdown-body');
        if (el.querySelector('.problem-ide-statement-title')) return;
        el.insertAdjacentHTML('afterbegin', html);
    });
    if (host && !host.querySelector('.problem-ide-statement-title')) {
        const body = host.querySelector('.section__body, .problem-content, .markdown-body') || host;
        body.insertAdjacentHTML('afterbegin', html);
    }
}
