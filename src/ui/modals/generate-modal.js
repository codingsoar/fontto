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
    showToast(`검수하거나 내보내려면 필수 자모 ${remaining}개를 더 완성해야 합니다.`);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal generate-modal">
      <div class="modal-header">
        <h2>폰트 생성</h2>
        <button class="modal-close" id="closeGenModal">x</button>
      </div>
      <div class="modal-body">
        <div class="gen-form">
          <label class="gen-label">
              <span>폰트 이름</span>
            <input type="text" class="gen-input" id="fontNameInput" value="MyHangulFont" placeholder="폰트 이름을 입력하세요" />
          </label>
        </div>
        <section class="download-gate-card" id="downloadGateCard">
          <div class="download-gate-copy">
            <strong>다운로드 결제 상태</strong>
            <p>미리보기와 생성은 무료입니다. TTF 다운로드만 mock 결제 해제 후 열립니다.</p>
          </div>
          <div class="download-gate-meta" id="downloadGateMeta"></div>
        </section>
        <div class="gen-progress" id="genProgress" style="display:none">
          <div class="gen-progress-bar">
            <div class="gen-progress-fill" id="genProgressFill"></div>
          </div>
            <span class="gen-progress-text" id="genProgressText">준비 중...</span>
        </div>
        <div class="gen-actions">
          <button class="gen-btn" id="genStartBtn">생성하기</button>
          <button class="gen-btn" id="genMockPurchaseBtn">Mock 결제 완료 처리</button>
          <button class="gen-btn" id="genResetPurchaseBtn">잠금 상태로 되돌리기</button>
          <button class="gen-btn download-btn" id="genDownloadBtn" disabled>TTF 다운로드</button>
        </div>
        <p class="gen-hint" id="genHint">폰트 이름을 바꾼 뒤에는 다시 생성해야 새 이름으로 다운로드됩니다.</p>
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
    showToast(`'${fontName}' 다운로드가 mock 결제 완료 상태로 열렸습니다.`, 'success', 2400);
  });

  document.getElementById('genResetPurchaseBtn')?.addEventListener('click', () => {
    app._lockDownload();
    syncDownloadGate(app);
    showToast('TTF 다운로드 상태를 다시 잠금으로 되돌렸습니다.', 'warning', 2400);
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
        if (progressText) progressText.textContent = `생성 중... ${pct}%`;
      }
    );

    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = '생성이 완료되었습니다.';

    app._generatedBuffer = buffer;
    app._generatedFontName = fontName;

    syncDownloadGate(app);
  } catch (err) {
    console.error('폰트 생성 오류:', err);
    if (progressText) progressText.textContent = `오류: ${err.message}`;
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
      ? `<span class="download-gate-badge is-open">열림</span><span>${currentName} 다운로드가 mock 결제 완료 상태입니다.</span>`
      : `<span class="download-gate-badge is-locked">잠금</span><span>현재 이름 기준으로는 아직 결제되지 않았습니다. 테스트 가격: 9,900 KRW</span>`;
    const generated = hasBuffer
      ? `<span>생성 완료 파일: <strong>${generatedFontName}</strong></span>`
      : '<span>아직 생성된 TTF 버퍼가 없습니다.</span>';
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
        showToast('먼저 폰트를 생성하고 mock 결제 상태를 열어야 다운로드할 수 있습니다.', 'warning', 2600);
        return;
      }
      downloadFont(app._generatedBuffer, `${generatedFontName}.ttf`);
    };
  }
}
