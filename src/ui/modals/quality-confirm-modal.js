/**
 * quality-confirm-modal.js — confirmation dialog for saving drawings with quality warnings
 */

/**
 * Show a modal asking the user to confirm saving despite quality warnings.
 * @param {Object} report — quality report from DrawingCanvas
 * @param {Function} getWarningMessages — function to convert warning codes to messages
 * @param {Function} onConfirm — callback when user clicks "Save anyway"
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
        <h2>Confirm Save</h2>
        <button class="modal-close" id="closeQualityConfirmModal">x</button>
      </div>
      <div class="modal-body quality-confirm-body">
        <p class="quality-confirm-copy">This drawing may produce unstable glyphs. Review the warnings or save anyway.</p>
        <ul class="quality-warnings">${warningItems}</ul>
        <div class="quality-confirm-actions">
          <button class="gen-btn" id="qualityConfirmCancelBtn">Keep editing</button>
          <button class="gen-btn download-btn" id="qualityConfirmSaveBtn">Save anyway</button>
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
