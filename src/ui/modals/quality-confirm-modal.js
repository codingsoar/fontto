/**
 * quality-confirm-modal.js — confirmation dialog for saving drawings with quality warnings
 */

/**
 * Show a modal asking the user to confirm saving despite quality warnings.
 * @param {Object} report — quality report from DrawingCanvas
 * @param {Function} getWarningMessages — function to convert warning codes to messages
 * @param {Function} onConfirm — callback when user confirms saving
 */
export function showQualityConfirmModal(report, getWarningMessages, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const warningItems = getWarningMessages(report.warnings)
    .map((message) => `<li>${message}</li>`)
    .join('');

  overlay.innerHTML = `
    <div class="modal quality-confirm-modal">
      <div class="modal-header">
        <h2>저장 확인</h2>
        <button class="modal-close" id="closeQualityConfirmModal">x</button>
      </div>
      <div class="modal-body quality-confirm-body">
        <p class="quality-confirm-copy">이 그림은 글자 모양이 불안정하게 생성될 수 있습니다. 경고를 확인하거나 그대로 저장하세요.</p>
        <ul class="quality-warnings">${warningItems}</ul>
        <div class="quality-confirm-actions">
          <button class="gen-btn" id="qualityConfirmCancelBtn">계속 수정</button>
          <button class="gen-btn download-btn" id="qualityConfirmSaveBtn">그대로 저장</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.getElementById('closeQualityConfirmModal')?.addEventListener('click', close);
  document.getElementById('qualityConfirmCancelBtn')?.addEventListener('click', close);
  document.getElementById('qualityConfirmSaveBtn')?.addEventListener('click', () => {
    close();
    onConfirm?.();
  });
}
