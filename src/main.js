/**
 * main.js — Fontto 앱 진입점
 *
 * 스텝 기반 플로우:
 *   1. 랜딩 → 2. 자모 입력 → 3. 미리보기 & 설정 → 4. 생성 & 다운로드
 */

import './index.css';
import { DrawingCanvas } from './ui/drawing-canvas.js';
import { JamoGrid, CATEGORIES, REQUIRED_JAMO_COUNT } from './ui/jamo-grid.js';
import { PreviewPanel } from './ui/preview-panel.js';
import { Toolbar } from './ui/toolbar.js';
import { generateFont, downloadFont } from './core/font-generator.js';
import { deriveAll } from './core/jamo-derive.js';
import {
  CHO,
  JUNG,
  JONG,
  compose,
  getVowelCategory,
  getChoInfo,
  getJungInfo,
  getJongInfo,
} from './core/hangul.js';

const STORAGE_KEY = 'fontto-jamo-lib-v1';
const DRAFT_STORAGE_KEY = 'fontto-jamo-drafts-v1';
const GUIDE_BOX_STORAGE_KEY = 'fontto-guide-boxes-v1';
const RECENT_REVIEW_LIMIT = 8;
const COMMON_REVIEW_CHARS = [
  '\uAC00', '\uB098', '\uB2E4', '\uB77C', '\uB9C8', '\uBC14', '\uC0AC', '\uC544',
  '\uC790', '\uCC28', '\uCE74', '\uD0C0', '\uD30C', '\uD558', '\uD55C', '\uAE00',
  '\uC11C', '\uC6B8', '\uD559', '\uAD50', '\uC0DD', '\uD65C', '\uC0AC', '\uB791',
  '\uD589', '\uBCF5', '\uD76C', '\uB9DD', '\uB098', '\uBB34', '\uBC14', '\uB2E4',
];
class FonttoApp {
  jamoDrafts = {};
  guideOverrides = {};

  constructor() {
    this.jamoLib = {};        // 자모 Path 커맨드 라이브러리
    this.currentStep = 'landing'; // 'landing' | 'editor' | 'preview' | 'generate'
    this.reviewState = this._getDefaultReviewState();
    this.reviewReturnContext = null;
    this.recentEditedKeys = [];
    this.currentSelectionKey = null;

    this.drawingCanvas = null;
    this.jamoGrid = null;
    this.previewPanel = null;
    this.toolbar = null;

    this._init();
  }

  _init() {
    this._loadSavedJamoLib();
    this._showLanding();
    window.addEventListener('resize', () => this._handleResize());
  }

  // ════════════════════════════════════════════
  //  Step 1: 랜딩 페이지
  // ════════════════════════════════════════════
  _showLanding() {
    this.currentStep = 'landing';
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="landing">
        <div class="landing-bg"></div>
        <div class="landing-content">
          <div class="landing-logo">
            <span class="logo-icon">Aa</span>
            <h1 class="logo-text">Fontto</h1>
          </div>
          <p class="landing-subtitle">Turn your handwriting into a Hangul font.</p>
          <div class="landing-features">
            <div class="feature-card">
              <span class="feature-icon">62</span>
              <h3>Draw 62 jamo</h3>
              <p>Complete the required consonants and vowels, then generate the rest automatically.</p>
            </div>
            <div class="feature-card">
              <span class="feature-icon">AI</span>
              <h3>Compose syllables</h3>
              <p>Context-aware composition combines initials, vowels, and finals into full glyphs.</p>
            </div>
            <div class="feature-card">
              <span class="feature-icon">TTF</span>
              <h3>Download TTF</h3>
              <p>Review the generated Hangul set and export your font as a TTF file.</p>
            </div>
          </div>
          <button class="start-btn" id="startBtn">
            <span>Start</span>
            <span class="btn-arrow">></span>
          </button>
          <p class="landing-note">Everything runs locally in your browser. No upload required.</p>
        </div>
      </div>
    `;

    document.getElementById('startBtn').addEventListener('click', () => {
      this._showEditor();
    });
  }
  _showEditor() {
    this.currentStep = 'editor';
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="editor-layout">
        <header class="editor-header">
          <div class="header-left">
            <span class="header-logo">Fontto</span>
          </div>
          <div class="header-center">
            <span class="current-jamo-label" id="currentJamoLabel">Select a guided task.</span>
          </div>
          <div class="header-right">
            <button class="header-btn is-hidden" id="returnToReviewBtn">Back to Full Set Review</button>
            <button class="header-btn" id="reviewBtn" disabled>Review Full Set</button>
            <button class="header-btn" id="previewBtn">Preview</button>
            <button class="header-btn primary" id="generateBtn" disabled>Generate Font</button>
          </div>
        </header>

        <aside class="editor-sidebar" id="jamoGridContainer"></aside>

        <main class="editor-canvas-area">
          <div class="canvas-wrapper">
            <canvas id="drawingCanvas"></canvas>
          </div>
          <div class="toolbar-area" id="toolbarContainer"></div>
          <div class="quality-panel" id="qualityPanel"></div>
        </main>

        <footer class="editor-footer" id="previewContainer"></footer>
      </div>
    `;

    this._initEditor();
  }
  _initEditor() {
    // 드로잉 캔버스 초기화
    const canvasEl = document.getElementById('drawingCanvas');
    this.drawingCanvas = new DrawingCanvas(canvasEl, {
      penSize: 8,
      onChange: (report) => this._updateQualityPanel(report),
      onGuideRegionChange: (region) => this._handleGuideRegionChange(region),
    });

    // 자모 그리드 초기화
    const gridContainer = document.getElementById('jamoGridContainer');
    this.jamoGrid = new JamoGrid(gridContainer, (catId, jamo, example, guide) => {
      this._onJamoSelect(catId, jamo, example, guide);
    });
    this.jamoGrid.setCompletedMap(this._getCompletedMapFromLib());

    // 미리보기 패널 초기화
    const previewContainer = document.getElementById('previewContainer');
    this.previewPanel = new PreviewPanel(previewContainer);
    this.previewPanel.updateJamoLib(deriveAll(this.jamoLib));

    // 툴바 초기화
    const toolbarContainer = document.getElementById('toolbarContainer');
    this.toolbar = new Toolbar(toolbarContainer, {
      onUndo: () => this.drawingCanvas.undo(),
      onRedo: () => this.drawingCanvas.redo(),
      onClear: () => this.drawingCanvas.clear(),
      onPenSize: (size) => this.drawingCanvas.setPenSize(size),
      onVariableWidth: (v) => this.drawingCanvas.setVariableWidth(v),
      onToggleGuideEdit: (enabled) => this.drawingCanvas.setGuideEditMode(enabled),
      onResetGuideBox: () => this._resetGuideRegionForCurrentSelection(),
      onSave: () => this._saveCurrentJamo(),
      onNext: () => this._saveAndNext(),
    });

    // 버튼 이벤트
    document.getElementById('previewBtn').addEventListener('click', () => {
      this._showPreviewModal();
    });
    document.getElementById('reviewBtn').addEventListener('click', () => {
      this._showReviewModal();
    });
    document.getElementById('returnToReviewBtn').addEventListener('click', () => {
      this._returnToReview();
    });
    document.getElementById('generateBtn').addEventListener('click', () => {
      this._showGenerateModal();
    });

    // 첫 번째 자모 자동 선택
    this._checkGenerateReady();
    this._updateReturnToReviewButton();
    this.jamoGrid.goToNext();
  }

  _onJamoSelect(catId, jamo, example, guide) {
    const label = document.getElementById('currentJamoLabel');
    if (label) {
      const cat = CATEGORIES.find((c) => c.id === catId);
      label.textContent = guide?.label
        ? `${cat?.label || ''} - ${guide.label} - "${example}"`
        : `${cat?.label || ''} - "${example}" - ${jamo}`;
    }

    const key = `${catId}_${jamo}`;
    this.currentSelectionKey = this._getGuideOverrideKey(catId, key, guide);
    const draft = this.jamoDrafts[key];
    if (draft?.strokes?.length) {
      this.drawingCanvas.loadStrokes(draft.strokes);
    } else {
      this.drawingCanvas.clear();
    }
    this.drawingCanvas.setGuide(this._applyGuideOverride(catId, key, guide ?? { char: example }));
    this._updateQualityPanel(this.drawingCanvas.getQualityReport());
  }
  _saveCurrentJamo(options = {}) {
    const sel = this.jamoGrid.getCurrentSelection();
    if (!sel) return false;

    if (!this.drawingCanvas.hasContent()) return false;

    const qualityReport = this.drawingCanvas.getQualityReport();

    if (!options.force && qualityReport.hasBlockingWarnings) {
      this._showQualityConfirmModal(qualityReport, () => {
        this._saveCurrentJamo({ ...options, force: true });
      });
      return false;
    }

    const commands = this.drawingCanvas.toPathCommands();
    const key = `${sel.categoryId}_${sel.jamo}`;
    const storageKeys = this._getStorageKeysForSelection(sel);
    storageKeys.forEach((storageKey) => {
      this.jamoLib[storageKey] = commands;
    });
    this.jamoDrafts[key] = {
      strokes: this.drawingCanvas.exportStrokes(),
    };
    this._trackRecentJamoEdit(key);

    this.jamoGrid.markCompleted(sel.categoryId, sel.jamo);

    const fullLib = deriveAll(this.jamoLib);
    this.previewPanel.updateJamoLib(fullLib);
    this._persistJamoLib();

    this._checkGenerateReady();

    if (qualityReport.warnings.length > 0) {
      this._showQualityToast(qualityReport.warnings);
    } else if (!options.advance) {
      this._showToast('Saved.', 'success', 2200);
    }

    if (options.advance) {
      this.drawingCanvas.clear();
      const next = this.jamoGrid.goToNext();
      if (!next) {
        this._showCompleteToast();
      }
    }

    return true;
  }

  _saveAndNext() {
    this._saveCurrentJamo({ advance: true });
  }

  _checkGenerateReady() {
    const reviewBtn = document.getElementById('reviewBtn');
    const btn = document.getElementById('generateBtn');
    const completed = this.jamoGrid
      ? this.jamoGrid.isAllCompleted()
      : this._getCompletedCount() >= REQUIRED_JAMO_COUNT;

    if (reviewBtn) {
      reviewBtn.disabled = !completed;
    }

    if (btn) {
      // 최소 초성 세로 1개 + 중성 1개가 있으면 활성화 (테스트용)
      // 실제론 62자 전부 완료해야 함
      const keys = Object.keys(this.jamoLib);
      btn.disabled = !completed;
    }
  }

  _showCompleteToast() {
    this._showToast('All required jamo are saved. You can generate the font now.', 'success');
  }
  _showIncompleteToast() {
    const completedCount = this._getCompletedCount();
    const remaining = Math.max(REQUIRED_JAMO_COUNT - completedCount, 0);
    this._showToast(`You still have ${remaining} required jamo to complete before review or export.`);
  }
  _showReviewModal() {
    if (!this.jamoGrid?.isAllCompleted()) {
      this._showIncompleteToast();
      return;
    }

    const fullLib = deriveAll(this.jamoLib);
    const state = {
      ...this._getDefaultReviewState(),
      ...this.reviewState,
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal review-modal">
        <div class="modal-header">
          <h2>Full Set Review</h2>
          <button class="modal-close" id="closeReviewModal">x</button>
        </div>
        <div class="modal-body review-body">
          <div class="review-toolbar">
            <div class="review-presets" id="reviewPresetGroup">
              <button class="gen-btn review-preset-btn" data-review-mode="all">All</button>
              <button class="gen-btn review-preset-btn" data-review-mode="common">Common</button>
              <button class="gen-btn review-preset-btn" data-review-mode="recent">Recently edited</button>
            </div>
            <div class="review-pagination">
              <button class="gen-btn" id="reviewPrevBtn">Prev</button>
              <span class="review-page-label" id="reviewPageLabel"></span>
              <button class="gen-btn" id="reviewNextBtn">Next</button>
            </div>
            <div class="review-search">
              <input type="text" class="gen-input review-search-input" id="reviewSearchInput" maxlength="1" placeholder="Glyph" />
              <button class="gen-btn" id="reviewSearchBtn">Find</button>
            </div>
            <div class="review-combo">
              <input type="text" class="gen-input review-combo-input" id="reviewComboInput" placeholder="Search by jamo sequence" />
              <button class="gen-btn" id="reviewComboBtn">Filter</button>
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
      this._syncReviewControls(state, presetButtons, comboInput);
      this._renderReviewPage(
        document.getElementById('reviewGrid'),
        document.getElementById('reviewInspector'),
        document.getElementById('reviewPageLabel'),
        state,
        fullLib
      );
      this.reviewState = { ...state };
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
      const maxPage = Math.max(Math.ceil(this._getReviewChars(state).length / state.pageSize) - 1, 0);
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

      const chars = this._getAllSyllables();
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
  _renderReviewPage(gridEl, inspectorEl, pageLabelEl, state, jamoLib) {
    const chars = this._getReviewChars(state);
    const totalPages = Math.max(Math.ceil(chars.length / state.pageSize), 1);
    state.page = Math.min(state.page, totalPages - 1);
    const pageStart = state.page * state.pageSize;
    const pageChars = chars.slice(pageStart, pageStart + state.pageSize);

    if (pageChars.length === 0) {
      pageLabelEl.textContent = '0 / 0 - 0 glyphs';
      gridEl.innerHTML = '<div class="review-empty">No glyphs match the current filter.</div>';
      this._renderReviewEmptyState(inspectorEl);
      return;
    }

    if (!pageChars.includes(state.selectedChar)) {
      state.selectedChar = pageChars[0];
    }

    pageLabelEl.textContent = `${state.page + 1} / ${totalPages} - ${chars.length} glyphs`;
    gridEl.innerHTML = '';

    pageChars.forEach((char) => {
      const info = this._decomposeChar(char);
      const commands = info
        ? composeSyllableFromLib(info.cho, info.jung, info.jong, jamoLib)
        : [];
      const button = document.createElement('button');
      button.className = `review-glyph-card ${char === state.selectedChar ? 'active' : ''}`;
      button.title = char;
      button.setAttribute('aria-label', `Review glyph ${char}`);
      button.addEventListener('click', () => {
        state.selectedChar = char;
        this._renderReviewPage(gridEl, inspectorEl, pageLabelEl, state, jamoLib);
      });

      const canvas = this._createGlyphCanvas(commands, 56);

      button.appendChild(canvas);
      gridEl.appendChild(button);
    });

    this._renderReviewInspector(inspectorEl, state.selectedChar, jamoLib);
  }
  _renderReviewInspector(container, char, jamoLib) {
    const info = this._decomposeChar(char);
    if (!info) {
      this._renderReviewEmptyState(container);
      return;
    }

    const commands = composeSyllableFromLib(info.cho, info.jung, info.jong, jamoLib);
    const editTargets = this._getEditTargetsForSyllable(info.cho, info.jung, info.jong);

    container.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'review-inspector-title';
    title.textContent = `Glyph ${char}`;

    const canvas = this._createGlyphCanvas(commands, 180);
    canvas.classList.add('review-inspector-canvas');

    const subtitle = document.createElement('p');
    subtitle.className = 'review-inspector-subtitle';
    subtitle.textContent = 'Jump back to the related jamo task to fix this glyph.';

    const list = document.createElement('div');
    list.className = 'review-edit-targets';

    editTargets.forEach((target) => {
      const button = document.createElement('button');
      button.className = 'tool-btn review-edit-btn';
      button.textContent = target.label;
      button.addEventListener('click', () => {
        this.reviewReturnContext = {
          selectedChar: char,
          state: { ...this.reviewState, selectedChar: char },
        };
        this.reviewState = { ...this.reviewState, selectedChar: char };
        this._updateReturnToReviewButton();
        this.jamoGrid.selectItem(target.categoryId, target.jamo);
        const closeButton = document.getElementById('closeReviewModal');
        if (closeButton) closeButton.click();
      });
      list.appendChild(button);
    });

    container.appendChild(title);
    container.appendChild(canvas);
    container.appendChild(subtitle);
    container.appendChild(list);
  }

  _renderReviewEmptyState(container) {
    container.innerHTML = `
      <div class="review-empty-panel">
        <h3 class="review-inspector-title">No selection</h3>
        <p class="review-inspector-subtitle">Change the filter or pick a glyph from the review grid.</p>
      </div>
    `;
  }
  _createGlyphCanvas(commands, size) {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    this._drawGlyphOnCtx(ctx, commands, 0, 0, size);
    return canvas;
  }

  _getAllSyllables() {
    if (!this._allSyllables) {
      this._allSyllables = [];
      for (let cho = 0; cho < 19; cho++) {
        for (let jung = 0; jung < 21; jung++) {
          for (let jong = 0; jong < 28; jong++) {
            this._allSyllables.push(compose(cho, jung, jong));
          }
        }
      }
    }

    return this._allSyllables;
  }

  _getAllSyllableDetails() {
    if (!this._allSyllableDetails) {
      this._allSyllableDetails = this._getAllSyllables().map((char) => {
        const info = this._decomposeChar(char);
        const targets = this._getEditTargetsForSyllable(info.cho, info.jung, info.jong);

        return {
          char,
          ...info,
          targetKeys: targets.map((target) => `${target.categoryId}_${target.jamo}`),
          sequence: this._getSyllableJamoSequence(info.cho, info.jung, info.jong),
        };
      });
    }

    return this._allSyllableDetails;
  }

  _getSyllableJamoSequence(choIdx, jungIdx, jongIdx) {
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

  _getReviewChars(state) {
    switch (state.mode) {
      case 'common':
        return COMMON_REVIEW_CHARS;
      case 'recent':
        return this._getCharsAffectedByJamoKeys(this.recentEditedKeys);
      case 'combo':
        return this._getCharsByJamoQuery(state.comboQuery);
      case 'all':
      default:
        return this._getAllSyllables();
    }
  }

  _getCharsAffectedByJamoKeys(keys) {
    if (!keys?.length) {
      return [];
    }

    const keySet = new Set(keys);
    return this._getAllSyllableDetails()
      .filter((detail) => detail.targetKeys.some((key) => keySet.has(key)))
      .map((detail) => detail.char);
  }

  _getCharsByJamoQuery(query) {
    const queryChars = Array.from((query ?? '').replace(/\s+/g, ''));
    if (queryChars.length === 0) {
      return this._getAllSyllables();
    }

    return this._getAllSyllableDetails()
      .filter((detail) => this._matchesJamoSequence(detail.sequence, queryChars))
      .map((detail) => detail.char);
  }

  _matchesJamoSequence(sequence, queryChars) {
    let queryIndex = 0;

    for (const jamo of sequence) {
      if (jamo === queryChars[queryIndex]) {
        queryIndex += 1;
        if (queryIndex === queryChars.length) {
          return true;
        }
      }
    }

    return queryIndex === queryChars.length;
  }

  _getDefaultReviewState() {
    return {
      mode: 'all',
      page: 0,
      pageSize: 96,
      selectedChar: '가',
      comboQuery: '',
    };
  }

  _syncReviewControls(state, presetButtons, comboInput) {
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

  _trackRecentJamoEdit(key) {
    this.recentEditedKeys = [key, ...this.recentEditedKeys.filter((item) => item !== key)]
      .slice(0, RECENT_REVIEW_LIMIT);
  }

  _updateReturnToReviewButton() {
    const button = document.getElementById('returnToReviewBtn');
    if (!button) return;

    button.classList.toggle('is-hidden', !this.reviewReturnContext);
  }

  _returnToReview() {
    if (!this.reviewReturnContext) {
      this._showReviewModal();
      return;
    }

    this.reviewState = {
      ...this._getDefaultReviewState(),
      ...this.reviewReturnContext.state,
      selectedChar: this.reviewReturnContext.selectedChar,
    };

    this._showReviewModal();
  }

  _getEditTargetsForSyllable(choIdx, jungIdx, jongIdx) {
    const targets = [];
    const vowelCategory = getVowelCategory(jungIdx);
    const choInfo = getChoInfo(choIdx);
    const jungInfo = getJungInfo(jungIdx);
    const jongInfo = getJongInfo(jongIdx);

    targets.push({
      categoryId: jongIdx > 0
        ? (vowelCategory === 'vertical' ? 'cho_v_wf' : 'cho_h_wf')
        : (vowelCategory === 'vertical' ? 'cho_v' : 'cho_h'),
      jamo: choInfo.base,
      label: `초성 ${choInfo.base} 수정`,
    });

    const jungItems = jungInfo.isCompound && jungInfo.components
      ? jungInfo.components
      : [JUNG[jungIdx]];

    jungItems.forEach((jamo, index) => {
      targets.push({
        categoryId: jongIdx > 0 ? 'jung_wb' : 'jung_nb',
        jamo,
        label: `중성 ${jamo} 수정${jungItems.length > 1 ? ` ${index + 1}` : ''}`,
      });
    });

    if (jongIdx > 0) {
      if (jongInfo?.isCompound) {
        targets.push({
          categoryId: vowelCategory === 'horizontal' ? 'jong_cluster_h' : 'jong_cluster',
          jamo: jongInfo.base,
          label: `복합 종성 ${jongInfo.base} 수정`,
        });

        return targets.filter((target, index, array) => {
          return array.findIndex((item) => item.categoryId === target.categoryId && item.jamo === target.jamo) === index;
        });
      }

      const jongItems = jongInfo?.isCompound && jongInfo.components
        ? jongInfo.components
        : [JONG[jongIdx]];

      jongItems.forEach((jamo, index) => {
        targets.push({
          categoryId: vowelCategory === 'horizontal' ? 'jong_h' : 'jong',
          jamo,
          label: `Final ${jamo} edit${jongItems.length > 1 ? ` ${index + 1}` : ''}`,
        });
      });
    }

    return targets.filter((target, index, array) => {
      return array.findIndex((item) => item.categoryId === target.categoryId && item.jamo === target.jamo) === index;
    });
  }

  _showPreviewModal() {
    const fullLib = deriveAll(this.jamoLib);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal preview-modal">
        <div class="modal-header">
          <h2>Preview</h2>
          <button class="modal-close" id="closePreviewModal">x</button>
        </div>
        <div class="modal-body">
          <textarea class="preview-textarea" id="previewText" placeholder="Type preview text here...">가나다라마바사
고교구규그기
한글 폰트 테스트</textarea>
          <div class="preview-render" id="previewRender"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('closePreviewModal');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const textarea = document.getElementById('previewText');
    const renderDiv = document.getElementById('previewRender');
    let isComposing = false;

    const render = () => {
      this._renderPreviewText(textarea.value, renderDiv, fullLib);
    };

    textarea.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    textarea.addEventListener('compositionend', () => {
      isComposing = false;
      requestAnimationFrame(() => {
        render();
      });
    });
    textarea.addEventListener('input', () => {
      if (!isComposing) {
        render();
      }
    });
    render();
  }
  _renderPreviewText(text, container, jamoLib) {
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const lines = text.split('\n');
    const cellSize = 48;
    const lineHeight = cellSize + 12;
    const maxChars = Math.max(...lines.map(l => l.length), 1);

    const w = Math.min(maxChars * (cellSize + 4) + 40, container.clientWidth || 700);
    const h = lines.length * lineHeight + 20;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      for (let ci = 0; ci < line.length; ci++) {
        const char = line[ci];
        if (char === ' ') continue;

        const x = 20 + ci * (cellSize + 4);
        const y = 10 + li * lineHeight;

        const info = this._decomposeChar(char);
        if (!info) continue;

        const commands = composeSyllableFromLib(info.cho, info.jung, info.jong, jamoLib);
        this._drawGlyphOnCtx(ctx, commands, x, y, cellSize);
      }
    }

    container.appendChild(canvas);
  }

  _decomposeChar(char) {
    const code = char.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return null;
    const offset = code - 0xAC00;
    const cho  = Math.floor(offset / (21 * 28));
    const jung = Math.floor((offset % (21 * 28)) / 28);
    const jong = offset % 28;
    return { cho, jung, jong };
  }

  _drawGlyphOnCtx(ctx, commands, x, y, size) {
    if (!commands || commands.length === 0) return;
    const scale = size / 1000;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();

    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M': ctx.moveTo(x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
        case 'L': ctx.lineTo(x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
        case 'Q': ctx.quadraticCurveTo(x + cmd.x1 * scale, y + (1000 - cmd.y1) * scale, x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
        case 'C': ctx.bezierCurveTo(x + cmd.x1 * scale, y + (1000 - cmd.y1) * scale, x + cmd.x2 * scale, y + (1000 - cmd.y2) * scale, x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
        case 'Z': ctx.closePath(); break;
      }
    }

    ctx.fill();
    ctx.restore();
  }

  // ════════════════════════════════════════════
  //  폰트 생성 모달
  // ════════════════════════════════════════════
  _showGenerateModal() {
    if (!this.jamoGrid?.isAllCompleted()) {
      this._showIncompleteToast();
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal generate-modal">
        <div class="modal-header">
          <h2>Generate Font</h2>
          <button class="modal-close" id="closeGenModal">x</button>
        </div>
        <div class="modal-body">
          <div class="gen-form">
            <label class="gen-label">
              <span>Font name</span>
              <input type="text" class="gen-input" id="fontNameInput" value="MyHangulFont" placeholder="Enter a font name" />
            </label>
          </div>
          <div class="gen-progress" id="genProgress" style="display:none">
            <div class="gen-progress-bar">
              <div class="gen-progress-fill" id="genProgressFill"></div>
            </div>
            <span class="gen-progress-text" id="genProgressText">Preparing...</span>
          </div>
          <div class="gen-actions">
            <button class="gen-btn" id="genStartBtn">Generate</button>
            <button class="gen-btn download-btn" id="genDownloadBtn" style="display:none">Download TTF</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('closeGenModal');
    closeBtn.addEventListener('click', () => overlay.remove());

    const startBtn = document.getElementById('genStartBtn');
    startBtn.addEventListener('click', () => this._startGeneration());
  }

  async _startGeneration() {
    const fontName = document.getElementById('fontNameInput')?.value || 'MyHangulFont';
    const progressDiv = document.getElementById('genProgress');
    const progressFill = document.getElementById('genProgressFill');
    const progressText = document.getElementById('genProgressText');
    const startBtn = document.getElementById('genStartBtn');
    const downloadBtn = document.getElementById('genDownloadBtn');

    if (progressDiv) progressDiv.style.display = 'block';
    if (startBtn) startBtn.disabled = true;

    try {
      const buffer = generateFont(
        this.jamoLib,
        fontName,
        (progress) => {
          const pct = Math.round(progress * 100);
          if (progressFill) progressFill.style.width = `${pct}%`;
          if (progressText) progressText.textContent = `Generating... ${pct}%`;
        }
      );

      if (progressFill) progressFill.style.width = '100%';
      if (progressText) progressText.textContent = 'Generation complete.';

      this._generatedBuffer = buffer;

      if (downloadBtn) {
        downloadBtn.style.display = 'block';
        downloadBtn.onclick = () => {
          downloadFont(buffer, `${fontName}.ttf`);
        };
      }
    } catch (err) {
      console.error('Font generation error:', err);
      if (progressText) progressText.textContent = `Error: ${err.message}`;
    }

    if (startBtn) startBtn.disabled = false;
  }
  _handleResize() {
    if (this.drawingCanvas) this.drawingCanvas.resize();
    if (this.previewPanel) this.previewPanel.resize();
  }

  _loadSavedJamoLib() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.jamoLib = parsed;
        }
      }

      const draftRaw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (draftRaw) {
        const parsedDrafts = JSON.parse(draftRaw);
        if (parsedDrafts && typeof parsedDrafts === 'object') {
          this.jamoDrafts = parsedDrafts;
        }
      }

      const guideRaw = window.localStorage.getItem(GUIDE_BOX_STORAGE_KEY);
      if (guideRaw) {
        const parsedGuides = JSON.parse(guideRaw);
        if (parsedGuides && typeof parsedGuides === 'object') {
          this.guideOverrides = parsedGuides;
        }
      }
    } catch (error) {
      console.warn('Failed to load saved jamo library:', error);
    }
  }

  _persistJamoLib() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.jamoLib));
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(this.jamoDrafts));
      window.localStorage.setItem(GUIDE_BOX_STORAGE_KEY, JSON.stringify(this.guideOverrides));
    } catch (error) {
      console.warn('Failed to persist jamo library:', error);
    }
  }

  _applyGuideOverride(categoryId, itemKey, guide) {
    if (!guide) return guide;
    const overrideKey = this._getGuideOverrideKey(categoryId, itemKey, guide);
    const override = guide.overrideScope === 'item'
      ? this.guideOverrides[overrideKey]
      : this.guideOverrides[overrideKey] || this.guideOverrides[itemKey];
    if (!override) return guide;

    return {
      ...guide,
      targetRegion: { ...override },
    };
  }

  _handleGuideRegionChange(region) {
    if (!this.currentSelectionKey) return;

    if (region) {
      this.guideOverrides[this.currentSelectionKey] = { ...region };
    } else {
      delete this.guideOverrides[this.currentSelectionKey];
    }

    this._persistJamoLib();
  }

  _resetGuideRegionForCurrentSelection() {
    const selection = this.jamoGrid?.getCurrentSelection();
    if (!selection) return;

    delete this.guideOverrides[
      this._getGuideOverrideKey(
        selection.categoryId,
        `${selection.categoryId}_${selection.jamo}`,
        selection.guide
      )
    ];
    this._persistJamoLib();
    this.drawingCanvas.resetGuideTargetRegion(false);
    this._showToast('Target box reset to the default guide.', 'success', 1800);
  }

  _getGuideOverrideKey(categoryId, itemKey, guide) {
    return guide?.overrideScope === 'item' ? itemKey : categoryId;
  }

  _getStorageKeysForSelection(selection) {
    const keys = selection?.guide?.storageKeys?.length
      ? selection.guide.storageKeys
      : [`${selection.categoryId}_${selection.jamo}`];

    return [...new Set(keys)];
  }

  _isTrackedInputKey(key) {
    return CATEGORIES.some((category) => key.startsWith(`${category.id}_`));
  }

  _getCompletedCount() {
    return Object.keys(this.jamoLib).filter((key) => {
      if (!this._isTrackedInputKey(key)) return false;
      const matchedCategory = CATEGORIES.find((category) => key.startsWith(`${category.id}_`));
      return matchedCategory?.required !== false;
    }).length;
  }

  _getCompletedMapFromLib() {
    return Object.keys(this.jamoLib)
      .filter((key) => this._isTrackedInputKey(key))
      .reduce((completedMap, key) => {
        completedMap[key] = true;
        return completedMap;
      }, {});
  }

  _updateQualityPanel(report) {
    const panel = document.getElementById('qualityPanel');
    if (!panel) return;

    if (!report?.hasContent) {
      panel.className = 'quality-panel';
      panel.innerHTML = `
        <div class="quality-summary">Draw inside the guide to see size and overflow checks before saving.</div>
      `;
      return;
    }

    const metrics = report.metrics;
    const warningItems = this._getQualityMessages(report.warnings)
      .map((message) => `<li>${message}</li>`)
      .join('');
    const panelState = report.hasBlockingWarnings
      ? 'is-danger'
      : report.warnings.length > 0
        ? 'is-warning'
        : 'is-good';

    panel.className = `quality-panel ${panelState}`;
    panel.innerHTML = `
      <div class="quality-summary">
        <span>Strokes ${report.strokeCount}</span>
        <span>Points ${report.pointCount}</span>
        ${metrics
          ? `<span>Fill ${Math.round(metrics.fillRatio * 100)}%</span>
             <span>Overflow ${Math.round(metrics.overflowRatio * 100)}%</span>
             <span>Center ${Math.round(Math.max(metrics.centerOffsetX ?? 0, metrics.centerOffsetY ?? 0) * 100)}%</span>`
          : '<span>Free input</span>'}
      </div>
      <div class="quality-message">
        ${report.hasBlockingWarnings
          ? '<strong>You can still save this, but the composed glyph may become unstable.</strong>'
          : report.warnings.length > 0
            ? '<strong>Saving is allowed, but the result will improve if you fix the items below.</strong>'
            : '<strong>The current drawing looks stable.</strong>'}
      </div>
      ${report.warnings.length > 0
        ? `<ul class="quality-warnings">${warningItems}</ul>`
        : ''}
    `;
  }

  _getQualityWarningMessage(warning) {
    switch (warning?.code) {
      case 'too_small':
        return 'The drawing is too small for the target region. Try drawing it larger.';
      case 'overflow':
        return 'Part of the stroke goes outside the guide region. Keep it inside the box.';
      case 'low_stroke_detail':
        return 'The stroke data is very sparse. Check that the input was captured correctly.';
      case 'off_center':
        return 'The drawing is off-center in the guide box. Re-center it before saving.';
      case 'skewed_shape':
        return 'The drawing is squeezed into a very thin area. Check the guide fit and redraw if needed.';
      default:
        return warning?.message || 'Review the drawing quality before saving.';
    }
  }

  _getQualityMessages(warnings = []) {
    return [...new Set(warnings.map((warning) => this._getQualityWarningMessage(warning)))];
  }

  _showQualityToast(warnings) {
    const uniqueMessages = this._getQualityMessages(warnings);
    this._showToast(`Saved. ${uniqueMessages.join(' / ')}`, 'warning', 4200);
  }

  _showQualityConfirmModal(report, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const warningItems = this._getQualityMessages(report.warnings)
      .map((message) => `<li>${message}</li>`)
      .join('');

    overlay.innerHTML = `
      <div class="modal quality-confirm-modal">
        <div class="modal-header">
          <h2>Confirm Save</h2>
          <button class="modal-close" id="closeQualityConfirmModal">x</button>
        </div>
        <div class="modal-body quality-confirm-body">
          <p class="quality-confirm-copy">This drawing may produce unstable glyphs. Review the warnings or save anyway.</p>
          <ul class="quality-warnings">${warningItems}</ul>
          <div class="quality-confirm-actions">
            <button class="gen-btn" id="qualityConfirmCancelBtn">Keep editing</button>
            <button class="gen-btn download-btn" id="qualityConfirmSaveBtn">Save anyway</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.getElementById('closeQualityConfirmModal')?.addEventListener('click', close);
    document.getElementById('qualityConfirmCancelBtn')?.addEventListener('click', close);
    document.getElementById('qualityConfirmSaveBtn')?.addEventListener('click', () => {
      close();
      onConfirm?.();
    });
  }

  _showToast(message, variant = '', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast${variant ? ` toast-${variant}` : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 500);
    }, duration);
  }
}
import { composeSyllable } from './core/composer.js';

function composeSyllableFromLib(cho, jung, jong, jamoLib) {
  return composeSyllable(cho, jung, jong, jamoLib);
}

// ── 앱 시작 ──
const fonttoApp = new FonttoApp();
