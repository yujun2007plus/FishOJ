import { Notification, request } from '@hydrooj/ui-default';

type GenStage = { id: string; title: string };

type GenPayload = {
    langs?: string[];
    stages?: GenStage[];
    protectedStages?: string[];
    concepts?: string[];
    commonMistakes?: string[];
    templates?: Record<string, Record<string, string>>;
};

function pidFromPage(): string {
    const m = window.location.pathname.match(/\/manage\/coding-assist\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

function textarea(name: string): HTMLTextAreaElement | null {
    return document.querySelector<HTMLTextAreaElement>(`textarea[name="${name}"]`);
}

function setTextarea(name: string, value: string) {
    const el = textarea(name);
    if (el) el.value = value;
}

function stagesToLines(stages: GenStage[]): string {
    return (stages || []).map((s) => `${s.id}|${s.title}`).join('\n');
}

/** 生成 → 回填「辅助编码题目配置」表单，不落库（落库仍走表单「保存」） */
export function initScaffoldGenerate() {
    const btn = document.getElementById('scaffoldGenerateBtn') as HTMLButtonElement | null;
    const status = document.getElementById('scaffoldGenerateStatus');
    if (!btn) return;
    const originalText = btn.textContent || '生成脚手架';

    btn.addEventListener('click', async () => {
        const pid = pidFromPage();
        if (!pid) {
            Notification.error('缺少题号');
            return;
        }
        btn.setAttribute('disabled', 'disabled');
        btn.textContent = '生成中…（约 30–60s）';
        if (status) status.textContent = '';
        try {
            const res = await request.post('/learning-scaffold/generate', { pid }) as {
                ok?: boolean;
                hasSolution?: boolean;
                error?: string;
                payload?: GenPayload;
            };
            if (!res?.ok) {
                Notification.error(res?.error || '脚手架生成失败');
                return;
            }
            const p = res.payload;
            if (!p) {
                Notification.error('生成结果为空');
                return;
            }

            setTextarea('stages', stagesToLines(p.stages || []));
            setTextarea('protectedStages', (p.protectedStages || []).join('\n'));
            setTextarea('concepts', (p.concepts || []).join('\n'));
            setTextarea('commonMistakes', (p.commonMistakes || []).join('\n'));

            const py = p.templates?.python || {};
            const cpp = p.templates?.cpp || {};
            setTextarea('py0', py['0'] || '');
            setTextarea('py1', py['1'] || '');
            setTextarea('py3', py['3'] || '');
            setTextarea('cpp0', cpp['0'] || '');
            setTextarea('cpp1', cpp['1'] || '');
            setTextarea('cpp3', cpp['3'] || '');

            if (status) {
                status.textContent = res.hasSolution
                    ? '已回填，请检查后点「保存」。'
                    : '本题暂无官方题解，已按题面推导；建议先用 fishoj-solvemake 生成题解再生成，以获得更准模板。';
            }
            Notification.success('脚手架已回填，请检查后点保存');
        } catch (e) {
            Notification.error(e instanceof Error ? e.message : '脚手架生成失败');
        } finally {
            btn.removeAttribute('disabled');
            btn.textContent = originalText;
        }
    });
}
