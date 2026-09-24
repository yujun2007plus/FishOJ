import type { AIAssistantConfig } from '../../shared/assistant-config.types';
import type { AssistantConversationListItem, AssistantQuote } from '../../shared/assistant-types';
import { AssistantMessageList } from './AssistantMessageList';
import { AssistantHistoryPanel } from './AssistantHistoryPanel';
import {
  AssistantWelcomeLanguageDropdown,
  isWelcomeLanguageValue,
} from './AssistantWelcomeLanguageDropdown';
import type { AssistantMessage } from '../core/ConversationStore';
import {
  dedupeAssistantLanguageOptions,
  getGlobalPreferredCodeLanguage,
  normalizeCodeLanguage,
  resolvePreferredCodeLanguage,
  setGlobalPreferredCodeLanguage,
} from '../core/AssistantCodeLanguage';
import type { AssistantLanguageOption } from '../../shared/assistant-config.types';
import {
  getAssistantDismissedStorageKey,
  getAssistantDockPositionStorageKey,
  getAssistantPanelSizeStorageKey,
} from '../../shared/assistant-storage';
import {
  isAssistantDeepThinkEnabled,
  setAssistantDeepThinkEnabled,
} from '../core/AssistantDeepThink';
import {
  ASSISTANT_SET_DISMISSED_EVENT,
  dispatchAssistantDismissedChange,
  isAssistantDismissedDetail,
} from '../core/assistantDismissEvents';
import { renderReferenceCardHtml, wireReferenceCard } from './AssistantReferenceCard';

declare const UiContext: {
  learning?: {
    tutorEnabled?: boolean;
  };
};

const PROBLEM_IDE_TUTOR_OPEN = 'problem-ide-tutor-open';

const DEFAULT_CONFIG: AIAssistantConfig = {
  id: 'assistant',
  scene: 'default',
  enabled: true,
  title: 'AI 助教',
  description: '有什么可以帮你？',
  inputPlaceholder: '输入问题…',
  referenceInputPlaceholder: '针对这段正文提问…',
  recommendedQuestions: [],
  followUpQuestions: [
    '这段内容的核心思路是什么？',
    '能结合一个具体样例说明吗？',
    '这里有哪些常见易错点？',
  ],
};

export type AssistantShellCallbacks = {
  onSubmit: (question: string, quote: AssistantQuote | null) => void;
  onStop: () => void;
  onClose: () => void;
  onOpen?: () => void;
  /** 返回 false 时阻止打开面板（如未登录已弹出登录框） */
  canOpen?: () => boolean;
  onNewChat: () => void;
  onHistoryOpen: () => void;
  onHistorySelect: (id: string) => void;
  onHistoryDelete: (id: string) => void;
  onCodeLanguageChange?: (lang: string) => void;
  onAddSelectionClick?: () => void;
};

export class AssistantShell {
  private root: HTMLElement;
  private panel: HTMLElement;
  private panelHeader: HTMLElement;
  private resizeTop: HTMLElement;
  private resizeLeft: HTMLElement;
  private resizeCorner: HTMLElement;
  private dockEl: HTMLElement;
  private launcher: HTMLElement;
  private dockCloseBtn: HTMLButtonElement;
  private restoreBtn: HTMLButtonElement;
  private messageList: AssistantMessageList;
  private jumpBottomBtn: HTMLButtonElement;
  private composer: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private chipsEl: HTMLElement;
  private hintEl: HTMLElement;
  private quotePreview: HTMLElement;
  private quotaValueEl: HTMLElement;
  private callbacks: AssistantShellCallbacks;
  private historyPanel: AssistantHistoryPanel;
  private panelTitleEl: HTMLElement;
  private historyBtn: HTMLButtonElement;
  private emptyTitleEl: HTMLElement;
  private emptyTextEl: HTMLElement;
  private hintLinkEl: HTMLButtonElement;
  private hintPrefixEl: HTMLElement;
  private deepthinkBtn: HTMLButtonElement;
  private headerCodeLangEl: HTMLElement;
  private headerLangDropdown: AssistantWelcomeLanguageDropdown | null = null;
  private addSelectionBtn: HTMLButtonElement;
  private codingHelperBtn: HTMLButtonElement | null = null;
  private config: AIAssistantConfig;
  private toastEl: HTMLElement;
  private toastTimer: number | null = null;
  private pageTitle = '';
  private codeLanguage = 'cpp';
  private deepThinkEnabled = false;
  private activeReference: AssistantQuote | null = null;
  private hasPendingSelection = false;
  private lastMessages: AssistantMessage[] = [];
  private languageOptions: AssistantLanguageOption[] = [];
  private open = false;
  private busy = false;
  private hasMessages = false;
  private historyOpen = false;
  private accessNotice: string | null = null;
  private dismissed = false;
  private restoreEnabled = true;
  private handleExternalSetDismissed: ((e: Event) => void) | null = null;
  private dockStorageKey: string;
  private dismissedStorageKey: string;
  private panelSizeStorageKey: string;

  constructor(callbacks: AssistantShellCallbacks, config: AIAssistantConfig = DEFAULT_CONFIG) {
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dockStorageKey = getAssistantDockPositionStorageKey(this.config);
    this.dismissedStorageKey = getAssistantDismissedStorageKey(this.config);
    this.panelSizeStorageKey = getAssistantPanelSizeStorageKey(this.config);
    this.root = document.createElement('div');
    this.root.id = 'cf-assistant-root';
    this.root.className = 'cf-assistant-root cf-assistant-root--empty';
    this.root.innerHTML = `
      <div class="cf-assistant-panel" hidden role="dialog" aria-modal="false" aria-labelledby="cf-assistant-panel-title">
        <div class="cf-assistant-resize-handle cf-assistant-resize-handle--top" aria-hidden="true"></div>
        <div class="cf-assistant-resize-handle cf-assistant-resize-handle--left" aria-hidden="true"></div>
        <div class="cf-assistant-resize-handle cf-assistant-resize-handle--corner" aria-hidden="true"></div>
        <header class="cf-assistant-panel-header cf-assistant-header">
          <div class="cf-assistant-header-brand">
            <span class="cf-assistant-panel-title cf-assistant-header-title" id="cf-assistant-panel-title">AI 助教</span>
            <div class="cf-assistant-language-actions">
              <div class="cf-assistant-code-lang cf-assistant-code-lang--header"></div>
              <button type="button" class="cf-assistant-add-selection" disabled aria-label="将选中内容问 AI" title="请先在笔记正文中选择内容">
                <span class="cf-assistant-add-selection-icon" aria-hidden="true"><i class="fas fa-wand-magic-sparkles"></i></span>
                <span>问 AI</span>
              </button>
            </div>
          </div>
          <div class="cf-assistant-header-actions">
            <button type="button" class="cf-assistant-icon-btn cf-assistant-header-action cf-assistant-new-chat" aria-label="创建新对话" title="创建新对话">
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <button type="button" class="cf-assistant-icon-btn cf-assistant-header-action cf-assistant-history" aria-label="历史对话" title="历史对话">
              <i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
            </button>
            <button type="button" class="cf-assistant-icon-btn cf-assistant-header-action cf-assistant-coding-helper" hidden aria-label="编程小助手" title="编程小助手（启发式提示）">
              <i class="fas fa-lightbulb" aria-hidden="true"></i>
            </button>
            <button type="button" class="cf-assistant-icon-btn cf-assistant-header-action cf-assistant-close" aria-label="关闭面板" title="关闭">
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </header>
        <div class="cf-assistant-body">
          <div class="cf-assistant-chat-view">
            <div class="cf-assistant-content">
              <div class="cf-assistant-messages-wrap">
                <div class="cf-assistant-messages cf-assistant-message-scroll" aria-live="polite"></div>
                <button type="button" class="cf-assistant-jump-bottom" hidden aria-label="回到底部" title="回到底部">
                  <i class="fas fa-arrow-down" aria-hidden="true"></i>
                </button>
              </div>
              <div class="cf-assistant-empty">
                <div class="cf-assistant-empty-inner">
                  <div class="cf-assistant-empty-icon" aria-hidden="true">
                    <i class="fas fa-robot"></i>
                  </div>
                  <h2 class="cf-assistant-empty-title">有什么可以帮你？</h2>
                  <p class="cf-assistant-empty-text">针对当前笔记提问，我会结合题面与笔记内容解答。</p>
                  <div class="cf-assistant-chips"></div>
                </div>
              </div>
              <div class="cf-assistant-hint cf-assistant-conversation-hint">
                <span class="cf-assistant-hint-prefix">追问可以继续对话，讨论新问题请</span>
                <button type="button" class="cf-assistant-hint-link">创建新对话</button>
              </div>
            </div>
            <div class="cf-assistant-quote-preview cf-assistant-reference-slot" hidden></div>
            <div class="cf-assistant-composer">
              <div class="cf-assistant-composer-box cf-assistant-input-wrap">
                <textarea rows="1" placeholder="输入问题…" maxlength="2000" aria-label="输入问题"></textarea>
                <button type="button" class="cf-assistant-send cf-assistant-send-button" aria-label="发送">
                  <i class="fas fa-paper-plane" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <footer class="cf-assistant-statusbar cf-assistant-footer">
              <a class="cf-assistant-quota" href="/ai-quota" target="_blank" rel="noopener noreferrer" title="查看 AI 额度中心">
                额度：<span class="cf-assistant-quota-value">额度信息加载中</span>
                <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
              </a>
              <div class="cf-assistant-footer-actions">
                <button type="button" class="cf-assistant-deepthink" aria-pressed="false" title="标准回答模式，点击切换为深度思考">
                  <i class="fas fa-brain" aria-hidden="true"></i>
                  <span class="cf-assistant-deepthink-label">深度思考</span>
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>
      <div class="cf-assistant-dock">
        <button type="button" class="cf-assistant-dock-close" aria-label="关闭 AI 助教" title="关闭 AI 助教">
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
        <button type="button" class="cf-assistant-launcher" aria-label="AI 助教" title="AI 助教">
          <span class="cf-assistant-launcher-icon" aria-hidden="true">
            <i class="fas fa-robot"></i>
          </span>
          <span class="cf-assistant-launcher-label">AI 助教</span>
        </button>
      </div>
      <button type="button" class="cf-assistant-restore" hidden aria-label="重新打开 AI 助教" title="AI 助教">
        <i class="fas fa-robot" aria-hidden="true"></i>
      </button>`;
    document.body.appendChild(this.root);

    const toast = document.createElement('div');
    toast.className = 'cf-assistant-toast';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    this.root.appendChild(toast);
    this.toastEl = toast;

    this.launcher = this.root.querySelector('.cf-assistant-launcher') as HTMLButtonElement;
    this.panel = this.root.querySelector('.cf-assistant-panel') as HTMLElement;
    this.panelHeader = this.root.querySelector('.cf-assistant-panel-header') as HTMLElement;
    this.resizeTop = this.root.querySelector('.cf-assistant-resize-handle--top') as HTMLElement;
    this.resizeLeft = this.root.querySelector('.cf-assistant-resize-handle--left') as HTMLElement;
    this.resizeCorner = this.root.querySelector('.cf-assistant-resize-handle--corner') as HTMLElement;
    this.dockEl = this.root.querySelector('.cf-assistant-dock') as HTMLElement;
    this.dockCloseBtn = this.root.querySelector('.cf-assistant-dock-close') as HTMLButtonElement;
    this.restoreBtn = this.root.querySelector('.cf-assistant-restore') as HTMLButtonElement;
    this.hintEl = this.root.querySelector('.cf-assistant-hint') as HTMLElement;
    this.composer = this.root.querySelector('textarea') as HTMLTextAreaElement;
    this.sendBtn = this.root.querySelector('.cf-assistant-send') as HTMLButtonElement;
    this.chipsEl = this.root.querySelector('.cf-assistant-chips') as HTMLElement;
    this.quotePreview = this.root.querySelector('.cf-assistant-quote-preview') as HTMLElement;
    this.quotaValueEl = this.root.querySelector('.cf-assistant-quota-value') as HTMLElement;
    this.panelTitleEl = this.root.querySelector('.cf-assistant-panel-title') as HTMLElement;
    this.historyBtn = this.root.querySelector('.cf-assistant-history') as HTMLButtonElement;
    this.emptyTitleEl = this.root.querySelector('.cf-assistant-empty-title') as HTMLElement;
    this.emptyTextEl = this.root.querySelector('.cf-assistant-empty-text') as HTMLElement;
    this.hintLinkEl = this.root.querySelector('.cf-assistant-hint-link') as HTMLButtonElement;
    this.hintPrefixEl = this.root.querySelector('.cf-assistant-hint-prefix') as HTMLElement;
    this.deepthinkBtn = this.root.querySelector('.cf-assistant-deepthink') as HTMLButtonElement;
    this.headerCodeLangEl = this.root.querySelector('.cf-assistant-code-lang--header') as HTMLElement;
    this.addSelectionBtn = this.root.querySelector('.cf-assistant-add-selection') as HTMLButtonElement;
    this.codingHelperBtn = this.root.querySelector('.cf-assistant-coding-helper') as HTMLButtonElement;
    const showCodingHelper = this.config.features?.codingHelperButton === true
      && UiContext.learning?.tutorEnabled === true;
    if (this.codingHelperBtn) {
      if (showCodingHelper) {
        this.codingHelperBtn.hidden = false;
        this.codingHelperBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // 若编程小助手被用户在右上角关闭，先帮它恢复，再派发事件
          try {
            const raw = window.localStorage.getItem('fishoj.tutor.enabled');
            if (raw === '0' || raw === 'false') {
              window.localStorage.removeItem('fishoj.tutor.enabled');
              const toggle = document.getElementById('problemIdeTutorToggle') as HTMLInputElement | null;
              if (toggle) toggle.checked = true;
              window.dispatchEvent(new CustomEvent('cf-tutor-enabled-change', {
                detail: { enabled: true },
              }));
            }
          } catch {
            /* ignore */
          }
          document.dispatchEvent(new CustomEvent(PROBLEM_IDE_TUTOR_OPEN, {
            detail: { requestHint: true },
          }));
        });
      } else {
        this.codingHelperBtn.style.display = 'none';
      }
    }
    this.headerLangDropdown = new AssistantWelcomeLanguageDropdown(this.headerCodeLangEl, {
      value: this.codeLanguage,
      onChange: (lang) => this.setCodeLanguage(lang),
      showLabel: false,
      variant: 'header',
    });
    const bodyEl = this.root.querySelector('.cf-assistant-body') as HTMLElement;
    const messagesEl = this.root.querySelector('.cf-assistant-messages') as HTMLElement;
    this.jumpBottomBtn = this.root.querySelector('.cf-assistant-jump-bottom') as HTMLButtonElement;
    this.messageList = new AssistantMessageList(messagesEl, {
      onFollowUpClick: (q) => this.handleFollowUpClick(q),
      shouldShowFollowUp: (msg, index, messages) => this.shouldShowFollowUp(msg, index, messages),
      getFollowUpQuestions: () => this.config.followUpQuestions || DEFAULT_CONFIG.followUpQuestions!,
      onStickPinnedChange: (pinned) => this.syncJumpBottomBtn(pinned),
    });
    this.historyPanel = new AssistantHistoryPanel(bodyEl, {
      onSelect: (id) => this.callbacks.onHistorySelect(id),
      onDelete: (id) => this.callbacks.onHistoryDelete(id),
    });

    this.launcher.addEventListener('click', () => this.toggle());
    this.restoreEnabled = this.config.features?.restoreButton !== false;
    if (this.config.features?.dismissible === false) {
      this.dockCloseBtn.style.display = 'none';
    } else {
      this.dockCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setDismissed(true);
        this.showToast(
          this.restoreEnabled
            ? 'AI 助教已关闭，点击小圆点可重新打开'
            : 'AI 助教已关闭，可在右上角设置中重新开启',
        );
      });
    }
    if (!this.restoreEnabled || this.config.features?.dismissible === false) {
      this.restoreBtn.style.display = 'none';
    } else {
      this.restoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setDismissed(false);
      });
    }
    this.handleExternalSetDismissed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!isAssistantDismissedDetail(detail, this.config.scene)) return;
      if (detail.dismissed === this.dismissed) return;
      this.setDismissed(detail.dismissed);
    };
    window.addEventListener(ASSISTANT_SET_DISMISSED_EVENT, this.handleExternalSetDismissed);
    const closeBtn = this.root.querySelector('.cf-assistant-close');
    closeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setOpen(false);
      this.callbacks.onClose();
    });
    this.root.querySelector('.cf-assistant-new-chat')?.addEventListener('click', () => {
      this.callbacks.onNewChat();
    });
    this.root.querySelector('.cf-assistant-hint-link')?.addEventListener('click', () => {
      this.callbacks.onNewChat();
    });
    this.root.querySelector('.cf-assistant-history')?.addEventListener('click', () => {
      if (this.historyOpen) {
        this.closeHistoryView();
        return;
      }
      this.callbacks.onHistoryOpen();
    });
    this.sendBtn.addEventListener('click', () => {
      if (this.busy) {
        this.callbacks.onStop();
      } else {
        this.handleSubmit();
      }
    });
    this.jumpBottomBtn.addEventListener('click', () => {
      this.messageList.pinToBottom();
      this.syncJumpBottomBtn(true);
    });
    this.composer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) {
        this.setOpen(false);
        this.callbacks.onClose();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.busy) this.handleSubmit();
      }
    });
    this.composer.addEventListener('input', () => this.syncComposerHeight());
    this.deepthinkBtn.addEventListener('click', () => this.toggleDeepThink());
    this.addSelectionBtn.addEventListener('click', () => {
      this.callbacks.onAddSelectionClick?.();
    });
    this.applyConfigToUi();
    this.syncComposerHeight();
    this.refreshCodeLanguages();
    this.syncDeepThinkToggle();
    this.attachScrollTopBtnToDock();
    if (this.config.features?.draggable !== false) {
      this.attachRootDrag(this.launcher);
      this.attachRootDrag(this.panelHeader);
    }
    if (this.config.features?.resizable !== false) {
      this.attachPanelResize(this.resizeTop, 'top');
      this.attachPanelResize(this.resizeLeft, 'left');
      this.attachPanelResize(this.resizeCorner, 'corner');
    }
    this.loadPanelSize();
    this.initDismissed();
    this.loadDockPosition();
  }

  isDeepThinkEnabled() {
    return this.deepThinkEnabled;
  }

  private syncDeepThinkToggle() {
    this.deepThinkEnabled = isAssistantDeepThinkEnabled();
    this.deepthinkBtn.classList.toggle('cf-assistant-deepthink--active', this.deepThinkEnabled);
    this.deepthinkBtn.setAttribute('aria-pressed', this.deepThinkEnabled ? 'true' : 'false');
    this.deepthinkBtn.title = this.deepThinkEnabled
      ? '已开启深度思考，回答更充分但可能更慢'
      : '标准回答模式，点击切换为深度思考';
  }

  private toggleDeepThink() {
    this.deepThinkEnabled = !this.deepThinkEnabled;
    setAssistantDeepThinkEnabled(this.deepThinkEnabled);
    this.syncDeepThinkToggle();
  }

  private tryAttachScrollTopBtn(): boolean {
    const scrollBtn = document.getElementById('scrollTopBtn');
    if (!scrollBtn) return false;
    if (scrollBtn.parentElement === this.dockEl) return true;
    this.dockEl.appendChild(scrollBtn);
    scrollBtn.classList.add('cf-assistant-dock-scroll');
    return true;
  }

  private attachScrollTopBtnToDock() {
    if (this.dismissed) return;

    if (this.tryAttachScrollTopBtn()) return;

    const observer = new MutationObserver(() => {
      if (this.tryAttachScrollTopBtn()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: false });
    window.setTimeout(() => observer.disconnect(), 8000);
  }

  /** 关闭入口胶囊时把回顶按钮放回 body，避免被一并隐藏 */
  private detachScrollTopBtnFromDock() {
    const scrollBtn = document.getElementById('scrollTopBtn');
    if (scrollBtn && scrollBtn.parentElement === this.dockEl) {
      scrollBtn.classList.remove('cf-assistant-dock-scroll');
      document.body.appendChild(scrollBtn);
    }
  }

  /* ── 入口胶囊拖动 / 关闭 ── */

  private applyDockPosition(left: number, top: number) {
    const root = this.root;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  private loadDockPosition() {
    let saved: { left?: number; top?: number } | null = null;
    try {
      const raw = window.localStorage.getItem(this.dockStorageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (!saved || typeof saved.left !== 'number' || typeof saved.top !== 'number') return;
    const { minLeft, maxLeft, minTop, maxTop } = this.rootViewportBounds();
    this.applyDockPosition(
      clampNumber(saved.left, minLeft, maxLeft),
      clampNumber(saved.top, minTop, maxTop),
    );
  }

  /** root（面板+胶囊）尽量完整留在视口内的可移动范围，四边各留 8px 余量 */
  private rootViewportBounds(): { minLeft: number; maxLeft: number; minTop: number; maxTop: number } {
    const rect = this.root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 当 root 大于视口（面板超高）时允许顶部出屏，保证底部也能拖进视口
    const minLeft = Math.min(8, vw - rect.width - 8);
    const maxLeft = Math.max(8, vw - rect.width - 8);
    const minTop = Math.min(8, vh - rect.height - 8);
    const maxTop = Math.max(8, vh - rect.height - 8);
    return { minLeft, maxLeft, minTop, maxTop };
  }

  private persistDockPosition(left: number, top: number) {
    try {
      window.localStorage.setItem(this.dockStorageKey, JSON.stringify({ left, top }));
    } catch {
      /* ignore */
    }
  }

  /**
   * 把整块浮动区（面板+胶囊）的拖动绑定到指定抓手上。
   * 面板标题栏与入口胶囊都可拖，位置共享同一份持久化；移动端禁用避免与页面滚动冲突。
   */
  private attachRootDrag(handle: HTMLElement) {
    const root = this.root;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let rootStartLeft = 0;
    let rootStartTop = 0;
    let bounds: { minLeft: number; maxLeft: number; minTop: number; maxTop: number } | null = null;
    let dragging = false;

    const onDown = (e: PointerEvent) => {
      if (window.matchMedia('(max-width: 640px)').matches) return;
      if (e.button !== 0) return;
      const target = e.target as Element | null;
      // 面板标题栏上的按钮/下拉等交互元素不参与拖动
      if (target && target !== handle && target.closest(
        'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="listbox"], [role="option"], .cf-assistant-language-actions, .cf-assistant-resize-handle',
      )) return;
      pointerId = e.pointerId;
      dragging = false;
      const rect = root.getBoundingClientRect();
      rootStartLeft = rect.left;
      rootStartTop = rect.top;
      bounds = this.rootViewportBounds();
      startX = e.clientX;
      startY = e.clientY;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 4) return;
        dragging = true;
        root.classList.add('cf-assistant-root--dragging');
      }
      const b = bounds || this.rootViewportBounds();
      this.applyDockPosition(
        clampNumber(rootStartLeft + dx, b.minLeft, b.maxLeft),
        clampNumber(rootStartTop + dy, b.minTop, b.maxTop),
      );
    };

    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      root.classList.remove('cf-assistant-root--dragging');
      const rect = root.getBoundingClientRect();
      this.persistDockPosition(rect.left, rect.top);
      // 拖动结束后吞掉合成的 click，避免误触开关面板或标题栏按钮
      const stopClick = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        handle.removeEventListener('click', stopClick, { capture: true });
      };
      handle.addEventListener('click', stopClick, { capture: true });
      window.setTimeout(() => handle.removeEventListener('click', stopClick, { capture: true }), 0);
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  /* ── 面板窗口尺寸调整 ── */

  private applyPanelSize(width: number, height: number) {
    this.panel.style.width = `${width}px`;
    this.panel.style.height = `${height}px`;
  }

  private loadPanelSize() {
    let saved: { width?: number; height?: number } | null = null;
    try {
      const raw = window.localStorage.getItem(this.panelSizeStorageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (!saved || typeof saved.width !== 'number' || typeof saved.height !== 'number') return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = vw - 32;
    const maxH = vh - 32 - this.dockEl.offsetHeight - 16;
    this.applyPanelSize(
      clampNumber(saved.width, Math.min(PANEL_MIN_WIDTH, maxW), maxW),
      clampNumber(saved.height, Math.min(PANEL_MIN_HEIGHT, maxH), maxH),
    );
  }

  private persistPanelSize(width: number, height: number) {
    try {
      window.localStorage.setItem(this.panelSizeStorageKey, JSON.stringify({ width, height }));
    } catch {
      /* ignore */
    }
  }

  /**
   * 面板 resize 抓手：拖左/顶边或左上角调整窗口尺寸。
   * 调整期间 root 临时锚定右下角（胶囊位置不动，面板向左/上生长），结束后转回 left/top 持久化。
   */
  private attachPanelResize(handle: HTMLElement, mode: 'top' | 'left' | 'corner') {
    const root = this.root;
    const panel = this.panel;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let rightOffset = 0;
    let bottomOffset = 0;
    let resizing = false;

    const onDown = (e: PointerEvent) => {
      if (window.matchMedia('(max-width: 640px)').matches) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      pointerId = e.pointerId;
      resizing = false;
      const rootRect = root.getBoundingClientRect();
      rightOffset = window.innerWidth - rootRect.right;
      bottomOffset = window.innerHeight - rootRect.bottom;
      startWidth = panel.offsetWidth;
      startHeight = panel.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;
      // 锚定右下：调整期间胶囊与面板右缘保持不动
      root.style.right = `${rightOffset}px`;
      root.style.bottom = `${bottomOffset}px`;
      root.style.left = 'auto';
      root.style.top = 'auto';
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!resizing) {
        if (Math.hypot(dx, dy) < 4) return;
        resizing = true;
        root.classList.add('cf-assistant-root--resizing');
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 16;
      const maxW = vw - rightOffset - 8;
      const maxH = vh - bottomOffset - this.dockEl.offsetHeight - gap - 8;
      let nextW = startWidth;
      let nextH = startHeight;
      if (mode === 'left' || mode === 'corner') {
        nextW = clampNumber(startWidth - dx, Math.min(PANEL_MIN_WIDTH, maxW), maxW);
      }
      if (mode === 'top' || mode === 'corner') {
        nextH = clampNumber(startHeight - dy, Math.min(PANEL_MIN_HEIGHT, maxH), maxH);
      }
      this.applyPanelSize(nextW, nextH);
    };

    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!resizing) return;
      resizing = false;
      root.classList.remove('cf-assistant-root--resizing');
      const rect = root.getBoundingClientRect();
      this.applyDockPosition(rect.left, rect.top);
      this.persistDockPosition(rect.left, rect.top);
      this.persistPanelSize(panel.offsetWidth, panel.offsetHeight);
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  private initDismissed() {
    let saved = false;
    try {
      saved = window.localStorage.getItem(this.dismissedStorageKey) === '1';
    } catch {
      /* ignore */
    }
    if (saved) {
      this.dismissed = true;
      this.applyDismissed();
    }
    dispatchAssistantDismissedChange({ scene: this.config.scene, dismissed: this.dismissed });
  }

  private setDismissed(next: boolean) {
    this.dismissed = next;
    try {
      if (next) window.localStorage.setItem(this.dismissedStorageKey, '1');
      else window.localStorage.removeItem(this.dismissedStorageKey);
    } catch {
      /* ignore */
    }
    this.applyDismissed();
    dispatchAssistantDismissedChange({ scene: this.config.scene, dismissed: next });
  }

  private applyDismissed() {
    this.root.classList.toggle('cf-assistant-root--dismissed', this.dismissed);
    this.restoreBtn.hidden = !this.dismissed || !this.restoreEnabled;
    if (this.dismissed) {
      this.setOpen(false);
      this.detachScrollTopBtnFromDock();
    } else {
      this.attachScrollTopBtnToDock();
    }
  }

  dispose() {
    if (this.toastTimer != null) window.clearTimeout(this.toastTimer);
    if (this.handleExternalSetDismissed) {
      window.removeEventListener(ASSISTANT_SET_DISMISSED_EVENT, this.handleExternalSetDismissed);
      this.handleExternalSetDismissed = null;
    }
    this.headerLangDropdown?.dispose();
    this.messageList.dispose();
    this.historyPanel.dispose();
    this.root.remove();
  }

  private syncJumpBottomBtn(pinned: boolean) {
    this.jumpBottomBtn.hidden = pinned || !this.hasMessages;
  }

  openHistoryView() {
    this.historyOpen = true;
    this.panel.classList.add('cf-assistant-panel--history');
    this.historyBtn.classList.add('cf-assistant-icon-btn--active');
    this.panelTitleEl.textContent = '历史对话';
    this.setOpen(true);
  }

  closeHistoryView() {
    this.historyOpen = false;
    this.panel.classList.remove('cf-assistant-panel--history');
    this.historyBtn.classList.remove('cf-assistant-icon-btn--active');
    this.panelTitleEl.textContent = this.config.title || 'AI 助教';
  }

  setPageTitle(title: string) {
    this.pageTitle = title;
    window.requestAnimationFrame(() => {
      this.refreshCodeLanguages();
      this.refreshSuggestedChips();
    });
  }

  setAccessNotice(notice?: string | null) {
    this.accessNotice = notice?.trim() || null;
    this.root.classList.toggle('cf-assistant-root--access-blocked', Boolean(this.accessNotice));
    this.emptyTextEl.textContent = this.accessNotice || this.config.description || this.emptyTextEl.textContent;
    const blocked = Boolean(this.accessNotice);
    this.composer.disabled = blocked || this.busy;
    this.sendBtn.disabled = blocked && !this.busy;
    this.syncComposerPlaceholder();
  }

  syncExternalLanguage(lang: string) {
    const normalized = normalizeCodeLanguage(lang);
    if (!normalized) return;
    if (this.languageOptions.length) {
      const allowed = this.languageOptions.some((opt) => normalizeCodeLanguage(opt.value) === normalized);
      if (!allowed) return;
    } else if (!isWelcomeLanguageValue(normalized)) {
      return;
    }
    if (normalized === this.codeLanguage) return;
    this.codeLanguage = normalized;
    setGlobalPreferredCodeLanguage(normalized);
    this.renderCodeLanguageSwitches();
  }

  private applyConfigToUi() {
    const f = this.config.features || {};
    const title = this.config.title || 'AI 助教';
    this.panelTitleEl.textContent = title;
    this.launcher.setAttribute('aria-label', title);
    this.launcher.setAttribute('title', title);
    this.launcher.querySelector('.cf-assistant-launcher-label')!.textContent = title;
    if (this.config.description) {
      this.emptyTextEl.textContent = this.config.description;
    }
    if (this.config.title) {
      this.emptyTitleEl.textContent = this.config.title;
    }
    if (this.config.inputPlaceholder) {
      this.composer.placeholder = this.config.inputPlaceholder;
    }
    const addLabel = this.config.selection?.buttonText || '问 AI';
    const addTextEl = this.addSelectionBtn.querySelector('span:last-child');
    if (addTextEl) addTextEl.textContent = addLabel;
    this.addSelectionBtn.setAttribute('aria-label', `将选中内容${addLabel}`);
    this.addSelectionBtn.setAttribute('title', `选中正文后可${addLabel}`);

    if (f.languageSelector === false) {
      this.headerCodeLangEl.style.display = 'none';
    }
    if (f.addToContextButton === false) {
      this.addSelectionBtn.style.display = 'none';
    }
    if (f.languageSelector === false && f.addToContextButton !== false) {
      this.root.querySelector('.cf-assistant-language-actions')
        ?.classList.add('cf-assistant-language-actions--solo-add');
    }
    if (f.deepThinking === false) {
      this.deepthinkBtn.style.display = 'none';
    }
    if (f.quotaDisplay === false) {
      (this.root.querySelector('.cf-assistant-quota') as HTMLElement).style.display = 'none';
    }
    if (f.history === false) {
      this.historyBtn.style.display = 'none';
    }
    this.applyPlacement();
    this.renderWelcomeChips();
    const sceneClass = String(this.config.scene || 'default').replace(/[^a-z0-9-_]/gi, '-');
    this.root.classList.add(`cf-assistant-root--scene-${sceneClass}`);
  }

  private applyPlacement() {
    const placement = this.config.placement;
    if (!placement) return;

    const root = this.root;
    root.style.position = 'fixed';
    root.style.zIndex = String(placement.zIndex ?? 12050);

    if (placement.position === 'bottom-left' || placement.left != null) {
      root.style.left = `${placement.left ?? 24}px`;
      root.style.right = 'auto';
    } else {
      root.style.right = `${placement.right ?? 24}px`;
      root.style.left = 'auto';
    }
    root.style.bottom = `${placement.bottom ?? 24}px`;
  }

  isHistoryOpen() {
    return this.historyOpen;
  }

  renderHistoryLoading() {
    this.historyPanel.renderLoading();
  }

  renderHistoryEmpty(message?: string) {
    this.historyPanel.renderEmpty(message);
  }

  renderHistoryError(message: string) {
    this.historyPanel.renderError(message);
  }

  renderHistoryList(items: AssistantConversationListItem[]) {
    this.historyPanel.renderList(items);
  }

  refreshSuggestedChips() {
    this.renderWelcomeChips();
  }

  refreshCodeLanguages(options?: AssistantLanguageOption[], currentLanguage?: string) {
    if (options?.length) {
      this.languageOptions = dedupeAssistantLanguageOptions(options);
    }

    const available = this.languageOptions.length
      ? this.languageOptions.map((opt) => opt.value)
      : [];

    if (currentLanguage) {
      const normalizedCurrent = normalizeCodeLanguage(currentLanguage);
      if (!available.length || available.includes(normalizedCurrent)) {
        this.codeLanguage = normalizedCurrent;
      } else {
        this.codeLanguage = resolvePreferredCodeLanguage(available);
      }
    } else {
      const preferred = getGlobalPreferredCodeLanguage();
      if (preferred && (available.length === 0 || available.includes(preferred))) {
        this.codeLanguage = preferred;
      } else if (available.length) {
        this.codeLanguage = resolvePreferredCodeLanguage(available);
      } else {
        this.codeLanguage = 'cpp';
      }
    }

    setGlobalPreferredCodeLanguage(this.codeLanguage);
    if (this.languageOptions.length) {
      this.headerLangDropdown?.setOptions(this.languageOptions, true);
    }
    this.renderCodeLanguageSwitches();
  }

  setLanguageOptions(options: AssistantLanguageOption[], currentLanguage?: string) {
    this.refreshCodeLanguages(options, currentLanguage);
  }

  getCodeLanguage() {
    return this.codeLanguage;
  }

  private renderWelcomeChips() {
    const questions = this.config.recommendedQuestions?.length
      ? this.config.recommendedQuestions
      : DEFAULT_CONFIG.recommendedQuestions || [];
    this.chipsEl.innerHTML = questions.map(
      (q) => `<button type="button" class="cf-assistant-chip" data-q="${escapeAttr(q)}">${escapeHtml(q)}</button>`,
    ).join('');
    this.chipsEl.querySelectorAll('.cf-assistant-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = (btn as HTMLElement).getAttribute('data-q') || '';
        this.composer.value = q;
        this.handleSubmit();
      });
    });
  }

  setCodeLanguage(lang: string) {
    const normalized = normalizeCodeLanguage(lang);
    if (!normalized) return;
    if (this.languageOptions.length) {
      const allowed = this.languageOptions.some((opt) => normalizeCodeLanguage(opt.value) === normalized);
      if (!allowed) return;
    } else if (!isWelcomeLanguageValue(normalized)) {
      return;
    }
    if (normalized === this.codeLanguage) return;
    this.codeLanguage = normalized;
    setGlobalPreferredCodeLanguage(normalized);
    this.renderCodeLanguageSwitches();
    this.callbacks.onCodeLanguageChange?.(normalized);
  }

  private renderCodeLanguageSwitches() {
    this.headerLangDropdown?.setValue(this.codeLanguage);
  }

  setQuotaRemaining(remaining: number | null, limited = true) {
    const link = this.root.querySelector('.cf-assistant-quota') as HTMLAnchorElement | null;
    if (link && !link.getAttribute('href')) link.href = '/ai-quota';
    if (!limited) {
      this.quotaValueEl.textContent = '不限';
      return;
    }
    if (remaining == null || !Number.isFinite(remaining)) {
      this.quotaValueEl.textContent = remaining == null ? '额度信息加载中' : '—';
      return;
    }
    this.quotaValueEl.textContent = String(Math.max(0, Math.floor(remaining)));
  }

  setOpen(next: boolean) {
    if (next && this.callbacks.canOpen && this.callbacks.canOpen() === false) {
      return;
    }
    if (next && this.dismissed) {
      this.setDismissed(false);
    }
    this.open = next;
    if (!next) this.closeHistoryView();
    this.panel.hidden = !next;
    this.panel.classList.toggle('cf-assistant-panel--open', next);
    this.root.classList.toggle('cf-assistant-root--open', next);
    this.launcher.classList.toggle('cf-assistant-launcher--active', next);
    this.launcher.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) {
      this.callbacks.onOpen?.();
      window.requestAnimationFrame(() => {
        if (!this.historyOpen) this.composer.focus();
      });
    } else {
      this.callbacks.onClose?.();
    }
  }

  toggle() {
    this.setOpen(!this.open);
  }

  getActiveReference() {
    return this.activeReference;
  }

  setReference(quote: AssistantQuote | null) {
    this.activeReference = quote?.content ? quote : null;
    this.renderReferenceCard();
    this.syncComposerPlaceholder();
    this.syncAddSelectionButton();
    if (this.lastMessages.length) {
      this.messageList.render(this.lastMessages);
    }
  }

  setPendingSelectionAvailable(available: boolean) {
    this.hasPendingSelection = available;
    this.syncAddSelectionButton();
  }

  showToast(message: string) {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastEl.classList.add('cf-assistant-toast--visible');
    if (this.toastTimer != null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('cf-assistant-toast--visible');
      this.toastTimer = window.setTimeout(() => {
        this.toastEl.hidden = true;
      }, 180);
    }, 1500);
  }

  focusInput() {
    if (!this.historyOpen) this.composer.focus();
  }

  private syncAddSelectionButton() {
    const enabled = this.hasPendingSelection;
    this.addSelectionBtn.disabled = !enabled;
    this.addSelectionBtn.classList.toggle('cf-assistant-add-selection--ready', enabled);
    this.addSelectionBtn.title = enabled
      ? '将当前选中文字添加到 AI 助教'
      : '请先在笔记正文中选择内容';
  }

  private renderReferenceCard() {
    if (!this.activeReference?.content) {
      this.quotePreview.hidden = true;
      this.quotePreview.innerHTML = '';
      return;
    }
    this.quotePreview.hidden = false;
    this.quotePreview.innerHTML = renderReferenceCardHtml(this.activeReference, 'composer');
    wireReferenceCard(this.quotePreview, {
      onRemove: () => this.setReference(null),
    });
  }

  private shouldShowFollowUp(msg: AssistantMessage, index: number, messages: AssistantMessage[]) {
    if (this.busy) return false;
    if (this.config.features?.followUpQuestions === false) return false;
    if (msg.role !== 'assistant' || msg.isStreaming) return false;
    for (let i = index + 1; i < messages.length; i++) {
      if (messages[i].role === 'assistant') return false;
    }
    // 引用仅随当次问题发送；追问建议看配对用户消息是否带正文引用
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].quote?.sourceType === 'article-selection';
      }
    }
    return false;
  }

  private handleFollowUpClick(question: string) {
    this.composer.value = question;
    this.syncComposerHeight();
    this.handleSubmit();
  }

  renderMessages(messages: AssistantMessage[], opts?: { forcePin?: boolean }) {
    this.lastMessages = messages;
    this.hasMessages = messages.length > 0;
    this.root.classList.toggle('cf-assistant-root--has-messages', this.hasMessages);
    this.root.classList.toggle('cf-assistant-root--empty', !this.hasMessages);
    this.syncComposerPlaceholder();
    this.messageList.render(messages, { forcePin: opts?.forcePin });
    this.syncJumpBottomBtn(this.messageList.isPinnedToBottom());
  }

  updateStreamingHtml(id: string, html: string) {
    this.messageList.updateStreamingHtml(id, html);
  }

  finalizeStreamingMessage(id: string, html: string) {
    this.messageList.finalizeStreamingMessage(id, html);
  }

  enhanceAssistantMessage(id: string) {
    this.messageList.enhanceAssistantMessage(id);
  }

  enhanceAllAssistantMessages() {
    this.messageList.enhanceAllAssistantMessages();
  }

  setBusy(busy: boolean) {
    this.busy = busy;
    this.composer.disabled = busy || Boolean(this.accessNotice);
    this.sendBtn.disabled = Boolean(this.accessNotice) && !busy;
    this.sendBtn.classList.toggle('cf-assistant-send--stop', busy);
    this.sendBtn.setAttribute('aria-label', busy ? '停止' : '发送');
    // 内联兜底：避免全局 button / hover 蓝底盖过停止态
    if (busy) {
      this.sendBtn.style.background = '#57606a';
      this.sendBtn.style.backgroundColor = '#57606a';
      this.sendBtn.style.backgroundImage = 'none';
      this.sendBtn.style.color = '#fff';
    } else {
      this.sendBtn.style.background = '';
      this.sendBtn.style.backgroundColor = '';
      this.sendBtn.style.backgroundImage = '';
      this.sendBtn.style.color = '';
    }
    this.sendBtn.innerHTML = busy
      ? '<i class="fas fa-stop"></i>'
      : '<i class="fas fa-paper-plane"></i>';
  }

  clearComposer() {
    this.composer.value = '';
    this.syncComposerHeight();
  }

  /** 停止生成后把问题回填输入框，并恢复引用（如有） */
  restoreComposer(question: string, quote?: AssistantQuote | null) {
    this.composer.disabled = Boolean(this.accessNotice);
    this.composer.value = String(question || '');
    this.syncComposerHeight();
    if (quote?.content) {
      this.setReference(quote);
    }
    this.syncComposerPlaceholder();
    if (!this.historyOpen) {
      try {
        this.composer.focus();
        const len = this.composer.value.length;
        this.composer.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }
  }

  private handleSubmit() {
    const q = this.composer.value.trim();
    if (!q) return;
    const quote = this.activeReference;
    this.composer.value = '';
    this.syncComposerHeight();
    // 引用一次：随本次问题发出后立即清空，避免追问重复带上同一段正文
    this.setReference(null);
    this.callbacks.onSubmit(q, quote);
  }

  private syncComposerHeight() {
    this.composer.style.height = 'auto';
    const nextHeight = Math.min(this.composer.scrollHeight, 120);
    this.composer.style.height = `${nextHeight}px`;
    const wrap = this.composer.closest('.cf-assistant-composer-box');
    wrap?.classList.toggle('cf-assistant-composer-box--multiline', nextHeight > 30);
  }

  private syncComposerPlaceholder() {
    if (this.activeReference?.sourceType === 'article-selection') {
      this.composer.placeholder = this.config.referenceInputPlaceholder
        || DEFAULT_CONFIG.referenceInputPlaceholder
        || '针对这段正文提问…';
      return;
    }
    if (this.hasMessages) {
      this.composer.placeholder = '继续追问…';
      return;
    }
    this.composer.placeholder = this.config.inputPlaceholder || DEFAULT_CONFIG.inputPlaceholder || '输入问题…';
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** 面板窗口最小尺寸（resize 下限） */
const PANEL_MIN_WIDTH = 300;
const PANEL_MIN_HEIGHT = 260;
