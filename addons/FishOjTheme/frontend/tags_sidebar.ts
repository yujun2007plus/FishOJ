/**
 * FishOJ 题库标签筛选 · 三维分组 + 分色 + 可折叠
 * ------------------------------------------------------------
 * 纯前端重组，不修改任何数据、不改后端逻辑。
 * 通过标签文本前缀 来源:/赛事:/知识点: 自动识别维度，
 * 把扁平的标签云重排为「三层可折叠分区」，并按维度分色：
 *   来源 → 灰（弱标记）   赛事 → 蓝   知识点 → 金（重点）
 *
 * 健壮性：
 *   - 不依赖任何具体 class，按文本前缀识别，找不到匹配即 no-op；
 *   - 只「移动」原始标签元素，保留其链接与点击事件；
 *   - 用 MutationObserver 兜底 Hydro 的惰性渲染 / 筛选后局部重绘。
 */
import { addPage, NamedPage } from '@hydrooj/ui-default';

type LayerKey = '来源' | '赛事' | '知识点';

interface LayerDef {
  key: LayerKey;
  cls: string; // CSS 修饰类后缀
  collapse: boolean; // 默认是否折叠
}

const PREFIX_RE = /^(来源|赛事|知识点):/;
const PREFIX_TRIM_RE = /^(来源|赛事|知识点):\s*/;

// 来源占比最高(480)且筛选价值最低，默认折叠；赛事/知识点展开
const LAYERS: LayerDef[] = [
  { key: '来源', cls: 'source', collapse: true },
  { key: '赛事', cls: 'event', collapse: false },
  { key: '知识点', cls: 'knowledge', collapse: false },
];

// 仅在这些页面处理
const TARGET_PAGES = ['problem_main', 'problem_category'];

function clickableAncestor(el: Element | null): Element | null {
  if (!el) return null;
  return el.closest('a,button,label,[role="button"]');
}

const CHIP_SELECTOR = 'a,span,button,label,li';

/** 找出所有带前缀的标签 chip（取最近可点击祖先，保留原始链接/事件）。
 *  关键：匹配「最外层」元素——自身文本含前缀、但其元素后代中不再含另一个含前缀的元素，
 *  这样无论标签是 <a>文本</a> 还是 <a><span>文本</span></a> 或带图标的 Tag 组件都能命中。 */
function findChips(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(CHIP_SELECTOR));
  candidates.forEach((el) => {
    if (!PREFIX_RE.test((el.textContent || '').trim())) return;
    // 若自身包含「元素后代」也匹配前缀，说明它是更外层容器，真正的 chip 在内部
    const hasMatchingDescendant = Array.from(
      el.querySelectorAll<HTMLElement>(CHIP_SELECTOR),
    ).some((d) => d !== el && PREFIX_RE.test((d.textContent || '').trim()));
    if (hasMatchingDescendant) return;
    const chip = (clickableAncestor(el) as HTMLElement) || el;
    if (!seen.has(chip)) {
      seen.add(chip);
      out.push(chip);
    }
  });
  return out;
}

/** 标签共同容器：若全部 chip 同父则取该父，否则取最近公共祖先 */
function getContainer(chips: HTMLElement[]): HTMLElement | null {
  if (!chips.length) return null;
  const parents = chips.map((c) => c.parentElement).filter(Boolean) as HTMLElement[];
  if (parents.length && parents.every((p) => p === parents[0])) return parents[0];
  let anc: HTMLElement | null = chips[0].parentElement;
  while (anc) {
    if (chips.every((c) => anc!.contains(c))) {
      const up = anc.parentElement;
      if (up && chips.every((c) => up.contains(c))) anc = up;
      else break;
    } else {
      anc = anc.parentElement;
    }
  }
  return anc;
}

function layerOf(text: string): LayerKey | null {
  const m = text.match(PREFIX_RE);
  return (m && (m[1] as LayerKey)) || null;
}

/** 安全地把前缀文字包成弱化 span（仅当 chip 只含单个文本节点时），不改变 textContent */
function dimPrefix(el: HTMLElement): void {
  const first = el.firstChild;
  if (el.childNodes.length === 1 && first?.nodeType === Node.TEXT_NODE) {
    const t = first.textContent || '';
    const m = t.match(PREFIX_TRIM_RE);
    if (!m) return;
    const span = document.createElement('span');
    span.className = 'fishoj-tag__prefix';
    span.textContent = m[0].replace(/:$/, '：');
    const rest = document.createTextNode(t.slice(m[0].length));
    el.replaceChild(span, first); // 用前缀 span 替换原文本节点
    el.appendChild(rest); // 再追加剩余文字，textContent 仍为完整标签值
  }
}

function buildGroup(def: LayerDef, chips: HTMLElement[]): HTMLElement {
  const group = document.createElement('div');
  group.className = `fishoj-tag-group fishoj-tag-group--${def.cls}`;
  if (def.collapse) group.classList.add('collapsed');

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'fishoj-tag-group__head';
  head.innerHTML =
    '<span class="fishoj-tag-group__dot"></span>' +
    `<span class="fishoj-tag-group__title">${def.key}</span>` +
    `<span class="fishoj-tag-group__count">${chips.length}</span>` +
    '<span class="fishoj-tag-group__chevron" aria-hidden="true">▾</span>';
  head.addEventListener('click', () => group.classList.toggle('collapsed'));

  const body = document.createElement('div');
  body.className = 'fishoj-tag-group__body';
  chips.forEach((c) => {
    dimPrefix(c);
    c.classList.add(`fishoj-tag--${def.cls}`);
    body.appendChild(c); // 移动原始元素，保留链接与事件
  });

  group.appendChild(head);
  group.appendChild(body);
  return group;
}

function groupTags(): boolean {
  const chips = findChips(document);
  if (chips.length < 2) return false;
  const container = getContainer(chips);
  if (!container || container.dataset.fishojTagGrouped === '1') return false;

  const buckets: Record<LayerKey, HTMLElement[]> = { 来源: [], 赛事: [], 知识点: [] };
  chips.forEach((c) => {
    const key = layerOf((c.textContent || '').trim());
    if (key) buckets[key].push(c);
  });
  if (LAYERS.every((l) => buckets[l.key].length === 0)) return false;

  // 先打标记，避免移动过程触发的 mutation 递归重排
  container.dataset.fishojTagGrouped = '1';

  const frag = document.createDocumentFragment();
  LAYERS.forEach((def) => {
    const list = buckets[def.key];
    if (list.length) frag.appendChild(buildGroup(def, list));
  });
  container.appendChild(frag);
  return true;
}

/** 兜底 Hydro 惰性渲染 / 筛选后局部重绘：观察 DOM，无已分组容器时重排 */
function observeAndRetry(): void {
  let timer: number | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!document.querySelector('[data-fishoj-tag-grouped="1"]')) groupTags();
    }, 200);
  };
  const obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  [0, 500, 1200].forEach((d) => window.setTimeout(groupTags, d));
}

function init(): void {
  observeAndRetry();
}

addPage(new NamedPage(TARGET_PAGES, init));
