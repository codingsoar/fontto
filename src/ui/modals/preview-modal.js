/**
 * preview-modal.js - text preview modal for composed glyphs
 */

import {
  composeCharFromLib,
  drawGlyphOnCtx,
} from '../../core/glyph-utils.js';
import { deriveAll } from '../../core/jamo-derive.js';

/**
 * Show a preview modal where the user can type text and see composed glyphs.
 * @param {Object} app FonttoApp instance (uses app.jamoLib)
 * @param {{ initialText?: string }} options
 */
export function showPreviewModal(app, options = {}) {
  const fullLib = deriveAll(app.jamoLib);
  const defaultPreviewText = options.initialText || '가나다라마바사\n아자차카타파하\n내 손글씨 폰트 테스트';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal preview-modal">
      <div class="modal-header">
        <h2>미리보기</h2>
        <button class="modal-close" id="closePreviewModal">x</button>
      </div>
      <div class="modal-body">
        <div class="preview-assist-panel">
          <div class="preview-assist-row">
            <label class="preview-assist-check">
              <input type="checkbox" id="previewAutoSpacing" checked />
              <span>AI 자간 보정</span>
            </label>
            <label class="preview-assist-range">
              <span>기본 간격</span>
              <input type="range" id="previewSpacingRange" min="-6" max="16" value="0" />
            </label>
            <button class="gen-btn" id="previewPolishBtn">문장 다듬기</button>
          </div>
          <p class="preview-assist-note" id="previewAssistNote">글자 외곽 여백을 읽어 자간을 보정합니다. 문장 다듬기는 오프라인 규칙 기반 보정입니다.</p>
        </div>
        <textarea class="preview-textarea" id="previewText" placeholder="미리보기 문장을 입력하세요." spellcheck="true" lang="ko">${defaultPreviewText}</textarea>
        <div class="preview-render" id="previewRender"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('closePreviewModal');
  let shouldCloseFromBackdrop = false;
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('pointerdown', (e) => {
    shouldCloseFromBackdrop = e.target === overlay;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && shouldCloseFromBackdrop) overlay.remove();
    shouldCloseFromBackdrop = false;
  });

  const textarea = document.getElementById('previewText');
  const renderDiv = document.getElementById('previewRender');
  const autoSpacingInput = document.getElementById('previewAutoSpacing');
  const spacingRange = document.getElementById('previewSpacingRange');
  const polishBtn = document.getElementById('previewPolishBtn');
  const note = document.getElementById('previewAssistNote');
  let isComposing = false;

  const render = () => {
    renderPreviewText(textarea.value, renderDiv, fullLib, {
      autoSpacing: Boolean(autoSpacingInput?.checked),
      letterSpacing: Number(spacingRange?.value || 0),
    });

    if (note) {
      note.textContent = autoSpacingInput?.checked
        ? '글자 외곽 여백을 읽어 자간을 보정합니다. 문장 다듬기는 오프라인 규칙 기반 보정입니다.'
        : '자동 자간 보정은 꺼져 있습니다. 기본 간격 슬라이더만 적용됩니다.';
    }
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
  autoSpacingInput?.addEventListener('change', render);
  spacingRange?.addEventListener('input', render);
  polishBtn?.addEventListener('click', () => {
    textarea.value = polishReviewText(textarea.value);
    render();
  });
  render();
}

function renderPreviewText(text, container, jamoLib, options = {}) {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const lines = text.split('\n');
  const paddingX = 20;
  const paddingY = 18;
  const cellSize = 48;
  const gap = Math.max(0, Number(options.letterSpacing || 0)) + 6;
  const lineHeight = cellSize + 14;
  const maxChars = Math.max(...lines.map((line) => line.length), 1);
  const contentWidth = paddingX * 2 + Math.max(0, maxChars * (cellSize + gap) - gap);
  const contentHeight = paddingY * 2 + Math.max(0, lines.length * lineHeight - (lineHeight - cellSize));
  const w = Math.max(Math.ceil(container.clientWidth || 700), contentWidth);
  const h = Math.max(Math.ceil(container.clientHeight || 260), contentHeight);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const char = line[charIndex];
      if (char === ' ') continue;

      const x = paddingX + charIndex * (cellSize + gap);
      const y = paddingY + lineIndex * lineHeight;
      const commands = composeCharFromLib(char, jamoLib);
      if (!commands.length) continue;
      drawGlyphOnCtx(ctx, commands, x, y, cellSize);
    }
  }

  container.appendChild(canvas);
}

function polishReviewText(text) {
  return (text || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=\S)/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n[ ]+/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}
