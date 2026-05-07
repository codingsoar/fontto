/**
 * syllable-editor-modal.js — per-syllable fine-tuning editor
 *
 * Allows users to adjust cho/jung/jong offsets and scales for individual syllables,
 * producing an override that is applied on top of the standard composition.
 */

import { decomposeChar, composeSyllableFromLib, drawGlyphOnCtx } from '../../core/glyph-utils.js';
import { deriveAll } from '../../core/jamo-derive.js';
import { composeSyllable, getCompositionLayout } from '../../core/composer.js';
import { showToast } from '../toast.js';

const OVERRIDE_STORAGE_KEY = 'fontto-syllable-overrides-v1';

/**
 * Load syllable overrides from localStorage.
 * @returns {Object} — { '가': { cho: {dx,dy,sx,sy}, jung: {...}, jong: {...} }, ... }
 */
export function loadOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save syllable overrides to localStorage.
 */
export function saveOverrides(overrides) {
  try {
    localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.warn('글자 세부 조정값 저장 실패:', err);
  }
}

/**
 * Apply an override to a set of path commands.
 * @param {Array} commands
 * @param {{ dx: number, dy: number, sx: number, sy: number }} override
 * @returns {Array} transformed commands
 */
export function applyOverrideToCommands(commands, override) {
  if (!override || !commands?.length) return commands;
  const { dx = 0, dy = 0, sx = 1, sy = 1 } = override;
  if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return commands;

  // Find center for scaling
  let sumX = 0, sumY = 0, n = 0;
  for (const cmd of commands) {
    if (cmd.x !== undefined) { sumX += cmd.x; sumY += cmd.y; n++; }
  }
  const cx = n > 0 ? sumX / n : 500;
  const cy = n > 0 ? sumY / n : 500;

  return commands.map((cmd) => {
    const out = { type: cmd.type };
    const transform = (x, y) => ({
      x: Math.round((x - cx) * sx + cx + dx),
      y: Math.round((y - cy) * sy + cy + dy),
    });

    if (cmd.x !== undefined && cmd.y !== undefined) {
      const { x, y } = transform(cmd.x, cmd.y);
      out.x = x;
      out.y = y;
    }
    if (cmd.x1 !== undefined && cmd.y1 !== undefined) {
      const { x, y } = transform(cmd.x1, cmd.y1);
      out.x1 = x;
      out.y1 = y;
    }
    if (cmd.x2 !== undefined && cmd.y2 !== undefined) {
      const { x, y } = transform(cmd.x2, cmd.y2);
      out.x2 = x;
      out.y2 = y;
    }
    return out;
  });
}

/**
 * Show the syllable fine-tune editor modal.
 * @param {Object} app — FonttoApp instance
 * @param {string} char — syllable character
 */
export function showSyllableEditorModal(app, char) {
  const info = decomposeChar(char);
  if (!info) {
    showToast('올바른 한글 음절을 입력하세요.', 'warning');
    return;
  }

  const overrides = loadOverrides();
  const current = overrides[char] || {
    cho: { dx: 0, dy: 0, sx: 1, sy: 1 },
    jung: { dx: 0, dy: 0, sx: 1, sy: 1 },
    jong: { dx: 0, dy: 0, sx: 1, sy: 1 },
  };

  const fullLib = deriveAll(app.jamoLib);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal syllable-editor-modal">
      <div class="modal-header">
        <h2>${char} 세부 조정</h2>
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
            <button class="gen-btn" id="syllableEditorResetBtn">초기화</button>
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
    renderPreview(ctx, info, fullLib, current);
  };

  // Wire up sliders
  ['cho', 'jung', 'jong'].forEach((part) => {
    ['dx', 'dy', 'sx', 'sy'].forEach((prop) => {
      const slider = document.getElementById(`se-${part}-${prop}`);
      const label = document.getElementById(`se-${part}-${prop}-val`);
      if (!slider || !label) return;

      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        current[part][prop] = value;
        label.textContent = prop.startsWith('s') ? value.toFixed(2) : Math.round(value);
        render();
      });
    });
  });

  document.getElementById('closeSyllableEditorModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById('syllableEditorResetBtn').addEventListener('click', () => {
    ['cho', 'jung', 'jong'].forEach((part) => {
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
    overrides[char] = { ...current };
    saveOverrides(overrides);
    showToast(`${char} 조정값을 저장했습니다.`, 'success', 2000);
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

function renderPreview(ctx, info, fullLib, overrides) {
  const size = 300;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);

  // Draw crosshair guide
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  // Compose with overrides
  const commands = composeSyllable(info.cho, info.jung, info.jong, fullLib);
  // For now, apply a simple global override render
  // In future, we can split composition into parts for per-part override
  const layout = getCompositionLayout(info.jung, info.jong);
  
  // Apply cho override
  const choCommands = getPartCommands(commands, layout, 'cho');
  const jungCommands = getPartCommands(commands, layout, 'jung');
  const jongCommands = getPartCommands(commands, layout, 'jong');

  const allCommands = [
    ...applyOverrideToCommands(choCommands, overrides.cho),
    ...applyOverrideToCommands(jungCommands, overrides.jung),
    ...applyOverrideToCommands(jongCommands, overrides.jong),
  ];

  if (allCommands.length > 0) {
    drawGlyphOnCtx(ctx, allCommands, 0, 0, size);
  } else {
    // Fallback: render without part splitting
    drawGlyphOnCtx(ctx, commands, 0, 0, size);
  }
}

/**
 * Simple heuristic to split commands into parts based on Y position.
 * Not perfect, but good enough for offset preview.
 */
function getPartCommands(commands, layout, part) {
  if (!layout?.[part] || !commands?.length) return [];
  
  const slot = layout[part];
  const slotTop = (1 - slot.y) * 1000;
  const slotBottom = (1 - (slot.y + slot.h)) * 1000;
  const slotLeft = slot.x * 1000;
  const slotRight = (slot.x + slot.w) * 1000;
  const cx = (slotLeft + slotRight) / 2;
  const cy = (slotTop + slotBottom) / 2;

  const result = [];
  let inRange = false;
  
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      // Check if this contour starts within this slot
      const x = cmd.x ?? 0;
      const y = cmd.y ?? 0;
      const distX = Math.abs(x - cx) / Math.max(slotRight - slotLeft, 1);
      const distY = Math.abs(y - cy) / Math.max(slotTop - slotBottom, 1);
      inRange = distX < 0.8 && distY < 0.8;
    }
    
    if (inRange) {
      result.push(cmd);
    }
  }
  
  return result;
}
