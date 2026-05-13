import { extractRasterComponents } from '../../core/template-import.js';
import { readImageSource } from './template-modal.js';

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
            </div>
            <div class="template-sequence-nav ${options.sequence?.length ? '' : 'is-hidden'}">
              <button type="button" class="tool-btn" id="splitPrevSourceBtn">이전 글자</button>
              <span class="template-sequence-counter" id="splitSourceCounter"></span>
              <button type="button" class="tool-btn" id="splitNextSourceBtn">다음 글자</button>
            </div>
          </div>

          <div class="template-manual-layout">
            <div class="template-manual-main">
              <div class="template-manual-canvas-shell">
                <button
                  type="button"
                  class="template-canvas-nav template-canvas-nav-prev ${options.sequence?.length ? '' : 'is-hidden'}"
                  id="splitPrevSourceCanvasBtn"
                  aria-label="이전 글자"
                >
                  ‹
                </button>
                <canvas class="template-manual-canvas" id="splitManualCanvas" width="520" height="520"></canvas>
                <button
                  type="button"
                  class="template-canvas-nav template-canvas-nav-next ${options.sequence?.length ? '' : 'is-hidden'}"
                  id="splitNextSourceCanvasBtn"
                  aria-label="다음 글자"
                >
                  ›
                </button>
              </div>
              <div class="template-workflow template-workflow--compact">
                <section class="template-workflow-group">
                  <div class="template-workflow-title">
                    <span class="template-workflow-step">1. 획 선택</span>
                    <span class="template-workflow-help">캔버스에서 획 그룹을 클릭하거나 직접 다듬으세요.</span>
                  </div>
                  <div class="template-edit-tools">
                    <button type="button" class="tool-btn active" id="splitSelectModeBtn">선택</button>
                    <button type="button" class="tool-btn" id="splitEraseModeBtn">지우기</button>
                    <button type="button" class="tool-btn" id="splitDrawModeBtn">그리기</button>
                    <button type="button" class="tool-btn" id="splitAutoAssignBtn">자동 지정</button>
                    <label class="template-brush-control">브러시 <input type="range" id="splitBrushSizeInput" min="6" max="42" value="18" /></label>
                  </div>
                </section>
              </div>
            </div>

            <div class="template-manual-actions">
              <section class="template-workflow-group">
                <div class="template-workflow-title">
                  <span class="template-workflow-step">2. 대상 지정</span>
                  <span class="template-workflow-help">선택한 획을 현재 대상에 지정하세요. 위치 보정은 캔버스에서 직접 드래그할 수 있습니다.</span>
                </div>
                <div class="template-assignment-tools template-manual-action-buttons">
                  <button type="button" class="gen-btn" id="splitAssignActiveBtn" disabled>현재 대상에 지정</button>
                  <button type="button" class="tool-btn" id="splitClearSelectionBtn" disabled>선택 해제</button>
                  <button type="button" class="tool-btn" id="splitClearAssignmentsBtn" disabled>지정 취소</button>
                </div>
              </section>
              <section class="template-workflow-group">
                <div class="template-workflow-title">
                  <span class="template-workflow-step">3. 적용</span>
                  <span class="template-workflow-help">지정된 획을 바로 반영하거나, 저장된 부분으로만 임시 보관할 수 있습니다.</span>
                </div>
                <div class="template-apply-tools template-manual-action-buttons">
                  <button class="gen-btn" id="splitSavePendingBtn" disabled>임시 보관</button>
                  <button class="gen-btn" id="splitApplySelectionBtn" disabled>바로 적용</button>
                  <button type="button" class="tool-btn" id="splitUndoApplyBtn" disabled>적용 취소</button>
                </div>
              </section>
            </div>

            <div class="template-manual-sidebar">
              <div class="template-progress-card" id="splitProgressCard"></div>
              <div class="template-target-list" id="splitTargetList"></div>
              <div class="template-component-list" id="splitComponentList"></div>
              <div class="template-selection-summary" id="splitSelectionSummary">불러온 이미지가 없습니다.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const modalEl = overlay.querySelector('.template-modal');

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
    lastPointerHit: null,
    transformDrag: null,
    suppressNextClick: false,
    editMode: 'select',
    brushSize: 18,
    editImageData: null,
    isEditingMask: false,
    statusMessage: '이미지를 불러오면 획을 선택하고 대상에 지정할 수 있습니다.',
    lastApplyUndoSnapshot: null,
    lastApplyUndoChar: '',
  };

  const close = () => {
    window.removeEventListener('keydown', handleShortcut);
    overlay.remove();
  };
  document.getElementById('closeSyllableSplitModal')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
    app._hideManualContextMenu(state);
  });

  const applyBtn = document.getElementById('splitApplySelectionBtn');
  const savePendingBtn = document.getElementById('splitSavePendingBtn');
  const undoApplyBtn = document.getElementById('splitUndoApplyBtn');
  const manualCanvas = document.getElementById('splitManualCanvas');
  const manualActions = overlay.querySelector('.template-manual-actions');
  const targetList = document.getElementById('splitTargetList');
  const componentList = document.getElementById('splitComponentList');
  const selectionSummary = document.getElementById('splitSelectionSummary');
  const progressCard = document.getElementById('splitProgressCard');
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
  const prevSourceCanvasBtn = document.getElementById('splitPrevSourceCanvasBtn');
  const nextSourceCanvasBtn = document.getElementById('splitNextSourceCanvasBtn');
  const sourceCounter = document.getElementById('splitSourceCounter');

  selectModeBtn?.setAttribute('title', '선택 (A)');
  eraseModeBtn?.setAttribute('title', '지우기 (S)');
  drawModeBtn?.setAttribute('title', '그리기 (D)');
  autoAssignBtn?.setAttribute('title', '자동 지정 (F)');
  assignActiveBtn?.setAttribute('title', '현재 대상에 지정 (Enter)');
  clearSelectionBtn?.setAttribute('title', '선택 해제 (Esc)');
  clearAssignmentsBtn?.setAttribute('title', '지정 취소 (Backspace)');
  savePendingBtn?.setAttribute('title', '임시 보관 (Q)');
  applyBtn?.setAttribute('title', '바로 적용 (W)');
  undoApplyBtn?.setAttribute('title', '적용 취소 (E)');

  const setStatus = (message) => {
    state.statusMessage = message;
  };

  const isTypingTarget = (target) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  };

  const canUndoManualApply = () => {
    return Boolean(state.lastApplyUndoSnapshot && state.lastApplyUndoChar === state.char);
  };

  const updateModalHeight = () => {
    if (!modalEl || typeof window === 'undefined') return;
    const targetCount = state.targets?.length ?? 0;
    const componentCount = state.extracted?.components?.length ?? 0;
    const extraTargetHeight = Math.max(0, targetCount - 2) * 54;
    const extraComponentHeight = Math.max(0, componentCount - 2) * 34;
    const desiredMinHeight = Math.min(
      window.innerHeight * 0.92,
      880 + extraTargetHeight + extraComponentHeight
    );
    modalEl.style.minHeight = `${Math.round(desiredMinHeight)}px`;
  };

  const syncActionsHeight = () => {
    if (!manualActions || !manualCanvas) return;
    const canvasHeight = Math.round(manualCanvas.getBoundingClientRect().height || 0);
    if (!canvasHeight) return;
    manualActions.style.height = `${canvasHeight}px`;
  };

  const getEffectiveAssignedTargetIndexes = () => {
    const indexes = new Set(state.assignments.values());
    if (state.selectedComponentIds?.size && state.activeTargetIndex >= 0) {
      indexes.add(state.activeTargetIndex);
    }
    return [...indexes].filter((index) => Number.isInteger(index) && index >= 0 && index < state.targets.length);
  };

  const confirmOverwriteIfNeeded = (mode) => {
    const targetIndexes = getEffectiveAssignedTargetIndexes();
    if (!targetIndexes.length) return true;

    const overwrittenLabels = targetIndexes
      .map((index) => state.targets[index])
      .filter(Boolean)
      .filter((target) => {
        if (mode === 'apply') {
          return app._isTargetStored?.(target);
        }
        const key = `${target.categoryId}_${target.jamo}`;
        return Boolean(app.pendingParts?.[key]);
      })
      .map((target) => target.label);

    if (!overwrittenLabels.length) return true;

    const actionLabel = mode === 'apply' ? '바로 적용' : '임시 보관';
    const targetLabel = overwrittenLabels.map((label) => `- ${label}`).join('\n');
    return window.confirm(
      `${actionLabel} 시 기존 저장 내용을 덮어씁니다.\n\n${targetLabel}\n\n계속할까요?`
    );
  };

  const handleShortcut = async (event) => {
    if (!overlay.isConnected) return;
    if (isTypingTarget(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    switch (event.key) {
      case 'A':
        event.preventDefault();
        setEditMode('select');
        return;
      case 's':
      case 'S':
        event.preventDefault();
        setEditMode('erase');
        return;
      case 'd':
      case 'D':
        event.preventDefault();
        setEditMode('draw');
        return;
      case 'f':
      case 'F':
        event.preventDefault();
        if (!autoAssignBtn?.disabled) autoAssignBtn.click();
        return;
      case 'Enter':
        event.preventDefault();
        if (!assignActiveBtn?.disabled) assignActiveBtn.click();
        return;
      case 'Escape':
        event.preventDefault();
        if (!clearSelectionBtn?.disabled) clearSelectionBtn.click();
        return;
      case 'Backspace':
        event.preventDefault();
        if (!clearAssignmentsBtn?.disabled) clearAssignmentsBtn.click();
        return;
      case 'q':
      case 'Q':
        event.preventDefault();
        if (!savePendingBtn?.disabled) savePendingBtn.click();
        return;
      case 'w':
      case 'W':
        event.preventDefault();
        if (!applyBtn?.disabled) applyBtn.click();
        return;
      case 'e':
      case 'E':
        event.preventDefault();
        if (!undoApplyBtn?.disabled) undoApplyBtn.click();
        return;
      case 'ArrowLeft':
        if (!sequence.length) return;
        event.preventDefault();
        if (currentSequenceIndex > 0) await loadSequenceSlot(currentSequenceIndex - 1);
        return;
      case 'ArrowRight':
        if (!sequence.length) return;
        event.preventDefault();
        if (currentSequenceIndex < sequence.length - 1) await loadSequenceSlot(currentSequenceIndex + 1);
        return;
      default:
        return;
    }
  };

  window.addEventListener('keydown', handleShortcut);

  const updateWorkflowSummary = () => {
    const selectedCount = state.selectedComponentIds?.size ?? 0;
    const assignedCount = state.assignments?.size ?? 0;
    const totalComponents = state.extracted?.components?.length ?? 0;
    const activeTarget = state.targets?.[state.activeTargetIndex] ?? null;
    const targetLabel = activeTarget?.label || '대상 없음';

    let stepLabel = '1. 획 선택';
    let stepGuide = '캔버스에서 획 그룹을 클릭해 선택하세요.';

    if (!state.extracted) {
      stepLabel = '준비';
      stepGuide = '먼저 이미지를 불러오거나 다른 원본 글자로 이동하세요.';
    } else if (state.editMode === 'erase') {
      stepLabel = '편집 중';
      stepGuide = '지우기 모드에서 불필요한 영역을 정리한 뒤 다시 선택 모드로 돌아오세요.';
    } else if (state.editMode === 'draw') {
      stepLabel = '편집 중';
      stepGuide = '그리기 모드에서 비어 있는 획을 보완한 뒤 다시 선택 모드로 돌아오세요.';
    } else if (selectedCount > 0) {
      stepLabel = '2. 대상 지정';
      stepGuide = `선택한 ${selectedCount}개 획을 현재 대상에 지정하세요.`;
    } else if (assignedCount > 0) {
      stepLabel = '3. 적용';
      stepGuide = `지정된 ${assignedCount}개 그룹을 바로 적용하거나 임시 보관할 수 있습니다.`;
    }

    if (!progressCard) return;
    progressCard.innerHTML = `
      <div class="template-progress-label">${stepLabel}</div>
      <div class="template-progress-target">${targetLabel}</div>
      <div class="template-progress-metrics">
        <span>총 ${totalComponents}개</span>
        <span>선택 ${selectedCount}개</span>
        <span>지정 ${assignedCount}개</span>
      </div>
      <div class="template-progress-guide">${stepGuide}</div>
      <div class="template-progress-status">${state.statusMessage}</div>
    `;
  };

  const render = () => {
    app._renderManualSplitState(manualCanvas, targetList, selectionSummary, state, render, componentList);
    applyBtn.disabled = !app._canApplyManualSplit(state);
    savePendingBtn.disabled = !app._canApplyManualSplit(state);
    undoApplyBtn.disabled = !canUndoManualApply();
    assignActiveBtn.disabled = !state.selectedComponentIds?.size || !state.targets.length || state.editMode !== 'select';
    clearSelectionBtn.disabled = !state.selectedComponentIds?.size;
    const hasSelectedAssignedComponents = [...(state.selectedComponentIds ?? [])]
      .some((componentId) => state.assignments?.has(componentId));
    clearAssignmentsBtn.disabled = state.selectedComponentIds?.size
      ? !hasSelectedAssignedComponents
      : !state.assignments?.size;
    if (sourceCounter) {
      sourceCounter.textContent = sequence.length && currentSequenceIndex >= 0
        ? `${currentSequenceIndex + 1}/${sequence.length}`
        : '';
    }
    const disablePrev = !sequence.length || currentSequenceIndex <= 0;
    const disableNext = !sequence.length || currentSequenceIndex >= sequence.length - 1;
    if (prevSourceBtn) prevSourceBtn.disabled = disablePrev;
    if (nextSourceBtn) nextSourceBtn.disabled = disableNext;
    if (prevSourceCanvasBtn) prevSourceCanvasBtn.disabled = disablePrev;
    if (nextSourceCanvasBtn) nextSourceCanvasBtn.disabled = disableNext;
    updateModalHeight();
    syncActionsHeight();
    updateWorkflowSummary();
  };

  const loadImageIntoState = async (src) => {
    const image = await readImageSource(src);
    state.image = image;
    state.imageSrc = src;
    state.extracted = extractManualSplitImage(image);
    state.editImageData = imageDataFromExtractedMask(state.extracted);
    state.assignments = new Map();
    state.selectedComponentIds = new Set();
    state.lastPointerHit = null;
    state.transformDrag = null;
    state.suppressNextClick = false;
    setStatus(`획 그룹 ${state.extracted.components.length}개를 찾았습니다. 필요한 획을 선택해서 대상에 지정하세요.`);
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
    state.lastPointerHit = null;
    state.transformDrag = null;
    state.suppressNextClick = false;
    state.contextMenuEl = null;
    state.editMode = 'select';
    setStatus(`${slot.char} 원본 글자를 불러오는 중입니다.`);
    render();
    try {
      await loadImageIntoState(slot.imageSrc);
      setStatus(`${slot.char} 원본 글자를 불러왔습니다. 필요한 획을 선택하고 대상에 지정하세요.`);
      render();
    } catch (error) {
      state.extracted = null;
      setStatus(`${slot.char} 원본 글자를 불러오지 못했습니다. ${error.message}`);
      render();
    }
  };

  manualCanvas.addEventListener('click', (event) => {
    if (state.editMode !== 'select') return;
    if (!state.extracted) return;
    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      return;
    }
    const componentId = app._getManualComponentAtPoint(event, manualCanvas, state.extracted, state);
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
    if (state.editMode === 'select') {
      if (event.button !== 0) return;
      if (app._beginManualTransformDrag(state, manualCanvas, event)) {
        manualCanvas.setPointerCapture?.(event.pointerId);
        render();
      }
      return;
    }

    event.preventDefault();
    state.isEditingMask = true;
    app._paintManualMaskAtEvent(event, manualCanvas, state);
    app._reextractManualMask(state);
    render();
  });

  manualCanvas.addEventListener('pointermove', (event) => {
    if (state.editMode === 'select') {
      if (state.transformDrag) {
        event.preventDefault();
        app._updateManualTransformDrag(state, manualCanvas, event);
        render();
      }
      return;
    }

    if (!state.isEditingMask) return;
    event.preventDefault();
    app._paintManualMaskAtEvent(event, manualCanvas, state);
    app._reextractManualMask(state);
    render();
  });

  window.addEventListener('pointerup', (event) => {
    if (state.transformDrag) {
      app._endManualTransformDrag(state);
      state.suppressNextClick = true;
      manualCanvas.releasePointerCapture?.(event.pointerId);
      render();
    }
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
    setStatus(`그룹 ${result.assigned}개를 자동 지정했습니다. ${result.needsReview}개는 직접 확인하세요.`);
    setEditMode('select');
    render();
  });

  assignActiveBtn?.addEventListener('click', () => {
    if (!state.selectedComponentIds?.size || !state.targets.length) return;
    const count = state.selectedComponentIds.size;
    app._assignSelectedComponentsToTarget(state, state.activeTargetIndex);
    setStatus(`선택한 그룹 ${count}개를 현재 대상에 지정했습니다.`);
    render();
  });

  clearSelectionBtn?.addEventListener('click', () => {
    state.selectedComponentIds = new Set();
    setStatus('선택을 해제했습니다.');
    render();
  });

  clearAssignmentsBtn?.addEventListener('click', () => {
    if (state.selectedComponentIds?.size) {
      let cleared = 0;
      state.selectedComponentIds.forEach((componentId) => {
        if (!state.assignments.has(componentId)) return;
        state.assignments.delete(componentId);
        cleared += 1;
      });
      setStatus(
        cleared > 0
          ? `선택한 ${cleared}개 획의 지정을 취소했습니다.`
          : '선택한 획에는 취소할 지정이 없습니다.'
      );
    } else {
      const cleared = state.assignments.size;
      state.assignments = new Map();
      setStatus(
        cleared > 0
          ? `전체 지정 ${cleared}개를 초기화했습니다.`
          : '취소할 지정이 없습니다.'
      );
    }
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

  prevSourceCanvasBtn?.addEventListener('click', async () => {
    if (currentSequenceIndex <= 0) return;
    await loadSequenceSlot(currentSequenceIndex - 1);
  });

  nextSourceCanvasBtn?.addEventListener('click', async () => {
    if (currentSequenceIndex >= sequence.length - 1) return;
    await loadSequenceSlot(currentSequenceIndex + 1);
  });

  applyBtn.addEventListener('click', () => {
    if (!confirmOverwriteIfNeeded('apply')) {
      setStatus('덮어쓰기 확인을 취소했습니다.');
      render();
      return;
    }
    const undoSnapshot = app._captureHistorySnapshot();
    const result = app._applyManualSplitAssignments(state);
    if (result.applied > 0) {
      state.lastApplyUndoSnapshot = undoSnapshot;
      state.lastApplyUndoChar = state.char;
    }
    setStatus(
      result.applied > 0
        ? `일치하는 글자 카드의 부분 ${result.applied}개를 바로 적용했습니다.`
        : `적용할 부분이 없습니다. ${result.reason || '획 그룹과 적용 대상을 먼저 선택하세요.'}`
    );
    render();
  });

  savePendingBtn.addEventListener('click', () => {
    if (!confirmOverwriteIfNeeded('pending')) {
      setStatus('덮어쓰기 확인을 취소했습니다.');
      render();
      return;
    }
    const result = app._saveManualSplitAssignmentsToPending(state);
    setStatus(
      result.saved > 0
        ? `부분 ${result.saved}개를 저장된 부분에 추가했습니다.`
        : `저장할 부분이 없습니다. ${result.reason || '획 그룹과 적용 대상을 먼저 선택하세요.'}`
    );
    render();
  });

  undoApplyBtn.addEventListener('click', () => {
    if (!canUndoManualApply()) {
      setStatus('취소할 바로 적용 작업이 없습니다.');
      render();
      return;
    }
    app._restoreHistorySnapshot(state.lastApplyUndoSnapshot);
    const lastEntry = app.undoStack?.[app.undoStack.length - 1];
    if (lastEntry?.label === '글자 카드에 부분 적용') {
      app.undoStack.pop();
      app._updateHistoryButtons?.();
    }
    state.lastApplyUndoSnapshot = null;
    state.lastApplyUndoChar = '';
    setStatus(`${state.char} 글자에서 마지막 바로 적용을 취소했습니다.`);
    render();
  });

  if (sequence.length) {
    await loadSequenceSlot(currentSequenceIndex);
  } else if (state.char && state.imageSrc && state.targets.length) {
    try {
      await loadImageIntoState(state.imageSrc);
    } catch (error) {
      setStatus(`가져온 이미지를 불러오지 못했습니다. ${error.message}`);
      render();
    }
  } else {
    render();
  }
}

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
