/**
 * toolbar.js — 드로잉 도구 바
 */

export class Toolbar {
  /**
   * @param {HTMLElement} container
   * @param {Object} callbacks — { onUndo, onRedo, onClear, onPenSize, onPenMode, onVariableWidth, onSave, onNext }
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.penSize = 8;
    this.variableWidth = false;
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('toolbar');

    // ── 펜 굵기 ──
    const penGroup = this._createGroup('펜 굵기');
    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = 2;
    sizeSlider.max = 20;
    sizeSlider.value = this.penSize;
    sizeSlider.className = 'pen-slider';
    sizeSlider.addEventListener('input', (e) => {
      this.penSize = parseInt(e.target.value);
      sizeLabel.textContent = `${this.penSize}px`;
      if (this.callbacks.onPenSize) this.callbacks.onPenSize(this.penSize);
    });
    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'pen-size-label';
    sizeLabel.textContent = `${this.penSize}px`;
    penGroup.appendChild(sizeSlider);
    penGroup.appendChild(sizeLabel);
    this.container.appendChild(penGroup);

    // ── 획 스타일 토글 ──
    const styleGroup = this._createGroup('획 스타일');
    const styleToggle = document.createElement('button');
    styleToggle.className = 'tool-btn style-toggle';
    styleToggle.textContent = '균일';
    styleToggle.title = '균일 굵기 / 가변 굵기 전환';
    styleToggle.addEventListener('click', () => {
      this.variableWidth = !this.variableWidth;
      styleToggle.textContent = this.variableWidth ? '가변' : '균일';
      styleToggle.classList.toggle('active', this.variableWidth);
      if (this.callbacks.onVariableWidth) this.callbacks.onVariableWidth(this.variableWidth);
    });
    styleGroup.appendChild(styleToggle);
    this.container.appendChild(styleGroup);

    // ── 편집 버튼들 ──
    const editGroup = this._createGroup('편집');

    const undoBtn = this._createBtn('↩', '되돌리기', () => {
      if (this.callbacks.onUndo) this.callbacks.onUndo();
    });
    const redoBtn = this._createBtn('↪', '다시하기', () => {
      if (this.callbacks.onRedo) this.callbacks.onRedo();
    });
    const clearBtn = this._createBtn('🗑', '지우기', () => {
      if (this.callbacks.onClear) this.callbacks.onClear();
    });

    editGroup.appendChild(undoBtn);
    editGroup.appendChild(redoBtn);
    editGroup.appendChild(clearBtn);
    this.container.appendChild(editGroup);

    // ── 저장 / 다음 ──
    const actionGroup = this._createGroup('');

    const saveBtn = document.createElement('button');
    saveBtn.className = 'tool-btn save-btn';
    saveBtn.innerHTML = '✓ 저장';
    saveBtn.addEventListener('click', () => {
      if (this.callbacks.onSave) this.callbacks.onSave();
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tool-btn next-btn';
    nextBtn.innerHTML = '다음 →';
    nextBtn.addEventListener('click', () => {
      if (this.callbacks.onNext) this.callbacks.onNext();
    });

    actionGroup.appendChild(saveBtn);
    actionGroup.appendChild(nextBtn);
    this.container.appendChild(actionGroup);
  }

  _createGroup(label) {
    const group = document.createElement('div');
    group.className = 'toolbar-group';
    if (label) {
      const lbl = document.createElement('span');
      lbl.className = 'toolbar-label';
      lbl.textContent = label;
      group.appendChild(lbl);
    }
    return group;
  }

  _createBtn(icon, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML = icon;
    btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
