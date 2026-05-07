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
        <div class="gen-progress" id="genProgress" style="display:none">
          <div class="gen-progress-bar">
            <div class="gen-progress-fill" id="genProgressFill"></div>
          </div>
            <span class="gen-progress-text" id="genProgressText">준비 중...</span>
        </div>
        <div class="gen-actions">
          <button class="gen-btn" id="genStartBtn">생성하기</button>
          <button class="gen-btn download-btn" id="genDownloadBtn" style="display:none">TTF 다운로드</button>
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
        if (progressText) progressText.textContent = `생성 중... ${pct}%`;
      }
    );

    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = '생성이 완료되었습니다.';

    app._generatedBuffer = buffer;

    if (downloadBtn) {
      downloadBtn.style.display = 'block';
      downloadBtn.onclick = () => {
        downloadFont(buffer, `${fontName}.ttf`);
      };
    }
  } catch (err) {
    console.error('폰트 생성 오류:', err);
    if (progressText) progressText.textContent = `오류: ${err.message}`;
  }

  if (startBtn) startBtn.disabled = false;
}
