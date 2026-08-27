/** 流式 AI 分析 loading spinner（与 CodeFun review-modal 同源片段） */
export function getReviewModalStyles(): string {
    return `
    .record-ai-stream-panel.is-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 200px;
      text-align: center;
    }
    .record-ai-stream-panel.is-loading > *:not(.spinner):not(.loading-text) {
      display: none !important;
    }
    .record-ai-stream-panel .spinner {
      width: 18px;
      height: 18px;
      border: 3px solid rgba(0,0,0,.15);
      border-top-color: #409eff;
      border-radius: 50%;
      animation: record-ai-spin .8s linear infinite;
      flex: 0 0 auto;
    }
    .record-ai-stream-panel .loading-text {
      margin: 0;
      font-size: 1.05rem;
      line-height: 1.6;
    }
    @keyframes record-ai-spin { to { transform: rotate(360deg); } }
    .theme--dark .record-ai-stream-panel .spinner {
      border-color: rgba(255,255,255,.12);
      border-top-color: #58a6ff;
    }
    `;
}
