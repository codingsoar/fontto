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
  const toast = document.createElement('div');
  toast.className = `toast${variant ? ` toast-${variant}` : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fade');
    setTimeout(() => toast.remove(), 500);
  }, duration);
}
