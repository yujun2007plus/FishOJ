// ============================================================
// FishOJ · 深海鎏金 · 比赛列表页状态增强（contest_status.ts）
// 纯前端，不发起任何额外请求。基于页面已渲染的 DOM：
//   .contest__item.contest-type--{rule}
//   .media > .media__left(.contest__date numbox) + .media__body(.contest__title / .supplementary)
//   .supplementary > .contest-type-tag ...（赛制 / Rated / 时长 / 人数）
// 功能：
//   ① 三态状态徽标：未开始→倒计时 / 进行中→LIVE脉冲+进度条 / 已结束→沉稳收尾
//   ② 赛制分色（XCPC金 / OI蓝 / IOI绿）
//   ③ RATED 火焰徽标
//   ④ 人数热门（≥ HOT_THRESHOLD 自动点亮）
// SPA 路由切换用 MutationObserver 兜底重跑。
// ============================================================

const HOT_THRESHOLD = 30;

// 赛制 → 显示文案（与预览页一致）
const RULE_LABEL: Record<string, string> = {
  acm: 'ACM',
  oi: 'OI',
  ioi: 'IOI',
  homework: '作业',
};

interface LiveItem {
  beginAt: Date;
  endAt: Date;
  stateEl: HTMLElement;
  barEl?: HTMLElement;
  metaEl?: HTMLElement;
}

const liveItems: LiveItem[] = [];

function parseDateTime(text: string): Date | null {
  const m = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return null;
}

function parseMonth(text: string): number | null {
  const map: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };
  const up = text.trim().toUpperCase();
  if (map[up]) return map[up];
  const cn = text.match(/(\d{1,2})\s*月/);
  if (cn) return +cn[1];
  return null;
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} 天 ${String(h).padStart(2, '0')} 时 ${String(m).padStart(2, '0')} 分`;
  if (h > 0) return `${h} 时 ${String(m).padStart(2, '0')} 分 ${String(sec).padStart(2, '0')} 秒`;
  return `${m} 分 ${String(sec).padStart(2, '0')} 秒`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildStateBadge(state: 'coming' | 'live' | 'over'): HTMLElement {
  const el = document.createElement('span');
  el.className = `fish-badge fish-state fish-state--${state}`;
  if (state === 'coming') {
    el.innerHTML = '<span class="fish-ico">⏳</span><span class="fish-state-txt">未开始</span>';
  } else if (state === 'live') {
    el.innerHTML = '<span class="fish-ico fish-dot"></span><span class="fish-state-txt">LIVE 进行中</span>';
  } else {
    el.innerHTML = '<span class="fish-ico">✓</span><span class="fish-state-txt">已结束</span>';
  }
  return el;
}

function buildLiveBar(): { bar: HTMLElement; meta: HTMLElement } {
  const bar = document.createElement('div');
  bar.className = 'fish-live-bar';
  const fill = document.createElement('i');
  bar.appendChild(fill);
  const meta = document.createElement('div');
  meta.className = 'fish-live-meta';
  return { bar, meta };
}

function tick() {
  const now = new Date();
  for (const it of liveItems) {
    const total = it.endAt.getTime() - it.beginAt.getTime();
    if (now < it.beginAt) {
      // 未开始：倒计时
      if (it.stateEl.dataset.kind !== 'coming') {
        it.stateEl.className = 'fish-badge fish-state fish-state--coming';
        it.stateEl.innerHTML = '<span class="fish-ico">⏳</span><span class="fish-state-txt">未开始</span>';
        it.stateEl.dataset.kind = 'coming';
        if (it.barEl) it.barEl.style.display = 'none';
        if (it.metaEl) it.metaEl.style.display = 'none';
      }
      const cd = it.stateEl.querySelector('.fish-state-txt') as HTMLElement;
      if (cd) cd.textContent = `距开赛 ${fmtDuration(it.beginAt.getTime() - now.getTime())}`;
    } else if (now <= it.endAt) {
      // 进行中：进度条
      if (it.stateEl.dataset.kind !== 'live') {
        it.stateEl.className = 'fish-badge fish-state fish-state--live';
        it.stateEl.innerHTML = '<span class="fish-ico fish-dot"></span><span class="fish-state-txt">LIVE 进行中</span>';
        it.stateEl.dataset.kind = 'live';
        if (it.barEl) it.barEl.style.display = '';
        if (it.metaEl) it.metaEl.style.display = '';
      }
      const elapsed = now.getTime() - it.beginAt.getTime();
      const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
      const fill = it.barEl?.firstChild as HTMLElement | null;
      if (fill) fill.style.width = `${pct}%`;
      if (it.metaEl) {
        it.metaEl.innerHTML =
          `<span>已进行 ${fmtDuration(elapsed)}</span><span>剩 ${fmtDuration(it.endAt.getTime() - now.getTime())}</span>`;
      }
    } else {
      // 已结束
      if (it.stateEl.dataset.kind !== 'over') {
        it.stateEl.className = 'fish-badge fish-state fish-state--over';
        it.stateEl.innerHTML = '<span class="fish-ico">✓</span><span class="fish-state-txt">已结束</span>';
        it.stateEl.dataset.kind = 'over';
        if (it.barEl) it.barEl.style.display = 'none';
        if (it.metaEl) it.metaEl.style.display = 'none';
      }
    }
  }
}

function decorateItem(item: HTMLElement) {
  if (item.dataset.fishContest) return;
  item.dataset.fishContest = '1';

  const body = item.querySelector('.media__body') as HTMLElement | null;
  if (!body) return;

  // —— 赛制（来自 item class contest-type--{rule}）——
  let rule = '';
  const cls = item.className.split(/\s+/);
  for (const c of cls) {
    const m = c.match(/^contest-type--(.+)$/);
    if (m) { rule = m[1]; break; }
  }

  // —— 时间：先尝试从文本解析精确起止，否则用日期块（当天 00:00）兜底 ——
  const fullText = item.textContent || '';
  const dtMatches = fullText.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})/g) || [];
  let beginAt: Date | null = null;
  let endAt: Date | null = null;
  if (dtMatches.length >= 2) {
    beginAt = parseDateTime(dtMatches[0]);
    endAt = parseDateTime(dtMatches[dtMatches.length - 1]);
  } else if (dtMatches.length === 1) {
    beginAt = parseDateTime(dtMatches[0]);
  }
  if (!beginAt) {
    const dayEl = item.querySelector('.contest__date .numbox__num');
    const monEl = item.querySelector('.contest__date .numbox__text');
    const day = dayEl ? parseInt((dayEl.textContent || '').trim(), 10) : NaN;
    const mon = monEl ? parseMonth(monEl.textContent || '') : null;
    if (!Number.isNaN(day) && mon) {
      const year = new Date().getFullYear();
      beginAt = new Date(year, mon - 1, day, 0, 0);
    }
  }

  // —— 时长（小时）——
  const durM = fullText.match(/(\d+(?:\.\d+)?)\s*(?:小时|时|h|hr|hour)/i);
  const durationHours = durM ? parseFloat(durM[1]) : 0;
  if (beginAt && !endAt && durationHours > 0) {
    endAt = new Date(beginAt.getTime() + durationHours * 3600 * 1000);
  }

  // —— 重绘 supplementary 内的徽标（赛制分色 / RATED火焰 / 人数热门）——
  // 约定 supplementary 顺序通常为：赛制 → Rated → 时长 → 人数
  const supp = item.querySelector('.supplementary') as HTMLElement | null;
  if (supp) {
    const tags = Array.from(supp.querySelectorAll('.contest-type-tag, [class*="tag"]')) as HTMLElement[];
    let ruleTag: HTMLElement | null = null;
    for (const tag of tags) {
      const t = (tag.textContent || '').trim();
      if (/rated|计分/i.test(t)) {
        // RATED 火焰
        tag.classList.add('fish-rated');
        if (!/🔥/.test(t)) tag.innerHTML = `🔥 ${t}`;
      } else if (/人|participant|参加/i.test(t) || /^\d+$/.test(t)) {
        // 人数
        const n = parseInt((t.match(/\d+/) || ['0'])[0], 10);
        tag.classList.add('fish-people');
        if (n >= HOT_THRESHOLD) tag.classList.add('fish-hot');
      } else if (/小时|时|hour|\bh\b/i.test(t)) {
        // 时长，保持原样
        continue;
      } else if (!ruleTag) {
        // 第一个既非 rated、非人数、非时长的徽标视为赛制
        ruleTag = tag;
      }
    }
    if (ruleTag && rule) {
      ruleTag.classList.add(`fish-rule--${rule}`);
      const label = RULE_LABEL[rule] || ruleTag.textContent;
      if (label !== ruleTag.textContent) ruleTag.textContent = label;
    }
  }

  // —— 状态徽标 + 进度条（注入到 media__body 顶部）——
  if (beginAt && endAt) {
    const now = new Date();
    let state: 'coming' | 'live' | 'over';
    if (now < beginAt) state = 'coming';
    else if (now <= endAt) state = 'live';
    else state = 'over';

    const stateEl = buildStateBadge(state);
    stateEl.dataset.kind = state;
    body.insertBefore(stateEl, body.firstChild);

    const { bar, meta } = buildLiveBar();
    bar.style.display = state === 'live' ? '' : 'none';
    meta.style.display = state === 'live' ? '' : 'none';
    body.appendChild(bar);
    body.appendChild(meta);

    const li: LiveItem = { beginAt, endAt, stateEl, barEl: bar, metaEl: meta };
    liveItems.push(li);
    tick();
  }
}

function initContest() {
  if (typeof document === 'undefined') return;
  const items = document.querySelectorAll('.contest__item') as NodeListOf<HTMLElement>;
  items.forEach(decorateItem);
}

let started = false;
export function initContestStatus() {
  if (started) return;
  started = true;
  if (typeof document === 'undefined') return;

  const run = () => initContest();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // SPA 导航兜底
  const observer = new MutationObserver(() => initContest());
  observer.observe(document.body, { childList: true, subtree: true });

  // 倒计时心跳
  setInterval(tick, 1000);
}
