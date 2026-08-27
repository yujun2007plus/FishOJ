function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function ensureCasePreviewAiConfirmStyles() {
    if (document.getElementById('record-case-preview-ai-confirm-style')) return;
    const style = document.createElement('style');
    style.id = 'record-case-preview-ai-confirm-style';
    style.textContent = `
@keyframes cp-ai-confirm-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes cp-ai-confirm-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes cp-ai-confirm-zoom-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
@keyframes cp-ai-confirm-zoom-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
.cp-ai-confirm-mask {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 100000;
  opacity: 0;
}
.cp-ai-confirm-dialog {
  width: 420px; max-width: 90vw;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
  padding: 24px 32px 20px;
  box-sizing: border-box;
  opacity: 0; transform: scale(0.9);
}
.cp-ai-confirm-enter-mask { animation: cp-ai-confirm-fade-in .22s forwards; }
.cp-ai-confirm-enter-dialog { animation: cp-ai-confirm-zoom-in .22s forwards; }
.cp-ai-confirm-leave-mask { animation: cp-ai-confirm-fade-out .18s forwards; }
.cp-ai-confirm-leave-dialog { animation: cp-ai-confirm-zoom-out .18s forwards; }
.cp-ai-confirm-header { display: flex; align-items: center; margin-bottom: 16px; }
.cp-ai-confirm-icon {
  width: 36px; height: 36px;
  border-radius: 50%;
  background-color: #00b578;
  display: flex; align-items: center; justify-content: center;
  margin-right: 12px; flex-shrink: 0;
  color: #fff; font-size: 22px;
}
.cp-ai-confirm-title { font-size: 18px; font-weight: 600; color: #333; }
.cp-ai-confirm-content { font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 24px; }
.cp-ai-confirm-footer { display: flex; justify-content: flex-end; gap: 12px; }
.cp-ai-confirm-btn {
  min-width: 80px; height: 32px; padding: 0 14px;
  border-radius: 6px; font-size: 14px; cursor: pointer;
}
.cp-ai-confirm-btn-cancel {
  border: 1px solid #d9d9d9; background: #fff; color: #333;
}
.cp-ai-confirm-btn-cancel:hover { border-color: #4096ff; color: #4096ff; }
.cp-ai-confirm-btn-confirm {
  border: none; background: #1677ff; color: #fff;
}
.cp-ai-confirm-btn-confirm:hover { background: #4096ff; }
.theme--dark .cp-ai-confirm-dialog { background: #161b22; }
.theme--dark .cp-ai-confirm-title { color: #e6edf3; }
.theme--dark .cp-ai-confirm-content { color: #8b949e; }
.theme--dark .cp-ai-confirm-btn-cancel {
  background: #21262d; border-color: #30363d; color: #c9d1d9;
}
.theme--dark .cp-ai-confirm-btn-cancel:hover { background: #30363d; border-color: #484f58; }
`;
    document.head.appendChild(style);
}

/** 与 CodeFun IDE 内 AI 分析同风格的确认框 */
export function showCasePreviewAiConfirm(
    title: string,
    messageHtml: string,
    buttonLabels?: { cancel?: string; confirm?: string },
): Promise<boolean> {
    ensureCasePreviewAiConfirmStyles();
    const cancelLabel = escapeHtml(buttonLabels?.cancel ?? '取消');
    const confirmLabel = escapeHtml(buttonLabels?.confirm ?? '确认');
    return new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.className = 'cp-ai-confirm-mask';
        const dialog = document.createElement('div');
        dialog.className = 'cp-ai-confirm-dialog';
        dialog.innerHTML = `
            <div class="cp-ai-confirm-header">
                <div class="cp-ai-confirm-icon">i</div>
                <div class="cp-ai-confirm-title">${escapeHtml(title)}</div>
            </div>
            <div class="cp-ai-confirm-content">${messageHtml}</div>
            <div class="cp-ai-confirm-footer">
                <button type="button" class="cp-ai-confirm-btn cp-ai-confirm-btn-cancel">${cancelLabel}</button>
                <button type="button" class="cp-ai-confirm-btn cp-ai-confirm-btn-confirm">${confirmLabel}</button>
            </div>
        `;
        mask.appendChild(dialog);
        document.body.appendChild(mask);
        requestAnimationFrame(() => {
            mask.classList.add('cp-ai-confirm-enter-mask');
            dialog.classList.add('cp-ai-confirm-enter-dialog');
        });
        const close = (result: boolean) => {
            mask.classList.remove('cp-ai-confirm-enter-mask');
            dialog.classList.remove('cp-ai-confirm-enter-dialog');
            mask.classList.add('cp-ai-confirm-leave-mask');
            dialog.classList.add('cp-ai-confirm-leave-dialog');
            dialog.addEventListener(
                'animationend',
                () => {
                    mask.remove();
                    resolve(result);
                },
                { once: true },
            );
        };
        dialog.addEventListener('click', (e) => e.stopPropagation());
        mask.addEventListener('click', () => close(false));
        dialog.querySelector('.cp-ai-confirm-btn-confirm')?.addEventListener('click', () => close(true));
        dialog.querySelector('.cp-ai-confirm-btn-cancel')?.addEventListener('click', () => close(false));
    });
}
