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
  cho_v_wf: 'cvc_simple',
  cho_h_wf: 'cvc_simple',
  jung_nb: 'cv',
  jung_wb: 'cvc_simple',
};

const syllable = (cho, jung, jong = 0) => String.fromCharCode(0xAC00 + (cho * 21 + jung) * 28 + jong);
const findChoIndex = (jamo) => CHO.findIndex((item) => item === jamo);
const findJongIndex = (jamo) => JONG.findIndex((item) => item === jamo);
const choExamples = (jung, jong = 0) => BASIC_CONSONANTS.map((jamo) => syllable(findChoIndex(jamo), jung, jong));
const jongExamples = (jung, items) => items.map((jamo) => syllable(0, jung, findJongIndex(jamo)));

export const CATEGORIES = [
  {
    id: 'cho_v',
    label: 'Initial (vertical vowel)',
    items: BASIC_CONSONANTS,
    examples: choExamples(0),
    guideType: 'cho',
  },
  {
    id: 'cho_h',
    label: 'Initial (horizontal vowel)',
    items: BASIC_CONSONANTS,
    examples: choExamples(18),
    guideType: 'cho',
  },
  {
    id: 'cho_v_wf',
    label: 'Initial (vertical vowel + final)',
    items: BASIC_CONSONANTS,
    examples: choExamples(0, 1),
    guideType: 'cho',
    required: false,
  },
  {
    id: 'cho_h_wf',
    label: 'Initial (horizontal vowel + final)',
    items: BASIC_CONSONANTS,
    examples: choExamples(18, 1),
    guideType: 'cho',
    required: false,
  },
  {
    id: 'jung_nb',
    label: 'Medial (no final)',
    items: BASIC_VOWELS,
    examples: [syllable(0, 0), syllable(0, 2), syllable(0, 4), syllable(0, 6), syllable(0, 8), syllable(0, 12), syllable(0, 13), syllable(0, 17), syllable(0, 18), syllable(0, 20)],
    guideType: 'jung',
    guideOverrideScope: 'item',
  },
  {
    id: 'jung_wb',
    label: 'Medial (with final)',
    items: BASIC_VOWELS,
    examples: [syllable(0, 0, 1), syllable(0, 2, 1), syllable(0, 4, 1), syllable(0, 6, 1), syllable(0, 8, 1), syllable(0, 12, 1), syllable(0, 13, 1), syllable(0, 17, 1), syllable(0, 18, 1), syllable(0, 20, 1)],
    guideType: 'jung',
  },
  {
    id: 'jong',
    label: 'Final (single)',
    items: BASIC_CONSONANTS,
    examples: jongExamples(0, BASIC_CONSONANTS),
    guideType: 'jong',
  },
  {
    id: 'jong_cluster',
    label: 'Final (cluster)',
    items: COMPOUND_JONG_CLUSTERS,
    examples: jongExamples(0, COMPOUND_JONG_CLUSTERS),
    guideType: 'jong_cluster',
  },
  {
    id: 'jong_h',
    label: 'Final (after horizontal medial)',
    items: BASIC_CONSONANTS,
    examples: jongExamples(18, BASIC_CONSONANTS),
    guideType: 'jong',
    required: false,
  },
  {
    id: 'jong_cluster_h',
    label: 'Final cluster (after horizontal medial)',
    items: COMPOUND_JONG_CLUSTERS,
    examples: jongExamples(18, COMPOUND_JONG_CLUSTERS),
    guideType: 'jong_cluster',
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

  const choInfo = getChoInfo(info.cho);
  const jungInfo = getJungInfo(info.jung);
  const jongInfo = getJongInfo(info.jong);
  const sequence = [choInfo.base];

  if (jungInfo.isCompound && jungInfo.components?.length) {
    sequence.push(...jungInfo.components);
  } else {
    sequence.push(JUNG[info.jung]);
  }

  if (info.jong > 0) {
    if (jongInfo?.isCompound && jongInfo.components?.length) {
      sequence.push(...jongInfo.components);
    } else {
      sequence.push(JONG[info.jong]);
    }
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

function buildGuideMeta(categoryId, jamo, example) {
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
      guide.targetRegion = categoryId === 'cho_h_wf'
        ? (extendRegionBottomToMidline(canvasLayout?.cho) ?? { x: 0.14, y: 0.12, w: 0.72, h: 0.38 })
        : (canvasLayout?.cho ?? (categoryId.includes('_h')
          ? { x: 0.14, y: 0.50, w: 0.72, h: 0.38 }
          : { x: 0.08, y: 0.11, w: 0.42, h: 0.79 }));
      guide.storageKeys = COMPOSITION_CONTEXT_MAP[categoryId]
        ? [`${categoryId}_${jamo}`, `cho_${categoryId.includes('_h') ? 'h' : 'v'}_${COMPOSITION_CONTEXT_MAP[categoryId]}_${jamo}`]
        : [`${categoryId}_${jamo}`];
      guide.qualityProfile = categoryId.includes('_h')
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
    case 'jung': {
      const composed = info !== null && getJungInfo(info.jung).isCompound;
      guide.targetIndices = composed ? [1, 2].slice(0, sequence.length - (info?.jong > 0 ? 1 : 0)) : [1];
      guide.label = `Target medial ${jamo}`;
      guide.targetRegion = (categoryId === 'jung_nb' && isHorizontal)
        ? (extendRegionTopToMidline(canvasLayout?.jung) ?? { x: 0.16, y: 0.5, w: 0.68, h: 0.36 })
        : (canvasLayout?.jung ?? (categoryId === 'jung_nb'
        ? (isCompoundVowel
          ? { x: 0.16, y: 0.12, w: 0.70, h: 0.73 }
          : isHorizontal
            ? { x: 0.16, y: 0.12, w: 0.68, h: 0.24 }
            : { x: 0.47, y: 0.08, w: 0.39, h: 0.82 })
        : (isCompoundVowel
          ? { x: 0.16, y: 0.30, w: 0.70, h: 0.50 }
          : isHorizontal
            ? { x: 0.16, y: 0.39, w: 0.68, h: 0.18 }
            : { x: 0.47, y: 0.43, w: 0.38, h: 0.47 })));
      guide.storageKeys = [`${categoryId}_${jamo}`, `${categoryId}_${COMPOSITION_CONTEXT_MAP[categoryId]}_${jamo}`];
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
    }
    case 'jong':
      guide.targetIndices = [sequence.length - 1];
      guide.label = `Target final ${jamo}`;
      guide.targetRegion = pinFinalRegionToMidline(canvasLayout?.jong) ?? { x: 0.15, y: 0.5, w: 0.68, h: 0.32 };
      guide.storageKeys = categoryId === 'jong_h'
        ? [`${categoryId}_${jamo}`, `jong_single_horizontal_${jamo}`]
        : [`${categoryId}_${jamo}`, `jong_single_${jamo}`];
      guide.qualityProfile = createQualityProfile({
        minFillRatio: 0.08,
        minCoverageY: 0.12,
        maxCenterOffsetY: 0.32,
        sparseLengthRatio: 0.22,
        allowThinY: true,
      });
      return guide;
    case 'jong_cluster':
      guide.targetIndices = sequence.length >= 4 ? [2, 3] : [sequence.length - 1];
      guide.label = `Target final cluster ${jamo}`;
      guide.targetRegion = pinFinalRegionToMidline(canvasLayout?.jong) ?? { x: 0.14, y: 0.5, w: 0.72, h: 0.35 };
      guide.storageKeys = categoryId === 'jong_cluster_h'
        ? [`${categoryId}_${jamo}`, `jong_cluster_horizontal_${jamo}`]
        : [`${categoryId}_${jamo}`, `jong_cluster_${jamo}`, `jong_cluster_cvc_compound_${jamo}`];
      guide.qualityProfile = createQualityProfile({
        minFillRatio: 0.1,
        minCoverageY: 0.14,
        maxCenterOffsetY: 0.3,
        sparseLengthRatio: 0.26,
      });
      return guide;
    default:
      return guide;
  }
}
export class JamoGrid {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
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

    const gridArea = document.createElement('div');
    gridArea.className = 'jamo-grid-area';

    this.container.appendChild(tabBar);
    this.container.appendChild(progressBar);
    this.container.appendChild(gridArea);

    this.tabBar = tabBar;
    this.progressBar = progressBar;
    this.gridArea = gridArea;
    this._renderGrid();
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
        ${isCompleted ? '<span class="jamo-check">?</span>' : ''}
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
