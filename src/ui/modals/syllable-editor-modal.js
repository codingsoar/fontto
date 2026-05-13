/**
 * syllable-editor-modal.js - per-syllable fine-tuning editor
 *
 * Allows users to adjust cho/jung/jong offsets and scales for individual syllables,
 * producing an override that is applied on top of the standard composition.
 */

import { decomposeChar, drawGlyphOnCtx, isSyllableDeleted } from '../../core/glyph-utils.js';
import { deriveAll } from '../../core/jamo-derive.js';
import { composeSyllable, composeSyllableParts } from '../../core/composer.js';
import { showToast } from '../toast.js';

const OVERRIDE_STORAGE_KEY = 'fontto-syllable-overrides-v1';

function createDefaultOverride() {
  return {
    cho: { dx: 0, dy: 0, sx: 1, sy: 1 },
    jung: { dx: 0, dy: 0, sx: 1, sy: 1 },
    jong: { dx: 0, dy: 0, sx: 1, sy: 1 },
  };
}

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(overrides) {
  try {
    localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.warn('글자별 조정값 저장 실패:', err);
  }
}

export function applyOverrideToCommands(commands, override) {
  if (!override || !commands?.length) return commands;
  const { dx = 0, dy = 0, sx = 1, sy = 1 } = override;
  if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return commands;

  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const cmd of commands) {
    if (cmd.x !== undefined && cmd.y !== undefined) {
      sumX += cmd.x;
      sumY += cmd.y;
      count += 1;
    }
  }
  const cx = count > 0 ? sumX / count : 500;
  const cy = count > 0 ? sumY / count : 500;

  const transform = (x, y) => ({
    x: Math.round((x - cx) * sx + cx + dx),
    y: Math.round((y - cy) * sy + cy + dy),
  });

  return commands.map((cmd) => {
    const next = { type: cmd.type };
    if (cmd.x !== undefined && cmd.y !== undefined) {
      const point = transform(cmd.x, cmd.y);
      next.x = point.x;
      next.y = point.y;
    }
    if (cmd.x1 !== undefined && cmd.y1 !== undefined) {
      const point = transform(cmd.x1, cmd.y1);
      next.x1 = point.x;
      next.y1 = point.y;
    }
    if (cmd.x2 !== undefined && cmd.y2 !== undefined) {
      const point = transform(cmd.x2, cmd.y2);
      next.x2 = point.x;
      next.y2 = point.y;
    }
    return next;
  });
}

export function showSyllableEditorModal(app, char) {
  const info = decomposeChar(char);
  if (!info) {
    showToast('올바른 한글 음절을 선택하세요.', 'warning');
    return;
  }

  const overrides = loadOverrides();
  const saved = overrides[char] || createDefaultOverride();
  const current = {
    cho: { ...saved.cho },
    jung: { ...saved.jung },
    jong: { ...saved.jong },
  };
  const fullLib = deriveAll(app.jamoLib);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal syllable-editor-modal">
      <div class="modal-header">
        <h2>${char} 미세 조정</h2>
        <button class="modal-close" id="closeSyllableEditorModal">x</button>
      </div>
      <div class="modal-body syllable-editor-body">
        <div class="syllable-editor-preview">
          <canvas id="syllableEditorCanvas" width="300" height="300"></canvas>
        </div>
        <div class="syllable-editor-controls">
          ${buildPartControls('초성', 'cho', current.cho)}
          ${buildPartControls('중성', 'jung', current.jung)}
          ${info.jong > 0 ? buildPartControls('종성', 'jong', current.jong) : ''}
          <div class="syllable-editor-actions">
            <button class="tool-btn" id="syllableEditorDeleteBtn">삭제</button>
            <button class="gen-btn" id="syllableEditorResetBtn">초기화</button>
            <button class="gen-btn" id="syllableEditorApplyRelatedBtn">관련 카드 전체 적용</button>
            <button class="gen-btn download-btn" id="syllableEditorSaveBtn">조정값 저장</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const canvas = document.getElementById('syllableEditorCanvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 300 * dpr;
  canvas.height = 300 * dpr;
  canvas.style.width = '300px';
  canvas.style.height = '300px';
  ctx.scale(dpr, dpr);

  const render = () => {
    renderPreview(ctx, char, info, fullLib, current);
  };

  ['cho', 'jung', 'jong'].forEach((part) => {
    ['dx', 'dy', 'sx', 'sy'].forEach((prop) => {
      const slider = document.getElementById(`se-${part}-${prop}`);
      const label = document.getElementById(`se-${part}-${prop}-val`);
      if (!slider || !label || !current[part]) return;

      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        current[part][prop] = value;
        label.textContent = prop.startsWith('s') ? value.toFixed(2) : Math.round(value);
        render();
      });
    });
  });

  document.getElementById('closeSyllableEditorModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.getElementById('syllableEditorDeleteBtn').addEventListener('click', () => {
    if (app?._deleteSyllableCard?.(char)) {
      overlay.remove();
    }
  });

  document.getElementById('syllableEditorResetBtn').addEventListener('click', () => {
    ['cho', 'jung', 'jong'].forEach((part) => {
      if (!current[part]) return;
      current[part] = { dx: 0, dy: 0, sx: 1, sy: 1 };
      ['dx', 'dy', 'sx', 'sy'].forEach((prop) => {
        const slider = document.getElementById(`se-${part}-${prop}`);
        const label = document.getElementById(`se-${part}-${prop}-val`);
        if (slider) slider.value = prop.startsWith('s') ? 1 : 0;
        if (label) label.textContent = prop.startsWith('s') ? '1.00' : '0';
      });
    });
    render();
  });

  document.getElementById('syllableEditorSaveBtn').addEventListener('click', () => {
    app?._restoreDeletedSyllable?.(char);
    overrides[char] = {
      cho: { ...current.cho },
      jung: { ...current.jung },
      jong: { ...current.jong },
    };
    saveOverrides(overrides);
    app?._refreshGlyphViews?.();
    showToast(`${char} 조정값을 저장했습니다.`, 'success', 2000);
    render();
  });

  document.getElementById('syllableEditorApplyRelatedBtn').addEventListener('click', () => {
    app?._restoreDeletedSyllable?.(char);
    overrides[char] = {
      cho: { ...current.cho },
      jung: { ...current.jung },
      jong: { ...current.jong },
    };
    saveOverrides(overrides);

    const result = app?._applySyllableOverrideToRelatedCards?.(char, current);
    if (!result?.applied) {
      showToast('관련 글자 카드를 찾지 못했습니다.', 'warning', 2200);
      return;
    }

    showToast(`${result.applied}개의 관련 글자 카드에 조정값을 적용했습니다.`, 'success', 2400);
    render();
  });

  render();
}

function buildPartControls(label, partKey, values) {
  return `
    <div class="syllable-editor-part">
      <h4 class="syllable-editor-part-label">${label}</h4>
      <div class="syllable-editor-sliders">
        ${buildSlider(partKey, 'dx', '가로 위치', values.dx, -200, 200, 1)}
        ${buildSlider(partKey, 'dy', '세로 위치', values.dy, -200, 200, 1)}
        ${buildSlider(partKey, 'sx', '가로 크기', values.sx, 0.5, 1.5, 0.01)}
        ${buildSlider(partKey, 'sy', '세로 크기', values.sy, 0.5, 1.5, 0.01)}
      </div>
    </div>
  `;
}

function buildSlider(part, prop, label, value, min, max, step) {
  const displayValue = prop.startsWith('s') ? value.toFixed(2) : Math.round(value);
  return `
    <label class="syllable-editor-slider-row">
      <span class="syllable-editor-slider-label">${label}</span>
      <input type="range" id="se-${part}-${prop}" min="${min}" max="${max}" step="${step}" value="${value}" class="syllable-editor-slider" />
      <span class="syllable-editor-slider-value" id="se-${part}-${prop}-val">${displayValue}</span>
    </label>
  `;
}

function renderPreview(ctx, char, info, fullLib, overrides) {
  const size = 300;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  if (isSyllableDeleted(char)) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.font = '600 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('삭제된 글자', size / 2, size / 2 - 12);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillText('복원 후 다시 미세 조정할 수 있습니다.', size / 2, size / 2 + 18);
    ctx.restore();
    return;
  }

  const commands = composeSyllable(info.cho, info.jung, info.jong, fullLib);
  const parts = composeSyllableParts(info.cho, info.jung, info.jong, fullLib);
  const allCommands = [
    ...applyOverrideToCommands(parts.cho, overrides.cho),
    ...applyOverrideToCommands(parts.jung, overrides.jung),
    ...applyOverrideToCommands(parts.jong, overrides.jong),
  ];

  if (allCommands.length > 0) {
    drawGlyphOnCtx(ctx, allCommands, 0, 0, size);
  } else {
    drawGlyphOnCtx(ctx, commands, 0, 0, size);
  }
}
