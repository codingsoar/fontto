/**
 * preview-modal.js — text preview modal for composed glyphs
 */

import { decomposeChar, composeSyllableFromLib, drawGlyphOnCtx } from '../../core/glyph-utils.js';
import { deriveAll } from '../../core/jamo-derive.js';

/**
 * Show a preview modal where the user can type text and see composed glyphs.
 * @param {Object} app — FonttoApp instance (uses app.jamoLib)
 */
export function showPreviewModal(app) {
  const fullLib = deriveAll(app.jamoLib);
  const defaultPreviewText = '가나다라마바사\n아자차카타파하\n손글씨 폰트 테스트';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal preview-modal">
      <div class="modal-header">
        <h2>Preview</h2>
        <button class="modal-close" id="closePreviewModal">x</button>
      </div>
      <div class="modal-body">
        <textarea class="preview-textarea" id="previewText" placeholder="미리보기 문장을 입력하세요.">${defaultPreviewText}</textarea>
        <div class="preview-render" id="previewRender"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('closePreviewModal');
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const textarea = document.getElementById('previewText');
  const renderDiv = document.getElementById('previewRender');
  let isComposing = false;

  const render = () => {
    renderPreviewText(textarea.value, renderDiv, fullLib);
  };

  textarea.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  textarea.addEventListener('compositionend', () => {
    isComposing = false;
    requestAnimationFrame(() => {
      render();
    });
  });
  textarea.addEventListener('input', () => {
    if (!isComposing) {
      render();
    }
  });
  render();
}

function renderPreviewText(text, container, jamoLib) {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const lines = text.split('\n');
  const cellSize = 48;
  const lineHeight = cellSize + 12;
  const maxChars = Math.max(...lines.map(l => l.length), 1);

  const w = Math.min(maxChars * (cellSize + 4) + 40, container.clientWidth || 700);
  const h = lines.length * lineHeight + 20;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let ci = 0; ci < line.length; ci++) {
      const char = line[ci];
      if (char === ' ') continue;

      const x = 20 + ci * (cellSize + 4);
      const y = 10 + li * lineHeight;

      const info = decomposeChar(char);
      if (!info) continue;

      const commands = composeSyllableFromLib(info.cho, info.jung, info.jong, jamoLib);
      drawGlyphOnCtx(ctx, commands, x, y, cellSize);
    }
  }

  container.appendChild(canvas);
}
