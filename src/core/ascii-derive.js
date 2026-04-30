/**
 * ascii-derive.js — derive lowercase, symbols from user-drawn uppercase + digits
 *
 * Strategy:
 *  - User draws A-Z (26) + 0-9 (10) = 36 glyphs
 *  - Lowercase a-z is derived by scaling uppercase down to 75% and shifting baseline
 *  - Basic punctuation/symbols get simple geometric fallbacks
 */

import { composeSyllable } from './composer.js';

/**
 * Get bounds of a set of path commands.
 * @param {Array} commands
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
function getCommandBounds(commands) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of commands) {
    if (cmd.x !== undefined) { minX = Math.min(minX, cmd.x); maxX = Math.max(maxX, cmd.x); }
    if (cmd.y !== undefined) { minY = Math.min(minY, cmd.y); maxY = Math.max(maxY, cmd.y); }
    if (cmd.x1 !== undefined) { minX = Math.min(minX, cmd.x1); maxX = Math.max(maxX, cmd.x1); }
    if (cmd.y1 !== undefined) { minY = Math.min(minY, cmd.y1); maxY = Math.max(maxY, cmd.y1); }
    if (cmd.x2 !== undefined) { minX = Math.min(minX, cmd.x2); maxX = Math.max(maxX, cmd.x2); }
    if (cmd.y2 !== undefined) { minY = Math.min(minY, cmd.y2); maxY = Math.max(maxY, cmd.y2); }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Scale and translate commands to fit within a target box (uniform scale, centered).
 */
function fitCommands(commands, targetX, targetY, targetW, targetH) {
  if (!commands?.length) return [];
  const bounds = getCommandBounds(commands);
  const srcW = Math.max(bounds.maxX - bounds.minX, 1);
  const srcH = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const offsetX = targetX + (targetW - srcW * scale) / 2 - bounds.minX * scale;
  const offsetY = targetY + (targetH - srcH * scale) / 2 - bounds.minY * scale;

  return commands.map((cmd) => {
    const out = { type: cmd.type };
    if (cmd.x !== undefined) out.x = Math.round(cmd.x * scale + offsetX);
    if (cmd.y !== undefined) out.y = Math.round(cmd.y * scale + offsetY);
    if (cmd.x1 !== undefined) out.x1 = Math.round(cmd.x1 * scale + offsetX);
    if (cmd.y1 !== undefined) out.y1 = Math.round(cmd.y1 * scale + offsetY);
    if (cmd.x2 !== undefined) out.x2 = Math.round(cmd.x2 * scale + offsetX);
    if (cmd.y2 !== undefined) out.y2 = Math.round(cmd.y2 * scale + offsetY);
    return out;
  });
}

/**
 * Derive lowercase letter commands from uppercase by scaling to ~72% and lowering.
 * Uppercase occupies roughly y: 250–850 (cap height).
 * Lowercase target: y: 200–650 (x-height ~450 units).
 */
export function deriveLowercase(upperCommands) {
  if (!upperCommands?.length) return [];
  return fitCommands(upperCommands, 100, 200, 800, 450);
}

/**
 * Derive all ASCII glyphs from a library of user-drawn uppercase + digits.
 * @param {Object} asciiLib — keys like 'ascii_A', 'ascii_B', ..., 'ascii_0', etc.
 * @returns {Object} — full ASCII glyph library with keys 'ascii_33' through 'ascii_126'
 */
export function deriveAsciiGlyphs(asciiLib) {
  const result = {};

  // Copy uppercase A-Z (charCode 65-90) from user input
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const key = `ascii_${letter}`;
    if (asciiLib[key]?.length) {
      result[`ascii_${i}`] = asciiLib[key];
    }
  }

  // Derive lowercase a-z (charCode 97-122) from uppercase
  for (let i = 97; i <= 122; i++) {
    const upperLetter = String.fromCharCode(i - 32);
    const upperKey = `ascii_${upperLetter}`;
    if (asciiLib[upperKey]?.length) {
      result[`ascii_${i}`] = deriveLowercase(asciiLib[upperKey]);
    }
  }

  // Copy digits 0-9 (charCode 48-57) from user input
  for (let i = 48; i <= 57; i++) {
    const digit = String.fromCharCode(i);
    const key = `ascii_${digit}`;
    if (asciiLib[key]?.length) {
      result[`ascii_${i}`] = asciiLib[key];
    }
  }

  // Generate basic symbol fallbacks
  const symbolGenerators = {
    32: () => [],                              // space
    33: () => makeExclamation(),                // !
    34: () => makeDoubleQuote(),                // "
    39: () => makeSingleQuote(),                // '
    40: () => makeParenOpen(),                  // (
    41: () => makeParenClose(),                 // )
    44: () => makeComma(),                      // ,
    45: () => makeHyphen(),                     // -
    46: () => makePeriod(),                     // .
    47: () => makeSlash(),                      // /
    58: () => makeColon(),                      // :
    59: () => makeSemicolon(),                   // ;
    63: () => makeQuestionMark(),                // ?
    91: () => makeBracketOpen(),                 // [
    93: () => makeBracketClose(),                // ]
  };

  Object.entries(symbolGenerators).forEach(([code, generator]) => {
    const key = `ascii_${code}`;
    if (!result[key]) {
      result[key] = generator();
    }
  });

  return result;
}

// ── Simple geometric symbol generators ─────────────────────

function makeRect(x, y, w, h) {
  const top = y + h;
  return [
    { type: 'M', x, y: top },
    { type: 'L', x: x + w, y: top },
    { type: 'L', x: x + w, y },
    { type: 'L', x, y },
    { type: 'Z' },
  ];
}

function makePeriod() {
  return makeRect(440, 140, 120, 120);
}

function makeComma() {
  return [
    ...makeRect(440, 80, 120, 140),
    ...makeRect(440, 10, 80, 80),
  ];
}

function makeColon() {
  return [
    ...makeRect(440, 580, 120, 120),
    ...makeRect(440, 280, 120, 120),
  ];
}

function makeSemicolon() {
  return [
    ...makeRect(440, 580, 120, 120),
    ...makeRect(440, 220, 120, 120),
    ...makeRect(440, 150, 80, 80),
  ];
}

function makeExclamation() {
  return [
    ...makeRect(440, 140, 120, 120),
    ...makeRect(450, 380, 100, 470),
  ];
}

function makeHyphen() {
  return makeRect(280, 460, 440, 80);
}

function makeSlash() {
  return [
    { type: 'M', x: 300, y: 100 },
    { type: 'L', x: 380, y: 100 },
    { type: 'L', x: 700, y: 900 },
    { type: 'L', x: 620, y: 900 },
    { type: 'Z' },
  ];
}

function makeQuestionMark() {
  return [
    ...makeRect(440, 140, 120, 120),
    ...makeRect(440, 380, 120, 140),
    ...makeRect(500, 520, 180, 80),
    ...makeRect(600, 520, 80, 200),
    ...makeRect(340, 720, 180, 80),
    ...makeRect(340, 600, 80, 130),
  ];
}

function makeParenOpen() {
  return [
    { type: 'M', x: 540, y: 100 },
    { type: 'L', x: 600, y: 100 },
    { type: 'Q', x1: 350, y1: 500, x: 600, y: 900 },
    { type: 'L', x: 540, y: 900 },
    { type: 'Q', x1: 300, y1: 500, x: 540, y: 100 },
    { type: 'Z' },
  ];
}

function makeParenClose() {
  return [
    { type: 'M', x: 400, y: 100 },
    { type: 'L', x: 460, y: 100 },
    { type: 'Q', x1: 700, y1: 500, x: 460, y: 900 },
    { type: 'L', x: 400, y: 900 },
    { type: 'Q', x1: 650, y1: 500, x: 400, y: 100 },
    { type: 'Z' },
  ];
}

function makeBracketOpen() {
  return [
    ...makeRect(360, 100, 60, 800),
    ...makeRect(360, 100, 240, 60),
    ...makeRect(360, 840, 240, 60),
  ];
}

function makeBracketClose() {
  return [
    ...makeRect(580, 100, 60, 800),
    ...makeRect(400, 100, 240, 60),
    ...makeRect(400, 840, 240, 60),
  ];
}

function makeSingleQuote() {
  return makeRect(460, 720, 80, 160);
}

function makeDoubleQuote() {
  return [
    ...makeRect(380, 720, 80, 160),
    ...makeRect(540, 720, 80, 160),
  ];
}
