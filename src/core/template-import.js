import { CATEGORIES, buildGuideMeta } from '../ui/jamo-grid.js';
import { compose, decompose } from './hangul.js';

export const TEMPLATE_COLUMNS = 4;
export const TEMPLATE_ROWS_PER_PAGE = 6;
export const TEMPLATE_SLOTS_PER_PAGE = TEMPLATE_COLUMNS * TEMPLATE_ROWS_PER_PAGE;
export const TEMPLATE_PAGE_WIDTH = 2480;
export const TEMPLATE_PAGE_HEIGHT = 3508;
const TEMPLATE_CELL_WIDTH = 564;
const TEMPLATE_CELL_HEIGHT = 476;
const TEMPLATE_GAP = 32;
const TEMPLATE_PADDING_X = 80;
const TEMPLATE_PADDING_Y = 144;
const TEMPLATE_HEADER_HEIGHT = 96;
const TEMPLATE_FOOTER_HEIGHT = 68;
const TEMPLATE_DRAW_PADDING = 20;
const TEMPLATE_IMPORT_INSET = 16;
const TEMPLATE_FONT_FAMILY = 'NanumGothic ExtraBold, Nanum Gothic, NanumGothic, sans-serif';

export function getTemplateSlots() {
  const slots = [];

  CATEGORIES
    .forEach((category) => {
      category.items.forEach((jamo, index) => {
        const example = category.examples[index];
        const guide = buildGuideMeta(category.id, jamo, example);
        slots.push({
          categoryId: category.id,
          categoryLabel: category.label,
          jamo,
          example,
          label: `${jamo}`,
          guideLabel: guide.label,
          storageKeys: guide.storageKeys,
          targetRegion: guide.targetRegion,
          previewChars: buildPreviewChars(category, index, example),
        });
      });
    });

  return slots;
}

export function getTemplatePages(slots) {
  const pages = [];
  for (let index = 0; index < slots.length; index += TEMPLATE_SLOTS_PER_PAGE) {
    pages.push(slots.slice(index, index + TEMPLATE_SLOTS_PER_PAGE));
  }
  return pages;
}

export function getTemplateMetrics(slotCount = TEMPLATE_SLOTS_PER_PAGE) {
  const rows = Math.min(Math.ceil(slotCount / TEMPLATE_COLUMNS), TEMPLATE_ROWS_PER_PAGE);

  return {
    rows,
    cols: TEMPLATE_COLUMNS,
    cellWidth: TEMPLATE_CELL_WIDTH,
    cellHeight: TEMPLATE_CELL_HEIGHT,
    gap: TEMPLATE_GAP,
    padding: TEMPLATE_PADDING_X,
    paddingX: TEMPLATE_PADDING_X,
    paddingY: TEMPLATE_PADDING_Y,
    width: TEMPLATE_PAGE_WIDTH,
    height: TEMPLATE_PAGE_HEIGHT,
    headerHeight: TEMPLATE_HEADER_HEIGHT,
    footerHeight: TEMPLATE_FOOTER_HEIGHT,
    drawPadding: TEMPLATE_DRAW_PADDING,
  };
}

export function buildTemplateSvg(slots, pageIndex = 0, totalPages = 1) {
  const metrics = getTemplateMetrics(slots.length);
  const cells = slots.map((slot, index) => {
    const rect = getTemplateCellRect(index, metrics);
    const drawRect = getTemplateDrawRect(rect, metrics);
    const headerY = rect.y + 36;
    const title = `${slot.label}  ${slot.example}`;
    const affectsText = `적용 예 ${slot.previewChars.join('  ')}`;
    const categoryText = compactCategoryLabel(slot.categoryLabel);
    const guideCenterY = drawRect.y + drawRect.h / 2;

    return `
      <g>
        <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="24" fill="#ffffff" stroke="#d6d9e4" stroke-width="4" />
        <rect x="${drawRect.x}" y="${drawRect.y}" width="${drawRect.w}" height="${drawRect.h}" rx="16" fill="#fafbff" stroke="#c6cbdb" stroke-dasharray="12 12" stroke-width="2" />
        <text x="${rect.x + 24}" y="${headerY}" font-family="${TEMPLATE_FONT_FAMILY}" font-size="30" font-weight="800" fill="#22283a">${escapeXml(title)}</text>
        <text x="${rect.x + 24}" y="${headerY + 36}" font-family="${TEMPLATE_FONT_FAMILY}" font-size="22" font-weight="800" fill="#667089">${escapeXml(categoryText)} - ${escapeXml(slot.guideLabel)}</text>
        <text x="${drawRect.x + drawRect.w / 2}" y="${guideCenterY}" text-anchor="middle" dy="0.35em" font-family="${TEMPLATE_FONT_FAMILY}" font-size="176" font-weight="800" fill="#e6eaf5">${escapeXml(slot.example)}</text>
        <text x="${rect.x + 24}" y="${rect.y + rect.h - 24}" font-family="${TEMPLATE_FONT_FAMILY}" font-size="22" font-weight="800" fill="#5a6278">${escapeXml(affectsText)}</text>
      </g>
    `;
  }).join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}">
      <rect width="100%" height="100%" fill="#f3f5fb" />
      <text x="${metrics.paddingX}" y="68" font-family="${TEMPLATE_FONT_FAMILY}" font-size="36" font-weight="800" fill="#22283a">Fontto 템플릿 ${pageIndex + 1}/${totalPages}</text>
      <text x="${metrics.paddingX}" y="112" font-family="${TEMPLATE_FONT_FAMILY}" font-size="24" font-weight="800" fill="#5a6278">
        점선 영역 안에만 써주세요. 각 칸에는 따라 쓸 글자와 이 입력이 반영될 예시 글자가 표시됩니다.
      </text>
      ${cells}
    </svg>
  `.trim();
}

export function getTemplateCellRect(index, metrics) {
  const col = index % metrics.cols;
  const row = Math.floor(index / metrics.cols);
  const x = metrics.paddingX + col * (metrics.cellWidth + metrics.gap);
  const y = metrics.paddingY + row * (metrics.cellHeight + metrics.gap);

  return {
    x,
    y,
    w: metrics.cellWidth,
    h: metrics.cellHeight,
  };
}

export function getTemplateDrawRect(cellRect, metrics) {
  return {
    x: cellRect.x + metrics.drawPadding,
    y: cellRect.y + metrics.headerHeight + metrics.drawPadding,
    w: cellRect.w - metrics.drawPadding * 2,
    h: cellRect.h - metrics.headerHeight - metrics.footerHeight - metrics.drawPadding * 2,
  };
}

export function getTemplateImportRect(cellRect, metrics) {
  const drawRect = getTemplateDrawRect(cellRect, metrics);
  const inset = Math.min(TEMPLATE_IMPORT_INSET, Math.floor(Math.min(drawRect.w, drawRect.h) * 0.08));
  return {
    x: drawRect.x + inset,
    y: drawRect.y + inset,
    w: Math.max(drawRect.w - inset * 2, 8),
    h: Math.max(drawRect.h - inset * 2, 8),
  };
}

export function rasterRectToCommands(imageData, targetRegion = null) {
  const { mask, bounds } = buildMaskFromImageData(imageData);
  if (!bounds) return [];

  const components = getConnectedComponents(mask, imageData.width, imageData.height, bounds)
    .filter((component) => component.area >= 18)
    .filter((component) => component.w >= 2 && component.h >= 2);
  if (components.length === 0) return [];

  const maxArea = Math.max(...components.map((component) => component.area));
  const kept = components.filter((component) => component.area >= Math.max(18, maxArea * 0.08));
  if (kept.length === 0) return [];

  const filteredMask = buildMaskFromComponents(kept, imageData.width, imageData.height);
  return maskToCommands(filteredMask, imageData.width, imageData.height, mergeComponentBounds(kept), targetRegion);
}

export function rasterRectToStrokes(imageData, targetRegion = null) {
  const { mask, bounds } = buildMaskFromImageData(imageData);
  if (!bounds) return [];

  const components = getConnectedComponents(mask, imageData.width, imageData.height, bounds)
    .filter((component) => component.area >= 18)
    .filter((component) => component.w >= 2 && component.h >= 2);
  if (components.length === 0) return [];

  const maxArea = Math.max(...components.map((component) => component.area));
  const kept = components.filter((component) => component.area >= Math.max(18, maxArea * 0.08));
  const filteredMask = buildMaskFromComponents(kept, imageData.width, imageData.height);
  return maskToStrokes(filteredMask, imageData.width, imageData.height, mergeComponentBounds(kept), targetRegion);
}

export function rasterRectToCleanImageData(imageData) {
  const { mask, bounds } = buildMaskFromImageData(imageData);
  const empty = new ImageData(1, 1);
  if (!bounds) return empty;

  const components = getConnectedComponents(mask, imageData.width, imageData.height, bounds)
    .filter((component) => component.area >= 18)
    .filter((component) => component.w >= 2 && component.h >= 2);
  if (components.length === 0) return empty;

  const maxArea = Math.max(...components.map((component) => component.area));
  const kept = components.filter((component) => component.area >= Math.max(18, maxArea * 0.08));
  if (kept.length === 0) return empty;

  const keptBounds = mergeComponentBounds(kept);
  const padding = 12;
  const width = Math.max(keptBounds.maxX - keptBounds.minX + 1 + padding * 2, 8);
  const height = Math.max(keptBounds.maxY - keptBounds.minY + 1 + padding * 2, 8);
  const output = new ImageData(width, height);

  kept.forEach((component) => {
    component.pixels.forEach((pixelIndex) => {
      const px = pixelIndex % imageData.width;
      const py = Math.floor(pixelIndex / imageData.width);
      const outX = px - keptBounds.minX + padding;
      const outY = py - keptBounds.minY + padding;
      const idx = (outY * width + outX) * 4;
      output.data[idx] = 255;
      output.data[idx + 1] = 255;
      output.data[idx + 2] = 255;
      output.data[idx + 3] = 255;
    });
  });

  return output;
}

export function extractRasterComponents(imageData) {
  const { width, height } = imageData;
  const { mask, bounds } = buildMaskFromImageData(imageData);
  if (!bounds) {
    return { width, height, mask, components: [] };
  }

  const components = getConnectedComponents(mask, width, height, bounds)
    .filter((component) => component.area >= 18)
    .filter((component) => component.w >= 2 && component.h >= 2)
    .sort((a, b) => b.area - a.area)
    .map((component, index) => ({
      id: index,
      area: component.area,
      bounds: {
        minX: component.minX,
        minY: component.minY,
        maxX: component.maxX,
        maxY: component.maxY,
        w: component.w,
        h: component.h,
      },
      pixels: component.pixels,
    }));

  return { width, height, mask, components };
}

export function selectedComponentsToCommands(extracted, componentIds, targetRegion = null) {
  const selected = extracted.components.filter((component) => componentIds.includes(component.id));
  if (selected.length === 0) return [];
  const mask = buildMaskFromComponents(selected, extracted.width, extracted.height);
  return maskToCommands(mask, extracted.width, extracted.height, mergeComponentBounds(selected), targetRegion);
}

export function selectedComponentsToPositionedCommands(extracted, componentIds) {
  const selected = extracted.components.filter((component) => componentIds.includes(component.id));
  if (selected.length === 0) return [];
  const mask = buildMaskFromComponents(selected, extracted.width, extracted.height);
  return maskToPositionedCommands(mask, extracted.width, extracted.height, mergeComponentBounds(selected));
}

export function selectedComponentsToStrokes(extracted, componentIds, targetRegion = null) {
  const selected = extracted.components.filter((component) => componentIds.includes(component.id));
  if (selected.length === 0) return [];
  const mask = buildMaskFromComponents(selected, extracted.width, extracted.height);
  return maskToStrokes(mask, extracted.width, extracted.height, mergeComponentBounds(selected), targetRegion);
}

function buildMaskFromImageData(imageData) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  let darkCount = 0;
  let visibleCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > 0) visibleCount += 1;
      const luminance = (data[idx] * 0.299) + (data[idx + 1] * 0.587) + (data[idx + 2] * 0.114);
      const isDark = alpha > 0 && luminance < 185;
      if (isDark) {
        mask[y * width + x] = 1;
        darkCount += 1;
      }
    }
  }

  if (darkCount < 12 && visibleCount >= 12 && visibleCount <= Math.floor(width * height * 0.45)) {
    mask.fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha > 0) {
          mask[y * width + x] = 1;
        }
      }
    }

    return {
      mask,
      bounds: getMaskBounds(mask, width, height),
    };
  }

  if (darkCount < 12) {
    return { mask, bounds: null };
  }

  return {
    mask,
    bounds: getMaskBounds(mask, width, height),
  };
}

function fitToDefaultBox(sourceWidth, sourceHeight) {
  const margin = 72;
  const targetSize = 1000 - margin * 2;
  const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;

  return {
    x: margin + (targetSize - w) / 2,
    y: margin + (targetSize - h) / 2,
    w,
    h,
  };
}

function maskToCommands(mask, width, height, bounds, targetRegion) {
  if (!bounds) return [];

  const rects = mergeRunsIntoRects(mask, width, height, bounds);
  if (rects.length === 0) return [];

  const sourceWidth = Math.max(bounds.maxX - bounds.minX + 1, 1);
  const sourceHeight = Math.max(bounds.maxY - bounds.minY + 1, 1);
  const target = targetRegion
    ? {
      x: targetRegion.x * 1000,
      y: (1 - (targetRegion.y + targetRegion.h)) * 1000,
      w: targetRegion.w * 1000,
      h: targetRegion.h * 1000,
    }
    : fitToDefaultBox(sourceWidth, sourceHeight);
  const scale = Math.min(target.w / sourceWidth, target.h / sourceHeight);
  const offsetX = target.x + (target.w - sourceWidth * scale) / 2;
  const offsetY = target.y + (target.h - sourceHeight * scale) / 2;
  const commands = [];

  rects.forEach((rect) => {
    const x = (rect.x - bounds.minX) * scale + offsetX;
    const y = (rect.y - bounds.minY) * scale + offsetY;
    const w = rect.w * scale;
    const h = rect.h * scale;
    const top = 1000 - y;
    const bottom = 1000 - (y + h);

    commands.push({ type: 'M', x, y: top });
    commands.push({ type: 'L', x: x + w, y: top });
    commands.push({ type: 'L', x: x + w, y: bottom });
    commands.push({ type: 'L', x, y: bottom });
    commands.push({ type: 'Z' });
  });

  return commands;
}

function maskToPositionedCommands(mask, width, height, bounds) {
  if (!bounds) return [];

  const rects = mergeRunsIntoRects(mask, width, height, bounds);
  if (rects.length === 0) return [];

  const scaleX = 1000 / width;
  const scaleY = 1000 / height;
  const commands = [];

  rects.forEach((rect) => {
    const x = rect.x * scaleX;
    const y = rect.y * scaleY;
    const w = rect.w * scaleX;
    const h = rect.h * scaleY;
    const top = 1000 - y;
    const bottom = 1000 - (y + h);

    commands.push({ type: 'M', x, y: top, preservePosition: true });
    commands.push({ type: 'L', x: x + w, y: top, preservePosition: true });
    commands.push({ type: 'L', x: x + w, y: bottom, preservePosition: true });
    commands.push({ type: 'L', x, y: bottom, preservePosition: true });
    commands.push({ type: 'Z', preservePosition: true });
  });

  return commands;
}

function maskToStrokes(mask, width, height, bounds, targetRegion) {
  if (!bounds) return [];

  const rects = mergeRunsIntoRects(mask, width, height, bounds);
  if (rects.length === 0) return [];

  const sourceWidth = Math.max(bounds.maxX - bounds.minX + 1, 1);
  const sourceHeight = Math.max(bounds.maxY - bounds.minY + 1, 1);
  const target = targetRegion
    ? {
      x: targetRegion.x * 448 + targetRegion.w * 448 * 0.5,
      y: targetRegion.y * 448 + targetRegion.h * 448 * 0.5,
      w: targetRegion.w * 448,
      h: targetRegion.h * 448,
    }
    : {
      x: 224,
      y: 224,
      w: 304,
      h: 304,
    };
  const scale = Math.min(target.w / sourceWidth, target.h / sourceHeight);
  const offsetX = target.x - (sourceWidth * scale) / 2;
  const offsetY = target.y - (sourceHeight * scale) / 2;
  let time = 0;

  return rects.map((rect) => {
    const left = (rect.x - bounds.minX) * scale + offsetX;
    const top = (rect.y - bounds.minY) * scale + offsetY;
    const right = left + rect.w * scale;
    const bottom = top + rect.h * scale;

    if (rect.w >= rect.h) {
      const y = top + (bottom - top) / 2;
      return [
        { x: left, y, pressure: 0.5, time: time += 8 },
        { x: right, y, pressure: 0.5, time: time += 8 },
      ];
    }

    const x = left + (right - left) / 2;
    return [
      { x, y: top, pressure: 0.5, time: time += 8 },
      { x, y: bottom, pressure: 0.5, time: time += 8 },
    ];
  }).filter((stroke) => stroke.length >= 2);
}

function getMaskBounds(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function getConnectedComponents(mask, width, height, bounds) {
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const startIndex = y * width + x;
      if (!mask[startIndex] || visited[startIndex]) continue;

      const queue = [startIndex];
      visited[startIndex] = 1;
      const pixels = [];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (queue.length) {
        const index = queue.pop();
        const px = index % width;
        const py = Math.floor(index / width);
        pixels.push(index);
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);

        const neighbors = [index - 1, index + 1, index - width, index + width];
        neighbors.forEach((next) => {
          if (next < 0 || next >= mask.length) return;
          const nx = next % width;
          const ny = Math.floor(next / width);
          if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) return;
          if (!mask[next] || visited[next]) return;
          visited[next] = 1;
          queue.push(next);
        });
      }

      components.push({
        pixels,
        area: pixels.length,
        minX,
        minY,
        maxX,
        maxY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
      });
    }
  }

  return components;
}

function buildMaskFromComponents(components, width, height) {
  const mask = new Uint8Array(width * height);
  components.forEach((component) => {
    component.pixels.forEach((index) => {
      mask[index] = 1;
    });
  });
  return mask;
}

function mergeComponentBounds(components) {
  if (!components.length) return null;

  return components.reduce((bounds, component) => ({
    minX: Math.min(bounds.minX, getComponentBound(component, 'minX')),
    minY: Math.min(bounds.minY, getComponentBound(component, 'minY')),
    maxX: Math.max(bounds.maxX, getComponentBound(component, 'maxX')),
    maxY: Math.max(bounds.maxY, getComponentBound(component, 'maxY')),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

function getComponentBound(component, key) {
  return component[key] ?? component.bounds?.[key] ?? 0;
}

function mergeRunsIntoRects(mask, width, height, bounds) {
  const active = new Map();
  const output = [];

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    const runs = [];
    let start = -1;

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const filled = !!mask[y * width + x];
      if (filled && start < 0) {
        start = x;
      } else if (!filled && start >= 0) {
        runs.push({ x: start, w: x - start });
        start = -1;
      }
    }

    if (start >= 0) {
      runs.push({ x: start, w: bounds.maxX + 1 - start });
    }

    const nextActive = new Map();
    runs.forEach((run) => {
      const key = `${run.x}:${run.w}`;
      const existing = active.get(key);
      if (existing) {
        existing.h += 1;
        nextActive.set(key, existing);
      } else {
        nextActive.set(key, { x: run.x, y, w: run.w, h: 1 });
      }
    });

    active.forEach((rect, key) => {
      if (!nextActive.has(key)) {
        output.push(rect);
      }
    });

    active.clear();
    nextActive.forEach((rect, key) => {
      active.set(key, rect);
    });
  }

  active.forEach((rect) => output.push(rect));
  return output.filter((rect) => rect.w * rect.h >= 3);
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}

function buildPreviewChars(category, index, example) {
  const info = decompose(example);
  if (!info) return [example];

  const previews = [example];
  const add = (cho, jung, jong = 0) => {
    previews.push(compose(cho, jung, jong));
  };

  if (category.id.startsWith('cho_v_wf')) {
    add(info.cho, 0, 4);
  } else if (category.id.startsWith('cho_h_wf')) {
    add(info.cho, 8, 4);
  } else if (category.id.startsWith('cho_v')) {
    add(info.cho, 2, 0);
  } else if (category.id.startsWith('cho_h')) {
    add(info.cho, 8, 0);
  } else if (category.id.startsWith('jung')) {
    add(2, info.jung, info.jong);
  } else if (category.id.startsWith('jong')) {
    add(2, info.jung, info.jong);
  }

  return [...new Set(previews)].slice(0, 2);
}

function compactCategoryLabel(label) {
  return label
    .replace('초성', '초성')
    .replace('중성', '중성')
    .replace('종성', '종성')
    .replace('세로 모음', '세로')
    .replace('가로 모음', '가로')
    .replace('복합 모음', '복합')
    .replace('받침 없음', '받침 없음')
    .replace('받침 있음', '받침 있음')
    .replace('단일', '단일')
    .replace('겹받침', '겹받침')
    .replace('가로 중성 뒤', '가로 뒤');
}
