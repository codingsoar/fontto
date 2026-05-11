/**
 * toast.js — lightweight toast notification system
 */

/**
 * Show a toast notification at the bottom of the screen.
 * @param {string} message — notification text
 * @param {string} variant — '' | 'success' | 'warning' | 'error'
 * @param {number} duration — display time in ms (default 3000)
 */
export function showToast(message, variant = '', duration = 3000) {
  const key = `${variant}::${message}`;
  const existing = [...document.querySelectorAll('.toast')].find((item) => item.dataset.toastKey === key);
  const toast = existing || document.createElement('div');

  toast.className = `toast${variant ? ` toast-${variant}` : ''}`;
  toast.textContent = message;
  toast.dataset.toastKey = key;

  if (!existing) {
    document.body.appendChild(toast);
  } else if (toast._removeTimer) {
    clearTimeout(toast._removeTimer);
  }

  toast._removeTimer = setTimeout(() => {
    toast.remove();
  }, duration);
}
