/**
 * review-modal.js — full set review modal for all 11,172 Hangul syllables
 */

import { compose } from '../../core/hangul.js';
import {
  decomposeChar,
  composeCharFromLib,
  createGlyphCanvas,
} from '../../core/glyph-utils.js';
import { deriveAll } from '../../core/jamo-derive.js';
import { CATEGORIES, REQUIRED_JAMO_COUNT } from '../jamo-grid.js';
import { showToast } from '../toast.js';
import { showSyllableEditorModal } from './syllable-editor-modal.js';
import {
  CHO,
  JUNG,
  JONG,
  getChoInfo,
  getJungInfo,
  getJongInfo,
  getVowelCategory,
} from '../../core/hangul.js';

const COMMON_REVIEW_CHARS = [
  '\uAC00', '\uB098', '\uB2E4', '\uB77C', '\uB9C8', '\uBC14', '\uC0AC', '\uC544',
  '\uC790', '\uCC28', '\uCE74', '\uD0C0', '\uD30C', '\uD558', '\uD55C', '\uAE00',
  '\uC11C', '\uC6B8', '\uD559', '\uAD50', '\uC0DD', '\uD65C', '\uC0AC', '\uB791',
  '\uD589', '\uBCF5', '\uD76C', '\uB9DD', '\uB098', '\uBB34', '\uBC14', '\uB2E4',
];

const RECENT_REVIEW_LIMIT = 8;

/**
 * Show the full set review modal.
 * @param {Object} app — FonttoApp instance
 */
export function showReviewModal(app) {
  if (!app.jamoGrid?.isAllCompleted()) {
    const completedCount = app._getCompletedCount();
    const remaining = Math.max(REQUIRED_JAMO_COUNT - completedCount, 0);
    showToast(`검수하거나 내보내려면 필수 자모 ${remaining}개를 더 완성해야 합니다.`);
    return;
  }

  const fullLib = deriveAll(app.jamoLib);
  const state = {
    ...getDefaultReviewState(),
    ...app.reviewState,
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal review-modal">
      <div class="modal-header">
        <h2>전체 글자 검수</h2>
        <button class="modal-close" id="closeReviewModal">x</button>
      </div>
      <div class="modal-body review-body">
        <div class="review-toolbar">
          <div class="review-presets" id="reviewPresetGroup">
            <button class="gen-btn review-preset-btn" data-review-mode="all">전체</button>
            <button class="gen-btn review-preset-btn" data-review-mode="common">자주 쓰는 글자</button>
            <button class="gen-btn review-preset-btn" data-review-mode="recent">최근 수정</button>
          </div>
          <div class="review-pagination">
              <button class="gen-btn" id="reviewPrevBtn">이전</button>
            <span class="review-page-label" id="reviewPageLabel"></span>
              <button class="gen-btn" id="reviewNextBtn">다음</button>
          </div>
          <div class="review-search">
              <input type="text" class="gen-input review-search-input" id="reviewSearchInput" maxlength="1" placeholder="글자" />
              <button class="gen-btn" id="reviewSearchBtn">찾기</button>
          </div>
          <div class="review-combo">
              <input type="text" class="gen-input review-combo-input" id="reviewComboInput" placeholder="자모 조합으로 검색" />
              <button class="gen-btn" id="reviewComboBtn">필터</button>
          </div>
        </div>
        <div class="review-layout">
          <div class="review-grid" id="reviewGrid"></div>
          <div class="review-inspector" id="reviewInspector"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const presetButtons = [...document.querySelectorAll('[data-review-mode]')];
  const comboInput = document.getElementById('reviewComboInput');
  const searchInput = document.getElementById('reviewSearchInput');
  comboInput.value = state.comboQuery ?? '';

  const render = () => {
    syncReviewControls(state, presetButtons, comboInput);
    renderReviewPage(
      document.getElementById('reviewGrid'),
      document.getElementById('reviewInspector'),
      document.getElementById('reviewPageLabel'),
      state,
      fullLib,
      app,
    );
    app.reviewState = { ...state };
  };

  document.getElementById('closeReviewModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.getElementById('reviewPrevBtn').addEventListener('click', () => {
    if (state.page > 0) {
      state.page -= 1;
      render();
    }
  });

  document.getElementById('reviewNextBtn').addEventListener('click', () => {
    const maxPage = Math.max(Math.ceil(getReviewChars(state, app).length / state.pageSize) - 1, 0);
    if (state.page < maxPage) {
      state.page += 1;
      render();
    }
  });

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.reviewMode;
      state.comboQuery = '';
      state.page = 0;
      render();
    });
  });

  document.getElementById('reviewSearchBtn').addEventListener('click', () => {
    const value = searchInput.value.trim();
    if (!value) return;

    const chars = getAllSyllables();
    const index = chars.indexOf(value);
    if (index < 0) return;

    state.mode = 'all';
    state.comboQuery = '';
    state.page = Math.floor(index / state.pageSize);
    state.selectedChar = value;
    render();
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('reviewSearchBtn').click();
    }
  });

  document.getElementById('reviewComboBtn').addEventListener('click', () => {
    state.mode = 'combo';
    state.comboQuery = comboInput.value.trim();
    state.page = 0;
    render();
  });

  comboInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('reviewComboBtn').click();
    }
  });

  render();
}

export function getDefaultReviewState() {
  return {
    mode: 'all',
    page: 0,
    pageSize: 96,
    selectedChar: '가',
    comboQuery: '',
  };
}

// ── Private helpers ─────────────────────────────────────────

let _allSyllables = null;
let _allSyllableDetails = null;

function getAllSyllables() {
  if (!_allSyllables) {
    _allSyllables = [];
    for (let cho = 0; cho < 19; cho++) {
      for (let jung = 0; jung < 21; jung++) {
        for (let jong = 0; jong < 28; jong++) {
          _allSyllables.push(compose(cho, jung, jong));
        }
      }
    }
  }
  return _allSyllables;
}

function getAllSyllableDetails(app) {
  if (!_allSyllableDetails) {
    _allSyllableDetails = getAllSyllables().map((char) => {
      const info = decomposeChar(char);
      const targets = app._getEditTargetsForSyllable(info.cho, info.jung, info.jong);
      return {
        char,
        ...info,
        targetKeys: targets.map((target) => `${target.categoryId}_${target.jamo}`),
        sequence: getSyllableJamoSequence(info.cho, info.jung, info.jong),
      };
    });
  }
  return _allSyllableDetails;
}

function getSyllableJamoSequence(choIdx, jungIdx, jongIdx) {
  const choInfo = getChoInfo(choIdx);
  const jungInfo = getJungInfo(jungIdx);
  const jongInfo = getJongInfo(jongIdx);
  const sequence = [choInfo.base];

  if (jungInfo.isCompound && jungInfo.components?.length) {
    sequence.push(...jungInfo.components);
  } else {
    sequence.push(JUNG[jungIdx]);
  }

  if (jongIdx > 0) {
    if (jongInfo?.isCompound && jongInfo.components?.length) {
      sequence.push(...jongInfo.components);
    } else {
      sequence.push(JONG[jongIdx]);
    }
  }

  return sequence;
}

function getReviewChars(state, app) {
  switch (state.mode) {
    case 'common':
      return COMMON_REVIEW_CHARS;
    case 'recent':
      return getCharsAffectedByJamoKeys(app.recentEditedKeys, app);
    case 'combo':
      return getCharsByJamoQuery(state.comboQuery, app);
    case 'all':
    default:
      return getAllSyllables();
  }
}

function getCharsAffectedByJamoKeys(keys, app) {
  if (!keys?.length) return [];
  const keySet = new Set(keys);
  return getAllSyllableDetails(app)
    .filter((detail) => detail.targetKeys.some((key) => keySet.has(key)))
    .map((detail) => detail.char);
}

function getCharsByJamoQuery(query, app) {
  const queryChars = Array.from((query ?? '').replace(/\s+/g, ''));
  if (queryChars.length === 0) return getAllSyllables();

  return getAllSyllableDetails(app)
    .filter((detail) => matchesJamoSequence(detail.sequence, queryChars))
    .map((detail) => detail.char);
}

function matchesJamoSequence(sequence, queryChars) {
  let queryIndex = 0;
  for (const jamo of sequence) {
    if (jamo === queryChars[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === queryChars.length) return true;
    }
  }
  return queryIndex === queryChars.length;
}

function syncReviewControls(state, presetButtons, comboInput) {
  presetButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewMode === state.mode);
  });

  if (state.mode !== 'combo' && comboInput.value) {
    comboInput.value = '';
  }

  if (state.mode === 'combo' && comboInput.value !== state.comboQuery) {
    comboInput.value = state.comboQuery ?? '';
  }
}

function renderReviewPage(gridEl, inspectorEl, pageLabelEl, state, jamoLib, app) {
  const chars = getReviewChars(state, app);
  const totalPages = Math.max(Math.ceil(chars.length / state.pageSize), 1);
  state.page = Math.min(state.page, totalPages - 1);
  const pageStart = state.page * state.pageSize;
  const pageChars = chars.slice(pageStart, pageStart + state.pageSize);

  if (pageChars.length === 0) {
    pageLabelEl.textContent = '0 / 0 - 0자';
    gridEl.innerHTML = '<div class="review-empty">현재 필터와 일치하는 글자가 없습니다.</div>';
    renderReviewEmptyState(inspectorEl);
    return;
  }

  if (!pageChars.includes(state.selectedChar)) {
    state.selectedChar = pageChars[0];
  }

  pageLabelEl.textContent = `${state.page + 1} / ${totalPages} - ${chars.length}자`;
  gridEl.innerHTML = '';

  pageChars.forEach((char) => {
    const info = decomposeChar(char);
    const commands = composeCharFromLib(char, jamoLib);
    const button = document.createElement('button');
    button.className = `review-glyph-card ${char === state.selectedChar ? 'active' : ''}`;
    button.title = char;
    button.setAttribute('aria-label', `${char} 글자 검수`);
    button.addEventListener('click', () => {
      state.selectedChar = char;
      renderReviewPage(gridEl, inspectorEl, pageLabelEl, state, jamoLib, app);
    });

    const canvas = createGlyphCanvas(commands, 56);
    button.appendChild(canvas);
    gridEl.appendChild(button);
  });

  renderReviewInspector(inspectorEl, state.selectedChar, jamoLib, app);
}

function renderReviewInspector(container, char, jamoLib, app) {
  const info = decomposeChar(char);
  if (!info) {
    renderReviewEmptyState(container);
    return;
  }

  const commands = composeCharFromLib(char, jamoLib);
  const editTargets = app._getEditTargetsForSyllable(info.cho, info.jung, info.jong);

  container.innerHTML = '';

  const title = document.createElement('h3');
  title.className = 'review-inspector-title';
  title.textContent = `글자 ${char}`;

  const canvas = createGlyphCanvas(commands, 180);
  canvas.classList.add('review-inspector-canvas');

  const subtitle = document.createElement('p');
  subtitle.className = 'review-inspector-subtitle';
  subtitle.textContent = '이 글자를 고치려면 관련 자모 입력 항목으로 이동하세요.';

  const list = document.createElement('div');
  list.className = 'review-edit-targets';

  editTargets.forEach((target) => {
    const button = document.createElement('button');
    button.className = 'tool-btn review-edit-btn';
    button.textContent = target.label;
    button.addEventListener('click', () => {
      app.reviewReturnContext = {
        selectedChar: char,
        state: { ...app.reviewState, selectedChar: char },
      };
      app.reviewState = { ...app.reviewState, selectedChar: char };
      app._updateReturnToReviewButton();
      app.jamoGrid.selectItem(target.categoryId, target.jamo);
      const closeButton = document.getElementById('closeReviewModal');
      if (closeButton) closeButton.click();
    });
    list.appendChild(button);
  });

  const fineTuneDivider = document.createElement('div');
  fineTuneDivider.style.margin = '16px 0';
  fineTuneDivider.style.borderTop = '1px dashed var(--border-subtle)';

  const fineTuneBtn = document.createElement('button');
  fineTuneBtn.className = 'gen-btn download-btn';
  fineTuneBtn.style.width = '100%';
  fineTuneBtn.textContent = '세부 조정';
  fineTuneBtn.addEventListener('click', () => {
    showSyllableEditorModal(app, char);
    const closeButton = document.getElementById('closeReviewModal');
    if (closeButton) closeButton.click();
  });

  container.appendChild(title);
  container.appendChild(canvas);
  container.appendChild(subtitle);
  container.appendChild(list);
  container.appendChild(fineTuneDivider);
  container.appendChild(fineTuneBtn);
}

function renderReviewEmptyState(container) {
  container.innerHTML = `
    <div class="review-empty-panel">
      <h3 class="review-inspector-title">선택된 글자가 없습니다</h3>
      <p class="review-inspector-subtitle">필터를 바꾸거나 검수 목록에서 글자를 선택하세요.</p>
    </div>
  `;
}
