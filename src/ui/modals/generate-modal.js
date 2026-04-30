/**
 * generate-modal.js — font generation and download modal
 */

import { generateFont, downloadFont } from '../../core/font-generator.js';
import { REQUIRED_JAMO_COUNT } from '../jamo-grid.js';
import { showToast } from '../toast.js';

/**
 * Show the font generation modal.
 * @param {Object} app — FonttoApp instance
 */
export function showGenerateModal(app) {
  if (!app.jamoGrid?.isAllCompleted()) {
    const completedCount = app._getCompletedCount();
    const remaining = Math.max(REQUIRED_JAMO_COUNT - completedCount, 0);
    showToast(`You still have ${remaining} required jamo to complete before review or export.`);
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
  startBtn.addEventListener('click', () => startGeneration(app));
}

async function startGeneration(app) {
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
      app.jamoLib,
      fontName,
      (progress) => {
        const pct = Math.round(progress * 100);
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `Generating... ${pct}%`;
      }
    );

    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = 'Generation complete.';

    app._generatedBuffer = buffer;

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
