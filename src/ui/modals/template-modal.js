/**
 * template-modal.js — template import modal
 */

import {
  buildTemplateSvg,
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
import { showToast } from '../toast.js';

/**
 * Show the template import modal.
 * @param {Object} app — FonttoApp instance
 */
export function showTemplateModal(app) {
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
        <details class="template-legacy" id="templatePreviewDetails">
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
    hideManualContextMenu(manualState);
  });

  const previewImage = document.getElementById('templatePreviewImage');
  const previewDetails = document.getElementById('templatePreviewDetails');
  let previewGenerated = false;

  previewDetails.addEventListener('toggle', () => {
    if (previewDetails.open && !previewGenerated) {
      previewGenerated = true;
      previewImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildTemplateSvg(slots))}`;
    }
  });

  const importReviewEl = document.getElementById('templateImportReview');

  document.getElementById('downloadTemplateBtn').addEventListener('click', async () => {
    await downloadTemplate(app, slots);
  });

  document.getElementById('templateFileInput').addEventListener('change', async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) return;

    const statusEl = document.getElementById('templateStatus');
    statusEl.textContent = 'Importing template...';

    try {
      const summary = await importTemplateFile(app, file, slots);
      statusEl.textContent = `Imported ${summary.imported} source syllables. Skipped ${summary.skipped} empty boxes.`;
      renderTemplateImportReview(app, importReviewEl, summary.importedSlots, close);
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
      ? 'Upload an image, click stroke groups to select them, then right-click to assign them.'
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
      manualStatus.textContent = 'Enter the syllable first so Fontto knows which parts to save.';
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
      manualStatus.textContent = `Detected ${extracted.components.length} stroke groups. Select groups, then right-click to assign them.`;
      renderManual();
    } catch (error) {
      manualStatus.textContent = `Split failed: ${error.message}`;
    }
  });

  applyBtn.addEventListener('click', () => {
    const result = app._applyManualSplitAssignments(manualState);
    manualStatus.textContent = result.applied > 0
      ? `Applied ${result.applied} part${result.applied === 1 ? '' : 's'} to the matching glyph card${result.applied === 1 ? '' : 's'}.`
      : `Applied 0 parts: ${result.reason || 'select a stroke group and target first.'}`;
    renderManual();
  });

  renderManual();
}

// ── Template download & import helpers ─────────────────────

async function downloadTemplate(app, slots) {
  const svg = buildTemplateSvg(slots);
  const metrics = getTemplateMetrics(slots.length);
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
  link.download = 'fontto-template.png';
  link.click();
  URL.revokeObjectURL(svgUrl);
}

async function importTemplateFile(app, file, slots) {
  const image = await readImageFile(file);
  const metrics = getTemplateMetrics(slots.length);
  validateTemplateImage(image, metrics);
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
    const imageSrc = createImageDataUrl(cleanImageData);
    if (!app.syllableImports[slot.example]) {
      app.syllableImports[slot.example] = {
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
        targets: app._getTargetsForManualSplit(slot.example),
      });
      imported += 1;
    }
  });

  importedSlots.push(...importedByChar.values());
  app.previewPanel.updateSyllableImports(app.syllableImports);
  if (app.browserPanel) app.browserPanel.updateSyllableImports(app.syllableImports);
  app._persistState();
  showToast(`Template import complete: ${imported} source syllables`, imported > 0 ? 'success' : 'warning', 3200);

  return { imported, skipped, importedSlots };
}

function renderTemplateImportReview(app, container, importedSlots, closeModal) {
  if (!container) return;

  if (!importedSlots?.length) {
    container.innerHTML = '<div class="template-target-empty">No source syllables were extracted from the uploaded template.</div>';
    return;
  }

  container.innerHTML = `
    <div class="template-import-review-header">
      <h3>Extracted Source Syllables</h3>
      <p>Click a card to split it, then assign selected strokes to apply the needed part to the matching glyph cards.</p>
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
      app._showSyllableSplitModal(slot.char, {
        imageSrc: slot.imageSrc,
        targets: slot.targets,
      });
      closeModal?.();
      showToast(`Opened ${slot.char} for part assignment.`, 'success', 2200);
    });

    grid.appendChild(card);
  });
}

// ── Shared image utilities ──────────────────────────────────

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the template file.'));
    reader.onload = () => {
      readImageSource(reader.result).then(resolve).catch(reject);
    };
    reader.readAsDataURL(file);
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read the image file.'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

export function readImageSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported image file.'));
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
    throw new Error('This image does not match the Fontto template layout. Please upload the downloaded template PNG, not a browser screenshot.');
  }

  if (image.width < metrics.width * 0.65 || image.height < metrics.height * 0.65) {
    throw new Error('Template image is too small. Export or scan the sheet at a higher resolution.');
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
    throw new Error('No stroke groups were detected in the uploaded image.');
  }

  return extracted;
}
