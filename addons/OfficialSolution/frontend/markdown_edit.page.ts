import './official_solution.css';
import { addPage, NamedPage, Notification, request } from '@hydrooj/ui-default';

function pidFromPage(): string {
    const q = new URLSearchParams(window.location.search).get('pid');
    if (q) return q.trim();
    const m = window.location.pathname.match(/\/manage\/problem-solution\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

function mountSave(textarea: HTMLTextAreaElement) {
    const name = textarea.getAttribute('name') || '';
    if (name !== 'content' && name !== 'solContent') return;
    const box = textarea.closest('.section__body') || textarea.parentElement;
    if (!box || box.querySelector('[data-fish-md-save]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rounded primary button';
    btn.dataset.fishMdSave = name;
    btn.textContent = name === 'solContent' ? '保存题解' : '保存题面';
    btn.style.marginTop = '12px';
    box.appendChild(btn);
    btn.addEventListener('click', async () => {
        const pid = pidFromPage();
        if (!pid) {
            Notification.error('缺少题号');
            return;
        }
        btn.setAttribute('disabled', 'disabled');
        try {
            await request.post('', { pid, [name]: textarea.value });
            Notification.success(name === 'solContent' ? '题解已保存' : '题面已保存');
        } catch (e) {
            Notification.error(e instanceof Error ? e.message : '保存失败');
        } finally {
            btn.removeAttribute('disabled');
        }
    });
}

addPage(new NamedPage(['markdown_edit'], async () => {
    document.querySelectorAll<HTMLTextAreaElement>('textarea[data-markdown]').forEach(mountSave);
}));
