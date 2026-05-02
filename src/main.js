/**
 * main.js — Fontto entry point
 *
 * Application flow:
 *   1. Landing → 2. Jamo input → 3. Preview & review → 4. Generate & download
 */

import './index.css';
import { DrawingCanvas } from './ui/drawing-canvas.js';
import { JamoGrid, CATEGORIES, REQUIRED_JAMO_COUNT, buildGuideMeta } from './ui/jamo-grid.js';
import { PreviewPanel } from './ui/preview-panel.js';
import { Toolbar } from './ui/toolbar.js';
import { deriveAll } from './core/jamo-derive.js';
import { extractRasterComponents, selectedComponentsToCommands, selectedComponentsToPositionedCommands, selectedComponentsToStrokes } from './core/template-import.js';
import { CHO, JUNG, JONG, compose, getVowelCategory, getChoInfo, getJungInfo, getJongInfo } from './core/hangul.js';
import { loadState, saveState } from './core/storage.js';
import { decomposeChar, composeSyllableFromLib, drawGlyphOnCtx, drawPathCommands, createGlyphCanvas, createPartPreviewCanvas } from './core/glyph-utils.js';
import { showToast } from './ui/toast.js';
import { showPreviewModal } from './ui/modals/preview-modal.js';
import { showGenerateModal } from './ui/modals/generate-modal.js';
import { showReviewModal, getDefaultReviewState } from './ui/modals/review-modal.js';
import { showTemplateModal } from './ui/modals/template-modal.js';
import { showSyllableSplitModal } from './ui/modals/syllable-split-modal.js';
import { showQualityConfirmModal } from './ui/modals/quality-confirm-modal.js';
import { showSyllableEditorModal } from './ui/modals/syllable-editor-modal.js';

const RECENT_REVIEW_LIMIT = 8;

class FonttoApp {
  jamoDrafts = {};
  guideOverrides = {};
  syllableImports = {};

  constructor() {
    this.jamoLib = {};
    this.pendingParts = {};
    this.currentStep = 'landing'; // 'landing' | 'editor' | 'preview' | 'generate'
    this.reviewState = getDefaultReviewState();
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
    const saved = loadState();
    this.jamoLib = saved.jamoLib;
    this.jamoDrafts = saved.jamoDrafts;
    this.guideOverrides = saved.guideOverrides;
    this.syllableImports = saved.syllableImports;
    this._showLanding();
    window.addEventListener('resize', () => this._handleResize());
  }

  // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
  //  Step 1: ?쒕뵫 ?섏씠吏
  // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
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
            <button class="header-btn" id="templateBtn">Template</button>
            <button class="header-btn is-hidden" id="returnToReviewBtn">Back to Full Set Review</button>
            <button class="header-btn" id="reviewBtn" disabled>Review Full Set</button>
            <button class="header-btn" id="previewBtn">Preview</button>
            <button class="header-btn primary" id="generateBtn" disabled>Generate Font</button>
          </div>
        </header>

        <aside class="editor-sidebar" id="jamoGridContainer"></aside>

        <main class="editor-canvas-area">
          <section class="pending-parts-panel" id="pendingPartsPanel"></section>
          <details class="manual-drawing-details">
            <summary class="template-legacy-summary">Advanced manual drawing</summary>
            <div class="manual-drawing-body">
              <div class="canvas-wrapper">
                <canvas id="drawingCanvas"></canvas>
              </div>
              <div class="toolbar-area" id="toolbarContainer"></div>
              <div class="quality-panel" id="qualityPanel"></div>
            </div>
          </details>
        </main>

        <aside class="editor-browser-area" id="browserContainer"></aside>

        <footer class="editor-footer" id="previewContainer"></footer>
      </div>
    `;

    this._initEditor();
  }
  _initEditor() {
    // Initialize drawing canvas
    const canvasEl = document.getElementById('drawingCanvas');
    this.drawingCanvas = new DrawingCanvas(canvasEl, {
      penSize: 8,
      onChange: (report) => this._updateQualityPanel(report),
      onGuideRegionChange: (region) => this._handleGuideRegionChange(region),
    });

    // Initialize jamo grid
    const gridContainer = document.getElementById('jamoGridContainer');
    this.jamoGrid = new JamoGrid(gridContainer, (catId, jamo, example, guide) => {
      this._onJamoSelect(catId, jamo, example, guide);
    }, {
      onLocateChar: (char) => this._jumpToGlyphEdit(char),
      onInvalidLocateChar: () => showToast('가, 한 같은 한글 음절 한 글자를 입력하세요.', 'warning', 2600),
    });
    this.jamoGrid.setCompletedMap(this._getCompletedMapFromLib());

    // Initialize preview panel
    const previewContainer = document.getElementById('previewContainer');
    this.previewPanel = new PreviewPanel(previewContainer, {
      showBrowser: false,
      onLocateChar: (char) => this._jumpToGlyphEdit(char),
      onEditImportedChar: (char) => showSyllableSplitModal(this, char),
      onOpenGlyph: (char, meta) => this._handleGlyphCardOpen(char, meta),
      onInvalidLocateChar: () => showToast('That glyph is outside the Hangul syllable set.', 'warning', 2600),
    });
    this.previewPanel.updateJamoLib(deriveAll(this.jamoLib));
    this.previewPanel.updateSyllableImports(this.syllableImports);

    const browserContainer = document.getElementById('browserContainer');
    this.browserPanel = new PreviewPanel(browserContainer, {
      showPreviewInput: false,
      showPreviewCanvas: false,
      showBrowser: true,
      onLocateChar: (char) => this._jumpToGlyphEdit(char),
      onEditImportedChar: (char) => showSyllableSplitModal(this, char),
      onOpenGlyph: (char, meta) => this._handleGlyphCardOpen(char, meta),
      onInvalidLocateChar: () => showToast('That glyph is outside the Hangul syllable set.', 'warning', 2600),
    });
    this.browserPanel.updateJamoLib(deriveAll(this.jamoLib));
    this.browserPanel.updateSyllableImports(this.syllableImports);

    // Initialize toolbar
    const toolbarContainer = document.getElementById('toolbarContainer');
    this.toolbar = new Toolbar(toolbarContainer, {
      onUndo: () => this.drawingCanvas.undo(),
      onRedo: () => this.drawingCanvas.redo(),
      onClear: () => this.drawingCanvas.clear(),
      onPenSize: (size) => this.drawingCanvas.setPenSize(size),
      onVariableWidth: (v) => this.drawingCanvas.setVariableWidth(v),
      onToggleGuideEdit: (enabled) => {
        this.drawingCanvas.setGuideEditMode(enabled);
        if (enabled) this.toolbar.setStrokeSelectMode(false);
      },
      onToggleStrokeSelect: (enabled) => {
        this.drawingCanvas.setStrokeSelectMode(enabled);
        if (enabled) this.toolbar.setGuideEditMode(false);
      },
      onKeepSelectedStrokes: () => this.drawingCanvas.keepSelectedStrokes(),
      onDeleteSelectedStrokes: () => this.drawingCanvas.deleteSelectedStrokes(),
      onSelectAllStrokes: () => this.drawingCanvas.selectAllStrokes(),
      onClearStrokeSelection: () => this.drawingCanvas.clearStrokeSelection(),
      onDuplicateSelectedStrokes: () => this.drawingCanvas.duplicateSelectedStrokes(),
      onNudgeSelectedStrokes: (dx, dy) => this.drawingCanvas.nudgeSelectedStrokes(dx, dy),
      onRotateSelectedStrokes: (degrees) => this.drawingCanvas.rotateSelectedStrokes(degrees),
      onScaleSelectedStrokes: (scaleX, scaleY) => this.drawingCanvas.scaleSelectedStrokes(scaleX, scaleY),
      onBringSelectedToFront: () => this.drawingCanvas.bringSelectedToFront(),
      onSendSelectedToBack: () => this.drawingCanvas.sendSelectedToBack(),
      onResetGuideBox: () => this._resetGuideRegionForCurrentSelection(),
      onSave: () => this._saveCurrentPart(),
      onNext: () => this._savePartAndNext(),
    });

    // Button events
    document.getElementById('previewBtn').addEventListener('click', () => {
      showPreviewModal(this);
    });
    document.getElementById('templateBtn').addEventListener('click', () => {
      showTemplateModal(this);
    });
    document.getElementById('reviewBtn').addEventListener('click', () => {
      showReviewModal(this);
    });
    document.getElementById('returnToReviewBtn').addEventListener('click', () => {
      this._returnToReview();
    });
    document.getElementById('generateBtn').addEventListener('click', () => {
      showGenerateModal(this);
    });

    // 泥?踰덉㎏ ?먮え ?먮룞 ?좏깮
    this._checkGenerateReady();
    this._updateReturnToReviewButton();
    this._renderPendingPartsPanel();
    this.jamoGrid.goToNext();
  }

  _renderPendingPartsPanel() {
    const panel = document.getElementById('pendingPartsPanel');
    if (!panel) return;

    const entries = Object.entries(this.pendingParts);
    panel.innerHTML = `
      <div class="pending-parts-header">
        <div>
          <h2>Saved Parts</h2>
          <p>Extract strokes from imported syllables or draw a part manually, review it here, then apply it to the glyph browser.</p>
        </div>
        <div class="pending-parts-actions">
          <button class="gen-btn" id="applyPendingPartsBtn" ${entries.length ? '' : 'disabled'}>Apply Saved Parts</button>
          <button class="tool-btn" id="clearPendingPartsBtn" ${entries.length ? '' : 'disabled'}>Clear</button>
        </div>
      </div>
      <div class="pending-parts-grid" id="pendingPartsGrid"></div>
    `;

    document.getElementById('applyPendingPartsBtn')?.addEventListener('click', () => {
      this._applyPendingParts();
    });
    document.getElementById('clearPendingPartsBtn')?.addEventListener('click', () => {
      this._clearAllPendingParts();
    });

    const grid = document.getElementById('pendingPartsGrid');
    if (!grid) return;
    if (!entries.length) {
      grid.innerHTML = '<div class="pending-parts-empty">No saved parts yet. Open an imported syllable or draw in Advanced manual drawing, then save parts here.</div>';
      return;
    }

    entries.forEach(([key, part]) => {
      const card = document.createElement('div');
      card.className = 'pending-part-card';

      const canvas = createPartPreviewCanvas(part.commands, 96);
      const title = document.createElement('div');
      title.className = 'pending-part-title';
      title.textContent = part.selection.guide?.label || `${part.selection.categoryId}_${part.selection.jamo}`;

      const meta = document.createElement('div');
      meta.className = 'pending-part-meta';
      meta.textContent = `${key}${part.sourceChar ? ` from ${part.sourceChar}` : ''}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tool-btn pending-part-remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => this._clearPendingPart(key));

      card.appendChild(canvas);
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(remove);
      grid.appendChild(card);
    });
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
    } else if (draft?.importedStrokes?.length) {
      this.drawingCanvas.loadStrokes(draft.importedStrokes);
    } else {
      this.drawingCanvas.clear();
    }
    this.drawingCanvas.setGuide(this._applyGuideOverride(catId, key, guide ?? { char: example }));
    this._updateQualityPanel(this.drawingCanvas.getQualityReport());
  }

  _jumpToGlyphEdit(char) {
    const info = decomposeChar(char);
    if (!info) {
      showToast('가, 한 같은 한글 음절 한 글자를 입력하세요.', 'warning', 2600);
      return;
    }

    const targets = this._getEditTargetsForSyllable(info.cho, info.jung, info.jong);
    const primaryTarget = targets[0];
    if (!primaryTarget) return;

    this.reviewReturnContext = {
      selectedChar: char,
      state: {
        ...this.reviewState,
        mode: 'all',
        comboQuery: '',
        selectedChar: char,
        page: Math.floor((char.charCodeAt(0) - 0xAC00) / this.reviewState.pageSize),
      },
    };
    this.reviewState = { ...this.reviewReturnContext.state };
    this._updateReturnToReviewButton();
    this.jamoGrid.selectItem(primaryTarget.categoryId, primaryTarget.jamo);
    showToast(`Jumped to ${char} -> ${primaryTarget.label}`, 'success', 2200);
  }

  _handleGlyphCardOpen(char, meta = {}) {
    if (meta.imported || this.syllableImports?.[char]?.imageSrc) {
      showSyllableSplitModal(this, char);
      return;
    }
    this._jumpToGlyphEdit(char);
  }

  _getCurrentDrawingSelection() {
    const sel = this.jamoGrid?.getCurrentSelection();
    if (!sel) return null;
    const key = `${sel.categoryId}_${sel.jamo}`;
    return {
      ...sel,
      guide: this._applyGuideOverride(sel.categoryId, key, sel.guide),
    };
  }

  _saveCurrentPart(options = {}) {
    const sel = this._getCurrentDrawingSelection();
    if (!sel) return false;

    if (!this.drawingCanvas.hasContent()) return false;

    const qualityReport = this.drawingCanvas.getQualityReport();

    if (!options.force && qualityReport.hasBlockingWarnings) {
      this._showQualityConfirmModal(qualityReport, () => {
        this._saveCurrentPart({ ...options, force: true });
      });
      return false;
    }

    const selectedOnly = this.drawingCanvas.getSelectedStrokeCount() > 0;
    const commands = this.drawingCanvas.toPathCommands({
      targetRegion: sel.guide?.targetRegion,
      selectedOnly,
    });
    const strokes = this.drawingCanvas.exportStrokes({ selectedOnly });
    if (!commands.length) {
      showToast('The drawing could not be converted into a reusable part.', 'warning', 2600);
      return false;
    }

    this._storePendingSelection(sel, commands, strokes, 'manual');
    this._renderPendingPartsPanel();

    if (qualityReport.warnings.length > 0) {
      this._showQualityToast(qualityReport.warnings);
    } else if (!options.advance) {
      showToast('Saved part to the pending panel.', 'success', 2200);
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

  _savePartAndNext() {
    this._saveCurrentPart({ advance: true });
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
      // 理쒖냼 珥덉꽦 ?몃줈 1媛?+ 以묒꽦 1媛쒓? ?덉쑝硫??쒖꽦??(?뚯뒪?몄슜)
      // Full review and export should stay locked until all required inputs are complete.
      const keys = Object.keys(this.jamoLib);
      btn.disabled = !completed;
    }
  }

  _showCompleteToast() {
    showToast('All required jamo are saved. You can generate the font now.', 'success');
  }
  _showIncompleteToast() {
    const completedCount = this._getCompletedCount();
    const remaining = Math.max(REQUIRED_JAMO_COUNT - completedCount, 0);
    showToast(`You still have ${remaining} required jamo to complete before review or export.`);
  }
  _showReviewModal() {
    if (!this.jamoGrid?.isAllCompleted()) {
      this._showIncompleteToast();
      return;
    }

    const fullLib = deriveAll(this.jamoLib);
    const state = {
      ...getDefaultReviewState(),
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
      const info = decomposeChar(char);
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

      const canvas = createGlyphCanvas(commands, 56);

      button.appendChild(canvas);
      gridEl.appendChild(button);
    });

    this._renderReviewInspector(inspectorEl, state.selectedChar, jamoLib);
  }
  _renderReviewInspector(container, char, jamoLib) {
    const info = decomposeChar(char);
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

    const canvas = createGlyphCanvas(commands, 180);
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
    drawGlyphOnCtx(ctx, commands, 0, 0, size);
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
        const info = decomposeChar(char);
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
      showReviewModal(this);
      return;
    }

    this.reviewState = {
      ...getDefaultReviewState(),
      ...this.reviewReturnContext.state,
      selectedChar: this.reviewReturnContext.selectedChar,
    };

    showReviewModal(this);
  }

  _getEditTargetsForSyllable(choIdx, jungIdx, jongIdx) {
    const targets = [];
    const vowelCategory = getVowelCategory(jungIdx);
    const jongCategoryId = vowelCategory === 'horizontal'
      ? 'jong_h'
      : vowelCategory === 'complex'
        ? 'jong_m'
        : 'jong_v';
    const hasFinal = jongIdx > 0;
    const choInfo = getChoInfo(choIdx);
    const jungInfo = getJungInfo(jungIdx);
    const jongInfo = getJongInfo(jongIdx);
    const choContext = `${vowelCategory === 'vertical' ? '세로모음' : '가로/복합모음'} · ${hasFinal ? '받침 있음' : '받침 없음'}`;
    const jungContext = hasFinal ? '받침 있음' : '받침 없음';
    const jongContext = vowelCategory === 'horizontal' ? '가로모음 뒤' : '세로/복합모음 뒤';

    targets.push({
      categoryId: jongIdx > 0
        ? (vowelCategory === 'vertical' ? 'cho_v_wf' : 'cho_h_wf')
        : (vowelCategory === 'vertical' ? 'cho_v' : 'cho_h'),
      jamo: choInfo.base,
      label: `초성 ${choInfo.base} 적용 (${choContext})`,
    });

    const jungItems = jungInfo.isCompound && jungInfo.components
      ? jungInfo.components
      : [JUNG[jungIdx]];

    jungItems.forEach((jamo, index) => {
      targets.push({
        categoryId: jongIdx > 0 ? 'jung_wb' : 'jung_nb',
        jamo,
        label: `중성 ${jamo} 적용 (${jungContext})${jungItems.length > 1 ? ` ${index + 1}` : ''}`,
      });
    });

    if (jongIdx > 0) {
      if (jongInfo?.isCompound) {
        targets.push({
          categoryId: jongCategoryId,
          jamo: jongInfo.base,
          label: `겹받침 ${jongInfo.base} 적용 (${jongContext})`,
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
          categoryId: jongCategoryId,
          jamo,
          label: `종성 ${jamo} 적용 (${jongContext})${jongItems.length > 1 ? ` ${index + 1}` : ''}`,
        });
      });
    }

    return targets.filter((target, index, array) => {
      return array.findIndex((item) => item.categoryId === target.categoryId && item.jamo === target.jamo) === index;
    });
  }

  _showTemplateModal() {
    const slots = getTemplateSlots();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal template-modal">
        <div class="modal-header">
          <h2>Template Import</h2>
          <button class="modal-close" id="closeTemplateModal">x</button>
        </div>
        <div class="modal-body template-body">
          <p class="template-copy">Write the required source syllables on the template, upload it, then open each extracted card and assign only the parts you want to reuse.</p>
          <div class="template-actions">
            <button class="gen-btn" id="downloadTemplateBtn">Download PNG Template</button>
            <label class="gen-btn template-upload-btn" for="templateFileInput">Upload Filled Template</label>
            <input type="file" id="templateFileInput" accept="image/*" class="template-file-input" />
          </div>
          <div class="template-status" id="templateStatus">Template expects ${slots.length} source syllable boxes.</div>
          <div class="template-import-review" id="templateImportReview">
            <div class="template-target-empty">Upload a filled template to review extracted source syllables here.</div>
          </div>
          <details class="template-manual-details">
            <summary class="template-legacy-summary">Advanced single-syllable split</summary>
            <div class="template-manual">
              <div class="template-manual-header">
                <h3>Split One Syllable</h3>
                <p>Use this only when you want to decompose one completed syllable manually by selecting stroke groups.</p>
              </div>
              <div class="template-manual-controls">
                <input type="text" class="gen-input template-syllable-input" id="templateSyllableInput" maxlength="1" placeholder="한" />
                <label class="gen-btn template-upload-btn" for="templateSingleFileInput">Upload Syllable Image</label>
                <input type="file" id="templateSingleFileInput" accept="image/*" class="template-file-input" />
              <button class="gen-btn" id="templateApplySelectionBtn" disabled>Apply to Glyph Cards</button>
              </div>
              <div class="template-status" id="templateManualStatus">Choose one Hangul syllable and an image containing only that syllable.</div>
              <div class="template-manual-layout">
                <canvas class="template-manual-canvas" id="templateManualCanvas" width="520" height="520"></canvas>
                <div class="template-manual-sidebar">
                  <div class="template-target-list" id="templateTargetList"></div>
                  <div class="template-selection-summary" id="templateSelectionSummary">No image loaded.</div>
                </div>
              </div>
            </div>
          </details>
          <details class="template-legacy">
            <summary class="template-legacy-summary">Template preview</summary>
            <div class="template-legacy-body">
              <div class="template-preview-wrap">
                <img alt="Template preview" class="template-preview-image" id="templatePreviewImage" />
              </div>
            </div>
          </details>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const manualState = {
      char: '',
      targets: [],
      extracted: null,
      image: null,
      activeTargetIndex: 0,
      assignments: new Map(),
      selectedComponentIds: new Set(),
      contextMenuEl: null,
    };

    document.getElementById('closeTemplateModal').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
      this._hideManualContextMenu(manualState);
    });

    const previewImage = document.getElementById('templatePreviewImage');
    previewImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildTemplateSvg(slots))}`;
    const importReviewEl = document.getElementById('templateImportReview');

    document.getElementById('downloadTemplateBtn').addEventListener('click', async () => {
      await this._downloadTemplate(slots);
    });

    document.getElementById('templateFileInput').addEventListener('change', async (event) => {
      const [file] = event.target.files ?? [];
      if (!file) return;

      const statusEl = document.getElementById('templateStatus');
      statusEl.textContent = 'Importing template...';

      try {
        const summary = await this._importTemplateFile(file, slots);
        statusEl.textContent = `Imported ${summary.imported} source syllables. Skipped ${summary.skipped} empty boxes.`;
        this._renderTemplateImportReview(importReviewEl, summary.importedSlots, close);
      } catch (error) {
        console.error('Template import failed:', error);
        statusEl.textContent = `Import failed: ${error.message}`;
      }
    });

    const syllableInput = document.getElementById('templateSyllableInput');
    const applyBtn = document.getElementById('templateApplySelectionBtn');
    const manualStatus = document.getElementById('templateManualStatus');
    const manualCanvas = document.getElementById('templateManualCanvas');
    const targetList = document.getElementById('templateTargetList');
    const selectionSummary = document.getElementById('templateSelectionSummary');

    const renderManual = () => {
      this._renderManualSplitState(manualCanvas, targetList, selectionSummary, manualState, renderManual);
      applyBtn.disabled = !this._canApplyManualSplit(manualState);
    };

    syllableInput.addEventListener('input', () => {
      manualState.char = syllableInput.value.trim();
      manualState.targets = this._getTargetsForManualSplit(manualState.char);
      manualState.activeTargetIndex = 0;
      manualState.assignments = new Map();
      manualState.selectedComponentIds = new Set();
      manualStatus.textContent = manualState.targets.length
        ? 'Upload an image, click stroke groups to select them, then right-click to assign them.'
        : '가, 한 같은 한글 음절 한 글자를 입력하세요.';
      renderManual();
    });

    manualCanvas.addEventListener('click', (event) => {
      if (!manualState.extracted) return;
      const componentId = this._getManualComponentAtPoint(event, manualCanvas, manualState.extracted);
      if (componentId === null) return;

      this._toggleManualComponentSelection(manualState, componentId, event.shiftKey);
      renderManual();
    });

    manualCanvas.addEventListener('contextmenu', (event) => {
      this._handleManualCanvasContextMenu(event, manualCanvas, manualState, renderManual);
    });

    document.getElementById('templateSingleFileInput').addEventListener('change', async (event) => {
      const [file] = event.target.files ?? [];
      if (!file) return;
      if (!manualState.targets.length) {
        manualStatus.textContent = 'Enter the syllable first so Fontto knows which parts to save.';
        return;
      }

      try {
      const image = await this._readImageFile(file);
      const extracted = this._extractManualSplitImage(image);
      manualState.image = image;
      manualState.imageSrc = file.type.startsWith('image/')
        ? await this._readFileAsDataUrl(file)
        : null;
      manualState.extracted = extracted;
        manualState.assignments = new Map();
        manualState.selectedComponentIds = new Set();
        manualStatus.textContent = `Detected ${extracted.components.length} stroke groups. Select groups, then right-click to assign them.`;
        renderManual();
      } catch (error) {
        manualStatus.textContent = `Split failed: ${error.message}`;
      }
    });

    applyBtn.addEventListener('click', () => {
      const result = this._applyManualSplitAssignments(manualState);
      manualStatus.textContent = result.applied > 0
        ? `Applied ${result.applied} part${result.applied === 1 ? '' : 's'} to the matching glyph card${result.applied === 1 ? '' : 's'}.`
        : `Applied 0 parts: ${result.reason || 'select a stroke group and target first.'}`;
      renderManual();
    });

    renderManual();
  }

  async _showSyllableSplitModal(initialChar = '', options = {}) {
    return showSyllableSplitModal(this, initialChar, options);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal template-modal">
        <div class="modal-header">
          <h2>Edit Imported Syllable</h2>
          <button class="modal-close" id="closeSyllableSplitModal">x</button>
        </div>
        <div class="modal-body template-body">
          <div class="template-manual">
            <div class="template-manual-header">
              <h3>Split One Syllable</h3>
              <p>Select the parts you want to reuse, then right-click to assign them to the matching initial, medial, or final target.</p>
            </div>
            <div class="template-manual-controls">
              <input type="text" class="gen-input template-syllable-input" id="splitSyllableInput" maxlength="1" placeholder="한" value="${initialChar}" />
              <label class="gen-btn template-upload-btn" for="splitSingleFileInput">Replace Image</label>
              <input type="file" id="splitSingleFileInput" accept="image/*" class="template-file-input" />
              <div class="template-edit-tools">
                <button type="button" class="tool-btn active" id="splitSelectModeBtn">Select</button>
                <button type="button" class="tool-btn" id="splitEraseModeBtn">Erase</button>
                <button type="button" class="tool-btn" id="splitDrawModeBtn">Draw</button>
                <button type="button" class="tool-btn" id="splitAutoAssignBtn">Auto Assign</button>
                <label class="template-brush-control">Brush <input type="range" id="splitBrushSizeInput" min="6" max="42" value="18" /></label>
              </div>
              <button class="gen-btn" id="splitApplySelectionBtn" disabled>Apply to Glyph Cards</button>
            </div>
            <div class="template-status" id="splitManualStatus">Load or replace the syllable image, then assign its parts.</div>
            <div class="template-manual-layout">
              <canvas class="template-manual-canvas" id="splitManualCanvas" width="520" height="520"></canvas>
              <div class="template-manual-sidebar">
                <div class="template-target-list" id="splitTargetList"></div>
                <div class="template-selection-summary" id="splitSelectionSummary">No image loaded.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('closeSyllableSplitModal').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
      this._hideManualContextMenu(state);
    });

    const state = {
      char: initialChar,
      targets: options.targets?.length ? options.targets : this._getTargetsForManualSplit(initialChar),
      extracted: null,
      image: null,
      imageSrc: options.imageSrc ?? this.syllableImports?.[initialChar]?.imageSrc ?? null,
      activeTargetIndex: 0,
      assignments: new Map(),
      selectedComponentIds: new Set(),
      contextMenuEl: null,
      editMode: 'select',
      brushSize: 18,
      editImageData: null,
      isEditingMask: false,
    };

    const syllableInput = document.getElementById('splitSyllableInput');
    const applyBtn = document.getElementById('splitApplySelectionBtn');
    const manualStatus = document.getElementById('splitManualStatus');
    const manualCanvas = document.getElementById('splitManualCanvas');
    const targetList = document.getElementById('splitTargetList');
    const selectionSummary = document.getElementById('splitSelectionSummary');
    const selectModeBtn = document.getElementById('splitSelectModeBtn');
    const eraseModeBtn = document.getElementById('splitEraseModeBtn');
    const drawModeBtn = document.getElementById('splitDrawModeBtn');
    const autoAssignBtn = document.getElementById('splitAutoAssignBtn');
    const brushSizeInput = document.getElementById('splitBrushSizeInput');

    const render = () => {
      this._renderManualSplitState(manualCanvas, targetList, selectionSummary, state, render);
      applyBtn.disabled = !this._canApplyManualSplit(state);
    };

    const loadImageIntoState = async (src) => {
      const image = await this._readImageSource(src);
      state.image = image;
      state.imageSrc = src;
      state.extracted = this._extractManualSplitImage(image);
      state.editImageData = this._imageDataFromExtractedMask(state.extracted);
      state.assignments = new Map();
      state.selectedComponentIds = new Set();
      manualStatus.textContent = `Detected ${state.extracted.components.length} stroke groups. Select groups, then right-click to assign them.`;
      render();
    };

    syllableInput.addEventListener('input', async () => {
      state.char = syllableInput.value.trim();
      state.targets = this._getTargetsForManualSplit(state.char);
      state.activeTargetIndex = 0;
      state.assignments = new Map();
      state.selectedComponentIds = new Set();
      if (!state.targets.length) {
        state.extracted = null;
        manualStatus.textContent = '가, 한 같은 한글 음절 한 글자를 입력하세요.';
        render();
        return;
      }
      if (state.imageSrc) {
        await loadImageIntoState(state.imageSrc);
      } else {
        manualStatus.textContent = 'Replace the image or pick one imported glyph card from the browser.';
        render();
      }
    });

    manualCanvas.addEventListener('click', (event) => {
      if (state.editMode !== 'select') return;
      if (!state.extracted) return;
      const componentId = this._getManualComponentAtPoint(event, manualCanvas, state.extracted);
      if (componentId === null) return;
      this._toggleManualComponentSelection(state, componentId, event.shiftKey);
      render();
    });

    manualCanvas.addEventListener('contextmenu', (event) => {
      if (state.editMode !== 'select') {
        event.preventDefault();
        return;
      }
      this._handleManualCanvasContextMenu(event, manualCanvas, state, render);
    });

    manualCanvas.addEventListener('pointerdown', (event) => {
      if (state.editMode === 'select') return;
      event.preventDefault();
      state.isEditingMask = true;
      this._paintManualMaskAtEvent(event, manualCanvas, state);
      this._reextractManualMask(state);
      render();
    });
    manualCanvas.addEventListener('pointermove', (event) => {
      if (!state.isEditingMask || state.editMode === 'select') return;
      event.preventDefault();
      this._paintManualMaskAtEvent(event, manualCanvas, state);
      this._reextractManualMask(state);
      render();
    });
    window.addEventListener('pointerup', () => {
      state.isEditingMask = false;
    });

    const setEditMode = (mode) => {
      state.editMode = mode;
      state.selectedComponentIds = new Set();
      [selectModeBtn, eraseModeBtn, drawModeBtn].forEach((button) => button?.classList.remove('active'));
      if (mode === 'select') selectModeBtn?.classList.add('active');
      if (mode === 'erase') eraseModeBtn?.classList.add('active');
      if (mode === 'draw') drawModeBtn?.classList.add('active');
      render();
    };
    selectModeBtn?.addEventListener('click', () => setEditMode('select'));
    eraseModeBtn?.addEventListener('click', () => setEditMode('erase'));
    drawModeBtn?.addEventListener('click', () => setEditMode('draw'));
    autoAssignBtn?.addEventListener('click', () => {
      const result = this._autoAssignManualSplitTargets(state);
      manualStatus.textContent = `Auto assigned ${result.assigned} group${result.assigned === 1 ? '' : 's'}. ${result.needsReview} group${result.needsReview === 1 ? '' : 's'} need review.`;
      setEditMode('select');
      render();
    });
    brushSizeInput?.addEventListener('input', () => {
      state.brushSize = Number(brushSizeInput.value) || 18;
    });

    document.getElementById('splitSingleFileInput').addEventListener('change', async (event) => {
      const [file] = event.target.files ?? [];
      if (!file) return;
      if (!this._getTargetsForManualSplit(state.char).length) {
        manualStatus.textContent = 'Enter the syllable first so Fontto knows where to save the parts.';
        return;
      }
      const src = await this._readFileAsDataUrl(file);
      await loadImageIntoState(src);
    });

    applyBtn.addEventListener('click', () => {
      const result = this._applyManualSplitAssignments(state);
      manualStatus.textContent = result.applied > 0
        ? `Applied ${result.applied} part${result.applied === 1 ? '' : 's'} to the matching glyph card${result.applied === 1 ? '' : 's'}.`
        : `Applied 0 parts: ${result.reason || 'select a stroke group and target first.'}`;
      render();
    });

    if (state.char && state.imageSrc && state.targets.length) {
      try {
        await loadImageIntoState(state.imageSrc);
      } catch (error) {
        manualStatus.textContent = `Failed to load imported image: ${error.message}`;
      }
    } else {
      render();
    }
  }

  async _downloadTemplate(slots) {
    const svg = buildTemplateSvg(slots);
    const metrics = getTemplateMetrics(slots.length);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = await this._readImageSource(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = metrics.width;
    canvas.height = metrics.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3f5fb';
    ctx.fillRect(0, 0, metrics.width, metrics.height);
    ctx.drawImage(image, 0, 0, metrics.width, metrics.height);

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fontto-template.png';
    link.click();
    URL.revokeObjectURL(svgUrl);
  }

  async _importTemplateFile(file, slots) {
    const image = await this._readImageFile(file);
    const metrics = getTemplateMetrics(slots.length);
    this._validateTemplateImage(image, metrics);
    const canvas = document.createElement('canvas');
    canvas.width = metrics.width;
    canvas.height = metrics.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, metrics.width, metrics.height);
    ctx.drawImage(image, 0, 0, metrics.width, metrics.height);

    let imported = 0;
    let skipped = 0;
    const importedSlots = [];
    const importedByChar = new Map();

    slots.forEach((slot, index) => {
      const cellRect = getTemplateCellRect(index, metrics);
      const importRect = getTemplateImportRect(cellRect, metrics);
      const imageData = ctx.getImageData(importRect.x, importRect.y, importRect.w, importRect.h);
      const commands = rasterRectToCommands(imageData);

      if (commands.length === 0) {
        skipped += 1;
        return;
      }

      const cleanImageData = rasterRectToCleanImageData(imageData);
      const imageSrc = this._createImageDataUrl(cleanImageData);
      if (!this.syllableImports[slot.example]) {
        this.syllableImports[slot.example] = {
          imageSrc,
          sourceChar: slot.example,
        };
      }

      if (!importedByChar.has(slot.example)) {
        importedByChar.set(slot.example, {
          char: slot.example,
          sourceJamo: slot.jamo,
          categoryId: slot.categoryId,
          categoryLabel: slot.categoryLabel,
          imageSrc,
          targets: this._getTargetsForManualSplit(slot.example),
        });
        imported += 1;
      }
    });

    importedSlots.push(...importedByChar.values());
    this.previewPanel.updateSyllableImports(this.syllableImports);
    if (this.browserPanel) this.browserPanel.updateSyllableImports(this.syllableImports);
    this._persistState();
    showToast(`Template import complete: ${imported} source syllables`, imported > 0 ? 'success' : 'warning', 3200);

    return { imported, skipped, importedSlots };
  }

  _renderTemplateImportReview(container, importedSlots, closeModal) {
    if (!container) return;

    if (!importedSlots?.length) {
      container.innerHTML = '<div class="template-target-empty">No source syllables were extracted from the uploaded template.</div>';
      return;
    }

    container.innerHTML = `
      <div class="template-import-review-header">
        <h3>Extracted Source Syllables</h3>
        <p>Click a card to split it, then right-click the selected strokes to apply the needed part to the matching jamo slots.</p>
      </div>
      <div class="template-import-review-grid"></div>
    `;

    const grid = container.querySelector('.template-import-review-grid');
    importedSlots.forEach((slot) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-import-card';
      const image = document.createElement('img');
      image.className = 'template-import-card-image';
      image.alt = `${slot.char} source`;
      image.src = slot.imageSrc;

      const title = document.createElement('span');
      title.className = 'template-import-card-title';
      title.textContent = slot.char;

      const subtitle = document.createElement('span');
      subtitle.className = 'template-import-card-subtitle';
      subtitle.textContent = slot.targets.map((target) => target.label).join(' / ');

      card.appendChild(image);
      card.appendChild(title);
      card.appendChild(subtitle);
      card.addEventListener('click', () => {
        showSyllableSplitModal(this, slot.char, {
          imageSrc: slot.imageSrc,
          targets: slot.targets,
        });
        closeModal?.();
        showToast(`Opened ${slot.char} for part assignment.`, 'success', 2200);
      });

      grid.appendChild(card);
    });
  }

  _readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read the template file.'));
      reader.onload = () => {
        this._readImageSource(reader.result).then(resolve).catch(reject);
      };
      reader.readAsDataURL(file);
    });
  }

  _readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read the image file.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  _readImageSource(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unsupported image file.'));
      img.src = src;
    });
  }

  _createImageDataUrl(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  _validateTemplateImage(image, metrics) {
    const expectedRatio = metrics.width / metrics.height;
    const actualRatio = image.width / image.height;
    const ratioDelta = Math.abs(actualRatio - expectedRatio) / expectedRatio;

    if (ratioDelta > 0.08) {
      throw new Error('This image does not match the Fontto template layout. Please upload the downloaded template PNG, not a browser screenshot.');
    }

    if (image.width < metrics.width * 0.65 || image.height < metrics.height * 0.65) {
      throw new Error('Template image is too small. Export or scan the sheet at a higher resolution.');
    }
  }

  _getTargetsForManualSplit(char) {
    const info = decomposeChar(char);
    if (!info) return [];
    return this._getEditTargetsForSyllable(info.cho, info.jung, info.jong);
  }

  _extractManualSplitImage(image) {
    const size = 520;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, size, size);

    const scale = Math.min((size - 40) / image.width, (size - 40) / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = (size - drawWidth) / 2;
    const y = (size - drawHeight) / 2;
    ctx.drawImage(image, x, y, drawWidth, drawHeight);

    const imageData = ctx.getImageData(0, 0, size, size);
    const extracted = extractRasterComponents(imageData);
    if (extracted.components.length === 0) {
      throw new Error('No stroke groups were detected in the uploaded image.');
    }

    return extracted;
  }

  _imageDataFromExtractedMask(extracted) {
    const imageData = new ImageData(extracted.width, extracted.height);
    extracted.mask.forEach((value, pixelIndex) => {
      if (!value) return;
      const idx = pixelIndex * 4;
      imageData.data[idx] = 255;
      imageData.data[idx + 1] = 255;
      imageData.data[idx + 2] = 255;
      imageData.data[idx + 3] = 255;
    });
    return imageData;
  }

  _paintManualMaskAtEvent(event, canvas, state) {
    if (!state.editImageData) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));
    const radius = Math.max(Math.floor((state.brushSize || 18) / 2), 1);
    const { width, height, data } = state.editImageData;
    const minX = Math.max(x - radius, 0);
    const maxX = Math.min(x + radius, width - 1);
    const minY = Math.max(y - radius, 0);
    const maxY = Math.min(y + radius, height - 1);
    const radiusSq = radius * radius;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - x;
        const dy = py - y;
        if ((dx * dx) + (dy * dy) > radiusSq) continue;
        const idx = (py * width + px) * 4;
        if (state.editMode === 'erase') {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        } else if (state.editMode === 'draw') {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        }
      }
    }
  }

  _reextractManualMask(state) {
    if (!state.editImageData) return;
    const extracted = extractRasterComponents(state.editImageData);
    state.extracted = extracted;
    state.assignments = new Map();
    state.selectedComponentIds = new Set();
  }

  _autoAssignManualSplitTargets(state) {
    if (!state.extracted || !state.targets.length) {
      return { assigned: 0, needsReview: 0 };
    }

    const targetRegions = state.targets.map((target, index) => {
      const selection = this._getSelectionForTarget(target.categoryId, target.jamo);
      return {
        index,
        region: selection?.guide?.targetRegion ?? null,
      };
    }).filter((item) => item.region);

    if (!targetRegions.length) {
      return { assigned: 0, needsReview: state.extracted.components.length };
    }

    state.assignments = new Map();
    state.selectedComponentIds = new Set();
    let assigned = 0;
    let needsReview = 0;

    state.extracted.components.forEach((component) => {
      const componentBox = this._componentBoundsToUnitRect(component.bounds, state.extracted.width, state.extracted.height);
      const ranked = targetRegions
        .map((target) => ({
          index: target.index,
          overlap: this._rectOverlapArea(componentBox, target.region),
          centerInside: this._rectCenterInside(componentBox, target.region),
        }))
        .sort((a, b) => b.overlap - a.overlap);

      const best = ranked[0];
      const second = ranked[1];
      const ambiguous = !best
        || best.overlap < 0.08
        || (second && second.overlap > 0 && best.overlap / second.overlap < 1.35);

      if (!ambiguous || best?.centerInside) {
        state.assignments.set(component.id, best.index);
        assigned += 1;
      } else {
        state.selectedComponentIds.add(component.id);
        needsReview += 1;
      }
    });

    return { assigned, needsReview };
  }

  _componentBoundsToUnitRect(bounds, width, height) {
    return {
      x: bounds.minX / width,
      y: bounds.minY / height,
      w: bounds.w / width,
      h: bounds.h / height,
    };
  }

  _rectOverlapArea(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1) return 0;
    const overlap = (x2 - x1) * (y2 - y1);
    const area = Math.max(a.w * a.h, 0.0001);
    return overlap / area;
  }

  _rectCenterInside(rect, target) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return cx >= target.x
      && cx <= target.x + target.w
      && cy >= target.y
      && cy <= target.y + target.h;
  }

  _renderManualSplitState(canvas, targetList, selectionSummary, state, rerender) {
    this._renderManualTargetList(targetList, state, rerender);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f1018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state.extracted) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Upload one syllable image to start manual split.', canvas.width / 2, canvas.height / 2);
      selectionSummary.textContent = 'No image loaded.';
      return;
    }

    const imageData = new ImageData(state.extracted.width, state.extracted.height);
    imageData.data.fill(0);
    state.extracted.components.forEach((component) => {
      const assignedTarget = state.assignments.get(component.id);
      const isAssigned = assignedTarget !== undefined;
      const isSelected = state.selectedComponentIds?.has(component.id);
      const fill = isSelected
        ? [255, 184, 77, 255]
        : isAssigned
          ? [0, 212, 170, 255]
          : [255, 255, 255, 255];
      component.pixels.forEach((pixelIndex) => {
        const idx = pixelIndex * 4;
        imageData.data[idx] = fill[0];
        imageData.data[idx + 1] = fill[1];
        imageData.data[idx + 2] = fill[2];
        imageData.data[idx + 3] = fill[3];
      });
    });
    ctx.putImageData(imageData, 0, 0);

    state.extracted.components.forEach((component) => {
      const assignedTarget = state.assignments.get(component.id);
      const isSelected = state.selectedComponentIds?.has(component.id);
      ctx.strokeStyle = isSelected
        ? 'rgba(255, 184, 77, 0.95)'
        : assignedTarget !== undefined
          ? 'rgba(0, 212, 170, 0.85)'
          : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = isSelected || assignedTarget !== undefined ? 2 : 1;
      ctx.strokeRect(
        component.bounds.minX - 2,
        component.bounds.minY - 2,
        component.bounds.w + 4,
        component.bounds.h + 4
      );
    });

    const selectedCount = state.selectedComponentIds?.size ?? 0;
    const totalAssigned = state.assignments.size;
    const modeText = state.editMode === 'erase'
      ? 'Erase mode: drag across connected strokes to split them.'
      : state.editMode === 'draw'
        ? 'Draw mode: restore missing stroke pixels.'
        : 'Select mode: click groups, then apply them to the active target.';
    selectionSummary.textContent = `${state.extracted.components.length} groups detected. ${selectedCount} groups selected. ${totalAssigned} groups assigned overall. ${modeText}`;
  }

  _renderManualTargetList(targetList, state, rerender) {
    targetList.innerHTML = '';
    if (!state.targets.length) {
      targetList.innerHTML = '<div class="template-target-empty">Enter one Hangul syllable to create split targets.</div>';
      return;
    }

    state.targets.forEach((target, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const stored = this._isTargetStored(target);
      button.className = `tool-btn template-target-btn ${state.activeTargetIndex === index ? 'active' : ''} ${stored ? 'completed' : ''}`;
      const count = [...state.assignments.values()].filter((targetIndex) => targetIndex === index).length;
      const status = stored ? '완료' : '미완료';
      button.textContent = count > 0 ? `${target.label} (${count}) · ${status}` : `${target.label} · ${status}`;
      button.addEventListener('click', () => {
        if (state.selectedComponentIds?.size) {
          this._assignSelectedComponentsToTarget(state, index);
        } else {
          state.activeTargetIndex = index;
        }
        rerender?.();
      });
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (state.selectedComponentIds?.size) {
          this._assignSelectedComponentsToTarget(state, index);
          rerender?.();
        }
      });
      targetList.appendChild(button);
    });
  }

  _isTargetStored(target) {
    const selection = this._getSelectionForTarget(target.categoryId, target.jamo);
    if (!selection) return false;
    return this._getStorageKeysForSelection(selection).some((key) => this.jamoLib[key]?.length);
  }

  _toggleManualComponentSelection(state, componentId, additive = false) {
    if (!additive) {
      if (state.selectedComponentIds.has(componentId) && state.selectedComponentIds.size === 1) {
        state.selectedComponentIds.clear();
        return;
      }
      state.selectedComponentIds = new Set([componentId]);
      return;
    }

    if (state.selectedComponentIds.has(componentId)) {
      state.selectedComponentIds.delete(componentId);
    } else {
      state.selectedComponentIds.add(componentId);
    }
  }

  _assignSelectedComponentsToTarget(state, targetIndex) {
    if (!state.selectedComponentIds?.size) return;
    state.activeTargetIndex = targetIndex;
    state.selectedComponentIds.forEach((componentId) => {
      state.assignments.set(componentId, targetIndex);
    });
    state.selectedComponentIds = new Set();
    this._hideManualContextMenu(state);
  }

  _handleManualCanvasContextMenu(event, canvas, state, rerender) {
    if (!state.extracted) return;
    event.preventDefault();
    const componentId = this._getManualComponentAtPoint(event, canvas, state.extracted);
    if (componentId !== null && !state.selectedComponentIds.has(componentId)) {
      this._toggleManualComponentSelection(state, componentId, event.shiftKey);
      rerender?.();
    }
    if (!state.selectedComponentIds?.size || !state.targets.length) return;
    this._showManualContextMenu(event.clientX, event.clientY, state, rerender);
  }

  _showManualContextMenu(x, y, state, rerender) {
    this._hideManualContextMenu(state);
    const menu = document.createElement('div');
    menu.className = 'template-context-menu';
    state.targets.forEach((target, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'template-context-menu-item';
      button.textContent = target.label;
      button.addEventListener('click', () => {
        this._assignSelectedComponentsToTarget(state, index);
        rerender?.();
      });
      menu.appendChild(button);
    });
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);
    state.contextMenuEl = menu;
  }

  _hideManualContextMenu(state) {
    if (!state?.contextMenuEl) return;
    state.contextMenuEl.remove();
    state.contextMenuEl = null;
  }

  _getManualComponentAtPoint(event, canvas, extracted) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));

    const hit = extracted.components.find((component) => (
      x >= component.bounds.minX &&
      x <= component.bounds.maxX &&
      y >= component.bounds.minY &&
      y <= component.bounds.maxY
    ));

    return hit ? hit.id : null;
  }

  _applyManualSplitAssignments(state) {
    if (!state.extracted || !state.targets.length) {
      return { applied: 0, reason: 'No glyph image or target list is loaded.' };
    }

    if (state.selectedComponentIds?.size && state.activeTargetIndex >= 0) {
      this._assignSelectedComponentsToTarget(state, state.activeTargetIndex);
    }

    let applied = 0;
    const appliedTargets = [];
    const skipped = [];
    state.targets.forEach((target, index) => {
      const componentIds = [...state.assignments.entries()]
        .filter(([, targetIndex]) => targetIndex === index)
        .map(([componentId]) => componentId);
      if (!componentIds.length) {
        skipped.push(`${target.label}: no stroke group assigned`);
        return;
      }

      const selection = this._getSelectionForTarget(target.categoryId, target.jamo);
      if (!selection) {
        skipped.push(`${target.label}: no matching target slot`);
        return;
      }

      let commands = selectedComponentsToPositionedCommands(state.extracted, componentIds);
      let strokes = selectedComponentsToStrokes(state.extracted, componentIds, selection.guide?.targetRegion);
      if (!commands.length) {
        commands = selectedComponentsToCommands(state.extracted, componentIds);
        strokes = selectedComponentsToStrokes(state.extracted, componentIds);
      }
      if (!commands.length) {
        skipped.push(`${target.label}: selected stroke could not be converted`);
        return;
      }

      this._storeImportedSelection(selection, commands, strokes);
      applied += 1;
      appliedTargets.push(target);
    });

    if (applied > 0) {
      if (state.char && state.imageSrc) {
        this.syllableImports[state.char] = {
          imageSrc: state.imageSrc,
          sourceChar: state.char,
        };
      }
      const fullLib = deriveAll(this.jamoLib);
      this.previewPanel.updateJamoLib(fullLib);
      if (this.browserPanel) this.browserPanel.updateJamoLib(fullLib);
      this.previewPanel.updateSyllableImports(this.syllableImports);
      if (this.browserPanel) this.browserPanel.updateSyllableImports(this.syllableImports);
      this._persistState();
      this._checkGenerateReady();
      this._renderPendingPartsPanel();
      const affectedChars = this._getAffectedCharsForTargets(appliedTargets);
      if (affectedChars[0]) {
        this.browserPanel?.focusBrowserChar(affectedChars[0]);
      }
      showToast(`Applied ${applied} part${applied === 1 ? '' : 's'} to matching glyph cards.`, 'success', 2600);
    }

    return {
      applied,
      reason: skipped.find((item) => !item.includes('no stroke group assigned')) || skipped[0] || '',
    };
  }

  _canApplyManualSplit(state) {
    if (!state.extracted || !state.targets.length) return false;
    if (state.selectedComponentIds?.size) return true;
    return state.targets.some((_, index) => [...state.assignments.values()].includes(index));
  }

  _getAffectedCharsForTargets(targets) {
    const chars = [];
    const push = (cho, jung, jong = 0) => {
      const char = compose(cho, jung, jong);
      if (!chars.includes(char)) chars.push(char);
    };

    targets.forEach((target) => {
      const category = CATEGORIES.find((item) => item.id === target.categoryId);
      if (!category) return;

      if (target.categoryId.startsWith('cho')) {
        const cho = CHO.findIndex((item) => item === target.jamo);
        if (cho < 0) return;
        const needsFinal = target.categoryId.endsWith('_wf');
        const wantsVertical = target.categoryId.includes('_v');
        for (let jung = 0; jung < JUNG.length && chars.length < 18; jung++) {
          const vowelCategory = getVowelCategory(jung);
          const matchesVowel = wantsVertical
            ? vowelCategory === 'vertical'
            : vowelCategory !== 'vertical';
          if (!matchesVowel) continue;
          if (needsFinal) {
            push(cho, jung, 1);
            push(cho, jung, 4);
          } else {
            push(cho, jung, 0);
          }
        }
        return;
      }

      if (target.categoryId.startsWith('jung')) {
        const jung = JUNG.findIndex((item) => item === target.jamo);
        if (jung < 0) return;
        const needsFinal = target.categoryId === 'jung_wb';
        for (let cho = 0; cho < CHO.length && chars.length < 18; cho++) {
          push(cho, jung, needsFinal ? 1 : 0);
        }
        return;
      }

      if (target.categoryId.startsWith('jong')) {
        const jong = JONG.findIndex((item) => item === target.jamo);
        if (jong <= 0) return;
        const wantsHorizontal = target.categoryId.endsWith('_h');
        for (let cho = 0; cho < CHO.length && chars.length < 18; cho++) {
          for (let jung = 0; jung < JUNG.length && chars.length < 18; jung++) {
            const isHorizontal = getVowelCategory(jung) === 'horizontal';
            if (wantsHorizontal !== isHorizontal) continue;
            push(cho, jung, jong);
          }
        }
      }
    });

    return chars;
  }

  _storePendingSelection(selection, commands, strokes, sourceChar = '') {
    const key = `${selection.categoryId}_${selection.jamo}`;
    this.pendingParts[key] = {
      selection,
      commands,
      strokes,
      sourceChar,
      savedAt: Date.now(),
    };
  }

  _applyPendingParts() {
    const parts = Object.values(this.pendingParts);
    if (parts.length === 0) {
      showToast('No saved parts to apply.', 'warning', 2200);
      return;
    }

    const appliedTargets = [];
    parts.forEach((part) => {
      this._storeImportedSelection(part.selection, part.commands, part.strokes);
      appliedTargets.push({
        categoryId: part.selection.categoryId,
        jamo: part.selection.jamo,
      });
    });

    this.pendingParts = {};
    const fullLib = deriveAll(this.jamoLib);
    this.previewPanel.updateJamoLib(fullLib);
    if (this.browserPanel) this.browserPanel.updateJamoLib(fullLib);
    this.previewPanel.updateSyllableImports(this.syllableImports);
    if (this.browserPanel) this.browserPanel.updateSyllableImports(this.syllableImports);
    this._persistState();
    this._checkGenerateReady();
    this._renderPendingPartsPanel();

    const affectedChars = this._getAffectedCharsForTargets(appliedTargets);
    if (affectedChars[0]) {
      this.browserPanel?.focusBrowserChar(affectedChars[0]);
    }
    showToast(`Applied ${parts.length} saved part${parts.length === 1 ? '' : 's'} to glyphs.`, 'success', 3000);
  }

  _clearPendingPart(key) {
    delete this.pendingParts[key];
    this._renderPendingPartsPanel();
  }

  _clearAllPendingParts() {
    this.pendingParts = {};
    this._renderPendingPartsPanel();
  }

  _getSelectionForTarget(categoryId, jamo) {
    const category = CATEGORIES.find((item) => item.id === categoryId);
    if (!category) return null;
    const itemIndex = category.items.findIndex((item) => item === jamo);
    if (itemIndex < 0) return null;
    const example = category.examples[itemIndex];
    return {
      categoryId,
      jamo,
      example,
      guide: buildGuideMeta(categoryId, jamo, example),
    };
  }

  _storeImportedSelection(selection, commands, strokes) {
    const storageKeys = this._getContextStorageKeysForSelection(selection);
    const broadKeys = this._getBroadStorageKeysForSelection(selection);
    broadKeys.forEach((storageKey) => {
      if (!storageKeys.includes(storageKey)) {
        delete this.jamoLib[storageKey];
      }
    });
    storageKeys.forEach((storageKey) => {
      this.jamoLib[storageKey] = commands;
    });
    this.jamoDrafts[`${selection.categoryId}_${selection.jamo}`] = {
      strokes,
      importedStrokes: strokes,
    };
    this.jamoGrid.markCompleted(selection.categoryId, selection.jamo);
  }

  _showPreviewModal() {
    const fullLib = deriveAll(this.jamoLib);
    const defaultPreviewText = '가나다라마바사\n아자차카타파하\n손글씨 폰트 테스트';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal preview-modal">
        <div class="modal-header">
          <h2>Preview</h2>
          <button class="modal-close" id="closePreviewModal">x</button>
        </div>
        <div class="modal-body">
          <textarea class="preview-textarea" id="previewText" placeholder="미리보기 문장을 입력하세요.">${defaultPreviewText}</textarea>
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

        const info = decomposeChar(char);
        if (!info) continue;

        const commands = composeSyllableFromLib(info.cho, info.jung, info.jong, jamoLib);
        drawGlyphOnCtx(ctx, commands, x, y, cellSize);
      }
    }

    container.appendChild(canvas);
  }







  _handleResize() {
    if (this.drawingCanvas) this.drawingCanvas.resize();
    if (this.previewPanel) this.previewPanel.resize();
    if (this.browserPanel) this.browserPanel.resize();
  }

  _persistState() {
    saveState({
      jamoLib: this.jamoLib,
      jamoDrafts: this.jamoDrafts,
      guideOverrides: this.guideOverrides,
      syllableImports: this.syllableImports,
    });
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

    this._persistState();
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
    this._persistState();
    this.drawingCanvas.resetGuideTargetRegion(false);
    showToast('Target box reset to the default guide.', 'success', 1800);
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

  _getContextStorageKeysForSelection(selection) {
    // In the 237-jamo architecture, the storage key is simply ${categoryId}_${jamo}
    // (e.g. cho_v_ㄱ, cho_v_wf_ㄱ, jung_nb_ㅏ, jong_h_ㄱ).
    // No legacy context filtering needed.
    return this._getStorageKeysForSelection(selection);
  }

  _getBroadStorageKeysForSelection(selection) {
    // In the 237-jamo architecture, the storage key is always the same
    // as the context key. No broader fallback keys needed.
    if (!selection?.categoryId || !selection?.jamo) return [];
    return [`${selection.categoryId}_${selection.jamo}`];
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
    showToast(`Saved. ${uniqueMessages.join(' / ')}`, 'warning', 4200);
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


}

// App bootstrap
const fonttoApp = new FonttoApp();
