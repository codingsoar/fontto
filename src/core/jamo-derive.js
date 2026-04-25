/**
 * jamo-derive.js — 자모 자동 파생 엔진
 *
 * 사용자가 그린 기본 자모(62자)로부터
 * 쌍자음, 복합모음, 겹받침을 자동 파생합니다.
 */

import {
  DOUBLE_CONSONANT_MAP,
  COMPOUND_VOWEL_MAP,
  COMPOUND_JONG_MAP,
  BASIC_VOWELS,
  VERTICAL_VOWELS,
  HORIZONTAL_VOWELS,
} from './hangul.js';

/**
 * opentype.js Path의 커맨드 목록을 스케일 + 이동 변환
 * @param {Array} commands — [{type, x, y, ...}, ...]
 * @param {number} sx — x 스케일
 * @param {number} sy — y 스케일
 * @param {number} tx — x 이동
 * @param {number} ty — y 이동
 * @returns {Array} 변환된 커맨드 목록
 */
export function transformCommands(commands, sx, sy, tx, ty) {
  return commands.map(cmd => {
    const c = { ...cmd };
    if (c.x !== undefined) { c.x = c.x * sx + tx; }
    if (c.y !== undefined) { c.y = c.y * sy + ty; }
    if (c.x1 !== undefined) { c.x1 = c.x1 * sx + tx; }
    if (c.y1 !== undefined) { c.y1 = c.y1 * sy + ty; }
    if (c.x2 !== undefined) { c.x2 = c.x2 * sx + tx; }
    if (c.y2 !== undefined) { c.y2 = c.y2 * sy + ty; }
    return c;
  });
}

/**
 * 두 커맨드 배열을 합치기
 */
export function mergeCommands(cmds1, cmds2) {
  return [...cmds1, ...cmds2];
}

function getCommandBounds(commands) {
  const points = [];

  for (const cmd of commands) {
    if (cmd.x !== undefined && cmd.y !== undefined) {
      points.push({ x: cmd.x, y: cmd.y });
    }
    if (cmd.x1 !== undefined && cmd.y1 !== undefined) {
      points.push({ x: cmd.x1, y: cmd.y1 });
    }
    if (cmd.x2 !== undefined && cmd.y2 !== undefined) {
      points.push({ x: cmd.x2, y: cmd.y2 });
    }
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

    if (next.x !== undefined) {
      next.x = (next.x - bounds.minX) * scale + offsetX;
    }
    if (next.y !== undefined) {
      next.y = (next.y - bounds.minY) * scale + offsetY;
    }
    if (next.x1 !== undefined) {
      next.x1 = (next.x1 - bounds.minX) * scale + offsetX;
    }
    if (next.y1 !== undefined) {
      next.y1 = (next.y1 - bounds.minY) * scale + offsetY;
    }
    if (next.x2 !== undefined) {
      next.x2 = (next.x2 - bounds.minX) * scale + offsetX;
    }
    if (next.y2 !== undefined) {
      next.y2 = (next.y2 - bounds.minY) * scale + offsetY;
    }

    return next;
  });
}

/**
 * 쌍자음 초성 파생 (세로모음용/가로모음용 각각)
 *
 * @param {Object} jamoLib — { 'cho_v_ㄱ': [...commands], ... }
 * @returns {Object} 파생된 엔트리 추가
 */
export function deriveDoubleConsonants(jamoLib) {
  const derived = {};

  for (const [base, double] of Object.entries(DOUBLE_CONSONANT_MAP)) {
    // 세로모음용 쌍자음
    const vKey = `cho_v_${base}`;
    if (jamoLib[vKey]) {
      const cmds = jamoLib[vKey];
      // 왼쪽에 50% 크기, 오른쪽에 50% 크기
      const left  = transformCommands(cmds, 0.5, 1.0, 0, 0);
      const right = transformCommands(cmds, 0.5, 1.0, 0.5, 0);
      derived[`cho_v_${double}`] = mergeCommands(left, right);
    }

    // 가로모음용 쌍자음
    const hKey = `cho_h_${base}`;
    if (jamoLib[hKey]) {
      const cmds = jamoLib[hKey];
      const left  = transformCommands(cmds, 0.5, 1.0, 0, 0);
      const right = transformCommands(cmds, 0.5, 1.0, 0.5, 0);
      derived[`cho_h_${double}`] = mergeCommands(left, right);
    }
  }

  return derived;
}

/**
 * 복합모음 파생 (받침없음/있음 각각)
 *
 * @param {Object} jamoLib
 * @returns {Object}
 */
export function deriveCompoundVowels(jamoLib) {
  const derived = {};

  for (const [compound, components] of Object.entries(COMPOUND_VOWEL_MAP)) {
    for (const suffix of ['nb', 'wb']) {
      const key = `jung_${suffix}_${compound}`;

      if (components.length === 2) {
        const [a, b] = components;
        const aKey = `jung_${suffix}_${a}`;
        const bKey = `jung_${suffix}_${b}`;

        if (jamoLib[aKey] && jamoLib[bKey]) {
          const isAHorizontal = HORIZONTAL_VOWELS.includes(a);
          const isBVertical   = VERTICAL_VOWELS.includes(b) || b === 'ㅣ';

          if (isAHorizontal && isBVertical) {
            // ㅘ = ㅗ(가로) + ㅏ(세로) → 왼쪽하단에 가로모음, 오른쪽에 세로모음
            const aCmd = transformCommands(jamoLib[aKey], 0.55, 0.5, 0, 0);
            const bCmd = transformCommands(jamoLib[bKey], 0.45, 1.0, 0.55, 0);
            derived[key] = mergeCommands(aCmd, bCmd);
          } else {
            // ㅐ = ㅏ + ㅣ → 나란히
            const aCmd = transformCommands(jamoLib[aKey], 0.55, 1.0, 0, 0);
            const bCmd = transformCommands(jamoLib[bKey], 0.45, 1.0, 0.55, 0);
            derived[key] = mergeCommands(aCmd, bCmd);
          }
        }
      } else if (components.length === 3) {
        // ㅙ = ㅗ + ㅏ + ㅣ
        const [a, b, c] = components;
        const aKey = `jung_${suffix}_${a}`;
        const bKey = `jung_${suffix}_${b}`;
        const cKey = `jung_${suffix}_${c}`;

        if (jamoLib[aKey] && jamoLib[bKey] && jamoLib[cKey]) {
          const aCmd = transformCommands(jamoLib[aKey], 0.45, 0.5, 0, 0);
          const bCmd = transformCommands(jamoLib[bKey], 0.35, 1.0, 0.45, 0);
          const cCmd = transformCommands(jamoLib[cKey], 0.20, 1.0, 0.80, 0);
          derived[key] = mergeCommands(mergeCommands(aCmd, bCmd), cCmd);
        }
      }
    }
  }

  return derived;
}

/**
 * 겹받침 / 쌍자음 종성 파생
 *
 * @param {Object} jamoLib
 * @returns {Object}
 */
export function deriveCompoundJong(jamoLib) {
  const derived = {};
  const sidePadding = 0.04;
  const gap = 0.08;
  const componentWidth = (1 - sidePadding * 2 - gap) / 2;

  for (const [compound, components] of Object.entries(COMPOUND_JONG_MAP)) {
    const [a, b] = components;
    const aKey = `jong_${a}`;
    const bKey = `jong_${b}`;

    if (jamoLib[aKey] && jamoLib[bKey]) {
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
  }

  return derived;
}

/**
 * 전체 파생 실행 — jamoLib에 파생된 엔트리를 추가
 * @param {Object} jamoLib — 사용자가 그린 62자의 Path 명령어
 * @returns {Object} 파생 포함된 완성 라이브러리
 */
export function deriveAll(jamoLib) {
  const lib = { ...jamoLib };

  const doubles  = deriveDoubleConsonants(lib);
  const vowels   = deriveCompoundVowels(lib);
  const jongs    = deriveCompoundJong(lib);

  Object.assign(lib, doubles, vowels, jongs);

  return lib;
}
