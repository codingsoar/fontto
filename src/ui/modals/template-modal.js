/**
 * template-modal.js — template import modal
 */

import {
  buildTemplateSvg,
  getTemplatePages,
  getTemplateSlots,
  getTemplateMetrics,
  getTemplateCellRect,
  getTemplateImportRect,
  rasterRectToCommands,
  extractRasterComponents,
  rasterRectToCleanImageData,
  selectedComponentsToCommands,
  selectedComponentsToPositionedCommands,
  selectedComponentsToStrokes,
} from '../../core/template-import.js';
import { renderPdfFileToCanvases } from '../../core/pdf-renderer.js';
import { buildTemplatePdfBytes } from '../../core/template-pdf.js';
import { showToast } from '../toast.js';

/**
 * Show the template import modal.
 * @param {Object} app — FonttoApp instance
 */
export function showTemplateModal(app) {
  const slots = getTemplateSlots();
  const pages = getTemplatePages(slots);
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
        <div class="template-status" id="templateStatus">템플릿에는 원본 글자 칸 ${slots.length}개가 필요합니다. A4 ${pages.length}페이지로 나뉩니다.</div>
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
        <details class="template-legacy" id="templatePreviewDetails">
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
  };

  document.getElementById('closeTemplateModal').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
    hideManualContextMenu(manualState);
  });

  const previewImage = document.getElementById('templatePreviewImage');
  const previewDetails = document.getElementById('templatePreviewDetails');
  let previewGenerated = false;

  previewDetails.addEventListener('toggle', () => {
    if (previewDetails.open && !previewGenerated) {
      previewGenerated = true;
      previewImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildTemplateSvg(pages[0] || [], 0, pages.length))}`;
    }
  });

  const importReviewEl = document.getElementById('templateImportReview');

  document.getElementById('downloadTemplateBtn').addEventListener('click', async () => {
    await downloadTemplate(app, slots);
  });
  document.getElementById('downloadTemplatePngBtn').addEventListener('click', async () => {
    await downloadTemplatePng(app, slots);
  });

  document.getElementById('templateFileInput').addEventListener('change', async (event) => {
    const files = [...(event.target.files ?? [])];
    if (!files.length) return;

    const statusEl = document.getElementById('templateStatus');
    statusEl.textContent = '템플릿을 가져오는 중...';

    try {
      const summary = await importTemplateFiles(app, files, slots);
      statusEl.textContent = `A4 ${summary.pages}페이지에서 원본 글자 ${summary.imported}개를 가져왔습니다. 빈 칸 ${summary.skipped}개는 건너뛰었습니다.`;
      renderTemplateImportReview(app, importReviewEl, summary.importedSlots, close);
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
    app._renderManualSplitState(manualCanvas, targetList, selectionSummary, manualState, renderManual);
    applyBtn.disabled = !app._canApplyManualSplit(manualState);
  };

  syllableInput.addEventListener('input', () => {
    manualState.char = syllableInput.value.trim();
    manualState.targets = app._getTargetsForManualSplit(manualState.char);
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
    const componentId = app._getManualComponentAtPoint(event, manualCanvas, manualState.extracted);
    if (componentId === null) return;

    app._toggleManualComponentSelection(manualState, componentId, event.shiftKey);
    renderManual();
  });

  manualCanvas.addEventListener('contextmenu', (event) => {
    app._handleManualCanvasContextMenu(event, manualCanvas, manualState, renderManual);
  });

  document.getElementById('templateSingleFileInput').addEventListener('change', async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;
    if (!manualState.targets.length) {
      manualStatus.textContent = '어떤 부분을 저장할지 알 수 있도록 글자를 먼저 입력하세요.';
      return;
    }

    try {
      const image = await readImageFile(file);
      const extracted = extractManualSplitImage(image);
      manualState.image = image;
      manualState.imageSrc = file.type.startsWith('image/')
        ? await readFileAsDataUrl(file)
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
    const result = app._applyManualSplitAssignments(manualState);
    manualStatus.textContent = result.applied > 0
      ? `일치하는 글자 카드에 부분 ${result.applied}개를 적용했습니다.`
      : `적용된 부분이 없습니다: ${result.reason || '획 그룹과 적용 대상을 먼저 선택하세요.'}`;
    renderManual();
  });

  renderManual();
}

// ── Template download & import helpers ─────────────────────

async function downloadTemplate(app, slots) {
  const pdfBytes = await buildTemplatePdfBytes(slots, readImageSource);
  const url = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fontto-template.pdf';
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadTemplatePng(app, slots) {
  const pages = getTemplatePages(slots);
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageSlots = pages[pageIndex];
    const svg = buildTemplateSvg(pageSlots, pageIndex, pages.length);
    const metrics = getTemplateMetrics(pageSlots.length);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = await readImageSource(svgUrl);
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

async function importTemplateFiles(app, files, slots) {
  const sources = await expandTemplateUploadFiles(files);
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
    const result = importTemplateSource(app, source, pages[pageIndex], pageIndex);
    skipped += result.skipped;
    result.importedSlots.forEach((slot) => {
      if (importedByChar.has(slot.char)) return;
      importedByChar.set(slot.char, slot);
      imported += 1;
    });
  }

  const importedSlots = [...importedByChar.values()];
  app.templateImportedSlots = importedSlots;
  app._persistState();
  app._renderTemplateImportReview?.(document.getElementById('templatePageImportReview'), importedSlots);
  showToast(`템플릿 가져오기 완료: 원본 글자 ${imported}개`, imported > 0 ? 'success' : 'warning', 3200);

  return { imported, skipped, importedSlots, pages: sources.length };
}

async function expandTemplateUploadFiles(files) {
  const sources = [];
  for (const file of files) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      sources.push(...await renderPdfFileToCanvases(file));
    } else {
      sources.push(await readImageFile(file));
    }
  }
  return sources;
}

function importTemplateSource(app, source, pageSlots, pageIndex) {
  const metrics = getTemplateMetrics(pageSlots.length);
  validateTemplateImage(source, metrics);
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
    const imageSrc = createImageDataUrl(cleanImageData);

    importedSlots.push({
      char: slot.example,
      sourceJamo: slot.jamo,
      categoryId: slot.categoryId,
      categoryLabel: slot.categoryLabel,
      imageSrc,
      pageIndex,
      targets: app._getTargetsForManualSplit(slot.example),
    });
  });

  return { skipped, importedSlots };
}

function renderTemplateImportReview(app, container, importedSlots, closeModal) {
  if (!container) return;

  if (!importedSlots?.length) {
    container.innerHTML = '<div class="template-target-empty">업로드한 템플릿에서 추출된 원본 글자가 없습니다.</div>';
    return;
  }

  container.innerHTML = `
    <div class="template-import-review-header">
      <h3>추출된 원본 글자</h3>
      <p>카드를 클릭해 글자를 분리한 뒤, 필요한 획을 선택해 일치하는 글자 카드에 적용하세요.</p>
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
      app._showSyllableSplitModal(slot.char, {
        imageSrc: slot.imageSrc,
        targets: slot.targets,
        sequence: importedSlots,
        sequenceIndex: index,
      });
      closeModal?.();
      showToast(`${slot.char} 글자의 부분 적용 화면을 열었습니다.`, 'success', 2200);
    });

    grid.appendChild(card);
  });
}

// ── Shared image utilities ──────────────────────────────────

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('템플릿 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      readImageSource(reader.result).then(resolve).catch(reject);
    };
    reader.readAsDataURL(file);
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

export function readImageSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('지원하지 않는 이미지 파일입니다.'));
    img.src = src;
  });
}

export function createImageDataUrl(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function validateTemplateImage(image, metrics) {
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
