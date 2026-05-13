/**
 * generate-modal.js - font generation and download modal
 */

import { generateFont, downloadFont } from '../../core/font-generator.js';
import { REQUIRED_JAMO_COUNT } from '../jamo-grid.js';
import { showToast } from '../toast.js';

/**
 * Show the font generation modal.
 * @param {Object} app - FonttoApp instance
 */
export function showGenerateModal(app) {
  if (!app.jamoGrid?.isAllCompleted()) {
    const completedCount = app._getCompletedCount();
    const remaining = Math.max(REQUIRED_JAMO_COUNT - completedCount, 0);
    showToast(`Generate is locked until the required ${remaining} jamo inputs are completed.`, 'warning');
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
            <span>Font Name</span>
            <input type="text" class="gen-input" id="fontNameInput" value="MyHangulFont" placeholder="Enter a font name" />
          </label>
        </div>
        <section class="download-gate-card" id="downloadGateCard">
          <div class="download-gate-copy">
            <strong>Download Access</strong>
            <p>Preview and generation are free. TTF download is still gated by the mock purchase state.</p>
          </div>
          <div class="download-gate-meta" id="downloadGateMeta"></div>
        </section>
        <div class="gen-progress" id="genProgress" style="display:none">
          <div class="gen-progress-bar">
            <div class="gen-progress-fill" id="genProgressFill"></div>
          </div>
          <span class="gen-progress-text" id="genProgressText">Preparing...</span>
        </div>
        <div class="gen-actions">
          <button class="gen-btn" id="genStartBtn">Generate</button>
          <button class="gen-btn" id="genMockPurchaseBtn">Mock Purchase</button>
          <button class="gen-btn" id="genResetPurchaseBtn">Reset Access</button>
          <button class="gen-btn download-btn" id="genDownloadBtn" disabled>Download TTF</button>
        </div>
        <p class="gen-hint" id="genHint">If you change the font name, generate again before downloading under that name.</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('closeGenModal')?.addEventListener('click', () => overlay.remove());
  document.getElementById('genStartBtn')?.addEventListener('click', () => startGeneration(app));

  document.getElementById('genMockPurchaseBtn')?.addEventListener('click', () => {
    const fontName = app._generatedFontName || document.getElementById('fontNameInput')?.value?.trim() || 'MyHangulFont';
    app._unlockDownload(fontName);
    syncDownloadGate(app);
    showToast(`Download access opened for '${fontName}'.`, 'success', 2400);
  });

  document.getElementById('genResetPurchaseBtn')?.addEventListener('click', () => {
    app._lockDownload();
    syncDownloadGate(app);
    showToast('Download access has been reset.', 'warning', 2400);
  });

  document.getElementById('fontNameInput')?.addEventListener('input', () => {
    syncDownloadGate(app);
  });

  syncDownloadGate(app);
}

async function startGeneration(app) {
  const fontName = document.getElementById('fontNameInput')?.value || 'MyHangulFont';
  const progressDiv = document.getElementById('genProgress');
  const progressFill = document.getElementById('genProgressFill');
  const progressText = document.getElementById('genProgressText');
  const startBtn = document.getElementById('genStartBtn');

  if (progressDiv) progressDiv.style.display = 'block';
  if (startBtn) startBtn.disabled = true;
  app._persistState?.();

  try {
    const result = await generateFont(
      app.jamoLib,
      fontName,
      (progress) => {
        const pct = Math.round(progress * 100);
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `Generating... ${pct}%`;
      }
    );
    const { buffer, skippedGlyphs = [] } = result;

    if (progressFill) progressFill.style.width = '100%';
    if (progressText) {
      progressText.textContent = skippedGlyphs.length > 0
        ? `Generation complete with ${skippedGlyphs.length} skipped glyphs.`
        : 'Generation complete.';
    }

    app._generatedBuffer = buffer;
    app._generatedFontName = fontName;
    app._generatedSkippedGlyphs = skippedGlyphs;

    syncDownloadGate(app);
    if (skippedGlyphs.length > 0) {
      showToast(`Generated font has ${skippedGlyphs.length} skipped glyphs. Review the affected inputs before download.`, 'warning', 4200);
    }
  } catch (err) {
    console.error('Font generation error:', err);
    if (progressText) progressText.textContent = `Error: ${err.message}`;
  }

  if (startBtn) startBtn.disabled = false;
}

function syncDownloadGate(app) {
  const fontNameInput = document.getElementById('fontNameInput');
  const gateMeta = document.getElementById('downloadGateMeta');
  const downloadBtn = document.getElementById('genDownloadBtn');
  const mockPurchaseBtn = document.getElementById('genMockPurchaseBtn');
  const resetPurchaseBtn = document.getElementById('genResetPurchaseBtn');
  const currentName = fontNameInput?.value?.trim() || 'MyHangulFont';
  const generatedFontName = app._generatedFontName || '';
  const hasBuffer = Boolean(app._generatedBuffer);
  const unlockedForGenerated = Boolean(generatedFontName && app._hasUnlockedDownload(generatedFontName));
  const unlockedForCurrent = app._hasUnlockedDownload(currentName);
  const skippedGlyphCount = app._generatedSkippedGlyphs?.length || 0;

  if (gateMeta) {
    const status = unlockedForCurrent
      ? `<span class="download-gate-badge is-open">Open</span><span>Download is unlocked for ${currentName}.</span>`
      : `<span class="download-gate-badge is-locked">Locked</span><span>Mock purchase is still required for ${currentName}. Demo price: 9,900 KRW.</span>`;
    const generated = hasBuffer
      ? `<span>Generated file: <strong>${generatedFontName}</strong>${skippedGlyphCount > 0 ? ` (${skippedGlyphCount} skipped glyphs)` : ''}</span>`
      : '<span>No generated TTF buffer yet.</span>';
    gateMeta.innerHTML = `${status}${generated}`;
  }

  if (mockPurchaseBtn) {
    mockPurchaseBtn.disabled = !hasBuffer;
  }

  if (resetPurchaseBtn) {
    resetPurchaseBtn.disabled = !app.downloadAccess?.unlocked;
  }

  if (downloadBtn) {
    downloadBtn.disabled = !(hasBuffer && unlockedForGenerated);
    downloadBtn.onclick = () => {
      if (!(hasBuffer && unlockedForGenerated)) {
        showToast('Generate the font and open mock purchase access before downloading.', 'warning', 2600);
        return;
      }
      downloadFont(app._generatedBuffer, `${generatedFontName}.ttf`);
    };
  }
}
