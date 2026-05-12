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
import {
  buildTemplateSvg,
  getTemplatePages,
  getTemplateSlots,
  getTemplateMetrics,
  getTemplateCellRect,
  getTemplateImportRect,
  rasterRectToCommands,
  rasterRectToCleanImageData,
  extractRasterComponents,
  selectedComponentsToCommands,
  selectedComponentsToPositionedCommands,
  selectedComponentsToStrokes,
} from './core/template-import.js';
import { renderPdfFileToCanvases } from './core/pdf-renderer.js';
import { buildTemplatePdfBytes } from './core/template-pdf.js';
import { CHO, JUNG, JONG, compose, getVowelCategory, getJongInfo } from './core/hangul.js';
import { loadState, saveState, clearState } from './core/storage.js';
import { decomposeChar, composeSyllableFromLib, composeCharFromLib, drawGlyphOnCtx, drawPathCommands, createGlyphCanvas, createPartPreviewCanvas, loadSyllableOverrides, saveSyllableOverrides, loadDeletedSyllables, saveDeletedSyllables } from './core/glyph-utils.js';
import { showToast } from './ui/toast.js';
import { showPreviewModal } from './ui/modals/preview-modal.js';
import { showGenerateModal } from './ui/modals/generate-modal.js';
import { showReviewModal, getDefaultReviewState } from './ui/modals/review-modal.js';
import { showSyllableSplitModal } from './ui/modals/syllable-split-modal.js';
import { showQualityConfirmModal } from './ui/modals/quality-confirm-modal.js';
import { showSyllableEditorModal } from './ui/modals/syllable-editor-modal.js';

const RECENT_REVIEW_LIMIT = 8;
const HISTORY_LIMIT = 40;

class FonttoApp {
  jamoDrafts = {};
  guideOverrides = {};
  syllableImports = {};
  templateImportedSlots = [];
  downloadAccess = {
    unlocked: false,
    fontName: '',
    unlockedAt: '',
  };

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
    this.templateBrowserPanel = null;
    this.editorMode = 'draw';
    this.undoStack = [];
    this.redoStack = [];

    this._init();
  }

  _init() {
    const saved = loadState();
    this.jamoLib = saved.jamoLib;
    this.jamoDrafts = saved.jamoDrafts;
    this.guideOverrides = saved.guideOverrides;
    this.syllableImports = saved.syllableImports;
    this.templateImportedSlots = saved.templateImportedSlots || [];
    this.pendingParts = saved.pendingParts || {};
    this.downloadAccess = saved.downloadAccess || {
      unlocked: false,
      fontName: '',
      unlockedAt: '',
    };
    this._showLanding();
    window.addEventListener('resize', () => this._handleResize());
    window.addEventListener('pagehide', () => this._persistState());
    window.addEventListener('beforeunload', () => this._persistState());
  }

  // Step 1: Landing page
  _showLanding() {
    this.currentStep = 'landing';
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="landing">
        <div class="landing-bg"></div>
        <div class="landing-content">
          <div class="landing-logo">
            <span class="logo-icon" aria-hidden="true">
              <svg viewBox="0 0 64 64" role="presentation" focusable="false">
                <defs>
                  <linearGradient id="landingLogoGlyph" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#7c5cfc"></stop>
                    <stop offset="100%" stop-color="#00d4aa"></stop>
                  </linearGradient>
                </defs>
                <rect x="8" y="8" width="48" height="48" rx="14" fill="rgba(255,255,255,0.04)" stroke="url(#landingLogoGlyph)" stroke-width="3"></rect>
                <path d="M24 18H43V23H30V29H41V34H30V46H24V18Z" fill="url(#landingLogoGlyph)"></path>
              </svg>
            </span>
            <h1 class="logo-text">Fontto</h1>
          </div>
          <p class="landing-subtitle">손글씨로 나만의 한글 폰트를 만들어보세요.</p>
          <div class="landing-features">
            <div class="feature-card">
              <span class="feature-icon">${REQUIRED_JAMO_COUNT}</span>
              <h3>필수 자모 ${REQUIRED_JAMO_COUNT}개 그리기</h3>
              <p>같은 자모도 모음 방향과 받침 유무에 따라 모양이 달라집니다. 맥락별로 한 번씩만 그리면 나머지 글자는 자동 생성됩니다.</p>
            </div>
            <div class="feature-card">
              <span class="feature-icon">AUTO</span>
              <h3>글자 자동 조합</h3>
              <p>초성, 중성, 종성의 구조에 맞춰 조합해서 완성형 글자를 만들어줍니다.</p>
            </div>
            <div class="feature-card">
              <span class="feature-icon">TTF</span>
              <h3>TTF 다운로드</h3>
              <p>생성된 폰트 결과를 검토하고 TTF 파일로 내보내세요.</p>
            </div>
          </div>
          <div class="landing-start-actions">
          <button class="start-btn" id="startDrawBtn">
            <span>시작하기</span>
            <span class="btn-arrow">></span>
          </button>
            <button class="start-btn secondary" id="startTemplateBtn">
              <span>템플릿으로 시작</span>
              <span class="btn-arrow">></span>
            </button>
          </div>
          <p class="landing-note">모든 작업은 브라우저 안에서만 실행됩니다. 서버 업로드가 필요 없습니다.</p>
        </div>
      </div>
    `;

    document.getElementById('startDrawBtn').addEventListener('click', () => {
      this._showEditor('draw');
    });
    document.getElementById('startTemplateBtn').addEventListener('click', () => {
      this._showEditor('template');
    });
  }
  _showEditor(initialMode = 'draw') {
    this.currentStep = 'editor';
    this.editorMode = initialMode;
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="editor-layout draw-mode" id="editorLayout">
        <header class="editor-header">
          <div class="header-left">
            <button class="header-logo" id="headerHomeBtn" type="button">Fontto</button>
            <div class="mode-switch" role="tablist" aria-label="입력 방식">
              <button class="mode-switch-btn" id="drawModeBtn" type="button">직접 그리기</button>
              <button class="mode-switch-btn" id="templateModeBtn" type="button">템플릿</button>
            </div>
          </div>
          <div class="header-center">
            <span class="current-jamo-label" id="currentJamoLabel">입력할 항목을 선택하세요.</span>
          </div>
          <div class="header-right">
            <button class="header-btn" id="undoActionBtn" disabled>이전 작업</button>
            <button class="header-btn" id="redoActionBtn" disabled>다시 실행</button>
            <button class="header-btn is-hidden" id="returnToReviewBtn">전체 검토로 돌아가기</button>
            <button class="header-btn" id="reviewBtn" disabled>전체 글자 검토</button>
            <button class="header-btn" id="previewBtn">미리보기</button>
            <button class="header-btn primary" id="generateBtn" disabled>폰트 생성</button>
          </div>
        </header>

        <aside class="editor-sidebar" id="jamoGridContainer"></aside>

        <main class="editor-canvas-area">
          <section class="pending-parts-panel" id="pendingPartsPanel"></section>
          <details class="manual-drawing-details">
            <summary class="template-legacy-summary">고급 직접 그리기</summary>
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

        <main class="template-page is-hidden" id="templatePage">
          <section class="template-page-header">
            <div>
              <h2>템플릿으로 가져오기</h2>
              <p>PNG 템플릿에 필요한 글자를 한 번에 쓰고 업로드한 뒤, 추출된 글자 카드에서 필요한 부분을 선택해 입력 카드에 적용하세요.</p>
            </div>
            <div class="template-actions">
              <button class="gen-btn" id="templatePageDownloadBtn">A4 PDF 템플릿 다운로드</button>
              <button class="gen-btn" id="templatePageDownloadPngBtn">A4 PNG 템플릿 다운로드</button>
              <label class="gen-btn template-upload-btn" for="templatePageFileInput">작성한 템플릿 업로드</label>
              <input type="file" id="templatePageFileInput" accept="image/*,.pdf,application/pdf" multiple class="template-file-input" />
            </div>
          </section>
          <div class="template-status" id="templatePageStatus"></div>
          <section class="template-import-review template-uploaded-panel" id="templatePageImportReview"></section>
          <section class="template-center-panel">
            <section class="pending-parts-panel" id="templatePendingPartsPanel"></section>
          </section>
          <aside class="template-browser-area" id="templateBrowserContainer"></aside>
        </main>
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
      onInvalidLocateChar: () => showToast('한글 음절 범위에 없는 글자입니다.', 'warning', 2600),
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
      onInvalidLocateChar: () => showToast('한글 음절 범위에 없는 글자입니다.', 'warning', 2600),
    });
    this.browserPanel.updateJamoLib(deriveAll(this.jamoLib));
    this.browserPanel.updateSyllableImports(this.syllableImports);

    const templateBrowserContainer = document.getElementById('templateBrowserContainer');
    this.templateBrowserPanel = new PreviewPanel(templateBrowserContainer, {
      showPreviewInput: false,
      showPreviewCanvas: false,
      showBrowser: true,
      onLocateChar: (char) => this._jumpToGlyphEdit(char),
      onEditImportedChar: (char) => showSyllableSplitModal(this, char),
      onOpenGlyph: (char, meta) => this._handleGlyphCardOpen(char, meta),
      onInvalidLocateChar: () => showToast('한글 음절 범위에 없는 글자입니다.', 'warning', 2600),
    });
    this.templateBrowserPanel.updateJamoLib(deriveAll(this.jamoLib));
    this.templateBrowserPanel.updateSyllableImports(this.syllableImports);

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
    document.getElementById('drawModeBtn').addEventListener('click', () => {
      this._setEditorMode('draw');
    });
    document.getElementById('headerHomeBtn').addEventListener('click', () => {
      this._showLanding();
    });
    document.getElementById('templateModeBtn').addEventListener('click', () => {
      this._setEditorMode('template');
    });
    document.getElementById('undoActionBtn').addEventListener('click', () => {
      this._undoAppAction();
    });
    document.getElementById('redoActionBtn').addEventListener('click', () => {
      this._redoAppAction();
    });
    document.getElementById('previewBtn').addEventListener('click', () => {
      showPreviewModal(this);
    });
    const headerRight = document.querySelector('.header-right');
    const generateBtn = document.getElementById('generateBtn');
    if (headerRight && generateBtn && !document.getElementById('resetEditorDataBtn')) {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'header-btn danger';
      resetBtn.id = 'resetEditorDataBtn';
      resetBtn.textContent = 'Reset';
      resetBtn.addEventListener('click', () => this._showResetAllDataConfirm());
      headerRight.insertBefore(resetBtn, generateBtn);
    }
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
    this._initTemplatePage();
    this.jamoGrid.goToNext();
    this._setEditorMode(this.editorMode);
    this._updateHistoryButtons();
  }

  _setEditorMode(mode = 'draw') {
    this.editorMode = mode === 'template' ? 'template' : 'draw';
    const layout = document.getElementById('editorLayout');
    const templatePage = document.getElementById('templatePage');
    const drawButton = document.getElementById('drawModeBtn');
    const templateButton = document.getElementById('templateModeBtn');
    const label = document.getElementById('currentJamoLabel');

    layout?.classList.toggle('draw-mode', this.editorMode === 'draw');
    layout?.classList.toggle('template-mode', this.editorMode === 'template');
    templatePage?.classList.toggle('is-hidden', this.editorMode !== 'template');
    drawButton?.classList.toggle('active', this.editorMode === 'draw');
    templateButton?.classList.toggle('active', this.editorMode === 'template');
    drawButton?.setAttribute('aria-selected', String(this.editorMode === 'draw'));
    templateButton?.setAttribute('aria-selected', String(this.editorMode === 'template'));

    if (label && this.editorMode === 'template') {
      label.textContent = '템플릿을 다운로드하고 작성한 이미지를 업로드하세요.';
    } else if (label && this.jamoGrid?.getCurrentSelection()) {
      const sel = this.jamoGrid.getCurrentSelection();
      const cat = CATEGORIES.find((c) => c.id === sel.categoryId);
      label.textContent = sel.guide?.label
        ? `${cat?.label || ''} - ${sel.guide.label} - "${sel.example}"`
        : `${cat?.label || ''} - "${sel.example}" - ${sel.jamo}`;
    }

    if (this.editorMode === 'draw') {
      requestAnimationFrame(() => {
        this.drawingCanvas?.resize();
        this.previewPanel?.resize?.();
        this.browserPanel?.resize?.();
        this.templateBrowserPanel?.resize?.();
      });
    } else {
      requestAnimationFrame(() => {
        this.browserPanel?.resize?.();
        this.templateBrowserPanel?.resize?.();
      });
    }
  }

  _initTemplatePage() {
    const page = document.getElementById('templatePage');
    if (!page) return;

    const slots = getTemplateSlots();
    const pages = getTemplatePages(slots);
    const statusEl = document.getElementById('templatePageStatus');
    const importReviewEl = document.getElementById('templatePageImportReview');
    if (statusEl) statusEl.textContent = `템플릿에는 원본 글자 칸 ${slots.length}개가 필요합니다. A4 ${pages.length}페이지로 나뉩니다.`;
    if (importReviewEl) {
      this._renderTemplateImportReview(importReviewEl, this.templateImportedSlots);
    }

    document.getElementById('templatePageDownloadBtn')?.addEventListener('click', async () => {
      await this._downloadTemplate(slots);
    });
    document.getElementById('templatePageDownloadPngBtn')?.addEventListener('click', async () => {
      await this._downloadTemplatePng(slots);
    });

    document.getElementById('templatePageFileInput')?.addEventListener('change', async (event) => {
      const files = [...(event.target.files ?? [])];
      if (!files.length || !statusEl) return;
      statusEl.textContent = '템플릿을 가져오는 중...';

      try {
        const summary = await this._importTemplateFiles(files, slots);
        statusEl.textContent = `A4 ${summary.pages}페이지에서 원본 글자 ${summary.imported}개를 가져왔습니다. 빈 칸 ${summary.skipped}개는 건너뛰었습니다.`;
        this._renderTemplateImportReview(importReviewEl, summary.importedSlots);
      } catch (error) {
        console.error('템플릿 가져오기 실패:', error);
        statusEl.textContent = `가져오기 실패: ${error.message}`;
      }
    });

  }

  _captureHistorySnapshot() {
    return JSON.parse(JSON.stringify({
      jamoLib: this.jamoLib,
      jamoDrafts: this.jamoDrafts,
      guideOverrides: this.guideOverrides,
      syllableImports: this.syllableImports,
      templateImportedSlots: this.templateImportedSlots,
      pendingParts: this.pendingParts,
      recentEditedKeys: this.recentEditedKeys,
    }));
  }

  _pushHistorySnapshot(snapshot, label) {
    if (!snapshot) return;
    const current = this._captureHistorySnapshot();
    if (JSON.stringify(snapshot) === JSON.stringify(current)) return;

    this.undoStack.push({ label, state: snapshot });
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this._updateHistoryButtons();
  }

  _recordHistory(label) {
    this.undoStack.push({ label, state: this._captureHistorySnapshot() });
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this._updateHistoryButtons();
  }

  _restoreHistorySnapshot(snapshot) {
    this.jamoLib = snapshot.jamoLib || {};
    this.jamoDrafts = snapshot.jamoDrafts || {};
    this.guideOverrides = snapshot.guideOverrides || {};
    this.syllableImports = snapshot.syllableImports || {};
    this.templateImportedSlots = snapshot.templateImportedSlots || [];
    this.pendingParts = snapshot.pendingParts || {};
    this.recentEditedKeys = snapshot.recentEditedKeys || [];

    this._persistState();
    this._refreshEditorState();
    this._updateHistoryButtons();
  }

  _undoAppAction() {
    if (!this.undoStack.length) return;
    const entry = this.undoStack.pop();
    this.redoStack.push({
      label: entry.label,
      state: this._captureHistorySnapshot(),
    });
    this._restoreHistorySnapshot(entry.state);
    showToast(`이전 작업으로 돌아갔습니다: ${entry.label}`, 'success', 1800);
  }

  _redoAppAction() {
    if (!this.redoStack.length) return;
    const entry = this.redoStack.pop();
    this.undoStack.push({
      label: entry.label,
      state: this._captureHistorySnapshot(),
    });
    this._restoreHistorySnapshot(entry.state);
    showToast(`작업을 다시 적용했습니다: ${entry.label}`, 'success', 1800);
  }

  _updateHistoryButtons() {
    const undoButton = document.getElementById('undoActionBtn');
    const redoButton = document.getElementById('redoActionBtn');
    if (undoButton) undoButton.disabled = this.undoStack.length === 0;
    if (redoButton) redoButton.disabled = this.redoStack.length === 0;
  }

  _refreshEditorState() {
    const fullLib = deriveAll(this.jamoLib);
    this.jamoGrid?.setCompletedMap(this._getCompletedMapFromLib());
    this.previewPanel?.updateJamoLib(fullLib);
    this.browserPanel?.updateJamoLib(fullLib);
    this.templateBrowserPanel?.updateJamoLib(fullLib);
    this.previewPanel?.updateSyllableImports(this.syllableImports);
    this.browserPanel?.updateSyllableImports(this.syllableImports);
    this.templateBrowserPanel?.updateSyllableImports(this.syllableImports);
    this._renderTemplateImportReview(
      document.getElementById('templatePageImportReview'),
      this.templateImportedSlots
    );
    this._renderPendingPartsPanel();
    this._checkGenerateReady();

    const selection = this.jamoGrid?.getCurrentSelection();
    if (selection && this.drawingCanvas) {
      const key = `${selection.categoryId}_${selection.jamo}`;
      const draft = this.jamoDrafts[key];
      if (draft?.strokes?.length) {
        this.drawingCanvas.loadStrokes(draft.strokes);
      } else if (draft?.importedStrokes?.length) {
        this.drawingCanvas.loadStrokes(draft.importedStrokes);
      } else {
        this.drawingCanvas.clear();
      }
      this.drawingCanvas.setGuide(this._applyGuideOverride(selection.categoryId, key, selection.guide));
      this._updateQualityPanel(this.drawingCanvas.getQualityReport());
    }
  }

  _renderPendingPartsPanel() {
    const panels = [
      document.getElementById('pendingPartsPanel'),
      document.getElementById('templatePendingPartsPanel'),
    ].filter(Boolean);
    if (!panels.length) return;

    const entries = Object.entries(this.pendingParts);
    panels.forEach((panel, index) => {
      const suffix = index === 0 ? 'Draw' : 'Template';
      const importedStrip = index === 0
        ? `
      <section class="pending-imported-strip">
        <div class="pending-imported-strip-header">
          <div>
            <h2>추출된 원본 글자</h2>
            <p>템플릿에서 가져온 글자를 가로로 훑어보고, 필요한 글자를 눌러 바로 분해하거나 적용할 수 있습니다.</p>
          </div>
          <span class="pending-imported-strip-count">${this.templateImportedSlots.length}개</span>
        </div>
        <div class="pending-imported-strip-scroller" id="pendingImportedStripScroller"></div>
      </section>
    `
        : '';
      panel.innerHTML = `
      ${importedStrip}
      <div class="pending-parts-header">
        <div>
          <h2>저장된 부분</h2>
          <p>가져온 글자에서 획을 추출하거나 직접 그린 부분을 여기에서 확인한 뒤, 한 번에 글자 카드에 적용하세요.</p>
        </div>
        <div class="pending-parts-actions">
          <button class="gen-btn" data-pending-action="apply" ${entries.length ? '' : 'disabled'}>저장된 부분 적용</button>
          <button class="tool-btn" data-pending-action="clear" ${entries.length ? '' : 'disabled'}>비우기</button>
        </div>
      </div>
      <div class="pending-parts-grid" id="pendingPartsGrid${suffix}"></div>
    `;

      if (index === 0) {
        this._renderPendingImportedStrip(
          panel.querySelector('#pendingImportedStripScroller'),
          this.templateImportedSlots
        );
      }

      panel.querySelector('[data-pending-action="apply"]')?.addEventListener('click', () => {
        this._applyPendingParts();
      });
      panel.querySelector('[data-pending-action="clear"]')?.addEventListener('click', () => {
        this._clearAllPendingParts();
      });

      const grid = panel.querySelector('.pending-parts-grid');
      if (!grid) return;
      if (!entries.length) {
        grid.innerHTML = '<div class="pending-parts-empty">아직 저장된 부분이 없습니다. 가져온 글자 카드에서 부분을 저장하거나 직접 그린 뒤 여기에 모아두세요.</div>';
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
        meta.textContent = `${key}${part.sourceChar ? ` / 원본 ${part.sourceChar}` : ''}`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'tool-btn pending-part-remove';
        remove.textContent = '삭제';
        remove.addEventListener('click', () => this._clearPendingPart(key));

        card.appendChild(canvas);
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(remove);
        grid.appendChild(card);
      });
    });
  }

  _renderPendingImportedStrip(container, importedSlots = []) {
    if (!container) return;

    if (!importedSlots.length) {
      container.innerHTML = '<div class="pending-imported-strip-empty">아직 템플릿에서 가져온 원본 글자가 없습니다.</div>';
      return;
    }

    container.innerHTML = '';
    container.onwheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      container.scrollLeft += event.deltaY;
    };

    importedSlots.forEach((slot, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pending-imported-card';

      const image = document.createElement('img');
      image.className = 'pending-imported-card-image';
      image.alt = `${slot.char} 원본`;
      image.src = slot.imageSrc;

      const title = document.createElement('span');
      title.className = 'pending-imported-card-title';
      title.textContent = slot.char;

      const subtitle = document.createElement('span');
      subtitle.className = 'pending-imported-card-subtitle';
      subtitle.textContent = slot.targets.map((target) => target.label).join(' / ');

      card.appendChild(image);
      card.appendChild(title);
      card.appendChild(subtitle);
      card.addEventListener('click', () => {
        showSyllableSplitModal(this, slot.char, {
          imageSrc: slot.imageSrc,
          targets: slot.targets,
          sequence: importedSlots,
          sequenceIndex: index,
        });
      });

      container.appendChild(card);
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
    showToast(`${char} 관련 항목으로 이동했습니다: ${primaryTarget.label}`, 'success', 2200);
  }

  _handleGlyphCardOpen(char, meta = {}) {
    if (meta.composed) {
      showSyllableEditorModal(this, char);
      return;
    }
    if (meta.imported || this.syllableImports?.[char]?.imageSrc) {
      showSyllableSplitModal(this, char);
      return;
    }
    showSyllableEditorModal(this, char);
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
      showToast('이 그림은 재사용 가능한 부분으로 변환할 수 없습니다.', 'warning', 2600);
      return false;
    }

    this._recordHistory('부분 저장');
    this._storePendingSelection(sel, commands, strokes, 'manual');
    this._renderPendingPartsPanel();

    if (qualityReport.warnings.length > 0) {
      this._showQualityToast(qualityReport.warnings);
    } else if (!options.advance) {
      showToast('부분을 저장된 부분 패널에 추가했습니다.', 'success', 2200);
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
    showToast('필수 자모가 모두 저장되었습니다. 이제 폰트를 생성할 수 있습니다.', 'success');
  }
  _showIncompleteToast() {
    const completedCount = this._getCompletedCount();
    const remaining = Math.max(REQUIRED_JAMO_COUNT - completedCount, 0);
    showToast(`검수하거나 내보내려면 필수 자모 ${remaining}개를 더 완성해야 합니다.`);
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
      pageLabelEl.textContent = '0 / 0 - 0자';
      gridEl.innerHTML = '<div class="review-empty">현재 필터와 일치하는 글자가 없습니다.</div>';
      this._renderReviewEmptyState(inspectorEl);
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

    const commands = composeCharFromLib(char, jamoLib);
    const editTargets = this._getEditTargetsForSyllable(info.cho, info.jung, info.jong);

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
        <h3 class="review-inspector-title">선택한 글자 없음</h3>
        <p class="review-inspector-subtitle">필터를 바꾸거나 검수 그리드에서 글자를 선택하세요.</p>
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
    const sequence = [CHO[choIdx], JUNG[jungIdx]];

    if (jongIdx > 0) {
      sequence.push(JONG[jongIdx]);
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
    const choJamo = CHO[choIdx];
    const jungJamo = JUNG[jungIdx];
    const jongInfo = getJongInfo(jongIdx);
    const choContext = `${vowelCategory === 'vertical' ? '세로모음' : vowelCategory === 'horizontal' ? '가로모음' : '복합모음'} · ${hasFinal ? '받침 있음' : '받침 없음'}`;
    const jungContext = hasFinal ? '받침 있음' : '받침 없음';
    const jongContext = vowelCategory === 'horizontal' ? '가로모음 뒤' : '세로/복합모음 뒤';

    targets.push({
      categoryId: this._getChoCategoryIdForContext(vowelCategory, hasFinal),
      jamo: choJamo,
      label: `초성 ${choJamo} 적용 (${choContext})`,
    });

    targets.push({
      categoryId: jongIdx > 0 ? 'jung_wb' : 'jung_nb',
      jamo: jungJamo,
      label: `중성 ${jungJamo} 적용 (${jungContext})`,
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

  _getChoCategoryIdForContext(vowelCategory, hasFinal) {
    if (vowelCategory === 'vertical') return hasFinal ? 'cho_v_wf' : 'cho_v';
    if (vowelCategory === 'horizontal') return hasFinal ? 'cho_h_wf' : 'cho_h';
    return hasFinal ? 'cho_m_wf' : 'cho_m';
  }

  _showTemplateModal() {
    const slots = getTemplateSlots();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal template-modal">
        <div class="modal-header">
          <h2>템플릿 가져오기</h2>
          <button class="modal-close" id="closeTemplateModal">x</button>
        </div>
        <div class="modal-body template-body">
          <p class="template-copy">템플릿에 필요한 원본 글자를 쓰고 업로드한 뒤, 추출된 카드를 열어 재사용할 획만 선택해 적용하세요.</p>
          <div class="template-actions">
          <button class="gen-btn" id="downloadTemplateBtn">A4 PDF 템플릿 다운로드</button>
          <button class="gen-btn" id="downloadTemplatePngBtn">A4 PNG 템플릿 다운로드</button>
          <label class="gen-btn template-upload-btn" for="templateFileInput">작성한 템플릿 업로드</label>
            <input type="file" id="templateFileInput" accept="image/*,.pdf,application/pdf" multiple class="template-file-input" />
          </div>
          <div class="template-status" id="templateStatus">템플릿에는 원본 글자 칸 ${slots.length}개가 필요합니다.</div>
          <div class="template-import-review" id="templateImportReview">
            <div class="template-target-empty">작성한 템플릿을 업로드하면 추출된 원본 글자를 여기에서 확인할 수 있습니다.</div>
          </div>
          <details class="template-manual-details">
            <summary class="template-legacy-summary">고급 단일 글자 분리</summary>
            <div class="template-manual">
              <div class="template-manual-header">
                <h3>글자 하나 분리하기</h3>
                <p>완성된 글자 하나에서 획 그룹을 직접 선택해 분리해야 할 때만 사용하세요.</p>
              </div>
              <div class="template-manual-controls">
                <input type="text" class="gen-input template-syllable-input" id="templateSyllableInput" maxlength="1" placeholder="한" />
                <label class="gen-btn template-upload-btn" for="templateSingleFileInput">글자 이미지 업로드</label>
                <input type="file" id="templateSingleFileInput" accept="image/*" class="template-file-input" />
              <button class="gen-btn" id="templateApplySelectionBtn" disabled>글자 카드에 적용</button>
              </div>
              <div class="template-status" id="templateManualStatus">한글 음절 한 글자와 그 글자만 포함된 이미지를 선택하세요.</div>
              <div class="template-manual-layout">
                <canvas class="template-manual-canvas" id="templateManualCanvas" width="520" height="520"></canvas>
                <div class="template-manual-sidebar">
                  <div class="template-target-list" id="templateTargetList"></div>
                  <div class="template-selection-summary" id="templateSelectionSummary">불러온 이미지가 없습니다.</div>
                </div>
              </div>
            </div>
          </details>
          <details class="template-legacy">
            <summary class="template-legacy-summary">템플릿 미리보기</summary>
            <div class="template-legacy-body">
              <div class="template-preview-wrap">
                <img alt="템플릿 미리보기" class="template-preview-image" id="templatePreviewImage" />
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
      lastPointerHit: null,
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
    document.getElementById('downloadTemplatePngBtn')?.addEventListener('click', async () => {
      await this._downloadTemplatePng(slots);
    });

    document.getElementById('templateFileInput').addEventListener('change', async (event) => {
      const [file] = event.target.files ?? [];
      if (!file) return;

      const statusEl = document.getElementById('templateStatus');
      statusEl.textContent = '템플릿을 가져오는 중...';

      try {
        const summary = await this._importTemplateFile(file, slots);
        statusEl.textContent = `원본 글자 ${summary.imported}개를 가져왔습니다. 빈 칸 ${summary.skipped}개는 건너뛰었습니다.`;
        this._renderTemplateImportReview(importReviewEl, summary.importedSlots, close);
      } catch (error) {
        console.error('템플릿 가져오기 실패:', error);
        statusEl.textContent = `가져오기 실패: ${error.message}`;
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
        ? '이미지를 업로드한 뒤 획 그룹을 클릭해 선택하고, 우클릭으로 적용 대상을 지정하세요.'
        : '가, 한 같은 한글 음절 한 글자를 입력하세요.';
      renderManual();
    });

    manualCanvas.addEventListener('click', (event) => {
      if (!manualState.extracted) return;
      const componentId = this._getManualComponentAtPoint(event, manualCanvas, manualState.extracted, manualState);
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
        manualStatus.textContent = '어떤 부분을 저장할지 알 수 있도록 글자를 먼저 입력하세요.';
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
        manualStatus.textContent = `획 그룹 ${extracted.components.length}개를 찾았습니다. 그룹을 선택한 뒤 우클릭으로 적용 대상을 지정하세요.`;
        renderManual();
      } catch (error) {
        manualStatus.textContent = `분리 실패: ${error.message}`;
      }
    });

    applyBtn.addEventListener('click', () => {
      const result = this._applyManualSplitAssignments(manualState);
      manualStatus.textContent = result.applied > 0
        ? `일치하는 글자 카드에 부분 ${result.applied}개를 적용했습니다.`
        : `적용된 부분이 없습니다: ${result.reason || '획 그룹과 적용 대상을 먼저 선택하세요.'}`;
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
          <h2>가져온 글자 편집</h2>
          <button class="modal-close" id="closeSyllableSplitModal">x</button>
        </div>
        <div class="modal-body template-body">
          <div class="template-manual">
            <div class="template-manual-header">
              <h3>글자 하나 분리하기</h3>
              <p>재사용할 부분을 선택한 뒤 우클릭으로 일치하는 초성, 중성, 종성 대상에 지정하세요.</p>
            </div>
            <div class="template-manual-controls">
              <input type="text" class="gen-input template-syllable-input" id="splitSyllableInput" maxlength="1" placeholder="한" value="${initialChar}" />
              <label class="gen-btn template-upload-btn" for="splitSingleFileInput">이미지 교체</label>
              <input type="file" id="splitSingleFileInput" accept="image/*" class="template-file-input" />
              <div class="template-edit-tools">
                <button type="button" class="tool-btn active" id="splitSelectModeBtn">선택</button>
                <button type="button" class="tool-btn" id="splitEraseModeBtn">지우기</button>
                <button type="button" class="tool-btn" id="splitDrawModeBtn">그리기</button>
                <button type="button" class="tool-btn" id="splitAutoAssignBtn">자동 지정</button>
                <label class="template-brush-control">브러시 <input type="range" id="splitBrushSizeInput" min="6" max="42" value="18" /></label>
              </div>
              <button class="gen-btn" id="splitApplySelectionBtn" disabled>글자 카드에 적용</button>
            </div>
            <div class="template-status" id="splitManualStatus">글자 이미지를 불러오거나 교체한 뒤, 각 부분의 적용 대상을 지정하세요.</div>
            <div class="template-manual-layout">
              <canvas class="template-manual-canvas" id="splitManualCanvas" width="520" height="520"></canvas>
              <div class="template-manual-sidebar">
                <div class="template-target-list" id="splitTargetList"></div>
                <div class="template-selection-summary" id="splitSelectionSummary">불러온 이미지가 없습니다.</div>
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
      lastPointerHit: null,
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
      manualStatus.textContent = `획 그룹 ${state.extracted.components.length}개를 찾았습니다. 그룹을 선택한 뒤 우클릭으로 적용 대상을 지정하세요.`;
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
        manualStatus.textContent = '이미지를 교체하거나 글자 보기에서 가져온 글자 카드를 선택하세요.';
        render();
      }
    });

    manualCanvas.addEventListener('click', (event) => {
      if (state.editMode !== 'select') return;
      if (!state.extracted) return;
      const componentId = this._getManualComponentAtPoint(event, manualCanvas, state.extracted, state);
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
      manualStatus.textContent = `그룹 ${result.assigned}개를 자동 지정했습니다. 그룹 ${result.needsReview}개는 확인이 필요합니다.`;
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
        manualStatus.textContent = '부분을 어디에 저장할지 알 수 있도록 글자를 먼저 입력하세요.';
        return;
      }
      const src = await this._readFileAsDataUrl(file);
      await loadImageIntoState(src);
    });

    applyBtn.addEventListener('click', () => {
      const result = this._applyManualSplitAssignments(state);
      manualStatus.textContent = result.applied > 0
        ? `일치하는 글자 카드에 부분 ${result.applied}개를 적용했습니다.`
        : `적용된 부분이 없습니다: ${result.reason || '획 그룹과 적용 대상을 먼저 선택하세요.'}`;
      render();
    });

    if (state.char && state.imageSrc && state.targets.length) {
      try {
        await loadImageIntoState(state.imageSrc);
      } catch (error) {
        manualStatus.textContent = `가져온 이미지를 불러오지 못했습니다: ${error.message}`;
      }
    } else {
      render();
    }
  }

  async _downloadTemplate(slots) {
    const pdfBytes = await buildTemplatePdfBytes(slots, (src) => this._readImageSource(src));
    const url = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fontto-template.pdf';
    link.click();
    URL.revokeObjectURL(url);
  }

  async _downloadTemplatePng(slots) {
    const pages = getTemplatePages(slots);
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const pageSlots = pages[pageIndex];
      const svg = buildTemplateSvg(pageSlots, pageIndex, pages.length);
      const metrics = getTemplateMetrics(pageSlots.length);
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
      link.download = `fontto-template-page-${String(pageIndex + 1).padStart(2, '0')}.png`;
      link.click();
      URL.revokeObjectURL(svgUrl);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  async _importTemplateFiles(files, slots) {
    const historySnapshot = this._captureHistorySnapshot();
    const sources = await this._expandTemplateUploadFiles(files);
    const pages = getTemplatePages(slots);
    const importedByChar = new Map();
    let imported = 0;
    let skipped = 0;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const source = sources[pageIndex];
      if (!source) {
        skipped += pages[pageIndex].length;
        continue;
      }
      const result = this._importTemplateSource(source, pages[pageIndex], pageIndex);
      skipped += result.skipped;
      result.importedSlots.forEach((slot) => {
        if (importedByChar.has(slot.char)) return;
        importedByChar.set(slot.char, slot);
        imported += 1;
      });
    }

    const importedSlots = [...importedByChar.values()];
    this.templateImportedSlots = importedSlots;
    this._renderPendingPartsPanel();
    this._persistState();
    this._pushHistorySnapshot(historySnapshot, '템플릿 원본 저장');
    showToast(`템플릿 가져오기 완료: 원본 글자 ${imported}개`, imported > 0 ? 'success' : 'warning', 3200);

    return { imported, skipped, importedSlots, pages: sources.length };
  }

  async _expandTemplateUploadFiles(files) {
    const sources = [];
    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        sources.push(...await renderPdfFileToCanvases(file));
      } else {
        sources.push(await this._readImageFile(file));
      }
    }
    return sources;
  }

  _importTemplateSource(source, pageSlots, pageIndex) {
    const metrics = getTemplateMetrics(pageSlots.length);
    this._validateTemplateImage(source, metrics);
    const canvas = document.createElement('canvas');
    canvas.width = metrics.width;
    canvas.height = metrics.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, metrics.width, metrics.height);
    ctx.drawImage(source, 0, 0, metrics.width, metrics.height);

    let skipped = 0;
    const importedSlots = [];

    pageSlots.forEach((slot, index) => {
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

      importedSlots.push({
        char: slot.example,
        sourceJamo: slot.jamo,
        categoryId: slot.categoryId,
        categoryLabel: slot.categoryLabel,
        imageSrc,
        pageIndex,
        targets: this._getTargetsForManualSplit(slot.example),
      });
    });

    return { skipped, importedSlots };
  }

  _renderTemplateImportReview(container, importedSlots, closeModal) {
    if (!container) return;

    if (!importedSlots?.length) {
      container.innerHTML = '<div class="template-target-empty">업로드한 템플릿에서 추출된 원본 글자가 없습니다.</div>';
      return;
    }

    container.innerHTML = `
      <div class="template-import-review-header">
        <h3>추출된 원본 글자</h3>
        <p>카드를 클릭해 글자를 분리한 뒤, 선택한 획을 우클릭해 필요한 부분을 일치하는 자모 칸에 적용하세요.</p>
      </div>
      <div class="template-import-review-grid"></div>
    `;

    const grid = container.querySelector('.template-import-review-grid');
    importedSlots.forEach((slot, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-import-card';
      const image = document.createElement('img');
      image.className = 'template-import-card-image';
      image.alt = `${slot.char} 원본`;
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
          sequence: importedSlots,
          sequenceIndex: index,
        });
        closeModal?.();
      });

      grid.appendChild(card);
    });
  }

  _readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('템플릿 파일을 읽지 못했습니다.'));
      reader.onload = () => {
        this._readImageSource(reader.result).then(resolve).catch(reject);
      };
      reader.readAsDataURL(file);
    });
  }

  _readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  _readImageSource(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('지원하지 않는 이미지 파일입니다.'));
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
      throw new Error('이 이미지는 Fontto 템플릿 형식과 맞지 않습니다. 브라우저 스크린샷이 아니라 다운로드한 템플릿 PNG를 업로드하세요.');
    }

    if (image.width < metrics.width * 0.65 || image.height < metrics.height * 0.65) {
      throw new Error('템플릿 이미지가 너무 작습니다. 더 높은 해상도로 내보내거나 스캔하세요.');
    }
  }

  _getTargetsForManualSplit(char) {
    const info = decomposeChar(char);
    if (!info) {
      const asciiTarget = this._getAsciiEditTarget(char);
      return asciiTarget ? [asciiTarget] : [];
    }
    return this._getEditTargetsForSyllable(info.cho, info.jung, info.jong);
  }

  _getAsciiEditTarget(char) {
    if (!char || char.length !== 1) return null;

    let categoryId = '';
    if (/^[A-Z]$/.test(char)) {
      categoryId = 'ascii_upper';
    } else if (/^[a-z]$/.test(char)) {
      categoryId = 'ascii_lower';
    } else if (/^[0-9]$/.test(char)) {
      categoryId = 'ascii_digit';
    } else {
      const asciiSymbols = new Set(['.', ',', '!', '?', ':', ';', "'", '"', '(', ')', '[', ']', '-', '/', '@', '#', '&', '*']);
      if (asciiSymbols.has(char)) {
        categoryId = 'ascii_symbol';
      }
    }

    if (!categoryId) return null;

    return {
      categoryId,
      jamo: char,
      label: char,
    };
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
      throw new Error('업로드한 이미지에서 획 그룹을 찾지 못했습니다.');
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

  _moveManualSelectedComponents(state, dx, dy) {
    if (!state?.editImageData || !state?.extracted || !state.selectedComponentIds?.size) return false;
    const width = state.editImageData.width;
    const height = state.editImageData.height;
    if (!width || !height) return false;

    const oldComponents = state.extracted.components.map((component) => ({
      id: component.id,
      pixels: [...component.pixels],
      bounds: { ...component.bounds },
      centerX: component.bounds.minX + component.bounds.w / 2,
      centerY: component.bounds.minY + component.bounds.h / 2,
      assignedTarget: state.assignments.get(component.id),
      selected: state.selectedComponentIds.has(component.id),
    }));
    const selectedIds = new Set([...state.selectedComponentIds]);
    const data = state.editImageData.data;
    const movedPixels = new Set();

    oldComponents.forEach((component) => {
      if (!selectedIds.has(component.id)) return;
      component.pixels.forEach((pixelIndex) => {
        const idx = pixelIndex * 4;
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;

        const px = pixelIndex % width;
        const py = Math.floor(pixelIndex / width);
        const nextX = Math.max(0, Math.min(width - 1, px + dx));
        const nextY = Math.max(0, Math.min(height - 1, py + dy));
        movedPixels.add((nextY * width) + nextX);
      });
    });

    movedPixels.forEach((pixelIndex) => {
      const idx = pixelIndex * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    });

    const extracted = extractRasterComponents(state.editImageData);
    state.extracted = extracted;
    state.lastPointerHit = null;

    const available = [...extracted.components].map((component) => ({
      component,
      centerX: component.bounds.minX + component.bounds.w / 2,
      centerY: component.bounds.minY + component.bounds.h / 2,
      taken: false,
    }));
    const nextAssignments = new Map();
    const nextSelected = new Set();
    const oldOrdered = [...oldComponents].sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      return a.id - b.id;
    });

    oldOrdered.forEach((oldComponent) => {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      available.forEach((candidate) => {
        if (candidate.taken) return;
        const distance = Math.abs(candidate.centerX - (oldComponent.centerX + (oldComponent.selected ? dx : 0)))
          + Math.abs(candidate.centerY - (oldComponent.centerY + (oldComponent.selected ? dy : 0)));
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      });

      if (!best) return;
      best.taken = true;
      if (oldComponent.assignedTarget !== undefined) {
        nextAssignments.set(best.component.id, oldComponent.assignedTarget);
      }
      if (oldComponent.selected) {
        nextSelected.add(best.component.id);
      }
    });

    state.assignments = nextAssignments;
    state.selectedComponentIds = nextSelected;
    return true;
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

  _renderManualSplitState(canvas, targetList, selectionSummary, state, rerender, componentList = null) {
    this._renderManualTargetList(targetList, state, rerender);
    this._renderManualComponentList(componentList, state, rerender);
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

    this._drawManualSelectionBounds(ctx, state);

    const selectedCount = state.selectedComponentIds?.size ?? 0;
    const totalAssigned = state.assignments.size;
    const modeText = state.editMode === 'erase'
      ? '지우기 모드: 연결된 획 위를 드래그해 분리하세요.'
      : state.editMode === 'draw'
        ? '그리기 모드: 누락된 획 픽셀을 복원하세요.'
        : '선택 모드: 그룹을 클릭한 뒤 현재 대상에 적용하세요.';
    selectionSummary.textContent = `획 그룹 ${state.extracted.components.length}개를 찾았습니다. ${selectedCount}개 선택됨, 전체 ${totalAssigned}개 지정됨. ${modeText}`;
  }

  _renderManualTargetList(targetList, state, rerender) {
    targetList.innerHTML = '';
    if (!state.targets.length) {
      targetList.innerHTML = '<div class="template-target-empty">분리 대상을 만들려면 한글 음절 한 글자를 입력하세요.</div>';
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

  _renderManualComponentList(componentList, state, rerender) {
    if (!componentList) return;

    componentList.innerHTML = '';
    if (!state.extracted?.components?.length) {
      componentList.innerHTML = '<div class="template-target-empty">겹친 획은 여기서 직접 선택할 수 있습니다.</div>';
      return;
    }

    const title = document.createElement('div');
    title.className = 'template-component-list-title';
    title.textContent = '획 그룹 선택';
    componentList.appendChild(title);

    const list = document.createElement('div');
    list.className = 'template-component-list-grid';
    const components = [...state.extracted.components].sort((a, b) => {
      const rowDiff = a.bounds.minY - b.bounds.minY;
      if (Math.abs(rowDiff) > 24) return rowDiff;
      return a.bounds.minX - b.bounds.minX;
    });

    components.forEach((component, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const targetIndex = state.assignments.get(component.id);
      const target = targetIndex !== undefined ? state.targets[targetIndex] : null;
      const isSelected = state.selectedComponentIds?.has(component.id);
      button.className = `tool-btn template-component-btn ${isSelected ? 'active' : ''} ${target ? 'completed' : ''}`;
      button.textContent = target
        ? `그룹 ${index + 1} -> ${target.jamo}`
        : `그룹 ${index + 1}`;
      button.title = `크기 ${component.bounds.w}x${component.bounds.h}`;
      button.addEventListener('click', (event) => {
        this._toggleManualComponentSelection(state, component.id, event.shiftKey);
        rerender?.();
      });
      list.appendChild(button);
    });

    componentList.appendChild(list);
  }

  _isTargetStored(target) {
    const selection = this._getSelectionForTarget(target.categoryId, target.jamo);
    if (!selection) return false;
    return this._getStorageKeysForSelection(selection).some((key) => this.jamoLib[key]?.length);
  }

  _drawManualSelectionBounds(ctx, state) {
    const bounds = this._getManualSelectedBounds(state);
    if (!bounds) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 184, 77, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(bounds.minX - 6, bounds.minY - 6, bounds.w + 12, bounds.h + 12);
    ctx.setLineDash([]);

    const handles = this._getManualTransformHandles(bounds);
    handles.forEach((handle) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = 'rgba(255, 184, 77, 1)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(handle.x - 5, handle.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  _getManualSelectedBounds(state) {
    const selected = state?.extracted?.components?.filter((component) => state.selectedComponentIds?.has(component.id));
    if (!selected?.length) return null;

    const bounds = selected.reduce((acc, component) => ({
      minX: Math.min(acc.minX, component.bounds.minX),
      minY: Math.min(acc.minY, component.bounds.minY),
      maxX: Math.max(acc.maxX, component.bounds.maxX),
      maxY: Math.max(acc.maxY, component.bounds.maxY),
    }), {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    });

    return {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      w: bounds.maxX - bounds.minX,
      h: bounds.maxY - bounds.minY,
    };
  }

  _getManualTransformHandles(bounds) {
    const padded = {
      minX: bounds.minX - 6,
      minY: bounds.minY - 6,
      maxX: bounds.maxX + 6,
      maxY: bounds.maxY + 6,
    };
    return [
      { type: 'nw', x: padded.minX, y: padded.minY },
      { type: 'ne', x: padded.maxX, y: padded.minY },
      { type: 'sw', x: padded.minX, y: padded.maxY },
      { type: 'se', x: padded.maxX, y: padded.maxY },
    ];
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

  _getManualCanvasPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  _beginManualTransformDrag(state, canvas, event) {
    if (!state?.selectedComponentIds?.size) return false;

    const point = this._getManualCanvasPoint(event, canvas);
    const bounds = this._getManualSelectedBounds(state);
    if (!bounds) return false;

    const handle = this._getManualTransformHandleAtPoint(point, bounds);
    const inside = point.x >= bounds.minX - 6
      && point.x <= bounds.maxX + 6
      && point.y >= bounds.minY - 6
      && point.y <= bounds.maxY + 6;
    const mode = handle || (inside ? 'move' : null);
    if (!mode) return false;

    event.preventDefault();
    state.transformDrag = {
      mode,
      startPoint: point,
      startBounds: { ...bounds },
      snapshot: this._captureManualTransformSnapshot(state),
      moved: false,
    };
    return true;
  }

  _updateManualTransformDrag(state, canvas, event) {
    if (!state?.transformDrag) return;
    const point = this._getManualCanvasPoint(event, canvas);
    const drag = state.transformDrag;
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    drag.moved = drag.moved || Math.abs(dx) > 1 || Math.abs(dy) > 1;

    if (drag.mode === 'move') {
      this._applyManualTransformSnapshot(state, drag.snapshot, {
        translateX: dx,
        translateY: dy,
        scaleX: 1,
        scaleY: 1,
        anchorX: drag.startBounds.minX + (drag.startBounds.maxX - drag.startBounds.minX) / 2,
        anchorY: drag.startBounds.minY + (drag.startBounds.maxY - drag.startBounds.minY) / 2,
      });
      return;
    }

    const startWidth = Math.max(drag.startBounds.maxX - drag.startBounds.minX + 1, 1);
    const startHeight = Math.max(drag.startBounds.maxY - drag.startBounds.minY + 1, 1);
    const signX = drag.mode.includes('w') ? -1 : 1;
    const signY = drag.mode.includes('n') ? -1 : 1;
    const scaleX = Math.max(0.2, (startWidth + dx * signX) / startWidth);
    const scaleY = Math.max(0.2, (startHeight + dy * signY) / startHeight);
    const anchorX = drag.mode.includes('w') ? drag.startBounds.maxX : drag.startBounds.minX;
    const anchorY = drag.mode.includes('n') ? drag.startBounds.maxY : drag.startBounds.minY;

    this._applyManualTransformSnapshot(state, drag.snapshot, {
      translateX: 0,
      translateY: 0,
      scaleX,
      scaleY,
      anchorX,
      anchorY,
    });
  }

  _endManualTransformDrag(state) {
    if (!state?.transformDrag) return;
    state.transformDrag = null;
    state.lastPointerHit = null;
  }

  _getManualTransformHandleAtPoint(point, bounds) {
    const threshold = 12;
    for (const handle of this._getManualTransformHandles(bounds)) {
      if (Math.abs(point.x - handle.x) <= threshold && Math.abs(point.y - handle.y) <= threshold) {
        return handle.type;
      }
    }
    return null;
  }

  _captureManualTransformSnapshot(state) {
    return {
      imageData: new ImageData(new Uint8ClampedArray(state.editImageData.data), state.editImageData.width, state.editImageData.height),
      components: state.extracted.components.map((component) => ({
        id: component.id,
        pixels: [...component.pixels],
        bounds: { ...component.bounds },
        centerX: component.bounds.minX + component.bounds.w / 2,
        centerY: component.bounds.minY + component.bounds.h / 2,
        assignedTarget: state.assignments.get(component.id),
        selected: state.selectedComponentIds.has(component.id),
      })),
    };
  }

  _applyManualTransformSnapshot(state, snapshot, transform) {
    const nextImageData = new ImageData(new Uint8ClampedArray(snapshot.imageData.data), snapshot.imageData.width, snapshot.imageData.height);
    const { width, height, data } = nextImageData;
    const movedPixels = new Set();

    snapshot.components.forEach((component) => {
      if (!component.selected) return;
      component.pixels.forEach((pixelIndex) => {
        const idx = pixelIndex * 4;
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;

        const px = pixelIndex % width;
        const py = Math.floor(pixelIndex / width);
        const scaledX = (px - transform.anchorX) * transform.scaleX + transform.anchorX + transform.translateX;
        const scaledY = (py - transform.anchorY) * transform.scaleY + transform.anchorY + transform.translateY;
        const nextX = Math.round(Math.max(0, Math.min(width - 1, scaledX)));
        const nextY = Math.round(Math.max(0, Math.min(height - 1, scaledY)));
        movedPixels.add((nextY * width) + nextX);
      });
    });

    movedPixels.forEach((pixelIndex) => {
      const idx = pixelIndex * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    });

    state.editImageData = nextImageData;
    this._restoreManualTransformedComponents(state, snapshot, transform);
  }

  _restoreManualTransformedComponents(state, snapshot, transform) {
    const extracted = extractRasterComponents(state.editImageData);
    state.extracted = extracted;

    const available = extracted.components.map((component) => ({
      component,
      centerX: component.bounds.minX + component.bounds.w / 2,
      centerY: component.bounds.minY + component.bounds.h / 2,
      taken: false,
    }));
    const nextAssignments = new Map();
    const nextSelected = new Set();
    const ordered = [...snapshot.components].sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      return a.id - b.id;
    });

    ordered.forEach((oldComponent) => {
      const expectedX = oldComponent.selected
        ? (oldComponent.centerX - transform.anchorX) * transform.scaleX + transform.anchorX + transform.translateX
        : oldComponent.centerX;
      const expectedY = oldComponent.selected
        ? (oldComponent.centerY - transform.anchorY) * transform.scaleY + transform.anchorY + transform.translateY
        : oldComponent.centerY;

      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      available.forEach((candidate) => {
        if (candidate.taken) return;
        const distance = Math.abs(candidate.centerX - expectedX) + Math.abs(candidate.centerY - expectedY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      });

      if (!best) return;
      best.taken = true;
      if (oldComponent.assignedTarget !== undefined) {
        nextAssignments.set(best.component.id, oldComponent.assignedTarget);
      }
      if (oldComponent.selected) {
        nextSelected.add(best.component.id);
      }
    });

    state.assignments = nextAssignments;
    state.selectedComponentIds = nextSelected;
  }

  _handleManualCanvasContextMenu(event, canvas, state, rerender) {
    if (!state.extracted) return;
    event.preventDefault();
    const componentId = this._getManualComponentAtPoint(event, canvas, state.extracted, state);
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

  _getManualComponentAtPoint(event, canvas, extracted, state = null) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));

    const hits = extracted.components
      .filter((component) => (
        x >= component.bounds.minX &&
        x <= component.bounds.maxX &&
        y >= component.bounds.minY &&
        y <= component.bounds.maxY
      ))
      .sort((a, b) => {
        const aArea = a.bounds.w * a.bounds.h;
        const bArea = b.bounds.w * b.bounds.h;
        if (aArea !== bArea) return aArea - bArea;

        const aCenterDistance = Math.abs(x - (a.bounds.minX + a.bounds.maxX) / 2) + Math.abs(y - (a.bounds.minY + a.bounds.maxY) / 2);
        const bCenterDistance = Math.abs(x - (b.bounds.minX + b.bounds.maxX) / 2) + Math.abs(y - (b.bounds.minY + b.bounds.maxY) / 2);
        return aCenterDistance - bCenterDistance;
      });

    if (!hits.length) {
      if (state) state.lastPointerHit = null;
      return null;
    }

    if (!state || hits.length === 1) {
      return hits[0].id;
    }

    const key = `${x}:${y}:${hits.map((component) => component.id).join(',')}`;
    const nextIndex = state.lastPointerHit?.key === key
      ? (state.lastPointerHit.index + 1) % hits.length
      : 0;
    state.lastPointerHit = { key, index: nextIndex };
    return hits[nextIndex].id;
  }

  _applyManualSplitAssignments(state) {
    if (!state.extracted || !state.targets.length) {
      return { applied: 0, reason: '불러온 글자 이미지나 대상 목록이 없습니다.' };
    }

    const historySnapshot = this._captureHistorySnapshot();

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
        skipped.push(`${target.label}: 지정된 획 그룹 없음`);
        return;
      }

      const selection = this._getSelectionForTarget(target.categoryId, target.jamo);
      if (!selection) {
        skipped.push(`${target.label}: 일치하는 대상 칸 없음`);
        return;
      }

      let commands = selectedComponentsToPositionedCommands(state.extracted, componentIds);
      let strokes = selectedComponentsToStrokes(state.extracted, componentIds, selection.guide?.targetRegion);
      if (!commands.length) {
        commands = selectedComponentsToCommands(state.extracted, componentIds);
        strokes = selectedComponentsToStrokes(state.extracted, componentIds);
      }
      if (!commands.length) {
        skipped.push(`${target.label}: 선택한 획을 변환할 수 없음`);
        return;
      }

      this._storeImportedSelection(selection, commands, strokes);
      applied += 1;
      appliedTargets.push(target);
    });

    if (applied > 0) {
      if (state.char && state.imageSrc) {
        this._restoreDeletedSyllable(state.char);
        this.syllableImports[state.char] = {
          imageSrc: state.imageSrc,
          sourceChar: state.char,
        };
      }
      const fullLib = deriveAll(this.jamoLib);
      this.previewPanel.updateJamoLib(fullLib);
      if (this.browserPanel) this.browserPanel.updateJamoLib(fullLib);
      if (this.templateBrowserPanel) this.templateBrowserPanel.updateJamoLib(fullLib);
      this.previewPanel.updateSyllableImports(this.syllableImports);
      if (this.browserPanel) this.browserPanel.updateSyllableImports(this.syllableImports);
      if (this.templateBrowserPanel) this.templateBrowserPanel.updateSyllableImports(this.syllableImports);
      this._persistState();
      this._pushHistorySnapshot(historySnapshot, '글자 카드에 부분 적용');
      this._checkGenerateReady();
      this._renderPendingPartsPanel();
      this._focusAppliedGlyphCard(state.char, appliedTargets);
    }

    return {
      applied,
      reason: skipped.find((item) => !item.includes('지정된 획 그룹 없음')) || skipped[0] || '',
    };
  }

  _saveManualSplitAssignmentsToPending(state) {
    if (!state.extracted || !state.targets.length) {
      return { saved: 0, reason: '불러온 글자 이미지나 대상 목록이 없습니다.' };
    }

    const historySnapshot = this._captureHistorySnapshot();

    if (state.selectedComponentIds?.size && state.activeTargetIndex >= 0) {
      this._assignSelectedComponentsToTarget(state, state.activeTargetIndex);
    }

    let saved = 0;
    const skipped = [];
    state.targets.forEach((target, index) => {
      const componentIds = [...state.assignments.entries()]
        .filter(([, targetIndex]) => targetIndex === index)
        .map(([componentId]) => componentId);
      if (!componentIds.length) {
        skipped.push(`${target.label}: 지정된 획 그룹 없음`);
        return;
      }

      const selection = this._getSelectionForTarget(target.categoryId, target.jamo);
      if (!selection) {
        skipped.push(`${target.label}: 일치하는 대상 칸 없음`);
        return;
      }

      let commands = selectedComponentsToPositionedCommands(state.extracted, componentIds);
      let strokes = selectedComponentsToStrokes(state.extracted, componentIds, selection.guide?.targetRegion);
      if (!commands.length) {
        commands = selectedComponentsToCommands(state.extracted, componentIds);
        strokes = selectedComponentsToStrokes(state.extracted, componentIds);
      }
      if (!commands.length) {
        skipped.push(`${target.label}: 선택한 획을 변환할 수 없음`);
        return;
      }

      this._storePendingSelection(selection, commands, strokes, state.char || 'template');
      saved += 1;
    });

    if (saved > 0) {
      this._pushHistorySnapshot(historySnapshot, '부분 임시 저장');
      this._renderPendingPartsPanel();
    }

    return {
      saved,
      reason: skipped.find((item) => !item.includes('지정된 획 그룹 없음')) || skipped[0] || '',
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

  _restoreDeletedSyllablesForTargets(targets = []) {
    const chars = this._getAffectedCharsForTargets(targets);
    if (!chars.length) return;
    chars.forEach((char) => this._restoreDeletedSyllable(char));
  }

  _focusAppliedGlyphCard(preferredChar = '', targets = []) {
    const focusChar = decomposeChar(preferredChar)
      ? preferredChar
      : this._getAffectedCharsForTargets(targets)[0];
    if (!focusChar) return;

    this.browserPanel?.focusBrowserChar(focusChar);
    this.templateBrowserPanel?.focusBrowserChar(focusChar);
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
    this._persistState();
  }

  _applyPendingParts() {
    const parts = Object.values(this.pendingParts);
    if (parts.length === 0) {
      showToast('적용할 저장된 부분이 없습니다.', 'warning', 2200);
      return;
    }

    const historySnapshot = this._captureHistorySnapshot();
    const appliedTargets = [];
    parts.forEach((part) => {
      this._storeImportedSelection(part.selection, part.commands, part.strokes);
      appliedTargets.push({
        categoryId: part.selection.categoryId,
        jamo: part.selection.jamo,
      });
    });

    this._restoreDeletedSyllablesForTargets(appliedTargets);
    this.pendingParts = {};
    this._persistState();
    const fullLib = deriveAll(this.jamoLib);
    this.previewPanel.updateJamoLib(fullLib);
    if (this.browserPanel) this.browserPanel.updateJamoLib(fullLib);
    if (this.templateBrowserPanel) this.templateBrowserPanel.updateJamoLib(fullLib);
    this.previewPanel.updateSyllableImports(this.syllableImports);
    if (this.browserPanel) this.browserPanel.updateSyllableImports(this.syllableImports);
    if (this.templateBrowserPanel) this.templateBrowserPanel.updateSyllableImports(this.syllableImports);
    this._persistState();
    this._pushHistorySnapshot(historySnapshot, '저장된 부분 적용');
    this._checkGenerateReady();
    this._renderPendingPartsPanel();

    const sourceChar = parts.length === 1 ? parts[0]?.sourceChar : '';
    this._focusAppliedGlyphCard(sourceChar, appliedTargets);
    showToast(`저장된 부분 ${parts.length}개를 글자에 적용했습니다.`, 'success', 3000);
  }

  _clearPendingPart(key) {
    if (!this.pendingParts[key]) return;
    this._recordHistory('저장된 부분 삭제');
    delete this.pendingParts[key];
    this._persistState();
    this._renderPendingPartsPanel();
  }

  _clearAllPendingParts() {
    if (Object.keys(this.pendingParts).length === 0) return;
    this._recordHistory('저장된 부분 비우기');
    this.pendingParts = {};
    this._persistState();
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
    this._trackRecentJamoEdit(`${selection.categoryId}_${selection.jamo}`);
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
          <h2>미리보기</h2>
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
    const paddingX = 20;
    const paddingY = 18;
    const cellSize = 48;
    const gap = 6;
    const lineHeight = cellSize + 14;
    const maxChars = Math.max(...lines.map((line) => line.length), 1);
    const contentWidth = paddingX * 2 + Math.max(0, maxChars * (cellSize + gap) - gap);
    const contentHeight = paddingY * 2 + Math.max(0, lines.length * lineHeight - (lineHeight - cellSize));
    const w = Math.max(Math.ceil(container.clientWidth || 700), contentWidth);
    const h = Math.max(Math.ceil(container.clientHeight || 260), contentHeight);

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

        const x = paddingX + ci * (cellSize + gap);
        const y = paddingY + li * lineHeight;

        const commands = composeCharFromLib(char, jamoLib);
        if (!commands.length) continue;
        drawGlyphOnCtx(ctx, commands, x, y, cellSize);
      }
    }

    container.appendChild(canvas);
  }







  _handleResize() {
    if (this.drawingCanvas) this.drawingCanvas.resize();
    if (this.previewPanel) this.previewPanel.resize();
    if (this.browserPanel) this.browserPanel.resize();
    if (this.templateBrowserPanel) this.templateBrowserPanel.resize();
  }

  _refreshGlyphViews() {
    const fullLib = deriveAll(this.jamoLib);
    this.previewPanel?.updateJamoLib(fullLib);
    this.browserPanel?.updateJamoLib(fullLib);
    this.templateBrowserPanel?.updateJamoLib(fullLib);
    this.previewPanel?.updateSyllableImports(this.syllableImports);
    this.browserPanel?.updateSyllableImports(this.syllableImports);
    this.templateBrowserPanel?.updateSyllableImports(this.syllableImports);
  }

  _restoreDeletedSyllable(char) {
    if (!char) return;
    const deleted = new Set(loadDeletedSyllables());
    if (!deleted.has(char)) return;
    deleted.delete(char);
    saveDeletedSyllables([...deleted]);
  }

  _deleteSyllableCard(char) {
    if (!char) return false;

    const info = decomposeChar(char);
    const overrides = loadSyllableOverrides();
    const hadOverride = Boolean(overrides?.[char]);
    const hadImport = Boolean(this.syllableImports?.[char]);
    let hadStoredInputs = false;

    if (info) {
      const targets = this._getEditTargetsForSyllable(info.cho, info.jung, info.jong);
      targets.forEach((target) => {
        const selection = this._getSelectionForTarget(target.categoryId, target.jamo);
        if (!selection) return;

        const storageKeys = this._getContextStorageKeysForSelection(selection);
        storageKeys.forEach((storageKey) => {
          if (!this.jamoLib[storageKey]?.length) return;
          hadStoredInputs = true;
          delete this.jamoLib[storageKey];
        });

        const draftKey = `${selection.categoryId}_${selection.jamo}`;
        if (this.jamoDrafts[draftKey]) {
          hadStoredInputs = true;
          delete this.jamoDrafts[draftKey];
        }
      });
    }

    if (!hadOverride && !hadImport && !hadStoredInputs) {
      showToast(`${char} 글자 카드에서 삭제할 저장 데이터가 없습니다.`, 'warning', 2200);
      return false;
    }

    if (hadOverride) {
      delete overrides[char];
      saveSyllableOverrides(overrides);
    }

    if (hadImport) {
      delete this.syllableImports[char];
      this._persistState();
    }

    const deleted = new Set(loadDeletedSyllables());
    deleted.add(char);
    saveDeletedSyllables([...deleted]);

    this.jamoGrid?.setCompletedMap(this._getCompletedMapFromLib());
    this._checkGenerateReady();
    this._persistState();
    this._refreshGlyphViews();
    showToast(`${char} 글자 카드 데이터를 삭제했습니다.`, 'success', 2200);
    return true;
  }

  _resetAllData() {
    clearState();
    this.jamoLib = {};
    this.jamoDrafts = {};
    this.guideOverrides = {};
    this.syllableImports = {};
    this.templateImportedSlots = [];
    this.pendingParts = {};
    this.downloadAccess = {
      unlocked: false,
      fontName: '',
      unlockedAt: '',
    };
    this.reviewState = getDefaultReviewState();
    this.reviewReturnContext = null;
    this.recentEditedKeys = [];
    this.currentSelectionKey = null;
    this._generatedBuffer = null;
    this._generatedFontName = '';
    this.undoStack = [];
    this.redoStack = [];
    this._showLanding();
    showToast('모든 저장된 작업을 초기화했습니다.', 'success', 2400);
  }

  _showResetAllDataConfirm() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal quality-confirm-modal">
        <div class="modal-header">
          <h2>Reset All Data</h2>
          <button class="modal-close" id="closeResetAllDataModal">x</button>
        </div>
        <div class="modal-body quality-confirm-body">
          <p class="quality-confirm-copy">저장된 자모, 가져온 글자, 저장된 부분, 세부 조정값까지 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.</p>
          <div class="quality-confirm-actions">
            <button class="gen-btn" id="resetAllDataCancelBtn">Cancel</button>
            <button class="gen-btn download-btn" id="resetAllDataConfirmBtn">Delete All</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.getElementById('closeResetAllDataModal')?.addEventListener('click', close);
    document.getElementById('resetAllDataCancelBtn')?.addEventListener('click', close);
    document.getElementById('resetAllDataConfirmBtn')?.addEventListener('click', () => {
      close();
      this._resetAllData();
    });
  }

  _persistState() {
    saveState({
      jamoLib: this.jamoLib,
      jamoDrafts: this.jamoDrafts,
      guideOverrides: this.guideOverrides,
      syllableImports: this.syllableImports,
      templateImportedSlots: this.templateImportedSlots,
      downloadAccess: this.downloadAccess,
      pendingParts: this.pendingParts,
    });
  }

  _hasUnlockedDownload(fontName) {
    if (!fontName) return false;
    return Boolean(this.downloadAccess?.unlocked && this.downloadAccess.fontName === fontName);
  }

  _unlockDownload(fontName) {
    this.downloadAccess = {
      unlocked: true,
      fontName,
      unlockedAt: new Date().toISOString(),
    };
    this._persistState();
  }

  _lockDownload() {
    this.downloadAccess = {
      unlocked: false,
      fontName: '',
      unlockedAt: '',
    };
    this._persistState();
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

    this._recordHistory('가이드 박스 조정');
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

    const overrideKey = this._getGuideOverrideKey(
      selection.categoryId,
      `${selection.categoryId}_${selection.jamo}`,
      selection.guide
    );
    if (!this.guideOverrides[overrideKey]) return;

    this._recordHistory('가이드 박스 초기화');
    delete this.guideOverrides[overrideKey];
    this._persistState();
    this.drawingCanvas.resetGuideTargetRegion(false);
    showToast('대상 박스를 기본 가이드로 초기화했습니다.', 'success', 1800);
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
        <div class="quality-summary">가이드 안에 그린 뒤 품질 상태를 확인하세요.</div>
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
        <span>획 ${report.strokeCount}</span>
        <span>점 ${report.pointCount}</span>
        ${metrics
          ? `<span>채움 ${Math.round(metrics.fillRatio * 100)}%</span>
             <span>넘침 ${Math.round(metrics.overflowRatio * 100)}%</span>
             <span>중심 ${Math.round(Math.max(metrics.centerOffsetX ?? 0, metrics.centerOffsetY ?? 0) * 100)}%</span>`
          : '<span>자유 입력</span>'}
      </div>
      <div class="quality-message">
        ${report.hasBlockingWarnings
          ? '<strong>저장은 가능하지만 조합된 글자 모양이 불안정할 수 있습니다.</strong>'
          : report.warnings.length > 0
            ? '<strong>저장은 가능하지만 아래 항목을 수정하면 결과가 더 좋아집니다.</strong>'
            : '<strong>현재 그림 상태가 안정적입니다.</strong>'}
      </div>
      ${report.warnings.length > 0
        ? `<ul class="quality-warnings">${warningItems}</ul>`
        : ''}
    `;
  }

  _getQualityWarningMessage(warning) {
    switch (warning?.code) {
      case 'too_small':
        return '가이드 영역에 비해 그림이 너무 작습니다. 더 크게 그려보세요.';
      case 'overflow':
        return '일부 획이 가이드 영역 밖으로 나갔습니다. 박스 안에 맞춰주세요.';
      case 'low_stroke_detail':
        return '획 디테일이 너무 적습니다. 입력이 제대로 기록됐는지 확인하세요.';
      case 'off_center':
        return '그림이 가이드 박스 중심에서 벗어났습니다. 가운데로 맞춰주세요.';
      case 'skewed_shape':
        return '그림이 한쪽 영역에 치우쳐 있습니다. 가이드 위치를 확인하고 필요하면 다시 그리세요.';
      default:
        return warning?.message || '저장하기 전에 그림 품질을 확인하세요.';
    }
  }

  _getQualityMessages(warnings = []) {
    return [...new Set(warnings.map((warning) => this._getQualityWarningMessage(warning)))];
  }

  _showQualityToast(warnings) {
    const uniqueMessages = this._getQualityMessages(warnings);
    showToast(`저장했습니다. ${uniqueMessages.join(' / ')}`, 'warning', 4200);
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
          <h2>저장 전 확인</h2>
          <button class="modal-close" id="closeQualityConfirmModal">x</button>
        </div>
        <div class="modal-body quality-confirm-body">
          <p class="quality-confirm-copy">이 그림은 글자 모양이 불안정하게 생성될 수 있습니다. 경고를 확인하고 그대로 저장할지 결정하세요.</p>
          <ul class="quality-warnings">${warningItems}</ul>
          <div class="quality-confirm-actions">
            <button class="gen-btn" id="qualityConfirmCancelBtn">계속 수정</button>
            <button class="gen-btn download-btn" id="qualityConfirmSaveBtn">그대로 저장</button>
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
