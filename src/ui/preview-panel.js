/**
 * preview-panel.js — 실시간 미리보기 패널
 */

import { compose, decompose, CHO, JUNG, JONG } from '../core/hangul.js';
import { composeSyllable } from '../core/composer.js';

export class PreviewPanel {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.jamoLib = {};
    this.sampleText = '가나다라마바사 아야어여오요우유으이';
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('preview-panel');

    // 샘플 텍스트 입력
    const inputArea = document.createElement('div');
    inputArea.className = 'preview-input-area';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'preview-input';
    input.placeholder = '미리보기 텍스트를 입력하세요...';
    input.value = this.sampleText;
    let isComposing = false;
    input.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    input.addEventListener('compositionend', (e) => {
      isComposing = false;
      requestAnimationFrame(() => {
        this.sampleText = e.target.value;
        this._renderPreview();
      });
    });
    input.addEventListener('input', (e) => {
      if (!isComposing) {
        this.sampleText = e.target.value;
        this._renderPreview();
      }
    });

    inputArea.appendChild(input);
    this.container.appendChild(inputArea);

    // 미리보기 캔버스
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'preview-canvas-wrap';

    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.className = 'preview-canvas';
    canvasWrap.appendChild(this.previewCanvas);
    this.container.appendChild(canvasWrap);

    this._setupCanvas();
  }

  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const wrap = this.previewCanvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 120;
    this.previewCanvas.width = w * dpr;
    this.previewCanvas.height = h * dpr;
    this.previewCanvas.style.width = w + 'px';
    this.previewCanvas.style.height = h + 'px';
    this.pCtx = this.previewCanvas.getContext('2d');
    this.pCtx.scale(dpr, dpr);
    this.pW = w;
    this.pH = h;
  }

  /**
   * 자모 라이브러리 업데이트
   */
  updateJamoLib(jamoLib) {
    this.jamoLib = jamoLib;
    this._renderPreview();
  }

  _renderPreview() {
    const ctx = this.pCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.pW, this.pH);

    const text = this.sampleText;
    if (!text) return;

    const cellSize = Math.min(60, (this.pW - 40) / Math.max(text.length, 1));
    const startX = 20;
    const startY = (this.pH - cellSize) / 2;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const x = startX + i * (cellSize + 4);

      if (char === ' ') continue;

      const info = decompose(char);
      if (!info) {
        // 한글이 아닌 문자 — 시스템 폰트로 그리기
        ctx.save();
        ctx.font = `${cellSize * 0.7}px "Pretendard", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, x + cellSize / 2, startY + cellSize / 2);
        ctx.restore();
        continue;
      }

      // 음절 조합 Path 가져오기
      const commands = composeSyllable(info.cho, info.jung, info.jong, this.jamoLib);
      if (commands.length === 0) {
        // 커맨드 없으면 빈 박스
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, startY, cellSize, cellSize);
        continue;
      }

      // Path 렌더링 (1000 UPM → cellSize 스케일)
      this._drawCommands(ctx, commands, x, startY, cellSize);
    }
  }

  _drawCommands(ctx, commands, x, y, size) {
    const scale = size / 1000;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();

    for (const cmd of commands) {
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
    }

    ctx.fill();
    ctx.restore();
  }

  resize() {
    this._setupCanvas();
    this._renderPreview();
  }
}
