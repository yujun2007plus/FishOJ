import { Notification } from '@hydrooj/ui-default';

function samplePreText(pre: Element | null): string {
    if (!pre) return '';
    const code = pre.querySelector('code');
    return (code?.textContent ?? pre.textContent ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '');
}

function localizeSampleHeading(h2: Element) {
    const raw = (h2.textContent || '').replace(/\s+/g, ' ').trim();
    const input = raw.match(/^(?:Sample\s+)?(?:Input|样例输入|输入数据)(?:\s+#?)?(\d+)$/i);
    const output = raw.match(/^(?:Sample\s+)?(?:Output|样例输出|输出数据)(?:\s+#?)?(\d+)$/i);
    if (input) h2.textContent = `输入数据 ${input[1]}`;
    else if (output) h2.textContent = `输出数据 ${output[1]}`;
    else if (/^Sample\s+Input$/i.test(raw) || raw === '样例输入') h2.textContent = '输入数据';
    else if (/^Sample\s+Output$/i.test(raw) || raw === '样例输出') h2.textContent = '输出数据';
}

function stripSampleChrome(col: HTMLElement) {
    col.classList.remove('code-toolbar', 'medium-6', 'medium-12', 'small-12', 'columns');
    col.classList.add('sample');
}

function flattenSampleGrid(host: HTMLElement) {
    host.querySelectorAll('.row, .problem-ide-sample-row').forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        if (row.classList.contains('problem-ide-sample-stack')) return;
        const samples = Array.from(row.querySelectorAll(':scope > .sample')) as HTMLElement[];
        if (!samples.length) return;
        const stack = document.createElement('div');
        stack.className = 'problem-ide-sample-stack';
        for (const col of samples) {
            stripSampleChrome(col);
            stack.appendChild(col);
        }
        row.replaceWith(stack);
    });
    host.querySelectorAll('.sample').forEach((el) => {
        if (el instanceof HTMLElement) stripSampleChrome(el);
    });
}

function decorateSampleToolbar(col: HTMLElement) {
    const h2 = col.querySelector(':scope > h2, :scope > .problem-ide-sample-head > h2');
    if (h2) localizeSampleHeading(h2);
    if (col.querySelector('.problem-ide-sample-toolbar')) return;
    if (!h2) return;

    const head = document.createElement('div');
    head.className = 'problem-ide-sample-head';
    const bar = document.createElement('div');
    bar.className = 'problem-ide-sample-toolbar';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'problem-ide-sample-toolbar__btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const text = samplePreText(col.querySelector('pre'));
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            Notification.success('已复制');
        } catch {
            Notification.error('复制失败');
        }
    });

    const fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.className = 'problem-ide-sample-toolbar__btn';
    fillBtn.textContent = '填充到自测';
    fillBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = col.closest('.problem-ide-sample-stack, .problem-ide-sample-row, .row');
        const cols = row
            ? Array.from(row.querySelectorAll(':scope > .sample'))
            : [col];
        const inCol = cols[0] instanceof HTMLElement ? cols[0] : col;
        const outCol = cols[1] instanceof HTMLElement ? cols[1] : null;
        document.dispatchEvent(new CustomEvent('problem-ide-fill-pretest-case', {
            detail: {
                input: samplePreText(inCol.querySelector('pre')),
                expected: samplePreText(outCol?.querySelector('pre') ?? null),
            },
        }));
    });

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'problem-ide-sample-toolbar__btn';
    checkBtn.textContent = '用这个样例检查';
    checkBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = col.closest('.problem-ide-sample-stack, .problem-ide-sample-row, .row');
        const cols = row
            ? Array.from(row.querySelectorAll(':scope > .sample'))
            : [col];
        const inCol = cols[0] instanceof HTMLElement ? cols[0] : col;
        const outCol = cols[1] instanceof HTMLElement ? cols[1] : null;
        document.dispatchEvent(new CustomEvent('problem-ide-fill-pretest-case', {
            detail: {
                input: samplePreText(inCol.querySelector('pre')),
                expected: samplePreText(outCol?.querySelector('pre') ?? null),
            },
        }));
        window.setTimeout(() => {
            document.dispatchEvent(new CustomEvent('problem-ide-run-request', { detail: { source: 'sample-check' } }));
        }, 50);
    });

    bar.append(copyBtn, fillBtn, checkBtn);
    h2.replaceWith(head);
    head.append(h2, bar);
}

/** Hydro highlighter：```input1 / ```output1 样例框（输入在上、输出在下，边框对齐） */
export function layoutStatementSamples() {
    const host = document.getElementById('problemIdeProblemContent');
    if (!host) return;

    const codes = Array.from(host.querySelectorAll('pre code')).filter((code) => !code.closest('#content-textSol, #content-aiAnalysis'));
    for (const code of codes) {
        const m = (code.getAttribute('class') || '').match(/language-input(\d+)/);
        if (!m) continue;
        const id = m[1];
        const inPre = code.closest('pre');
        if (!inPre || inPre.closest('.sample, .problem-ide-sample-stack, .problem-ide-sample-row')) continue;

        const outCode = host.querySelector(`pre code.language-output${id}`);
        const outPre = (outCode?.closest('pre') || host.querySelector(`pre.language-output${id}`)) as HTMLElement | null;
        if (!outPre || outPre.closest('.sample, .problem-ide-sample-stack, .problem-ide-sample-row')) continue;

        const stack = document.createElement('div');
        stack.className = 'problem-ide-sample-stack';
        const inCol = document.createElement('div');
        inCol.className = 'sample';
        const inH = document.createElement('h2');
        inH.textContent = `输入数据 ${id}`;
        const outCol = document.createElement('div');
        outCol.className = 'sample';
        const outH = document.createElement('h2');
        outH.textContent = `输出数据 ${id}`;
        inPre.parentNode?.insertBefore(stack, inPre);
        inCol.append(inH, inPre);
        outCol.append(outH, outPre);
        stack.append(inCol, outCol);
    }

    flattenSampleGrid(host);
    host.querySelectorAll('.sample').forEach((el) => {
        if (el instanceof HTMLElement) decorateSampleToolbar(el);
    });
    host.querySelectorAll('.toolbar').forEach((el) => {
        if (el.closest('.problem-ide-sample-toolbar')) return;
        el.remove();
    });
}
