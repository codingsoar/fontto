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

export function deriveDoubleConsonants(jamoLib) {
  const derived = {};
  const sidePadding = 0.03;
  const gap = 0.04;
  const componentWidth = (1 - sidePadding * 2 - gap) / 2;

  for (const [base, doubled] of Object.entries(DOUBLE_CONSONANT_MAP)) {
    for (const dir of ['v', 'h']) {
      const sourceKey = `cho_${dir}_${base}`;
      if (!jamoLib[sourceKey]) continue;

      const source = jamoLib[sourceKey];
      const left = fitCommandsToBox(source, {
        x: sidePadding,
        y: 0,
        w: componentWidth,
        h: 1,
      });
      const right = fitCommandsToBox(source, {
        x: sidePadding + componentWidth + gap,
        y: 0,
        w: componentWidth,
        h: 1,
      });

      derived[`cho_${dir}_${doubled}`] = mergeCommands(left, right);
    }
  }

  return derived;
}

export function deriveCompoundVowels(jamoLib) {
  const derived = {};

  for (const [compound, components] of Object.entries(COMPOUND_VOWEL_MAP)) {
    for (const suffix of ['nb', 'wb']) {
      const key = `jung_${suffix}_${compound}`;

      if (components.length === 2) {
        const [a, b] = components;
        const aKey = `jung_${suffix}_${a}`;
        const bKey = `jung_${suffix}_${b}`;
        if (!jamoLib[aKey] || !jamoLib[bKey]) continue;

        const isAHorizontal = HORIZONTAL_VOWELS.includes(a);
        const isBVertical = VERTICAL_VOWELS.includes(b) || b === 'ㅣ';

        if (isAHorizontal && isBVertical) {
          const aCmd = fitCommandsToBox(jamoLib[aKey], {
            x: 0,
            y: 0,
            w: 0.55,
            h: 0.5,
          });
          const bCmd = fitCommandsToBox(jamoLib[bKey], {
            x: 0.55,
            y: 0,
            w: 0.45,
            h: 1,
          });
          derived[key] = mergeCommands(aCmd, bCmd);
        } else {
          const aCmd = fitCommandsToBox(jamoLib[aKey], {
            x: 0,
            y: 0,
            w: 0.55,
            h: 1,
          });
          const bCmd = fitCommandsToBox(jamoLib[bKey], {
            x: 0.55,
            y: 0,
            w: 0.45,
            h: 1,
          });
          derived[key] = mergeCommands(aCmd, bCmd);
        }
      } else if (components.length === 3) {
        const [a, b, c] = components;
        const aKey = `jung_${suffix}_${a}`;
        const bKey = `jung_${suffix}_${b}`;
        const cKey = `jung_${suffix}_${c}`;
        if (!jamoLib[aKey] || !jamoLib[bKey] || !jamoLib[cKey]) continue;

        const aCmd = fitCommandsToBox(jamoLib[aKey], {
          x: 0,
          y: 0,
          w: 0.45,
          h: 0.5,
        });
        const bCmd = fitCommandsToBox(jamoLib[bKey], {
          x: 0.45,
          y: 0,
          w: 0.35,
          h: 1,
        });
        const cCmd = fitCommandsToBox(jamoLib[cKey], {
          x: 0.80,
          y: 0,
          w: 0.20,
          h: 1,
        });
        derived[key] = mergeCommands(mergeCommands(aCmd, bCmd), cCmd);
      }
    }
  }

  return derived;
}

export function deriveCompoundJong(jamoLib) {
  const derived = {};
  const sidePadding = 0.04;
  const gap = 0.08;
  const componentWidth = (1 - sidePadding * 2 - gap) / 2;

  for (const [compound, components] of Object.entries(COMPOUND_JONG_MAP)) {
    const [a, b] = components;
    const aKey = `jong_${a}`;
    const bKey = `jong_${b}`;
    if (!jamoLib[aKey] || !jamoLib[bKey]) continue;

    const left = fitCommandsToBox(jamoLib[aKey], {
      x: sidePadding,
      y: 0,
      w: componentWidth,
      h: 1,
    });
    const right = fitCommandsToBox(jamoLib[bKey], {
      x: sidePadding + componentWidth + gap,
      y: 0,
      w: componentWidth,
      h: 1,
    });
    derived[`jong_${compound}`] = mergeCommands(left, right);
  }

  return derived;
}

export function deriveAll(jamoLib) {
  const lib = { ...jamoLib };
  Object.assign(lib, deriveDoubleConsonants(lib));
  Object.assign(lib, deriveCompoundVowels(lib));
  Object.assign(lib, deriveCompoundJong(lib));
  return lib;
}
