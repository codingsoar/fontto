/**
 * composer.js - compose a Hangul syllable from jamo paths
 */

import {
  CHO,
  JUNG,
  JONG,
  getBlockType,
  getVowelCategory,
  getChoInfo,
  getJungInfo,
  getJongInfo,
} from './hangul.js';
import { mergeCommands } from './jamo-derive.js';

const UPM = 1000;
const COMPOSITION_CONTEXT = {
  CV: 'cv',
  CVC_SIMPLE: 'cvc_simple',
  CVC_COMPOUND: 'cvc_compound',
};

const LAYOUT = {
  1: {
    cho: { x: 0.08, y: 0.11, w: 0.42, h: 0.79 },
    jung: { x: 0.47, y: 0.08, w: 0.39, h: 0.82 },
  },
  2: {
    cho: { x: 0.08, y: 0.46, w: 0.41, h: 0.45 },
    jung: { x: 0.47, y: 0.43, w: 0.38, h: 0.47 },
    jong: { x: 0.15, y: 0.09, w: 0.68, h: 0.20 },
  },
  3: {
    cho: { x: 0.14, y: 0.50, w: 0.72, h: 0.38 },
    jung: { x: 0.16, y: 0.12, w: 0.68, h: 0.24 },
  },
  4: {
    cho: { x: 0.14, y: 0.62, w: 0.72, h: 0.26 },
    jung: { x: 0.16, y: 0.39, w: 0.68, h: 0.18 },
    jong: { x: 0.15, y: 0.09, w: 0.68, h: 0.18 },
  },
  5: {
    cho: { x: 0.09, y: 0.53, w: 0.34, h: 0.31 },
    jung: { x: 0.16, y: 0.12, w: 0.70, h: 0.73 },
  },
  6: {
    cho: { x: 0.09, y: 0.58, w: 0.34, h: 0.25 },
    jung: { x: 0.16, y: 0.30, w: 0.70, h: 0.50 },
    jong: { x: 0.15, y: 0.08, w: 0.68, h: 0.16 },
  },
};

const CONTEXT_LAYOUT_OVERRIDES = {
  2: {
    [COMPOSITION_CONTEXT.CVC_COMPOUND]: {
      cho: { x: 0.09, y: 0.50, w: 0.39, h: 0.38 },
      jung: { x: 0.48, y: 0.47, w: 0.36, h: 0.40 },
      jong: { x: 0.14, y: 0.08, w: 0.72, h: 0.23 },
    },
  },
  4: {
    [COMPOSITION_CONTEXT.CVC_COMPOUND]: {
      cho: { x: 0.14, y: 0.66, w: 0.70, h: 0.22 },
      jung: { x: 0.17, y: 0.43, w: 0.66, h: 0.14 },
      jong: { x: 0.14, y: 0.08, w: 0.72, h: 0.22 },
    },
  },
  6: {
    [COMPOSITION_CONTEXT.CVC_COMPOUND]: {
      cho: { x: 0.10, y: 0.61, w: 0.33, h: 0.22 },
      jung: { x: 0.17, y: 0.34, w: 0.68, h: 0.42 },
      jong: { x: 0.14, y: 0.08, w: 0.72, h: 0.19 },
    },
  },
};

function getCompositionContext(jongIdx) {
  if (jongIdx === 0) {
    return COMPOSITION_CONTEXT.CV;
  }

  const jongInfo = getJongInfo(jongIdx);
  return jongInfo?.isCompound
    ? COMPOSITION_CONTEXT.CVC_COMPOUND
    : COMPOSITION_CONTEXT.CVC_SIMPLE;
}

function getLayoutForContext(blockType, context) {
  const base = LAYOUT[blockType];
  if (!base) return null;

  const override = CONTEXT_LAYOUT_OVERRIDES[blockType]?.[context];
  if (!override) return base;

  return {
    ...base,
    ...override,
  };
}

export function getCompositionLayout(jungIdx, jongIdx) {
  const blockType = getBlockType(jungIdx, jongIdx);
  const context = getCompositionContext(jongIdx);
  return getLayoutForContext(blockType, context);
}

function resolveCommands(jamoLib, keys) {
  for (const key of keys) {
    if (key && jamoLib[key]?.length) {
      return jamoLib[key];
    }
  }

  return [];
}

function getCommandBounds(commands) {
  const points = [];

  for (const cmd of commands) {
    if (cmd.x !== undefined && cmd.y !== undefined) points.push({ x: cmd.x, y: cmd.y });
    if (cmd.x1 !== undefined && cmd.y1 !== undefined) points.push({ x: cmd.x1, y: cmd.y1 });
    if (cmd.x2 !== undefined && cmd.y2 !== undefined) points.push({ x: cmd.x2, y: cmd.y2 });
  }

  if (points.length === 0) return null;

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

function fitCommandsToSlot(commands, slot) {
  const bounds = getCommandBounds(commands);
  if (!bounds) return [];

  const slotX = slot.x * UPM;
  const slotY = slot.y * UPM;
  const slotW = slot.w * UPM;
  const slotH = slot.h * UPM;
  const sourceWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const sourceHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(slotW / sourceWidth, slotH / sourceHeight);
  const offsetX = slotX + (slotW - sourceWidth * scale) / 2;
  const offsetY = slotY + (slotH - sourceHeight * scale) / 2;

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

function getChoCommands(choIdx, jungIdx, jongIdx, jamoLib) {
  const choChar = CHO[choIdx];
  const choInfo = getChoInfo(choIdx);
  const dirSuffix = getVowelCategory(jungIdx) === 'vertical' ? 'v' : 'h';
  const context = getCompositionContext(jongIdx);

  if (choInfo.isDouble) {
    return resolveCommands(jamoLib, [
      `cho_${dirSuffix}_${context}_${choChar}`,
      `cho_${dirSuffix}_${choChar}`,
      `cho_${dirSuffix}_${context}_${choInfo.base}`,
      `cho_${dirSuffix}_${choInfo.base}`,
    ]);
  }

  return resolveCommands(jamoLib, [
    `cho_${dirSuffix}_${context}_${choChar}`,
    `cho_${dirSuffix}_${choChar}`,
  ]);
}

function getJungCommands(jungIdx, jongIdx, jamoLib) {
  const vowel = JUNG[jungIdx];
  const context = getCompositionContext(jongIdx);
  const suffix = context === COMPOSITION_CONTEXT.CV ? 'nb' : 'wb';

  const direct = resolveCommands(jamoLib, [
    `jung_${suffix}_${context}_${vowel}`,
    `jung_${suffix}_${vowel}`,
  ]);
  if (direct.length > 0) {
    return direct;
  }

  const jungInfo = getJungInfo(jungIdx);
  if (jungInfo.isCompound && jungInfo.components) {
    return resolveCommands(jamoLib, [
      `jung_${suffix}_${context}_${jungInfo.components[0]}`,
      `jung_${suffix}_${jungInfo.components[0]}`,
    ]);
  }

  return [];
}

function getJongCommands(jongIdx, jungIdx, jamoLib, slot = 'single') {
  if (jongIdx === 0) return [];

  const jongInfo = getJongInfo(jongIdx);
  if (jongInfo?.isCompound) return [];
  const vowelContext = getVowelCategory(jungIdx);

  return resolveCommands(jamoLib, [
    `jong_${slot}_${vowelContext}_${JONG[jongIdx]}`,
    `jong_${slot}_${JONG[jongIdx]}`,
    `jong_${JONG[jongIdx]}`,
  ]);
}

function composeJongCommands(jongIdx, jungIdx, layout, jamoLib) {
  if (jongIdx === 0 || !layout?.jong) return [];

  const jongInfo = getJongInfo(jongIdx);
  const jongSlot = layout.jong;
  const vowelContext = getVowelCategory(jungIdx);

  if (!jongInfo?.isCompound || !jongInfo.components?.length) {
    const jongCmds = getJongCommands(jongIdx, jungIdx, jamoLib, 'single');
    if (jongCmds.length === 0) return [];

    return fitCommandsToSlot(jongCmds, jongSlot);
  }

  const clusterCommands = resolveCommands(jamoLib, [
    `jong_cluster_${vowelContext}_${jongInfo.base}`,
    `jong_cluster_${jongInfo.base}`,
    `jong_cluster_${COMPOSITION_CONTEXT.CVC_COMPOUND}_${jongInfo.base}`,
  ]);
  if (clusterCommands.length > 0) {
    return fitCommandsToSlot(clusterCommands, jongSlot);
  }

  const [leftJamo, rightJamo] = jongInfo.components;
  const leftCommands = resolveCommands(jamoLib, [
    `jong_compound_left_${leftJamo}`,
    `jong_left_${leftJamo}`,
    `jong_${leftJamo}`,
  ]);
  const rightCommands = resolveCommands(jamoLib, [
    `jong_compound_right_${rightJamo}`,
    `jong_right_${rightJamo}`,
    `jong_${rightJamo}`,
  ]);
  if (leftCommands.length === 0 || rightCommands.length === 0) return [];

  const sidePadding = 0.03;
  const gap = 0.04;
  const innerWidth = jongSlot.w - sidePadding * 2;
  const componentWidth = Math.max((innerWidth - gap) / 2, 0.01);
  const leftSlot = {
    x: jongSlot.x + sidePadding,
    y: jongSlot.y,
    w: componentWidth,
    h: jongSlot.h,
  };
  const rightSlot = {
    x: jongSlot.x + sidePadding + componentWidth + gap,
    y: jongSlot.y,
    w: componentWidth,
    h: jongSlot.h,
  };

  return mergeCommands(
    fitCommandsToSlot(leftCommands, leftSlot),
    fitCommandsToSlot(rightCommands, rightSlot)
  );
}

export function composeSyllable(choIdx, jungIdx, jongIdx, jamoLib) {
  const layout = getCompositionLayout(jungIdx, jongIdx);
  if (!layout) return [];

  const result = [];

  const choCmds = getChoCommands(choIdx, jungIdx, jongIdx, jamoLib);
  if (choCmds.length > 0) {
    result.push(...fitCommandsToSlot(choCmds, layout.cho));
  }

  const jungCmds = getJungCommands(jungIdx, jongIdx, jamoLib);
  if (jungCmds.length > 0) {
    result.push(...fitCommandsToSlot(jungCmds, layout.jung));
  }

  if (jongIdx > 0 && layout.jong) {
    const jongCommands = composeJongCommands(jongIdx, jungIdx, layout, jamoLib);
    if (jongCommands.length > 0) {
      result.push(...jongCommands);
    }
  }

  return result;
}

export function commandsToPath(commands, opentype) {
  const path = new opentype.Path();
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        path.moveTo(cmd.x, cmd.y);
        break;
      case 'L':
        path.lineTo(cmd.x, cmd.y);
        break;
      case 'Q':
        path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;
      case 'C':
        path.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case 'Z':
        path.closePath();
        break;
    }
  }
  return path;
}
