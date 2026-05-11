/**
 * preview-modal.js — text preview modal for composed glyphs
 */

import {
  decomposeChar,
  composeCharFromLib,
  drawGlyphOnCtx,
  getCommandBounds,
} from '../../core/glyph-utils.js';
import { deriveAll } from '../../core/jamo-derive.js';

/**
 * Show a preview modal where the user can type text and see composed glyphs.
 * @param {Object} app FonttoApp instance (uses app.jamoLib)
 * @param {{ initialText?: string }} options
 */
export function showPreviewModal(app, options = {}) {
  const fullLib = deriveAll(app.jamoLib);
  const defaultPreviewText = options.initialText || '가나다라마바사\n아자차카타파하\n손글씨 폰트 테스트';
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
        : '자동 자간 보정이 꺼져 있습니다. 기본 간격 슬라이더만 적용됩니다.';
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
  const maxChars = Math.max(...lines.map((line) => line.length), 1);
  const paddingX = 20;
  const availableWidth = Math.max((container.clientWidth || 700) - 32, 240);
  const gap = Math.min(8, Math.max(-8, Number(options.letterSpacing || 0)));
  const cellSize = Math.max(
    Math.min(
      48,
      (availableWidth - paddingX * 2 - Math.max(gap, 0) * Math.max(maxChars - 1, 0)) / maxChars
    ),
    1
  );
  const lineHeight = cellSize + 12;
  const layouts = lines.map((line) => buildLineLayout(line, jamoLib, cellSize, gap, options));

  const w = Math.ceil(Math.max(...layouts.map((layout) => layout.width), 0) + paddingX * 2);
  const h = lines.length * lineHeight + 20;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  for (let lineIndex = 0; lineIndex < layouts.length; lineIndex += 1) {
    const layout = layouts[lineIndex];
    for (let charIndex = 0; charIndex < layout.items.length; charIndex += 1) {
      const item = layout.items[charIndex];
      const char = item.char;
      if (char === ' ') continue;

      const x = paddingX + item.x;
      const y = 10 + lineIndex * lineHeight;
      const commands = composeCharFromLib(char, jamoLib);
      if (!commands.length) continue;
      drawGlyphOnCtx(ctx, commands, x, y, cellSize);
    }
  }

  container.appendChild(canvas);
}

function buildLineLayout(line, jamoLib, cellSize, gap, options) {
  const items = [];
  const glyphs = Array.from(line).map((char) => {
    const info = decomposeChar(char);
    const commands = composeCharFromLib(char, jamoLib);
    return {
      char,
      bounds: getCommandBounds(commands),
    };
  });

  const autoSpacing = options.autoSpacing !== false;
  const defaultAdvance = Math.max(cellSize * 0.55, cellSize + gap);
  const desiredWhitespace = cellSize * 0.14;
  let cursor = 0;

  glyphs.forEach((glyph, index) => {
    items.push({ char: glyph.char, x: cursor });
    if (index === glyphs.length - 1) return;

    const nextGlyph = glyphs[index + 1];
    let advance = defaultAdvance;

    if (glyph.char === ' ' || nextGlyph.char === ' ') {
      advance = Math.max(cellSize * 0.42, cellSize * 0.38 + gap);
    } else if (autoSpacing && glyph.bounds && nextGlyph.bounds) {
      const currentRight = ((1000 - glyph.bounds.maxX) / 1000) * cellSize;
      const nextLeft = (nextGlyph.bounds.minX / 1000) * cellSize;
      const pairWhitespace = currentRight + nextLeft;
      const delta = pairWhitespace - desiredWhitespace;
      advance -= delta * 0.55;
    }

    advance = Math.max(cellSize * 0.5, Math.min(cellSize * 1.24, advance));
    cursor += advance;
  });

  return {
    items,
    width: cursor + cellSize,
  };
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
