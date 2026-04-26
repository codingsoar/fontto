export class Toolbar {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.penSize = 8;
    this.variableWidth = false;
    this.guideEditMode = false;
    this.strokeSelectMode = false;
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('toolbar');

    const penGroup = this._createGroup('Pen');
    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = 2;
    sizeSlider.max = 20;
    sizeSlider.value = this.penSize;
    sizeSlider.className = 'pen-slider';
    sizeSlider.addEventListener('input', (event) => {
      this.penSize = parseInt(event.target.value, 10);
      sizeLabel.textContent = `${this.penSize}px`;
      this.callbacks.onPenSize?.(this.penSize);
    });

    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'pen-size-label';
    sizeLabel.textContent = `${this.penSize}px`;
    penGroup.appendChild(sizeSlider);
    penGroup.appendChild(sizeLabel);
    this.container.appendChild(penGroup);

    const styleGroup = this._createGroup('Stroke');
    const styleToggle = document.createElement('button');
    styleToggle.className = 'tool-btn style-toggle';
    styleToggle.textContent = '✒️';
    styleToggle.title = 'Toggle fixed / variable stroke width';
    styleToggle.addEventListener('click', () => {
      this.variableWidth = !this.variableWidth;
      styleToggle.textContent = this.variableWidth ? '🖌️' : '✒️';
      styleToggle.classList.toggle('active', this.variableWidth);
      this.callbacks.onVariableWidth?.(this.variableWidth);
    });
    styleGroup.appendChild(styleToggle);
    this.container.appendChild(styleGroup);

    const guideGroup = this._createGroup('Guide');
    const guideEditBtn = document.createElement('button');
    guideEditBtn.className = 'tool-btn guide-edit-btn';
    guideEditBtn.textContent = '📦';
    guideEditBtn.title = 'Move or resize the target box';
    guideEditBtn.addEventListener('click', () => {
      this.setGuideEditMode(!this.guideEditMode);
      this.callbacks.onToggleGuideEdit?.(this.guideEditMode);
    });

    const guideResetBtn = document.createElement('button');
    guideResetBtn.className = 'tool-btn guide-reset-btn';
    guideResetBtn.textContent = '↺';
    guideResetBtn.title = 'Reset the target box to the default guide';
    guideResetBtn.addEventListener('click', () => {
      this.callbacks.onResetGuideBox?.();
    });

    guideGroup.appendChild(guideEditBtn);
    guideGroup.appendChild(guideResetBtn);
    this.container.appendChild(guideGroup);
    this.guideEditBtn = guideEditBtn;

    const partsGroup = this._createGroup('Parts');
    const strokeSelectBtn = document.createElement('button');
    strokeSelectBtn.className = 'tool-btn stroke-select-btn';
    strokeSelectBtn.textContent = '🎯';
    strokeSelectBtn.title = 'Select, move, or delete individual strokes';
    strokeSelectBtn.addEventListener('click', () => {
      this.setStrokeSelectMode(!this.strokeSelectMode);
      this.callbacks.onToggleStrokeSelect?.(this.strokeSelectMode);
    });

    const partButtons = [
      { text: '✅', title: 'Select every stroke in the current glyph', cb: () => this.callbacks.onSelectAllStrokes?.() },
      { text: '🫥', title: 'Clear the current stroke selection', cb: () => this.callbacks.onClearStrokeSelection?.() },
      { text: '🧬', title: 'Duplicate the selected strokes', cb: () => this.callbacks.onDuplicateSelectedStrokes?.() },
      { text: '✂️', title: 'Remove every stroke except the selected ones', cb: () => this.callbacks.onKeepSelectedStrokes?.() },
      { text: '🗑️', title: 'Delete the selected strokes', cb: () => this.callbacks.onDeleteSelectedStrokes?.() },
    ];

    partsGroup.appendChild(strokeSelectBtn);
    partButtons.forEach((item) => partsGroup.appendChild(this._createBtn(item.text, item.title, item.cb)));
    this.container.appendChild(partsGroup);
    this.strokeSelectBtn = strokeSelectBtn;

    const nudgeGroup = this._createGroup('Nudge');
    [
      { label: '⬅️', dx: -4, dy: 0, title: 'Move selected strokes left' },
      { label: '⬆️', dx: 0, dy: -4, title: 'Move selected strokes up' },
      { label: '⬇️', dx: 0, dy: 4, title: 'Move selected strokes down' },
      { label: '➡️', dx: 4, dy: 0, title: 'Move selected strokes right' },
    ].forEach((item) => {
      nudgeGroup.appendChild(this._createBtn(item.label, item.title, () => {
        this.callbacks.onNudgeSelectedStrokes?.(item.dx, item.dy);
      }));
    });
    this.container.appendChild(nudgeGroup);

    const transformGroup = this._createGroup('Transform');
    [
      { text: '↺', title: 'Rotate selected strokes counterclockwise', cb: () => this.callbacks.onRotateSelectedStrokes?.(-8) },
      { text: '↻', title: 'Rotate selected strokes clockwise', cb: () => this.callbacks.onRotateSelectedStrokes?.(8) },
      { text: '↔️−', title: 'Shrink selected strokes horizontally', cb: () => this.callbacks.onScaleSelectedStrokes?.(0.94, 1) },
      { text: '↔️+', title: 'Expand selected strokes horizontally', cb: () => this.callbacks.onScaleSelectedStrokes?.(1.06, 1) },
      { text: '↕️−', title: 'Shrink selected strokes vertically', cb: () => this.callbacks.onScaleSelectedStrokes?.(1, 0.94) },
      { text: '↕️+', title: 'Expand selected strokes vertically', cb: () => this.callbacks.onScaleSelectedStrokes?.(1, 1.06) },
    ].forEach((item) => transformGroup.appendChild(this._createBtn(item.text, item.title, item.cb)));
    this.container.appendChild(transformGroup);

    const layerGroup = this._createGroup('Layer');
    layerGroup.appendChild(this._createBtn('🔼', 'Bring selected strokes to the front', () => {
      this.callbacks.onBringSelectedToFront?.();
    }));
    layerGroup.appendChild(this._createBtn('🔽', 'Send selected strokes to the back', () => {
      this.callbacks.onSendSelectedToBack?.();
    }));
    this.container.appendChild(layerGroup);

    const editGroup = this._createGroup('Edit');
    editGroup.appendChild(this._createBtn('↶', 'Undo', () => this.callbacks.onUndo?.()));
    editGroup.appendChild(this._createBtn('↷', 'Redo', () => this.callbacks.onRedo?.()));
    editGroup.appendChild(this._createBtn('🧹', 'Clear', () => this.callbacks.onClear?.()));
    this.container.appendChild(editGroup);

    const actionGroup = this._createGroup('');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'tool-btn save-btn';
    saveBtn.textContent = '💾';
    saveBtn.addEventListener('click', () => this.callbacks.onSave?.());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tool-btn next-btn';
    nextBtn.textContent = '💾➡️';
    nextBtn.addEventListener('click', () => this.callbacks.onNext?.());

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

  _createBtn(text, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
  }

  setGuideEditMode(enabled) {
    this.guideEditMode = !!enabled;
    if (this.guideEditBtn) {
      this.guideEditBtn.classList.toggle('active', this.guideEditMode);
      this.guideEditBtn.textContent = this.guideEditMode ? '📦✨' : '📦';
    }
  }

  setStrokeSelectMode(enabled) {
    this.strokeSelectMode = !!enabled;
    if (this.strokeSelectBtn) {
      this.strokeSelectBtn.classList.toggle('active', this.strokeSelectMode);
      this.strokeSelectBtn.textContent = this.strokeSelectMode ? '🎯✨' : '🎯';
    }
  }
}
