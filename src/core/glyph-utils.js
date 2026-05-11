/**
 * glyph-utils.js — shared glyph rendering utilities
 *
 * Consolidates glyph drawing code that was duplicated across
 * main.js, preview-panel.js, and other modules.
 */

import { composeSyllable, composeSyllableParts } from './composer.js';
import { deriveAsciiGlyphs } from './ascii-derive.js';

const SYLLABLE_OVERRIDE_STORAGE_KEY = 'fontto-syllable-overrides-v1';

/**
 * Decompose a Hangul syllable character into cho/jung/jong indices.
 * @param {string} char — single Hangul character
 * @returns {{ cho: number, jung: number, jong: number } | null}
 */
export function decomposeChar(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  const offset = code - 0xAC00;
  const cho = Math.floor(offset / (21 * 28));
  const jung = Math.floor((offset % (21 * 28)) / 28);
  const jong = offset % 28;
  return { cho, jung, jong };
}

/**
 * Compose a syllable from cho/jung/jong using the given jamoLib.
 * @param {number} cho
 * @param {number} jung
 * @param {number} jong
 * @param {Object} jamoLib
 * @returns {Array} path commands
 */
export function composeSyllableFromLib(cho, jung, jong, jamoLib) {
  return composeSyllable(cho, jung, jong, jamoLib);
}

export function loadSyllableOverrides() {
  try {
    const raw = localStorage.getItem(SYLLABLE_OVERRIDE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSyllableOverrides(overrides) {
  try {
    localStorage.setItem(SYLLABLE_OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.warn('Failed to save syllable overrides:', error);
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

export function composeSyllableWithOverride(cho, jung, jong, jamoLib, override = null) {
  const commands = composeSyllable(cho, jung, jong, jamoLib);
  if (!override) return commands;

  const parts = composeSyllableParts(cho, jung, jong, jamoLib);
  const transformed = [
    ...applyOverrideToCommands(parts.cho, override.cho),
    ...applyOverrideToCommands(parts.jung, override.jung),
    ...applyOverrideToCommands(parts.jong, override.jong),
  ];

  return transformed.length > 0 ? transformed : commands;
}

export function composeCharFromLib(char, jamoLib, overridesMap = null) {
  const info = decomposeChar(char);
  if (!info) {
    if (!char || char.length !== 1) return [];
    const asciiCode = char.charCodeAt(0);
    if (asciiCode < 32 || asciiCode > 126) return [];
    const asciiLib = deriveAsciiGlyphs(jamoLib || {});
    return asciiLib[`ascii_${asciiCode}`] || [];
  }
  const overrides = overridesMap ?? loadSyllableOverrides();
  return composeSyllableWithOverride(info.cho, info.jung, info.jong, jamoLib, overrides?.[char] || null);
}

/**
 * Draw glyph path commands onto a canvas context.
 * Uses the font coordinate system (Y-up) mapped to canvas (Y-down).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} commands — path commands with type M/L/Q/C/Z
 * @param {number} x — top-left x
 * @param {number} y — top-left y
 * @param {number} size — cell size in pixels
 */
export function drawGlyphOnCtx(ctx, commands, x, y, size) {
  if (!commands || commands.length === 0) return;
  const scale = size / 1000;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': ctx.moveTo(x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
      case 'L': ctx.lineTo(x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
      case 'Q': ctx.quadraticCurveTo(x + cmd.x1 * scale, y + (1000 - cmd.y1) * scale, x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
      case 'C': ctx.bezierCurveTo(x + cmd.x1 * scale, y + (1000 - cmd.y1) * scale, x + cmd.x2 * scale, y + (1000 - cmd.y2) * scale, x + cmd.x * scale, y + (1000 - cmd.y) * scale); break;
      case 'Z': ctx.closePath(); break;
    }
  }

  ctx.fill();
  ctx.restore();
}

/**
 * Draw path commands with a custom fill style.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} commands
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} fillStyle
 */
export function drawPathCommands(ctx, commands, x, y, size, fillStyle = 'rgba(255, 255, 255, 0.92)') {
  const scale = size / 1000;
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  commands.forEach((cmd) => {
    switch (cmd.type) {
      case 'M':
        ctx.moveTo(x + cmd.x * scale, y + (1000 - cmd.y) * scale);
        break;
      case 'L':
        ctx.lineTo(x + cmd.x * scale, y + (1000 - cmd.y) * scale);
        break;
      case 'Q':
        ctx.quadraticCurveTo(
          x + cmd.x1 * scale, y + (1000 - cmd.y1) * scale,
          x + cmd.x * scale, y + (1000 - cmd.y) * scale
        );
        break;
      case 'C':
        ctx.bezierCurveTo(
          x + cmd.x1 * scale, y + (1000 - cmd.y1) * scale,
          x + cmd.x2 * scale, y + (1000 - cmd.y2) * scale,
          x + cmd.x * scale, y + (1000 - cmd.y) * scale
        );
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  });
  ctx.fill();
  ctx.restore();
}

/**
 * Create a canvas element with a rendered glyph.
 * @param {Array} commands — path commands
 * @param {number} size — pixel size
 * @returns {HTMLCanvasElement}
 */
export function createGlyphCanvas(commands, size) {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  drawGlyphOnCtx(ctx, commands, 0, 0, size);
  return canvas;
}

/**
 * Create a canvas element for a part preview with a dark background.
 * @param {Array} commands — path commands
 * @param {number} size — pixel size
 * @returns {HTMLCanvasElement}
 */
export function createPartPreviewCanvas(commands, size = 96) {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.fillRect(0, 0, size, size);
  drawPathCommands(ctx, commands, 0, 0, size);
  return canvas;
}

/**
 * Compute a loose bounding box for path commands in font units.
 * Useful for preview spacing heuristics.
 * @param {Array} commands
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } | null}
 */
export function getCommandBounds(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  commands.forEach((cmd) => {
    includePoint(cmd.x, cmd.y);
    includePoint(cmd.x1, cmd.y1);
    includePoint(cmd.x2, cmd.y2);
  });

  if (!Number.isFinite(minX)) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 0),
    height: Math.max(maxY - minY, 0),
  };
}
