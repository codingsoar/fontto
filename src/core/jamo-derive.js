/**
 * jamo-derive.js - derive composite jamo variants from saved base inputs
 */

import {
  DOUBLE_CONSONANT_MAP,
  COMPOUND_VOWEL_MAP,
  COMPOUND_JONG_MAP,
  VERTICAL_VOWELS,
  HORIZONTAL_VOWELS,
} from './hangul.js';

export function transformCommands(commands, sx, sy, tx, ty) {
  return commands.map((cmd) => {
    const next = { ...cmd };
    if (next.x !== undefined) next.x = next.x * sx + tx;
    if (next.y !== undefined) next.y = next.y * sy + ty;
    if (next.x1 !== undefined) next.x1 = next.x1 * sx + tx;
    if (next.y1 !== undefined) next.y1 = next.y1 * sy + ty;
    if (next.x2 !== undefined) next.x2 = next.x2 * sx + tx;
    if (next.y2 !== undefined) next.y2 = next.y2 * sy + ty;
    return next;
  });
}

export function mergeCommands(cmds1, cmds2) {
  return [...cmds1, ...cmds2];
}

function getCommandBounds(commands) {
  const points = [];

  for (const cmd of commands) {
    if (cmd.x !== undefined && cmd.y !== undefined) points.push({ x: cmd.x, y: cmd.y });
    if (cmd.x1 !== undefined && cmd.y1 !== undefined) points.push({ x: cmd.x1, y: cmd.y1 });
    if (cmd.x2 !== undefined && cmd.y2 !== undefined) points.push({ x: cmd.x2, y: cmd.y2 });
  }

  if (points.length === 0) {
    return null;
  }

  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

function fitCommandsToBox(commands, box) {
  const bounds = getCommandBounds(commands);
  if (!bounds) {
    return [];
  }

  const sourceWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const sourceHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(box.w / sourceWidth, box.h / sourceHeight);
  const offsetX = box.x + (box.w - sourceWidth * scale) / 2;
  const offsetY = box.y + (box.h - sourceHeight * scale) / 2;

  return commands.map((cmd) => {
    const next = { ...cmd };
    if (next.x !== undefined) next.x = (next.x - bounds.minX) * scale + offsetX;
    if (next.y !== undefined) next.y = (next.y - bounds.minY) * scale + offsetY;
    if (next.x1 !== undefined) next.x1 = (next.x1 - bounds.minX) * scale + offsetX;
    if (next.y1 !== undefined) next.y1 = (next.y1 - bounds.minY) * scale + offsetY;
    if (next.x2 !== undefined) next.x2 = (next.x2 - bounds.minX) * scale + offsetX;
    if (next.y2 !== undefined) next.y2 = (next.y2 - bounds.minY) * scale + offsetY;
    return next;
  });
}

export function deriveAll(jamoLib) {
  // With the 3-set 180-jamo structure, users manually draw all required
  // double consonants, compound vowels, and compound final consonants.
  // Therefore, no algorithmic derivation is needed here.
  return { ...jamoLib };
}
