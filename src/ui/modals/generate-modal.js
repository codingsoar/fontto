/**
 * generate-modal.js ??font generation and download modal
 */

import { generateFont, downloadFont } from '../../core/font-generator.js';
import { REQUIRED_JAMO_COUNT } from '../jamo-grid.js';
import { showToast } from '../toast.js';

/**
 * Show the font generation modal.
 * @param {Object} app ??FonttoApp instance
 */
export function showGenerateModal(app) {
  if (!app.jamoGrid?.isAllCompleted()) {
    const completedCount = app._getCompletedCount();
    const remaining = Math.max(REQUIRED_JAMO_COUNT - completedCount, 0);
    showToast(`寃?섑븯嫄곕굹 ?대낫?대젮硫??꾩닔 ?먮え ${remaining}媛쒕? ???꾩꽦?댁빞 ?⑸땲??`);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal generate-modal">
      <div class="modal-header">
        <h2>?고듃 ?앹꽦</h2>
        <button class="modal-close" id="closeGenModal">x</button>
      </div>
      <div class="modal-body">
        <div class="gen-form">
          <label class="gen-label">
              <span>?고듃 ?대쫫</span>
            <input type="text" class="gen-input" id="fontNameInput" value="MyHangulFont" placeholder="?고듃 ?대쫫???낅젰?섏꽭??" />
          </label>
        </div>
        <section class="download-gate-card" id="downloadGateCard">
          <div class="download-gate-copy">
            <strong>?ㅼ슫濡쒕뱶 寃곗젣 ?곹깭</strong>
            <p>誘몃━蹂닿린? ?앹꽦? 臾대즺?낅땲?? TTF ?ㅼ슫濡쒕뱶留?mock 寃곗젣 ?댁젣 ???대┰?덈떎.</p>
          </div>
          <div class="download-gate-meta" id="downloadGateMeta"></div>
        </section>
        <div class="gen-progress" id="genProgress" style="display:none">
          <div class="gen-progress-bar">
            <div class="gen-progress-fill" id="genProgressFill"></div>
          </div>
            <span class="gen-progress-text" id="genProgressText">以鍮?以?..</span>
        </div>
        <div class="gen-actions">
          <button class="gen-btn" id="genStartBtn">?앹꽦?섍린</button>
          <button class="gen-btn" id="genMockPurchaseBtn">Mock 寃곗젣 ?꾨즺 泥섎━</button>
          <button class="gen-btn" id="genResetPurchaseBtn">?좉툑 ?곹깭濡??섎룎由ш린</button>
          <button class="gen-btn download-btn" id="genDownloadBtn" disabled>TTF ?ㅼ슫濡쒕뱶</button>
        </div>
        <p class="gen-hint" id="genHint">?고듃 ?대쫫??諛붽씔 ?ㅼ뿉???ㅼ떆 ?앹꽦?댁빞 ???대쫫?쇰줈 ?ㅼ슫濡쒕뱶?⑸땲??</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('closeGenModal');
  closeBtn.addEventListener('click', () => overlay.remove());

  const startBtn = document.getElementById('genStartBtn');
  startBtn.addEventListener('click', () => startGeneration(app));

  document.getElementById('genMockPurchaseBtn')?.addEventListener('click', () => {
    const fontName = app._generatedFontName || document.getElementById('fontNameInput')?.value?.trim() || 'MyHangulFont';
    app._unlockDownload(fontName);
    syncDownloadGate(app);
    showToast(`'${fontName}' ?ㅼ슫濡쒕뱶媛 mock 寃곗젣 ?꾨즺 ?곹깭濡??대졇?듬땲??`, 'success', 2400);
  });

  document.getElementById('genResetPurchaseBtn')?.addEventListener('click', () => {
    app._lockDownload();
    syncDownloadGate(app);
    showToast('TTF ?ㅼ슫濡쒕뱶 ?곹깭瑜??ㅼ떆 ?좉툑?쇰줈 ?섎룎?몄뒿?덈떎.', 'warning', 2400);
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
    const buffer = generateFont(
      app.jamoLib,
      fontName,
      (progress) => {
        const pct = Math.round(progress * 100);
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `?앹꽦 以?.. ${pct}%`;
      }
    );

    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = '?앹꽦???꾨즺?섏뿀?듬땲??';

    app._generatedBuffer = buffer;
    app._generatedFontName = fontName;

    syncDownloadGate(app);
  } catch (err) {
    console.error('?고듃 ?앹꽦 ?ㅻ쪟:', err);
    if (progressText) progressText.textContent = `?ㅻ쪟: ${err.message}`;
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

  if (gateMeta) {
    const status = unlockedForCurrent
      ? `<span class="download-gate-badge is-open">?대┝</span><span>${currentName} ?ㅼ슫濡쒕뱶媛 mock 寃곗젣 ?꾨즺 ?곹깭?낅땲??</span>`
      : `<span class="download-gate-badge is-locked">?좉툑</span><span>?꾩옱 ?대쫫 湲곗??쇰줈???꾩쭅 寃곗젣?섏? ?딆븯?듬땲?? ?뚯뒪??媛寃? 9,900 KRW</span>`;
    const generated = hasBuffer
      ? `<span>?앹꽦 ?꾨즺 ?뚯씪: <strong>${generatedFontName}</strong></span>`
      : '<span>?꾩쭅 ?앹꽦??TTF 踰꾪띁媛 ?놁뒿?덈떎.</span>';
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
        showToast('癒쇱? ?고듃瑜??앹꽦?섍퀬 mock 寃곗젣 ?곹깭瑜??댁뼱???ㅼ슫濡쒕뱶?????덉뒿?덈떎.', 'warning', 2600);
        return;
      }
      downloadFont(app._generatedBuffer, `${generatedFontName}.ttf`);
    };
  }
}
