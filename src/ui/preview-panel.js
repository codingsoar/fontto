import { compose, decompose, CHO, JUNG, JONG, getVowelCategory } from '../core/hangul.js';
import { loadSyllableOverrides, composeCharFromLib } from '../core/glyph-utils.js';

export class PreviewPanel {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.showPreviewInput = options.showPreviewInput !== false;
    this.showPreviewCanvas = options.showPreviewCanvas !== false;
    this.showBrowser = options.showBrowser !== false;
    this.jamoLib = {};
    this.syllableImports = {};
    this.sampleText = '가나다라마바사 아자차카타파하';
    this.browserPage = 0;
    this.browserPageSize = 35;
    this.browserSelectedChar = '가';
    this.allSyllables = null;
    this.previewInput = null;
    this.previewCanvas = null;
    this.browserGrid = null;
    this.browserPageLabel = null;
    this.browserInput = null;
    this.importImageCache = new Map();
    this.syllableOverrides = loadSyllableOverrides();
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('preview-panel');

    if (this.showPreviewInput) {
      const inputArea = document.createElement('div');
      inputArea.className = 'preview-input-area';

      const input = document.createElement('textarea');
      input.className = 'preview-input';
      input.placeholder = '미리보기 문장을 입력하세요.';
      input.value = this.sampleText;
      input.rows = 2;

      let isComposing = false;
      input.addEventListener('compositionstart', () => {
        isComposing = true;
      });
      input.addEventListener('compositionend', (event) => {
        isComposing = false;
        requestAnimationFrame(() => {
          this.sampleText = event.target.value;
          this._renderPreview();
        });
      });
      input.addEventListener('input', (event) => {
        if (!isComposing) {
          this.sampleText = event.target.value;
          this._renderPreview();
        }
      });

      inputArea.appendChild(input);
      this.container.appendChild(inputArea);
      this.previewInput = input;
    }

    if (this.showBrowser) {
      const browserSection = document.createElement('section');
      browserSection.className = 'preview-browser';
      browserSection.innerHTML = `
        <div class="preview-browser-toolbar">
          <span class="preview-browser-title">11,172자 글자 보기</span>
          <div class="preview-browser-nav">
            <button type="button" class="tool-btn preview-browser-btn" data-nav="prev">이전</button>
            <span class="preview-browser-page"></span>
            <button type="button" class="tool-btn preview-browser-btn" data-nav="next">다음</button>
          </div>
          <div class="preview-browser-search">
            <input type="text" class="preview-browser-input" maxlength="1" placeholder="한" />
            <button type="button" class="tool-btn preview-browser-btn preview-browser-find">찾기</button>
          </div>
        </div>
        <div class="preview-browser-grid"></div>
      `;
      this.container.appendChild(browserSection);

      this.browserGrid = browserSection.querySelector('.preview-browser-grid');
      this.browserPageLabel = browserSection.querySelector('.preview-browser-page');
      this.browserInput = browserSection.querySelector('.preview-browser-input');

      browserSection.querySelector('[data-nav="prev"]').addEventListener('click', () => {
        if (this.browserPage > 0) {
          this.browserPage -= 1;
          this._renderBrowser();
        }
      });
      browserSection.querySelector('[data-nav="next"]').addEventListener('click', () => {
        const maxPage = Math.max(Math.ceil(this._getAllSyllables().length / this.browserPageSize) - 1, 0);
        if (this.browserPage < maxPage) {
          this.browserPage += 1;
          this._renderBrowser();
        }
      });
      browserSection.querySelector('.preview-browser-find').addEventListener('click', () => {
        this._findBrowserChar();
      });
      this.browserInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this._findBrowserChar();
        }
      });
    }

    if (this.showPreviewCanvas) {
      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'preview-canvas-wrap';

      this.previewCanvas = document.createElement('canvas');
      this.previewCanvas.className = 'preview-canvas';
      canvasWrap.appendChild(this.previewCanvas);
      this.container.appendChild(canvasWrap);

      this._setupCanvas();
    }

    this._renderPreview();
    this._renderBrowser();
  }

  _setupCanvas() {
    if (!this.previewCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const wrap = this.previewCanvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 120;
    this.previewCanvas.width = w * dpr;
    this.previewCanvas.height = h * dpr;
    this.previewCanvas.style.width = `${w}px`;
    this.previewCanvas.style.height = `${h}px`;
    this.pCtx = this.previewCanvas.getContext('2d');
    this.pCtx.scale(dpr, dpr);
    this.pW = w;
    this.pH = h;
  }

  updateJamoLib(jamoLib) {
    this.jamoLib = jamoLib;
    this.syllableOverrides = loadSyllableOverrides();
    this._renderPreview();
    this._renderBrowser();
  }

  updateSyllableImports(syllableImports = {}) {
    this.syllableImports = syllableImports;
    this.syllableOverrides = loadSyllableOverrides();
    this.importImageCache.clear();
    Object.entries(this.syllableImports).forEach(([char, imported]) => {
      if (!imported?.imageSrc) return;
      const image = new Image();
      image.src = imported.imageSrc;
      image.onload = () => this._renderPreview();
      this.importImageCache.set(char, image);
    });
    this._renderPreview();
    this._renderBrowser();
  }

  _getAllSyllables() {
    if (!this.allSyllables) {
      this.allSyllables = [];
      for (let cho = 0; cho < CHO.length; cho++) {
        for (let jung = 0; jung < JUNG.length; jung++) {
          for (let jong = 0; jong < JONG.length; jong++) {
            this.allSyllables.push(compose(cho, jung, jong));
          }
        }
      }
    }

    return this.allSyllables;
  }

  _findBrowserChar() {
    const value = this.browserInput?.value.trim();
    if (!value) return;

    this.focusBrowserChar(value);
  }

  focusBrowserChar(char) {
    const index = this._getAllSyllables().indexOf(char);
    if (index < 0) {
      this.options.onInvalidLocateChar?.(char);
      return;
    }

    this.browserSelectedChar = char;
    this.browserPage = Math.floor(index / this.browserPageSize);
    if (this.browserInput) {
      this.browserInput.value = char;
    }
    this._renderBrowser();
  }

  _renderBrowser() {
    if (!this.browserGrid || !this.browserPageLabel) return;

    const chars = this._getAllSyllables();
    const totalPages = Math.max(Math.ceil(chars.length / this.browserPageSize), 1);
    this.browserPage = Math.min(this.browserPage, totalPages - 1);

    const start = this.browserPage * this.browserPageSize;
    const pageChars = chars.slice(start, start + this.browserPageSize);

    if (!pageChars.includes(this.browserSelectedChar)) {
      this.browserSelectedChar = pageChars[0] ?? '가';
    }

    this.browserPageLabel.textContent = `${this.browserPage + 1}/${totalPages}`;
    this.browserGrid.innerHTML = '';

    pageChars.forEach((char) => {
      const imported = this.syllableImports?.[char];
      const commands = this._getComposedCommands(char);
      const hasComposedGlyph = this._hasCompleteComposedGlyph(char);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = [
        'preview-browser-card',
        char === this.browserSelectedChar ? 'active' : '',
        imported ? 'has-import' : '',
        hasComposedGlyph ? 'has-composed' : '',
      ].filter(Boolean).join(' ');
      button.title = char;
      let visualNode;
      if (hasComposedGlyph && commands.length > 0) {
        const canvas = document.createElement('canvas');
        const size = 48;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this._drawCommands(ctx, commands, 0, 0, size);
        visualNode = canvas;
      } else if (imported?.imageSrc) {
        const image = document.createElement('img');
        image.className = 'preview-browser-import-image';
        image.alt = `${char} 가져온 원본`;
        image.src = imported.imageSrc;
        visualNode = image;
      } else {
        const canvas = document.createElement('canvas');
        const size = 48;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        visualNode = canvas;
      }

      const label = document.createElement('span');
      label.className = 'preview-browser-char';
      label.textContent = char;

      button.appendChild(visualNode);
      if (imported?.imageSrc || hasComposedGlyph) {
        const badge = document.createElement('span');
        badge.className = 'preview-browser-badge';
        badge.textContent = hasComposedGlyph ? '완성' : '가져옴';
        button.appendChild(badge);
      }
      button.appendChild(label);
      button.addEventListener('click', () => {
        this.browserSelectedChar = char;
        this.sampleText = char;
        if (this.previewInput) {
          this.previewInput.value = char;
        }
        this.options.onOpenGlyph?.(char, {
          imported: Boolean(imported?.imageSrc),
          composed: hasComposedGlyph,
        });
        this._renderPreview();
        this._renderBrowser();
      });
      button.addEventListener('dblclick', () => {
        this.options.onLocateChar?.(char);
      });

      this.browserGrid.appendChild(button);
    });
  }

  _renderPreview() {
    if (!this.previewCanvas) return;
    const wrap = this.previewCanvas.parentElement;
    const rect = wrap?.getBoundingClientRect?.() || { width: 800, height: 120 };
    const text = this.sampleText;
    if (!text) return;

    const lines = text.split('\n');
    const paddingX = 16;
    const paddingY = 14;
    const cellSize = 48;
    const gap = 8;
    const lineHeight = cellSize + 14;
    const maxChars = Math.max(...lines.map((line) => line.length), 1);
    const contentWidth = paddingX * 2 + Math.max(0, maxChars * (cellSize + gap) - gap);
    const contentHeight = paddingY * 2 + Math.max(0, lines.length * lineHeight - (lineHeight - cellSize));
    const width = Math.max(Math.ceil(rect.width || 800), contentWidth);
    const height = Math.max(Math.ceil(rect.height || 120), contentHeight);
    const dpr = window.devicePixelRatio || 1;

    this.previewCanvas.width = width * dpr;
    this.previewCanvas.height = height * dpr;
    this.previewCanvas.style.width = `${width}px`;
    this.previewCanvas.style.height = `${height}px`;

    const ctx = this.previewCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    this.pCtx = ctx;
    this.pW = width;
    this.pH = height;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
        const char = line[charIndex];
        const x = paddingX + charIndex * (cellSize + gap);
        const y = paddingY + lineIndex * lineHeight;

        if (char === ' ') continue;

        const imported = this.syllableImports?.[char];
        const commands = this._getComposedCommands(char);
        if (commands.length > 0) {
          this._drawCommands(ctx, commands, x, y, cellSize);
          continue;
        }

        if (imported?.imageSrc) {
          this._drawImportedPreview(ctx, char, x, y, cellSize);
          continue;
        }

        if (!decompose(char)) {
          ctx.save();
          ctx.font = `${cellSize * 0.7}px "Pretendard", sans-serif`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(char, x + cellSize / 2, y + cellSize / 2);
          ctx.restore();
          continue;
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }

  _getComposedCommands(char) {
    return composeCharFromLib(char, this.jamoLib, this.syllableOverrides);
  }

  _getRequiredKeysForChar(char) {
    const info = decompose(char);
    if (!info) return [];

    const vowelCategory = getVowelCategory(info.jung);
    const dirSuffix = vowelCategory === 'vertical'
      ? 'v'
      : vowelCategory === 'horizontal'
        ? 'h'
        : 'm';
    const finalSuffix = info.jong > 0 ? '_wf' : '';
    const keys = [
      `cho_${dirSuffix}${finalSuffix}_${CHO[info.cho]}`,
      `jung_${info.jong > 0 ? 'wb' : 'nb'}_${JUNG[info.jung]}`,
    ];

    if (info.jong > 0) {
      keys.push(`jong_${dirSuffix}_${JONG[info.jong]}`);
    }

    return keys;
  }

  _hasCompleteComposedGlyph(char) {
    const requiredKeys = this._getRequiredKeysForChar(char);
    return requiredKeys.length > 0 && requiredKeys.every((key) => this.jamoLib?.[key]?.length);
  }

  _drawImportedPreview(ctx, char, x, y, size) {
    let image = this.importImageCache.get(char);
    if (!image) {
      const imported = this.syllableImports?.[char];
      if (!imported?.imageSrc) return;
      image = new Image();
      image.src = imported.imageSrc;
      image.onload = () => this._renderPreview();
      this.importImageCache.set(char, image);
    }

    if (image.complete && image.naturalWidth > 0) {
      const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const drawX = x + (size - drawWidth) / 2;
      const drawY = y + (size - drawHeight) / 2;
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    } else {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeRect(x, y, size, size);
      ctx.restore();
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
    if (this.previewCanvas) {
      this._setupCanvas();
    }
    this._renderPreview();
    this._renderBrowser();
  }
}
