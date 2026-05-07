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
        <h2>가져온 글자 편집</h2>
        <button class="modal-close" id="closeSyllableSplitModal">x</button>
      </div>
      <div class="modal-body template-body">
        <div class="template-manual">
          <div class="template-manual-header">
            <div>
              <h3>글자 하나 분리하기</h3>
              <p>재사용할 부분을 선택하고 적용 대상을 지정한 뒤, 일치하는 글자 카드에 바로 적용하세요.</p>
            </div>
            <div class="template-sequence-nav ${options.sequence?.length ? '' : 'is-hidden'}">
              <button type="button" class="tool-btn" id="splitPrevSourceBtn">이전 원본</button>
              <span class="template-sequence-counter" id="splitSourceCounter"></span>
              <button type="button" class="tool-btn" id="splitNextSourceBtn">다음 원본</button>
            </div>
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
            <div class="template-assignment-tools">
              <button type="button" class="gen-btn" id="splitAssignActiveBtn" disabled>선택한 대상에 지정</button>
              <button type="button" class="tool-btn" id="splitClearSelectionBtn" disabled>선택 해제</button>
              <button type="button" class="tool-btn" id="splitClearAssignmentsBtn" disabled>지정 초기화</button>
            </div>
            <div class="template-apply-tools">
              <button class="gen-btn" id="splitSavePendingBtn" disabled>저장된 부분에 추가</button>
              <button class="gen-btn" id="splitApplySelectionBtn" disabled>글자 카드에 적용</button>
            </div>
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
    app._hideManualContextMenu(state);
  });

  const sequence = Array.isArray(options.sequence) ? options.sequence.filter((slot) => slot?.char && slot?.imageSrc) : [];
  let currentSequenceIndex = sequence.length
    ? Math.max(0, Math.min(
        Number.isInteger(options.sequenceIndex)
          ? options.sequenceIndex
          : sequence.findIndex((slot) => slot.char === initialChar),
        sequence.length - 1
      ))
    : -1;
  if (currentSequenceIndex < 0 && sequence.length) currentSequenceIndex = 0;

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
  const savePendingBtn = document.getElementById('splitSavePendingBtn');
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
  const prevSourceBtn = document.getElementById('splitPrevSourceBtn');
  const nextSourceBtn = document.getElementById('splitNextSourceBtn');
  const sourceCounter = document.getElementById('splitSourceCounter');

  const render = () => {
    app._renderManualSplitState(manualCanvas, targetList, selectionSummary, state, render);
    applyBtn.disabled = !app._canApplyManualSplit(state);
    savePendingBtn.disabled = !app._canApplyManualSplit(state);
    assignActiveBtn.disabled = !state.selectedComponentIds?.size || !state.targets.length || state.editMode !== 'select';
    clearSelectionBtn.disabled = !state.selectedComponentIds?.size;
    clearAssignmentsBtn.disabled = !state.assignments?.size;
    if (sourceCounter) {
      sourceCounter.textContent = sequence.length && currentSequenceIndex >= 0
        ? `${currentSequenceIndex + 1}/${sequence.length}`
        : '';
    }
    if (prevSourceBtn) prevSourceBtn.disabled = !sequence.length || currentSequenceIndex <= 0;
    if (nextSourceBtn) nextSourceBtn.disabled = !sequence.length || currentSequenceIndex >= sequence.length - 1;
  };

  const loadImageIntoState = async (src) => {
    const image = await readImageSource(src);
    state.image = image;
    state.imageSrc = src;
    state.extracted = extractManualSplitImage(image);
    state.editImageData = imageDataFromExtractedMask(state.extracted);
    state.assignments = new Map();
    state.selectedComponentIds = new Set();
    manualStatus.textContent = `획 그룹 ${state.extracted.components.length}개를 찾았습니다. 그룹을 선택하고 대상을 지정한 뒤 글자 카드에 적용하세요.`;
    render();
  };

  const loadSequenceSlot = async (index) => {
    if (!sequence.length || index < 0 || index >= sequence.length) return;
    const slot = sequence[index];
    currentSequenceIndex = index;
    state.char = slot.char;
    state.targets = slot.targets?.length ? slot.targets : app._getTargetsForManualSplit(slot.char);
    state.imageSrc = slot.imageSrc;
    state.activeTargetIndex = 0;
    state.assignments = new Map();
    state.selectedComponentIds = new Set();
    state.contextMenuEl = null;
    state.editMode = 'select';
    syllableInput.value = slot.char;
    manualStatus.textContent = `${slot.char} 원본을 불러오는 중...`;
    try {
      await loadImageIntoState(slot.imageSrc);
      manualStatus.textContent = `${slot.char} 원본을 불러왔습니다. 필요한 획을 선택해 저장하거나 적용하세요.`;
    } catch (error) {
      state.extracted = null;
      manualStatus.textContent = `${slot.char} 원본을 불러오지 못했습니다: ${error.message}`;
      render();
    }
  };

  syllableInput.addEventListener('input', async () => {
    currentSequenceIndex = -1;
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
      manualStatus.textContent = '이미지를 교체하거나 글자 보기에서 가져온 글자 카드를 선택하세요.';
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
    manualStatus.textContent = `그룹 ${result.assigned}개를 자동 지정했습니다. 그룹 ${result.needsReview}개는 확인이 필요합니다.`;
    setEditMode('select');
    render();
  });
  assignActiveBtn?.addEventListener('click', () => {
    if (!state.selectedComponentIds?.size || !state.targets.length) return;
    const count = state.selectedComponentIds.size;
    app._assignSelectedComponentsToTarget(state, state.activeTargetIndex);
    manualStatus.textContent = `선택한 그룹 ${count}개를 현재 대상에 지정했습니다.`;
    render();
  });
  clearSelectionBtn?.addEventListener('click', () => {
    state.selectedComponentIds = new Set();
    manualStatus.textContent = '선택을 해제했습니다.';
    render();
  });
  clearAssignmentsBtn?.addEventListener('click', () => {
    state.assignments = new Map();
    state.selectedComponentIds = new Set();
    manualStatus.textContent = '지정을 초기화했습니다.';
    render();
  });
  brushSizeInput?.addEventListener('input', () => {
    state.brushSize = Number(brushSizeInput.value) || 18;
  });
  prevSourceBtn?.addEventListener('click', async () => {
    if (currentSequenceIndex <= 0) return;
    await loadSequenceSlot(currentSequenceIndex - 1);
  });
  nextSourceBtn?.addEventListener('click', async () => {
    if (currentSequenceIndex >= sequence.length - 1) return;
    await loadSequenceSlot(currentSequenceIndex + 1);
  });

  document.getElementById('splitSingleFileInput').addEventListener('change', async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;
    if (!app._getTargetsForManualSplit(state.char).length) {
      manualStatus.textContent = '부분을 어디에 저장할지 알 수 있도록 글자를 먼저 입력하세요.';
      return;
    }
    const src = await readFileAsDataUrl(file);
    await loadImageIntoState(src);
  });

  applyBtn.addEventListener('click', () => {
    const result = app._applyManualSplitAssignments(state);
    manualStatus.textContent = result.applied > 0
      ? `일치하는 글자 카드에 부분 ${result.applied}개를 적용했습니다.`
      : `적용된 부분이 없습니다: ${result.reason || '획 그룹과 적용 대상을 먼저 선택하세요.'}`;
    render();
  });

  savePendingBtn.addEventListener('click', () => {
    const result = app._saveManualSplitAssignmentsToPending(state);
    manualStatus.textContent = result.saved > 0
      ? `부분 ${result.saved}개를 저장된 부분에 추가했습니다.`
      : `저장된 부분이 없습니다: ${result.reason || '획 그룹과 적용 대상을 먼저 선택하세요.'}`;
    render();
  });

  if (sequence.length) {
    await loadSequenceSlot(currentSequenceIndex);
  } else if (state.char && state.imageSrc && state.targets.length) {
    try {
      await loadImageIntoState(state.imageSrc);
    } catch (error) {
      manualStatus.textContent = `가져온 이미지를 불러오지 못했습니다: ${error.message}`;
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
    throw new Error('업로드한 이미지에서 획 그룹을 찾지 못했습니다.');
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
