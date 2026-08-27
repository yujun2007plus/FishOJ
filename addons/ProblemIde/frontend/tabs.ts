import { $ } from '@hydrooj/ui-default';

function syncProblemTabLayout(type: string) {
    document.getElementById('problemIdeRoot')
        ?.classList.toggle('problem-ide-root--ai-analysis-tab', type === 'aiAnalysis');
}

export function showProblemTab($root: ReturnType<typeof $>, type: string) {
    $root.find('.section__tab-header-item').removeClass('tab--active');
    $root.find(`.section__tab-header-item[data-type="${type}"]`).addClass('tab--active');
    $root.find('.problem_content').hide();
    const el = document.getElementById(`content-${type}`);
    if (el) $(el).show();
    syncProblemTabLayout(type);
    try {
        window.dispatchEvent(new CustomEvent('problem-ide:tab-changed', { detail: { type } }));
    } catch { /* ignore */ }
}

export function initProblemTabs($root: ReturnType<typeof $>) {
    $(document).on('click', '.problem-ide-left .section__tab-header-item', (ev) => {
        ev.preventDefault();
        const type = $(ev.currentTarget).attr('data-type');
        if (type) showProblemTab($root, type);
    });
    let $active = $root.find('.section__tab-header-item.tab--active').first();
    if (!$active.length) $active = $root.find('.section__tab-header-item').first();
    const t = $active.attr('data-type');
    if (t) showProblemTab($root, t);
}
