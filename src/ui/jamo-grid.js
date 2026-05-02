/**
 * jamo-grid.js - jamo input grid UI
 */

import {
  CHO,
  BASIC_CONSONANTS,
  BASIC_VOWELS,
  COMPOUND_JONG_CLUSTERS,
  decompose,
  getChoInfo,
  getJungInfo,
  getJongInfo,
  JUNG,
  JONG,
} from '../core/hangul.js';
import { getCompositionLayout } from '../core/composer.js';

const COMPOSITION_CONTEXT_MAP = {
  cho_v: 'cv',
  cho_h: 'cv',
  cho_m: 'cv',
  jung_nb: 'cv',
  jung_wb: 'cvc_simple',
};

const syllable = (cho, jung, jong = 0) => String.fromCharCode(0xAC00 + (cho * 21 + jung) * 28 + jong);
const findChoIndex = (jamo) => CHO.findIndex((item) => item === jamo);
const findJungIndex = (jamo) => JUNG.findIndex((item) => item === jamo);
const findJongIndex = (jamo) => JONG.findIndex((item) => item === jamo);

const choExamples = (jungIdx, jongIdx = 0) => CHO.map((jamo) => syllable(findChoIndex(jamo), jungIdx, jongIdx));
const jungExamples = (jongIdx = 0) => JUNG.map((jamo) => syllable(0, findJungIndex(jamo), jongIdx));
const jongExamples = (jungIdx) => JONG.slice(1).map((jamo) => syllable(0, jungIdx, findJongIndex(jamo)));
const ASCII_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ASCII_LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const ASCII_DIGITS = '0123456789'.split('');
const ASCII_SYMBOLS = ['.', ',', '!', '?', ':', ';', "'", '"', '(', ')', '[', ']', '-', '/', '@', '#', '&', '*'];

export const CATEGORIES = [
  {
    id: 'cho_v',
    label: 'Initial (Vertical Vowel)',
    items: CHO,
    examples: choExamples(0), // ㅏ
    guideType: 'cho',
  },
  {
    id: 'cho_v_wf',
    label: 'Initial (Vertical + Final)',
    items: CHO,
    examples: choExamples(0, 1), // 각
    guideType: 'cho',
  },
  {
    id: 'cho_h',
    label: 'Initial (Horizontal Vowel)',
    items: CHO,
    examples: choExamples(18), // ㅡ
    guideType: 'cho',
  },
  {
    id: 'cho_h_wf',
    label: 'Initial (Horizontal + Final)',
    items: CHO,
    examples: choExamples(18, 1), // 극
    guideType: 'cho',
  },
  {
    id: 'cho_m',
    label: 'Initial (Complex Vowel)',
    items: CHO,
    examples: choExamples(9), // ㅘ
    guideType: 'cho',
  },
  {
    id: 'cho_m_wf',
    label: 'Initial (Complex + Final)',
    items: CHO,
    examples: choExamples(9, 1), // 꽉
    guideType: 'cho',
  },
  {
    id: 'jung_nb',
    label: 'Medial (No Final)',
    items: JUNG,
    examples: jungExamples(0),
    guideType: 'jung',
    guideOverrideScope: 'item',
  },
  {
    id: 'jung_wb',
    label: 'Medial (With Final)',
    items: JUNG,
    examples: jungExamples(1), // ㄱ 받침
    guideType: 'jung',
  },
  {
    id: 'jong_v',
    label: 'Final (Vertical Vowel)',
    items: JONG.slice(1),
    examples: jongExamples(0), // ㅏ
    guideType: 'jong',
  },
  {
    id: 'jong_h',
    label: 'Final (Horizontal Vowel)',
    items: JONG.slice(1),
    examples: jongExamples(18), // ㅡ
    guideType: 'jong',
  },
  {
    id: 'jong_m',
    label: 'Final (Complex Vowel)',
    items: JONG.slice(1),
    examples: jongExamples(9), // ㅘ
    guideType: 'jong',
  },
  {
    id: 'ascii_upper',
    label: 'Uppercase (A-Z)',
    items: ASCII_UPPER,
    examples: ASCII_UPPER,
    guideType: 'ascii',
    required: false,
  },
  {
    id: 'ascii_lower',
    label: 'Lowercase (a-z)',
    items: ASCII_LOWER,
    examples: ASCII_LOWER,
    guideType: 'ascii',
    required: false,
  },
  {
    id: 'ascii_digit',
    label: 'Digits (0-9)',
    items: ASCII_DIGITS,
    examples: ASCII_DIGITS,
    guideType: 'ascii',
    required: false,
  },
  {
    id: 'ascii_symbol',
    label: 'Symbols',
    items: ASCII_SYMBOLS,
    examples: ASCII_SYMBOLS,
    guideType: 'ascii',
    required: false,
  },
];
export const REQUIRED_JAMO_COUNT = CATEGORIES
  .filter((category) => category.required !== false)
  .reduce((sum, category) => sum + category.items.length, 0);

function isRequiredCategory(categoryId) {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  return category?.required !== false;
}

function getGuideSequence(char) {
  const info = decompose(char);
  if (!info) {
    return [char];
  }

  const sequence = [CHO[info.cho], JUNG[info.jung]];
  if (info.jong > 0) {
    sequence.push(JONG[info.jong]);
  }

  return sequence;
}

function toCanvasRegion(slot) {
  if (!slot) return null;
  return {
    x: slot.x,
    y: 1 - (slot.y + slot.h),
    w: slot.w,
    h: slot.h,
  };
}

function pinFinalRegionToMidline(slot) {
  if (!slot) return null;
  return {
    ...slot,
    y: 0.5,
    h: Math.min(slot.h + 0.12, 0.36),
  };
}

function extendRegionTopToMidline(slot) {
  if (!slot) return null;
  const nextY = 0.5;
  const extraHeight = Math.max(slot.y - nextY, 0);
  return {
    ...slot,
    y: nextY,
    h: Math.min(slot.h + extraHeight, 0.5),
  };
}

function extendRegionBottomToMidline(slot) {
  if (!slot) return null;
  const nextBottom = 0.5;
  const currentBottom = slot.y + slot.h;
  const extraHeight = Math.max(nextBottom - currentBottom, 0);
  return {
    ...slot,
    h: Math.min(slot.h + extraHeight, 0.5),
  };
}

function createQualityProfile(overrides = {}) {
  return {
    minFillRatio: 0.14,
    minCoverageX: 0.24,
    minCoverageY: 0.24,
    maxOverflowRatio: 0.28,
    maxCenterOffsetX: 0.26,
    maxCenterOffsetY: 0.26,
    sparsePointCount: 5,
    sparseSingleStrokePointCount: 8,
    sparseLengthRatio: 0.32,
    thinCoverageMin: 0.18,
    strongCoverageMin: 0.72,
    allowThinX: false,
    allowThinY: false,
    ...overrides,
  };
}

export function buildGuideMeta(categoryId, jamo, example) {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  const sequence = getGuideSequence(example);
  const info = decompose(example);
  const vowelInfo = info ? getJungInfo(info.jung) : null;
  const isHorizontal = info
    ? categoryId.startsWith('cho_h') || (categoryId.startsWith('jung') && vowelInfo && !vowelInfo.isCompound && ['\u3157', '\u315B', '\u315C', '\u3160', '\u3161'].includes(JUNG[info.jung]))
    : false;
  const isCompoundVowel = !!vowelInfo?.isCompound;
  const layout = info ? getCompositionLayout(info.jung, info.jong) : null;
  const canvasLayout = layout
    ? {
      cho: toCanvasRegion(layout.cho),
      jung: toCanvasRegion(layout.jung),
      jong: toCanvasRegion(layout.jong),
    }
    : null;
  const guide = {
    char: example,
    sequence,
    targetIndices: [],
    label: '',
    targetRegion: null,
    storageKeys: [],
    qualityProfile: createQualityProfile(),
    overrideScope: category?.guideOverrideScope || 'category',
  };

  switch (category?.guideType) {
    case 'cho':
      guide.targetIndices = [0];
      guide.label = `Target initial ${jamo}`;
      guide.targetRegion = canvasLayout?.cho ?? (categoryId.includes('_h') || categoryId.includes('_m')
        ? { x: 0.14, y: 0.50, w: 0.72, h: 0.38 }
        : { x: 0.08, y: 0.11, w: 0.42, h: 0.79 });
      guide.storageKeys = [`${categoryId}_${jamo}`];
      guide.qualityProfile = categoryId.includes('_h') || categoryId.includes('_m')
        ? createQualityProfile({
          minFillRatio: 0.11,
          minCoverageY: 0.18,
          maxCenterOffsetY: 0.3,
          allowThinY: true,
        })
        : createQualityProfile({
          minFillRatio: 0.11,
          minCoverageX: 0.18,
          maxCenterOffsetX: 0.3,
          allowThinX: true,
        });
      return guide;
    case 'jung':
      guide.targetIndices = [1];
      guide.label = `Target medial ${jamo}`;
      guide.targetRegion = categoryId === 'jung_nb'
        ? (isHorizontal
            ? { x: 0.16, y: 0.12, w: 0.68, h: 0.24 }
            : { x: 0.47, y: 0.08, w: 0.39, h: 0.82 })
        : (isHorizontal
            ? { x: 0.16, y: 0.39, w: 0.68, h: 0.18 }
            : { x: 0.47, y: 0.43, w: 0.38, h: 0.47 });
      guide.storageKeys = [`${categoryId}_${jamo}`];
      guide.qualityProfile = isHorizontal
        ? createQualityProfile({
          minFillRatio: isCompoundVowel ? 0.1 : 0.07,
          minCoverageY: isCompoundVowel ? 0.18 : 0.1,
          maxCenterOffsetY: 0.34,
          sparseLengthRatio: 0.22,
          allowThinY: true,
        })
        : createQualityProfile({
          minFillRatio: isCompoundVowel ? 0.11 : 0.09,
          minCoverageX: isCompoundVowel ? 0.18 : 0.13,
          maxCenterOffsetX: 0.32,
          sparseLengthRatio: 0.24,
          allowThinX: true,
        });
      return guide;
    case 'jong':
      guide.targetIndices = [sequence.length - 1];
      guide.label = `Target final ${jamo}`;
      guide.targetRegion = pinFinalRegionToMidline(canvasLayout?.jong) ?? { x: 0.15, y: 0.5, w: 0.68, h: 0.32 };
      guide.storageKeys = [`${categoryId}_${jamo}`];
      guide.qualityProfile = createQualityProfile({
        minFillRatio: 0.08,
        minCoverageY: 0.12,
        maxCenterOffsetY: 0.32,
        sparseLengthRatio: 0.22,
        allowThinY: true,
      });
      return guide;
    case 'ascii':
      guide.targetIndices = [0];
      guide.label = `Draw ${jamo}`;
      guide.targetRegion = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
      guide.storageKeys = [`${categoryId}_${jamo}`, `ascii_${jamo}`];
      guide.qualityProfile = createQualityProfile({
        minFillRatio: 0.05,
        minCoverageX: 0.12,
        minCoverageY: 0.12,
        maxOverflowRatio: 0.35,
        sparsePointCount: 3,
      });
      return guide;
    default:
      return guide;
  }
}
export class JamoGrid {
  constructor(container, onSelect, options = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.options = options;
    this.completedMap = {};
    this.activeCategory = 0;
    this.activeItemIndex = -1;
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('jamo-grid');

    const tabBar = document.createElement('div');
    tabBar.className = 'jamo-tabs';

    CATEGORIES.forEach((cat, idx) => {
      const tab = document.createElement('button');
      tab.className = `jamo-tab ${idx === 0 ? 'active' : ''}`;
      tab.innerHTML = `
        <span class="tab-label">${cat.label}</span>
        <span class="tab-progress">${this._getCategoryProgress(cat)}</span>
      `;
      tab.addEventListener('click', () => this._switchCategory(idx));
      tabBar.appendChild(tab);
    });

    const progressBar = document.createElement('div');
    progressBar.className = 'jamo-progress-bar';
    progressBar.innerHTML = `
      <div class="progress-fill" style="width: 0%"></div>
      <span class="progress-text">0/${REQUIRED_JAMO_COUNT}</span>
    `;

    const quickFind = document.createElement('div');
    quickFind.className = 'jamo-quick-find';
    quickFind.innerHTML = `
      <div class="jamo-quick-find-label">Find syllable</div>
      <div class="jamo-quick-find-row">
        <input type="text" class="jamo-quick-find-input" maxlength="1" placeholder="한" />
        <button type="button" class="tool-btn jamo-quick-find-btn">Go</button>
      </div>
      <p class="jamo-quick-find-help">Enter one Hangul syllable to jump to the related jamo task.</p>
    `;

    const gridArea = document.createElement('div');
    gridArea.className = 'jamo-grid-area';

    this.container.appendChild(tabBar);
    this.container.appendChild(progressBar);
    this.container.appendChild(quickFind);
    this.container.appendChild(gridArea);

    this.tabBar = tabBar;
    this.progressBar = progressBar;
    this.quickFindInput = quickFind.querySelector('.jamo-quick-find-input');
    this.gridArea = gridArea;

    quickFind.querySelector('.jamo-quick-find-btn').addEventListener('click', () => {
      this._handleQuickFind();
    });
    this.quickFindInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this._handleQuickFind();
      }
    });

    this._renderGrid();
  }

  _handleQuickFind() {
    const value = this.quickFindInput?.value.trim();
    if (!value) return;

    const info = decompose(value);
    if (!info) {
      this.options.onInvalidLocateChar?.(value);
      return;
    }

    this.options.onLocateChar?.(value, info);
  }

  _switchCategory(idx) {
    this.activeCategory = idx;
    this.activeItemIndex = -1;
    this.tabBar.querySelectorAll('.jamo-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === idx);
    });
    this._renderGrid();
  }

  _renderGrid() {
    const cat = CATEGORIES[this.activeCategory];
    this.gridArea.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'jamo-items';

    cat.items.forEach((jamo, i) => {
      const key = `${cat.id}_${jamo}`;
      const isCompleted = !!this.completedMap[key];
      const isActive = this.activeItemIndex === i;
      const example = cat.examples[i];

      const card = document.createElement('button');
      card.className = `jamo-card ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`;
      card.innerHTML = `
        <span class="jamo-char">${jamo}</span>
        <span class="jamo-example">${example}</span>
        ${isCompleted ? '<span class="jamo-check">✓</span>' : ''}
      `;

      card.addEventListener('click', () => {
        this.activeItemIndex = i;
        this._renderGrid();
        if (this.onSelect) {
          this.onSelect(cat.id, jamo, example, buildGuideMeta(cat.id, jamo, example));
        }
      });

      grid.appendChild(card);
    });

    this.gridArea.appendChild(grid);
  }

  markCompleted(categoryId, jamo) {
    this.completedMap[`${categoryId}_${jamo}`] = true;
    this._updateProgress();
    this._renderGrid();
    this._updateTabs();
  }

  setCompletedMap(completedMap) {
    this.completedMap = { ...completedMap };
    this._updateProgress();
    this._renderGrid();
    this._updateTabs();
  }

  goToNext() {
    const cat = CATEGORIES[this.activeCategory];

    for (let i = this.activeItemIndex + 1; i < cat.items.length; i++) {
      const key = `${cat.id}_${cat.items[i]}`;
      if (!this.completedMap[key]) {
        this.activeItemIndex = i;
        this._renderGrid();
        const example = cat.examples[i];
        if (this.onSelect) {
          this.onSelect(cat.id, cat.items[i], example, buildGuideMeta(cat.id, cat.items[i], example));
        }
        return { categoryId: cat.id, jamo: cat.items[i], example };
      }
    }

    for (let c = this.activeCategory + 1; c < CATEGORIES.length; c++) {
      const nextCat = CATEGORIES[c];
      for (let i = 0; i < nextCat.items.length; i++) {
        const key = `${nextCat.id}_${nextCat.items[i]}`;
        if (!this.completedMap[key]) {
          this._switchCategory(c);
          this.activeItemIndex = i;
          this._renderGrid();
          const example = nextCat.examples[i];
          if (this.onSelect) {
            this.onSelect(nextCat.id, nextCat.items[i], example, buildGuideMeta(nextCat.id, nextCat.items[i], example));
          }
          return { categoryId: nextCat.id, jamo: nextCat.items[i], example };
        }
      }
    }

    return null;
  }

  _getCategoryProgress(cat) {
    let done = 0;
    for (const jamo of cat.items) {
      if (this.completedMap[`${cat.id}_${jamo}`]) done++;
    }
    return `${done}/${cat.items.length}`;
  }

  _updateProgress() {
    const total = REQUIRED_JAMO_COUNT;
    const done = Object.keys(this.completedMap).filter((key) => {
      if (!this.completedMap[key]) return false;
      const categoryId = key.split('_').slice(0, -1).join('_');
      return isRequiredCategory(categoryId);
    }).length;
    const pct = (done / total) * 100;
    this.progressBar.querySelector('.progress-fill').style.width = `${pct}%`;
    this.progressBar.querySelector('.progress-text').textContent = `${done}/${total}`;
  }

  _updateTabs() {
    this.tabBar.querySelectorAll('.jamo-tab').forEach((tab, idx) => {
      tab.querySelector('.tab-progress').textContent = this._getCategoryProgress(CATEGORIES[idx]);
    });
  }

  isAllCompleted() {
    return Object.keys(this.completedMap).filter((key) => {
      if (!this.completedMap[key]) return false;
      const categoryId = key.split('_').slice(0, -1).join('_');
      return isRequiredCategory(categoryId);
    }).length >= REQUIRED_JAMO_COUNT;
  }

  getCurrentSelection() {
    const cat = CATEGORIES[this.activeCategory];
    if (this.activeItemIndex < 0) return null;
    const example = cat.examples[this.activeItemIndex];
    return {
      categoryId: cat.id,
      jamo: cat.items[this.activeItemIndex],
      example,
      guide: buildGuideMeta(cat.id, cat.items[this.activeItemIndex], example),
    };
  }

  selectItem(categoryId, jamo) {
    const categoryIndex = CATEGORIES.findIndex((cat) => cat.id === categoryId);
    if (categoryIndex < 0) return null;

    const category = CATEGORIES[categoryIndex];
    const itemIndex = category.items.findIndex((item) => item === jamo);
    if (itemIndex < 0) return null;

    this.activeCategory = categoryIndex;
    this.activeItemIndex = itemIndex;
    this.tabBar.querySelectorAll('.jamo-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === categoryIndex);
    });
    this._renderGrid();

    const example = category.examples[itemIndex];
    const guide = buildGuideMeta(category.id, category.items[itemIndex], example);
    if (this.onSelect) {
      this.onSelect(category.id, category.items[itemIndex], example, guide);
    }

    return {
      categoryId: category.id,
      jamo: category.items[itemIndex],
      example,
      guide,
    };
  }
}
