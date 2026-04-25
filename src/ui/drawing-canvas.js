/**
 * drawing-canvas.js - stroke input canvas for jamo drawing
 *
 * Uses pointer events so mouse, touch, and pen input follow the same path.
 * Coalesced events and pointerrawupdate are used when available to improve
 * stylus sampling quality.
 */

export class DrawingCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.penSize = options.penSize || 8;
    this.penMode = options.penMode || 'pen';
    this.variableWidth = options.variableWidth || false;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;

    this.strokes = [];
    this.currentStroke = null;
    this.undoStack = [];
    this.redoStack = [];

    this.isDrawing = false;
    this.activePointerId = null;
    this.guideChar = '';
    this.guideSequence = [];
    this.guideTargetIndices = [];
    this.guideLabel = '';
    this.guideTargetRegion = null;

    this._bindEvents();
    requestAnimationFrame(() => {
      this._setupCanvas();
      this.render();
    });
  }

  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || 480;
    const h = rect.height || 480;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.displayWidth = w;
    this.displayHeight = h;
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._handlePointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._handlePointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this._handlePointerUp(e));
    this.canvas.addEventListener('pointerrawupdate', (e) => this._handlePointerMove(e));
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      time: typeof e.timeStamp === 'number' ? Math.round(e.timeStamp) : Date.now(),
    };
  }

  _handlePointerDown(e) {
    if (this.activePointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    this.activePointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this._startStroke(e);
  }

  _handlePointerMove(e) {
    if (!this._isActivePointer(e)) return;

    e.preventDefault();
    this._continueStroke(e);
  }

  _handlePointerUp(e) {
    if (!this._isActivePointer(e)) return;

    e.preventDefault();
    this._continueStroke(e);
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.activePointerId = null;
    this._endStroke();
  }

  _isActivePointer(e) {
    return this.activePointerId !== null && e.pointerId === this.activePointerId;
  }

  _startStroke(e) {
    this.isDrawing = true;
    this.currentStroke = [];
    this.redoStack = [];
    this._appendEventPoints(e, true);
  }

  _continueStroke(e) {
    if (!this.isDrawing || !this.currentStroke) return;

    this._appendEventPoints(e, false);
    this.render();
  }

  _appendEventPoints(e, includePrimaryEvent = true) {
    const events = typeof e.getCoalescedEvents === 'function'
      ? e.getCoalescedEvents()
      : [];

    const sourceEvents = events.length > 0
      ? events
      : includePrimaryEvent
        ? [e]
        : [e];

    for (const sourceEvent of sourceEvents) {
      const pos = this._getPos(sourceEvent);
      const lastPoint = this.currentStroke[this.currentStroke.length - 1];
      if (!lastPoint || lastPoint.x !== pos.x || lastPoint.y !== pos.y) {
        this.currentStroke.push(pos);
      }
    }
  }

  _endStroke() {
    if (!this.isDrawing) return;

    this.isDrawing = false;
    if (this.currentStroke && this.currentStroke.length > 1) {
      this.strokes.push(this.currentStroke);
      this.undoStack.push(this.currentStroke);
    }
    this.currentStroke = null;
    this.render();
    this._emitChange();
  }

  undo() {
    if (this.strokes.length === 0) return;

    const stroke = this.strokes.pop();
    this.undoStack.pop();
    this.redoStack.push(stroke);
    this.render();
    this._emitChange();
  }

  redo() {
    if (this.redoStack.length === 0) return;

    const stroke = this.redoStack.pop();
    this.strokes.push(stroke);
    this.undoStack.push(stroke);
    this.render();
    this._emitChange();
  }

  clear() {
    if (this.strokes.length > 0) {
      this.redoStack = [];
      this.undoStack = [];
    }
    this.strokes = [];
    this.currentStroke = null;
    this.render();
    this._emitChange();
  }

  loadStrokes(strokes = []) {
    this.strokes = this._cloneStrokes(strokes);
    this.currentStroke = null;
    this.undoStack = [...this.strokes];
    this.redoStack = [];
    this.render();
    this._emitChange();
  }

  exportStrokes() {
    return this._cloneStrokes(this.strokes);
  }

  setPenSize(size) {
    this.penSize = size;
  }

  setPenMode(mode) {
    this.penMode = mode;
  }

  setVariableWidth(enabled) {
    this.variableWidth = enabled;
  }

  setGuideChar(char) {
    this.guideChar = char;
    this.render();
  }

  setGuide(guide = {}) {
    this.guideChar = guide.char || '';
    this.guideSequence = guide.sequence || [];
    this.guideTargetIndices = guide.targetIndices || [];
    this.guideLabel = guide.label || '';
    this.guideTargetRegion = guide.targetRegion || null;
    this.render();
    this._emitChange();
  }

  _drawGuides() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    const pad = 16;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    if (this.guideChar) {
      ctx.save();
      ctx.font = `${h * 0.6}px "Pretendard", sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.guideChar, w / 2, h / 2);
      ctx.restore();
    }

    if (this.guideTargetRegion) {
      const pad = 16;
      const inner = {
        x: pad,
        y: pad,
        w: w - pad * 2,
        h: h - pad * 2,
      };
      const box = {
        x: inner.x + inner.w * this.guideTargetRegion.x,
        y: inner.y + inner.h * this.guideTargetRegion.y,
        w: inner.w * this.guideTargetRegion.w,
        h: inner.h * this.guideTargetRegion.h,
      };

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(inner.x, inner.y, inner.w, Math.max(box.y - inner.y, 0));
      ctx.fillRect(inner.x, box.y + box.h, inner.w, Math.max(inner.y + inner.h - (box.y + box.h), 0));
      ctx.fillRect(inner.x, box.y, Math.max(box.x - inner.x, 0), box.h);
      ctx.fillRect(box.x + box.w, box.y, Math.max(inner.x + inner.w - (box.x + box.w), 0), box.h);

      ctx.strokeStyle = 'rgba(124, 92, 252, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.w, box.h);

      if (this.guideLabel) {
        ctx.save();
        ctx.fillStyle = 'rgba(124, 92, 252, 0.96)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '600 12px "Noto Sans KR", sans-serif';
        ctx.fillText(this.guideLabel, box.x + 8, box.y + 8);
        ctx.restore();
      }
      ctx.restore();
    }

    if (this.guideSequence.length > 0) {
      const baseX = 24;
      const topY = 28;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '600 18px "Noto Sans KR", sans-serif';

      let cursorX = baseX;
      this.guideSequence.forEach((jamo, index) => {
        ctx.fillStyle = this.guideTargetIndices.includes(index)
          ? 'rgba(124, 92, 252, 0.95)'
          : 'rgba(255, 255, 255, 0.26)';
        ctx.fillText(jamo, cursorX, topY);
        cursorX += ctx.measureText(jamo).width + 12;
      });

      if (this.guideLabel && !this.guideTargetRegion) {
        ctx.font = '500 13px "Noto Sans KR", sans-serif';
        ctx.fillStyle = 'rgba(124, 92, 252, 0.92)';
        ctx.fillText(this.guideLabel, baseX, topY + 24);
      }

      ctx.restore();
    }
  }

  _drawStroke(stroke, isActive = false) {
    const processedStroke = this._getProcessedStroke(stroke);
    if (processedStroke.length < 2) return;

    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.variableWidth) {
      for (let i = 1; i < processedStroke.length; i++) {
        const prev = processedStroke[i - 1];
        const curr = processedStroke[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = Math.max(curr.time - prev.time, 1);
        const speed = dist / dt;

        const width = Math.max(
          this.penSize * 0.3,
          this.penSize * (1.2 - speed * 0.15)
        );

        ctx.beginPath();
        ctx.strokeStyle = isActive
          ? 'rgba(255, 255, 255, 0.9)'
          : 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = width;
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.strokeStyle = isActive
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = this.penSize;
      ctx.moveTo(processedStroke[0].x, processedStroke[0].y);

      for (let i = 1; i < processedStroke.length; i++) {
        if (i < processedStroke.length - 1) {
          const mid = {
            x: (processedStroke[i].x + processedStroke[i + 1].x) / 2,
            y: (processedStroke[i].y + processedStroke[i + 1].y) / 2,
          };
          ctx.quadraticCurveTo(processedStroke[i].x, processedStroke[i].y, mid.x, mid.y);
        } else {
          ctx.lineTo(processedStroke[i].x, processedStroke[i].y);
        }
      }
      ctx.stroke();
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    this._drawGuides();

    for (const stroke of this.strokes) {
      this._drawStroke(stroke, false);
    }

    if (this.currentStroke && this.currentStroke.length > 1) {
      this._drawStroke(this.currentStroke, true);
    }
  }

  toPathCommands() {
    if (this.strokes.length === 0) return [];

    const polygons = [];
    const halfPen = this.penSize / 2;

    for (const stroke of this.strokes) {
      const processedStroke = this._getProcessedStroke(stroke);
      if (processedStroke.length < 2) continue;
      const polygon = this._buildStrokePolygon(processedStroke, halfPen);
      if (polygon.length >= 3) {
        polygons.push(polygon);
      }
    }

    if (polygons.length === 0) return [];

    const margin = 72;
    const targetSize = 1000 - margin * 2;
    const bounds = this._getBounds(polygons.flat());
    const sourceWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const sourceHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
    const offsetX = margin + (targetSize - sourceWidth * scale) / 2;
    const offsetY = margin + (targetSize - sourceHeight * scale) / 2;

    const normalize = (point) => ({
      x: (point.x - bounds.minX) * scale + offsetX,
      y: 1000 - ((point.y - bounds.minY) * scale + offsetY),
    });

    const commands = [];
    for (const polygon of polygons) {
      if (polygon.length === 0) continue;

      const start = normalize(polygon[0]);
      commands.push({ type: 'M', x: start.x, y: start.y });

      for (let i = 1; i < polygon.length; i++) {
        const point = normalize(polygon[i]);
        commands.push({ type: 'L', x: point.x, y: point.y });
      }

      commands.push({ type: 'Z' });
    }

    return commands;
  }

  _buildStrokePolygon(stroke, halfPen) {
    const topPoints = [];
    const bottomPoints = [];

    for (let i = 0; i < stroke.length; i++) {
      const point = stroke[i];
      const thickness = this._getPointThickness(stroke, i, halfPen);
      const normal = this._getJoinNormal(stroke, i);
      const joinScale = this._getJoinScale(stroke, i, normal, thickness);

      topPoints.push({
        x: point.x + normal.x * joinScale,
        y: point.y + normal.y * joinScale,
      });
      bottomPoints.push({
        x: point.x - normal.x * joinScale,
        y: point.y - normal.y * joinScale,
      });
    }

    return this._dedupePolygon([...topPoints, ...bottomPoints.reverse()]);
  }

  _getPointThickness(stroke, index, halfPen) {
    if (!this.variableWidth || index === 0) {
      return halfPen;
    }

    const prev = stroke[index - 1];
    const point = stroke[index];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt = Math.max(point.time - prev.time, 1);
    const speed = dist / dt;

    return Math.max(halfPen * 0.3, halfPen * (1.2 - speed * 0.15));
  }

  _getJoinNormal(stroke, index) {
    const prev = stroke[index - 1] ?? stroke[index];
    const point = stroke[index];
    const next = stroke[index + 1] ?? stroke[index];
    const prevNormal = this._getSegmentNormal(prev, point);
    const nextNormal = this._getSegmentNormal(point, next);
    const merged = {
      x: prevNormal.x + nextNormal.x,
      y: prevNormal.y + nextNormal.y,
    };

    if (Math.abs(merged.x) < 1e-3 && Math.abs(merged.y) < 1e-3) {
      return nextNormal;
    }

    return this._normalizeVector(merged);
  }

  _getJoinScale(stroke, index, joinNormal, thickness) {
    const prev = stroke[index - 1];
    const point = stroke[index];
    const next = stroke[index + 1];
    const referenceNormal = next
      ? this._getSegmentNormal(point, next)
      : prev
        ? this._getSegmentNormal(prev, point)
        : { x: 0, y: -1 };
    const alignment = Math.abs(joinNormal.x * referenceNormal.x + joinNormal.y * referenceNormal.y);
    const safeAlignment = Math.max(alignment, 0.55);
    return Math.min(thickness / safeAlignment, thickness * 1.35);
  }

  _getSegmentNormal(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      x: -dy / len,
      y: dx / len,
    };
  }

  _normalizeVector(vector) {
    const len = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
    return {
      x: vector.x / len,
      y: vector.y / len,
    };
  }

  _dedupePolygon(points) {
    const deduped = [];

    for (const point of points) {
      const last = deduped[deduped.length - 1];
      if (!last) {
        deduped.push(point);
        continue;
      }

      const dx = point.x - last.x;
      const dy = point.y - last.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 0.75) {
        deduped.push(point);
      }
    }

    if (deduped.length > 2) {
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      const dx = first.x - last.x;
      const dy = first.y - last.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.75) {
        deduped.pop();
      }
    }

    return deduped;
  }

  hasContent() {
    return this.strokes.length > 0;
  }

  resize() {
    this._setupCanvas();
    this.render();
    this._emitChange();
  }

  getQualityReport() {
    const processedStrokes = this.strokes
      .map((stroke) => this._getProcessedStroke(stroke))
      .filter((stroke) => stroke.length > 0);
    const points = processedStrokes.flat();
    const strokeCount = processedStrokes.length;
    const pointCount = points.length;
    const innerBox = this._getGuideInnerBox();
    const targetBox = this._getGuideTargetBox();

    const report = {
      hasContent: pointCount > 0,
      strokeCount,
      pointCount,
      bounds: points.length > 0 ? this._getBounds(points) : null,
      targetBox,
      metrics: null,
      warnings: [],
      hasBlockingWarnings: false,
    };

    if (!report.bounds || !targetBox) {
      if (report.hasContent && this._isSparseInput(processedStrokes, null)) {
        report.warnings.push({
          code: 'low_stroke_detail',
          severity: 'medium',
          message: '획 정보가 너무 적습니다. 실제 입력이 제대로 들어갔는지 확인하세요.',
        });
      }
      report.hasBlockingWarnings = report.warnings.some((warning) => warning.severity === 'high');
      return report;
    }

    const bounds = report.bounds;
    const paddedTargetBox = this._expandRect(targetBox, Math.max(this.penSize * 0.7, 6));
    const boundsWidth = Math.max(bounds.maxX - bounds.minX, 0);
    const boundsHeight = Math.max(bounds.maxY - bounds.minY, 0);
    const boundsArea = boundsWidth * boundsHeight;
    const targetArea = Math.max(targetBox.w * targetBox.h, 1);
    const intersection = this._getIntersectionRect(bounds, paddedTargetBox);
    const overlapArea = intersection ? intersection.w * intersection.h : 0;
    const overflowArea = Math.max(boundsArea - overlapArea, 0);
    const coverageX = targetBox.w > 0 ? boundsWidth / targetBox.w : 0;
    const coverageY = targetBox.h > 0 ? boundsHeight / targetBox.h : 0;
    const fillRatio = boundsArea / targetArea;
    const targetCenterX = targetBox.x + targetBox.w / 2;
    const targetCenterY = targetBox.y + targetBox.h / 2;
    const boundsCenterX = (bounds.minX + bounds.maxX) / 2;
    const boundsCenterY = (bounds.minY + bounds.maxY) / 2;
    const centerOffsetX = targetBox.w > 0 ? Math.abs(boundsCenterX - targetCenterX) / targetBox.w : 0;
    const centerOffsetY = targetBox.h > 0 ? Math.abs(boundsCenterY - targetCenterY) / targetBox.h : 0;
    const aspectRatio = boundsHeight > 0 ? boundsWidth / boundsHeight : 0;
    const totalLength = this._getTotalStrokeLength(processedStrokes);
    const outsidePointRatio = pointCount > 0
      ? points.filter((point) => !this._isPointInsideRect(point, paddedTargetBox)).length / pointCount
      : 0;
    const overflowRatio = Math.max(
      boundsArea > 0 ? overflowArea / boundsArea : 0,
      outsidePointRatio
    );

    report.metrics = {
      fillRatio,
      overflowRatio,
      coverageX,
      coverageY,
      innerBox,
      outsidePointRatio,
      centerOffsetX,
      centerOffsetY,
      aspectRatio,
      totalLength,
    };

    if (fillRatio < 0.14 || coverageX < 0.24 || coverageY < 0.24) {
      report.warnings.push({
        code: 'too_small',
        severity: 'high',
        message: '입력이 가이드 영역에 비해 너무 작습니다. 조금 더 크게 써보세요.',
      });
    }

    if (overflowRatio > 0.28) {
      report.warnings.push({
        code: 'overflow',
        severity: 'high',
        message: '획 일부가 가이드 영역을 벗어났습니다. 영역 안쪽으로 맞추는 편이 안정적입니다.',
      });
    }

    if (this._isSparseInput(processedStrokes, targetBox)) {
      report.warnings.push({
        code: 'low_stroke_detail',
        severity: 'medium',
        message: '획 수가 매우 적습니다. 끊김 없이 입력됐는지 확인하세요.',
      });
    }

    if (centerOffsetX > 0.26 || centerOffsetY > 0.26) {
      report.warnings.push({
        code: 'off_center',
        severity: 'medium',
        message: 'The drawing is noticeably off-center inside the target region. Re-centering it will improve composition.',
      });
    }

    if ((coverageX < 0.18 && coverageY > 0.72) || (coverageY < 0.18 && coverageX > 0.72)) {
      report.warnings.push({
        code: 'skewed_shape',
        severity: 'medium',
        message: 'The shape is concentrated into a very thin strip inside the target region. Check the guide alignment.',
      });
    }

    report.hasBlockingWarnings = report.warnings.some((warning) => warning.severity === 'high');
    return report;
  }

  _getTotalStrokeLength(strokes) {
    let total = 0;

    for (const stroke of strokes) {
      for (let i = 1; i < stroke.length; i++) {
        const dx = stroke[i].x - stroke[i - 1].x;
        const dy = stroke[i].y - stroke[i - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
      }
    }

    return total;
  }

  _isSparseInput(strokes, targetBox) {
    const pointCount = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
    const totalLength = this._getTotalStrokeLength(strokes);
    const minTargetSpan = targetBox
      ? Math.min(targetBox.w, targetBox.h)
      : Math.min(this.displayWidth || 0, this.displayHeight || 0);

    if (pointCount <= 5) {
      return true;
    }

    if (strokes.length === 1 && pointCount <= 8) {
      return true;
    }

    return minTargetSpan > 0 && totalLength < minTargetSpan * 0.32;
  }

  _getProcessedStroke(stroke) {
    if (!stroke || stroke.length < 3) return stroke ?? [];

    const simplified = this._simplifyStroke(stroke, 1.75);
    return this._smoothStroke(simplified);
  }

  _simplifyStroke(stroke, minDistance) {
    if (stroke.length < 3) return stroke;

    const simplified = [stroke[0]];
    let lastKept = stroke[0];

    for (let i = 1; i < stroke.length - 1; i++) {
      const point = stroke[i];
      const dx = point.x - lastKept.x;
      const dy = point.y - lastKept.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= minDistance) {
        simplified.push(point);
        lastKept = point;
      }
    }

    simplified.push(stroke[stroke.length - 1]);
    return simplified;
  }

  _smoothStroke(stroke) {
    if (stroke.length < 3) return stroke;

    const smoothed = [stroke[0]];

    for (let i = 1; i < stroke.length - 1; i++) {
      const prev = stroke[i - 1];
      const curr = stroke[i];
      const next = stroke[i + 1];

      smoothed.push({
        x: prev.x * 0.2 + curr.x * 0.6 + next.x * 0.2,
        y: prev.y * 0.2 + curr.y * 0.6 + next.y * 0.2,
        pressure: (prev.pressure + curr.pressure + next.pressure) / 3,
        time: curr.time,
      });
    }

    smoothed.push(stroke[stroke.length - 1]);
    return smoothed;
  }

  _getBounds(points) {
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

  _getGuideInnerBox() {
    const pad = 16;
    const width = Math.max(this.displayWidth - pad * 2, 0);
    const height = Math.max(this.displayHeight - pad * 2, 0);
    return {
      x: pad,
      y: pad,
      w: width,
      h: height,
    };
  }

  _getGuideTargetBox() {
    if (!this.guideTargetRegion) return null;

    const inner = this._getGuideInnerBox();
    return {
      x: inner.x + inner.w * this.guideTargetRegion.x,
      y: inner.y + inner.h * this.guideTargetRegion.y,
      w: inner.w * this.guideTargetRegion.w,
      h: inner.h * this.guideTargetRegion.h,
    };
  }

  _getIntersectionRect(a, b) {
    const x1 = Math.max(a.minX, b.x);
    const y1 = Math.max(a.minY, b.y);
    const x2 = Math.min(a.maxX, b.x + b.w);
    const y2 = Math.min(a.maxY, b.y + b.h);

    if (x2 <= x1 || y2 <= y1) {
      return null;
    }

    return {
      x: x1,
      y: y1,
      w: x2 - x1,
      h: y2 - y1,
    };
  }

  _expandRect(rect, padding) {
    return {
      x: rect.x - padding,
      y: rect.y - padding,
      w: rect.w + padding * 2,
      h: rect.h + padding * 2,
    };
  }

  _isPointInsideRect(point, rect) {
    return point.x >= rect.x
      && point.x <= rect.x + rect.w
      && point.y >= rect.y
      && point.y <= rect.y + rect.h;
  }

  _emitChange() {
    if (this.onChange) {
      this.onChange(this.getQualityReport());
    }
  }

  _cloneStrokes(strokes) {
    return strokes.map((stroke) =>
      stroke.map((point) => ({
        x: point.x,
        y: point.y,
        pressure: point.pressure ?? 0.5,
        time: point.time ?? Date.now(),
      }))
    );
  }
}
