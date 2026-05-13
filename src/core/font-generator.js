/**
 * font-generator.js — opentype.js 기반 TTF 폰트 생성기
 */

import opentype from 'opentype.js';
import { CHO, JUNG, JONG, compose, TOTAL_SYLLABLES } from './hangul.js';
import { composeSyllable, commandsToPath } from './composer.js';
import { deriveAll } from './jamo-derive.js';
import { deriveAsciiGlyphs } from './ascii-derive.js';
import { loadSyllableOverrides, composeSyllableWithOverride } from './glyph-utils.js';

const UPM = 1000;
const ASCENDER = 800;
const DESCENDER = -200;
const MAX_GLYPH_COMMANDS = 6000;
const MAX_GLYPH_CONTOURS = 1200;
const GENERATION_YIELD_INTERVAL = 96;

function roundCoord(value) {
  return Math.round(value * 10) / 10;
}

function hasFiniteCoord(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSamePoint(a, b) {
  return a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function sanitizeCommands(commands = []) {
  const sanitized = [];
  let contourStart = null;
  let currentPoint = null;
  let contourPointCount = 0;

  const closeContour = () => {
    if (contourStart && contourPointCount >= 2) {
      sanitized.push({ type: 'Z' });
    } else if (contourStart) {
      while (sanitized.length > 0 && sanitized[sanitized.length - 1].type !== 'Z') {
        sanitized.pop();
      }
    }

    contourStart = null;
    currentPoint = null;
    contourPointCount = 0;
  };

  for (const cmd of commands) {
    if (!cmd?.type) continue;

    if (cmd.type === 'M') {
      closeContour();
      if (!hasFiniteCoord(cmd.x) || !hasFiniteCoord(cmd.y)) continue;
      contourStart = { x: roundCoord(cmd.x), y: roundCoord(cmd.y) };
      currentPoint = contourStart;
      contourPointCount = 1;
      sanitized.push({ type: 'M', ...contourStart });
      continue;
    }

    if (!contourStart) continue;

    if (cmd.type === 'L') {
      if (!hasFiniteCoord(cmd.x) || !hasFiniteCoord(cmd.y)) continue;
      const nextPoint = { x: roundCoord(cmd.x), y: roundCoord(cmd.y) };
      if (isSamePoint(currentPoint, nextPoint)) continue;
      sanitized.push({ type: 'L', ...nextPoint });
      currentPoint = nextPoint;
      contourPointCount += 1;
      continue;
    }

    if (cmd.type === 'Q') {
      if (!hasFiniteCoord(cmd.x) || !hasFiniteCoord(cmd.y) || !hasFiniteCoord(cmd.x1) || !hasFiniteCoord(cmd.y1)) continue;
      const nextPoint = { x: roundCoord(cmd.x), y: roundCoord(cmd.y) };
      if (isSamePoint(currentPoint, nextPoint)) continue;
      sanitized.push({
        type: 'Q',
        x1: roundCoord(cmd.x1),
        y1: roundCoord(cmd.y1),
        ...nextPoint,
      });
      currentPoint = nextPoint;
      contourPointCount += 1;
      continue;
    }

    if (cmd.type === 'C') {
      if (
        !hasFiniteCoord(cmd.x) || !hasFiniteCoord(cmd.y)
        || !hasFiniteCoord(cmd.x1) || !hasFiniteCoord(cmd.y1)
        || !hasFiniteCoord(cmd.x2) || !hasFiniteCoord(cmd.y2)
      ) continue;
      const nextPoint = { x: roundCoord(cmd.x), y: roundCoord(cmd.y) };
      if (isSamePoint(currentPoint, nextPoint)) continue;
      sanitized.push({
        type: 'C',
        x1: roundCoord(cmd.x1),
        y1: roundCoord(cmd.y1),
        x2: roundCoord(cmd.x2),
        y2: roundCoord(cmd.y2),
        ...nextPoint,
      });
      currentPoint = nextPoint;
      contourPointCount += 1;
      continue;
    }

    if (cmd.type === 'Z') {
      closeContour();
    }
  }

  closeContour();
  return sanitized;
}

function getGlyphComplexity(commands = []) {
  let contourCount = 0;
  let pointCount = 0;

  for (const cmd of commands) {
    if (!cmd?.type) continue;
    if (cmd.type === 'M') contourCount += 1;
    if (cmd.type === 'L' || cmd.type === 'Q' || cmd.type === 'C') pointCount += 1;
  }

  return {
    commandCount: commands.length,
    contourCount,
    pointCount,
  };
}

function shouldSkipComplexGlyph(complexity) {
  return complexity.commandCount > MAX_GLYPH_COMMANDS || complexity.contourCount > MAX_GLYPH_CONTOURS;
}

function getSkipReason(complexity) {
  if (complexity.commandCount > MAX_GLYPH_COMMANDS) {
    return `command count ${complexity.commandCount} exceeds ${MAX_GLYPH_COMMANDS}`;
  }
  if (complexity.contourCount > MAX_GLYPH_CONTOURS) {
    return `contour count ${complexity.contourCount} exceeds ${MAX_GLYPH_CONTOURS}`;
  }
  return 'unknown complexity limit';
}

function createEmptyGlyph(name, unicode, advanceWidth = UPM) {
  return new opentype.Glyph({
    name,
    unicode,
    advanceWidth,
    path: new opentype.Path(),
  });
}

async function yieldToBrowser() {
  await new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

/**
 * 커맨드 배열 → opentype.Glyph
 */
function createGlyph(name, unicode, commands, advanceWidth = UPM) {
  const path = new opentype.Path();
  const safeCommands = sanitizeCommands(commands);
  const complexity = getGlyphComplexity(safeCommands);

  if (shouldSkipComplexGlyph(complexity)) {
    return createEmptyGlyph(name, unicode, advanceWidth);
  }

  for (const cmd of safeCommands) {
    switch (cmd.type) {
      case 'M': path.moveTo(cmd.x, cmd.y); break;
      case 'L': path.lineTo(cmd.x, cmd.y); break;
      case 'Q': path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y); break;
      case 'C': path.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y); break;
      case 'Z': path.closePath(); break;
    }
  }

  return new opentype.Glyph({
    name,
    unicode,
    advanceWidth,
    path,
  });
}

/**
 * 전체 폰트 생성
 *
 * @param {Object} jamoLib — 사용자가 그린 62자의 Path 커맨드 라이브러리
 * @param {string} fontName — 폰트 이름
 * @param {Function} onProgress — 진행률 콜백 (0~1)
 * @returns {ArrayBuffer} TTF 바이너리
 */
export async function generateFont(jamoLib, fontName = 'MyHandwritingFont', onProgress = null) {
  // 1. 자모 파생 (쌍자음, 복합모음, 겹받침)
  const fullLib = deriveAll(jamoLib);
  const syllableOverrides = loadSyllableOverrides();

  // 2. .notdef 글리프
  const notdefGlyph = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: UPM,
    path: new opentype.Path(),
  });

  // 3. 공백 글리프
  const spaceGlyph = new opentype.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: UPM / 2,
    path: new opentype.Path(),
  });

  const glyphs = [notdefGlyph, spaceGlyph];
  const skippedGlyphs = [];
  let count = 0;
  const total = 19 * 21 * 28; // 11172
  let processedSinceYield = 0;

  // 4. 한글 11,172 음절 생성
  for (let cho = 0; cho < 19; cho++) {
    for (let jung = 0; jung < 21; jung++) {
      for (let jong = 0; jong < 28; jong++) {
        const char = compose(cho, jung, jong);
        const unicode = char.charCodeAt(0);
        const name = `uni${unicode.toString(16).toUpperCase().padStart(4, '0')}`;

        const commands = composeSyllableWithOverride(cho, jung, jong, fullLib, syllableOverrides?.[char] || null);
        const complexity = getGlyphComplexity(sanitizeCommands(commands));
        if (shouldSkipComplexGlyph(complexity)) {
          skippedGlyphs.push({ char, name, unicode, reason: getSkipReason(complexity), ...complexity });
        }
        const glyph = createGlyph(name, unicode, commands);
        glyphs.push(glyph);

        count++;
        processedSinceYield += 1;
        if (onProgress && count % 200 === 0) {
          onProgress(count / total);
        }
        if (processedSinceYield >= GENERATION_YIELD_INTERVAL) {
          processedSinceYield = 0;
          await yieldToBrowser();
        }
      }
    }
  }

  // 4b. ASCII glyphs (33-126)
  const asciiLib = deriveAsciiGlyphs(jamoLib);
  for (let code = 33; code <= 126; code++) {
    if (code === 32) continue; // space already added
    const key = `ascii_${code}`;
    const commands = asciiLib[key] ?? [];
    if (commands.length === 0) continue;
    const char = String.fromCharCode(code);
    const name = `ascii_${char.replace(/[^A-Za-z0-9]/g, `u${code}`).padStart(4, '0')}`;
    const complexity = getGlyphComplexity(sanitizeCommands(commands));
    if (shouldSkipComplexGlyph(complexity)) {
      skippedGlyphs.push({ char, name, unicode: code, reason: getSkipReason(complexity), ...complexity });
    }
    const glyph = createGlyph(name, code, commands);
    glyphs.push(glyph);
    processedSinceYield += 1;
    if (processedSinceYield >= GENERATION_YIELD_INTERVAL) {
      processedSinceYield = 0;
      await yieldToBrowser();
    }
  }

  if (onProgress) onProgress(1);

  // 5. Font 객체 생성
  const font = new opentype.Font({
    familyName: fontName,
    styleName: 'Regular',
    fullName: `${fontName} Regular`,
    postScriptName: `${fontName.replace(/[^A-Za-z0-9]/g, '') || 'MyHangulFont'}-Regular`,
    unitsPerEm: UPM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs,
  });

  const buffer = font.toArrayBuffer();
  opentype.parse(buffer);
  if (skippedGlyphs.length > 0) {
    console.warn('[font-generator] skipped overly complex glyphs to keep TTF valid', skippedGlyphs.slice(0, 50));
  }
  return {
    buffer,
    skippedGlyphs,
  };
}

/**
 * ArrayBuffer를 Blob URL로 변환하여 다운로드 가능하게 만듦
 */
export function fontBufferToDownloadUrl(buffer) {
  const blob = new Blob([buffer], { type: 'font/ttf' });
  return URL.createObjectURL(blob);
}

/**
 * 다운로드 트리거
 */
export function downloadFont(buffer, fileName = 'my-font.ttf') {
  const url = fontBufferToDownloadUrl(buffer);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 미리보기용: ArrayBuffer에서 @font-face 등록
 */
export function registerPreviewFont(buffer, fontName = 'PreviewFont') {
  const blob = new Blob([buffer], { type: 'font/ttf' });
  const url = URL.createObjectURL(blob);

  // 기존 등록된 것 제거
  const existingStyle = document.getElementById('preview-font-style');
  if (existingStyle) existingStyle.remove();

  const style = document.createElement('style');
  style.id = 'preview-font-style';
  style.textContent = `
    @font-face {
      font-family: '${fontName}';
      src: url('${url}') format('truetype');
    }
  `;
  document.head.appendChild(style);

  return fontName;
}
