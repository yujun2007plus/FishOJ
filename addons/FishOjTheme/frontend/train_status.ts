// ============================================================
// FishOJ · 深海鎏金 · 训练列表页状态增强（train_status.ts）
// 纯前端，不发起任何额外请求。基于页面已渲染的 DOM：
//   ol.section__list.all.primary.training__list
//     > li.section__list__item.training__item
//       > .media > .media__left(.training__participants .numbox__num/.numbox__text)
//               + .media__body(.training__title / .training__intro / ul.training__progress)
//   .training-status--text 自带 outside / progress / done 三种状态类
// 功能：
//   ① 元信息徽标化：小节数 / 题数 / 规模分级（入门·进阶·挑战）
//   ② 三态状态徽标：未参加灰 / 进行中鎏金+% / 已完成青碧✓ + 进度条
//   ③ 右栏：创建训练计划卡鎏金化、已参加进度条鎏金化
//   ④ 前端筛选 Tab：全部 / 我参加的 / 未参加 / 已完成（纯前端隐藏，不发请求）
// 主题一致性：颜色字号一律由 train_gilded.css 引用 --fishoj-* token，与比赛/讨论页同源。
// SPA 路由切换用 MutationObserver 兜底重跑。
// ============================================================

type TrainState = 'outside' | 'progress' | 'done';

const STATE_ICON: Record<TrainState, string> = {
  outside: '◷',
  progress: '◐',
  done: '✓',
};

const STATE_LABEL: Record<TrainState, string> = {
  outside: '未参加',
  progress: '进行中',
  done: '已完成',
};

// 规模分级阈值（按题目数）
const SCALE_MID = 6;
const SCALE_HARD = 16;

// 主列表选择器（排除右栏 .my.secondary 的迷你项）
const MAIN_ITEM_SEL = '.training__list.primary > .training__item, .section__list.all > .training__item';

function scaleOf(problems: number): { key: string; text: string } {
  if (problems <= SCALE_MID - 1) return { key: 'easy', text: '入门' };
  if (problems < SCALE_HARD) return { key: 'mid', text: '进阶' };
  return { key: 'hard', text: '挑战' };
}

function detectState(item: HTMLElement): TrainState {
  const el = item.querySelector('.training-status--text');
  if (!el) return 'outside';
  const c = el.className || '';
  if (/\bdone\b/.test(c)) return 'done';
  if (/\bprogress\b/.test(c)) return 'progress';
  return 'outside';
}

function detectPercent(item: HTMLElement): number | null {
  const el = item.querySelector('.training-status--text');
  if (!el) return null;
  const m = (el.textContent || '').match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Math.min(100, Math.max(0, n));
}

function parseCounts(text: string): { sections: number | null; problems: number | null } {
  const s = text.match(/(\d+)\s*(?:小节|sections?)/i);
  const p = text.match(/(\d+)\s*(?:题|problems?)/i);
  return { sections: s ? parseInt(s[1], 10) : null, problems: p ? parseInt(p[1], 10) : null };
}

function makeBadge(modifier: string, text: string): HTMLElement {
  const el = document.createElement('span');
  // 注意：不复用 contest 的 .fish-badge（它 color:#fff !important，会染白浅底徽标）
  el.className = `fish-train-badge ${modifier}`;
  el.textContent = text;
  return el;
}

function decorateItem(item: HTMLElement): void {
  if (item.dataset.fishTrain === '1') return;
  item.dataset.fishTrain = '1';

  const body = item.querySelector('.media__body') as HTMLElement | null;
  if (!body) return;

  const progressEl = item.querySelector('.training__progress') as HTMLElement | null;
  const counts = parseCounts(progressEl ? progressEl.textContent || '' : '');
  const state = detectState(item);
  const percent = detectPercent(item);

  item.dataset.fishTrainState = state;
  item.classList.add(`fish-train--${state}`);

  // —— 徽标行 ——
  const foot = document.createElement('div');
  foot.className = 'fish-train-foot';

  if (counts.sections != null) {
    foot.appendChild(makeBadge('fish-train-badge--sec', `📚 ${counts.sections} 小节`));
  }
  if (counts.problems != null) {
    foot.appendChild(makeBadge('fish-train-badge--prob', `🧩 ${counts.problems} 题`));
    const sc = scaleOf(counts.problems);
    foot.appendChild(makeBadge(`fish-train-badge--scale-${sc.key}`, sc.text));
  }

  const stateText = state === 'outside' || percent == null
    ? `${STATE_ICON[state]} ${STATE_LABEL[state]}`
    : `${STATE_ICON[state]} ${STATE_LABEL[state]} ${percent}%`;
  foot.appendChild(makeBadge(`fish-train-badge--state-${state}`, stateText));

  const intro = body.querySelector('.training__intro');
  if (intro && intro.parentNode) intro.parentNode.insertBefore(foot, intro.nextSibling);
  else body.appendChild(foot);

  // —— 进度条 ——
  if (state !== 'outside' && percent != null) {
    const bar = document.createElement('div');
    bar.className = `fish-train-bar${state === 'done' ? ' is-done' : ''}`;
    const fill = document.createElement('span');
    fill.className = 'fish-train-bar__fill';
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);
    if (foot.parentNode) foot.parentNode.insertBefore(bar, foot.nextSibling);
  }

  // —— 原始元信息行：识别成功才隐藏，避免丢信息 ——
  if (progressEl && (counts.problems != null || state !== 'outside')) {
    progressEl.classList.add('fish-train-meta-hidden');
  }

  // —— 人数块鎏金化 ——
  const numbox = item.querySelector('.training__participants');
  if (numbox) numbox.classList.add('fish-train-attend');
}

function decorateSides(): void {
  // 创建训练计划卡 → 深蓝鎏金 CTA
  const links = document.querySelectorAll('a[href*="training/create"], a[href*="training_create"]');
  Array.from(links).forEach((a) => {
    const side = a.closest('.section.side') as HTMLElement | null;
    if (side) side.classList.add('fish-side-gold');
  });

  // 已参加：进度条鎏金化
  Array.from(document.querySelectorAll('.training__progress-bar')).forEach((b) => {
    b.classList.add('fish-track');
  });
  Array.from(document.querySelectorAll('.training__progress-track')).forEach((t) => {
    t.classList.add('fish-track__fill');
  });
}

let tabsMounted = false;

function applyFilter(key: string): void {
  const items = Array.from(document.querySelectorAll(MAIN_ITEM_SEL)) as HTMLElement[];
  let shown = 0;
  items.forEach((el) => {
    const st = el.dataset.fishTrainState || 'outside';
    let show = true;
    if (key === 'mine') show = st !== 'outside';
    else if (key === 'todo') show = st === 'outside';
    else if (key === 'done') show = st === 'done';
    el.style.display = show ? '' : 'none';
    if (show) shown += 1;
  });
  // 空结果提示
  const list = document.querySelector('.training__list.primary, .section__list.all');
  if (!list) return;
  let empty = list.parentElement?.querySelector('.fish-train-empty') as HTMLElement | null;
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'fish-train-empty';
    empty.textContent = '该筛选下暂时没有训练计划';
    list.parentNode?.insertBefore(empty, list.nextSibling);
  }
  empty.style.display = shown === 0 ? '' : 'none';
}

function buildTabs(): void {
  if (tabsMounted) return;
  // 从主列表往上找所属 section 的 header，兼容 .section__list.all / .training__list.primary 两种结构
  const listEl = document.querySelector('.training__list.primary')
    || document.querySelector('.section__list.all');
  const section = listEl ? listEl.closest('.section') : null;
  const header = section ? section.querySelector('.section__header') : null;
  if (!header) return;

  const tabs = document.createElement('div');
  tabs.className = 'fish-train-tabs';

  const defs: Array<[string, string]> = [
    ['all', '全部'],
    ['mine', '◐ 我参加的'],
    ['todo', '○ 未参加'],
    ['done', '✓ 已完成'],
  ];

  defs.forEach(([key, label], idx) => {
    const b = document.createElement('span');
    b.className = `fish-train-tab${idx === 0 ? ' is-on' : ''}`;
    b.textContent = label;
    b.setAttribute('role', 'button');
    b.addEventListener('click', () => {
      Array.from(tabs.querySelectorAll('.fish-train-tab')).forEach((t) => t.classList.remove('is-on'));
      b.classList.add('is-on');
      applyFilter(key);
    });
    tabs.appendChild(b);
  });

  header.appendChild(tabs);
  tabsMounted = true;
}

function run(): void {
  const items = Array.from(document.querySelectorAll(MAIN_ITEM_SEL)) as HTMLElement[];
  if (!items.length) return;
  items.forEach(decorateItem);
  decorateSides();
  buildTabs();
}

export function initTrainStatus(): void {
  run();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  }

  // SPA 路由切换兜底
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = null;
      run();
    }, 220);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
