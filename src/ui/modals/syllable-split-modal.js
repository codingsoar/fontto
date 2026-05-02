/**
 * syllable-split-modal.js — edit imported syllable modal
 */

import { extractRasterComponents } from '../../core/template-import.js';
import { readImageSource, readFileAsDataUrl } from './template-modal.js';
import { showToast } from '../toast.js';

/**
 * Show the syllable split/edit modal.
 * @param {Object} app — FonttoApp instance
 * @param {string} initialChar — initial syllable character
 * @param {Object} options — { targets, imageSrc }
 */
export async function showSyllableSplitModal(app, initialChar = '', options = {}) {
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
            <p>Select the parts you want to reuse, assign them to a target, then apply them directly to the matching glyph cards.</p>
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
            <div class="template-assignment-tools">
              <button type="button" class="gen-btn" id="splitAssignActiveBtn" disabled>Assign to Active Target</button>
              <button type="button" class="tool-btn" id="splitClearSelectionBtn" disabled>Clear Selection</button>
              <button type="button" class="tool-btn" id="splitClearAssignmentsBtn" disabled>Clear Assignments</button>
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
    app._hideManualContextMenu(state);
  });

  const state = {
    char: initialChar,
    targets: options.targets?.length ? options.targets : app._getTargetsForManualSplit(initialChar),
    extracted: null,
    image: null,
    imageSrc: options.imageSrc ?? app.syllableImports?.[initialChar]?.imageSrc ?? null,
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
  const assignActiveBtn = document.getElementById('splitAssignActiveBtn');
  const clearSelectionBtn = document.getElementById('splitClearSelectionBtn');
  const clearAssignmentsBtn = document.getElementById('splitClearAssignmentsBtn');

  const render = () => {
    app._renderManualSplitState(manualCanvas, targetList, selectionSummary, state, render);
    applyBtn.disabled = !app._canApplyManualSplit(state);
    assignActiveBtn.disabled = !state.selectedComponentIds?.size || !state.targets.length || state.editMode !== 'select';
    clearSelectionBtn.disabled = !state.selectedComponentIds?.size;
    clearAssignmentsBtn.disabled = !state.assignments?.size;
  };

  const loadImageIntoState = async (src) => {
    const image = await readImageSource(src);
    state.image = image;
    state.imageSrc = src;
    state.extracted = extractManualSplitImage(image);
    state.editImageData = imageDataFromExtractedMask(state.extracted);
    state.assignments = new Map();
    state.selectedComponentIds = new Set();
    manualStatus.textContent = `Detected ${state.extracted.components.length} stroke groups. Select groups, assign targets, then apply them to glyph cards.`;
    render();
  };

  syllableInput.addEventListener('input', async () => {
    state.char = syllableInput.value.trim();
    state.targets = app._getTargetsForManualSplit(state.char);
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
    const componentId = app._getManualComponentAtPoint(event, manualCanvas, state.extracted);
    if (componentId === null) return;
    app._toggleManualComponentSelection(state, componentId, event.shiftKey);
    render();
  });

  manualCanvas.addEventListener('contextmenu', (event) => {
    if (state.editMode !== 'select') {
      event.preventDefault();
      return;
    }
    app._handleManualCanvasContextMenu(event, manualCanvas, state, render);
  });

  manualCanvas.addEventListener('pointerdown', (event) => {
    if (state.editMode === 'select') return;
    event.preventDefault();
    state.isEditingMask = true;
    app._paintManualMaskAtEvent(event, manualCanvas, state);
    app._reextractManualMask(state);
    render();
  });
  manualCanvas.addEventListener('pointermove', (event) => {
    if (!state.isEditingMask || state.editMode === 'select') return;
    event.preventDefault();
    app._paintManualMaskAtEvent(event, manualCanvas, state);
    app._reextractManualMask(state);
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
    const result = app._autoAssignManualSplitTargets(state);
    manualStatus.textContent = `Auto assigned ${result.assigned} group${result.assigned === 1 ? '' : 's'}. ${result.needsReview} group${result.needsReview === 1 ? '' : 's'} need review.`;
    setEditMode('select');
    render();
  });
  assignActiveBtn?.addEventListener('click', () => {
    if (!state.selectedComponentIds?.size || !state.targets.length) return;
    const count = state.selectedComponentIds.size;
    app._assignSelectedComponentsToTarget(state, state.activeTargetIndex);
    manualStatus.textContent = `Assigned ${count} selected group${count === 1 ? '' : 's'} to the active target.`;
    render();
  });
  clearSelectionBtn?.addEventListener('click', () => {
    state.selectedComponentIds = new Set();
    manualStatus.textContent = 'Selection cleared.';
    render();
  });
  clearAssignmentsBtn?.addEventListener('click', () => {
    state.assignments = new Map();
    state.selectedComponentIds = new Set();
    manualStatus.textContent = 'Assignments cleared.';
    render();
  });
  brushSizeInput?.addEventListener('input', () => {
    state.brushSize = Number(brushSizeInput.value) || 18;
  });

  document.getElementById('splitSingleFileInput').addEventListener('change', async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;
    if (!app._getTargetsForManualSplit(state.char).length) {
      manualStatus.textContent = 'Enter the syllable first so Fontto knows where to save the parts.';
      return;
    }
    const src = await readFileAsDataUrl(file);
    await loadImageIntoState(src);
  });

  applyBtn.addEventListener('click', () => {
    const result = app._applyManualSplitAssignments(state);
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

// ── Helpers ─────────────────────────────────────────────────

function extractManualSplitImage(image) {
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

function imageDataFromExtractedMask(extracted) {
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
