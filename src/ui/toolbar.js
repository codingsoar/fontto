/**
 * toolbar.js - editor toolbar UI
 */

export class Toolbar {
  /**
   * @param {HTMLElement} container
   * @param {Object} callbacks
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.penSize = 8;
    this.variableWidth = false;
    this.guideEditMode = false;
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
    styleToggle.textContent = 'Fixed';
    styleToggle.title = 'Toggle fixed / variable stroke width';
    styleToggle.addEventListener('click', () => {
      this.variableWidth = !this.variableWidth;
      styleToggle.textContent = this.variableWidth ? 'Variable' : 'Fixed';
      styleToggle.classList.toggle('active', this.variableWidth);
      this.callbacks.onVariableWidth?.(this.variableWidth);
    });
    styleGroup.appendChild(styleToggle);
    this.container.appendChild(styleGroup);

    const guideGroup = this._createGroup('Guide');
    const guideEditBtn = document.createElement('button');
    guideEditBtn.className = 'tool-btn guide-edit-btn';
    guideEditBtn.textContent = 'Adjust Box';
    guideEditBtn.title = 'Move or resize the target box';
    guideEditBtn.addEventListener('click', () => {
      this.setGuideEditMode(!this.guideEditMode);
      this.callbacks.onToggleGuideEdit?.(this.guideEditMode);
    });

    const guideResetBtn = document.createElement('button');
    guideResetBtn.className = 'tool-btn guide-reset-btn';
    guideResetBtn.textContent = 'Reset Box';
    guideResetBtn.title = 'Reset the target box to the default guide';
    guideResetBtn.addEventListener('click', () => {
      this.callbacks.onResetGuideBox?.();
    });

    guideGroup.appendChild(guideEditBtn);
    guideGroup.appendChild(guideResetBtn);
    this.container.appendChild(guideGroup);
    this.guideEditBtn = guideEditBtn;

    const editGroup = this._createGroup('Edit');
    editGroup.appendChild(this._createBtn('Undo', 'Undo', () => this.callbacks.onUndo?.()));
    editGroup.appendChild(this._createBtn('Redo', 'Redo', () => this.callbacks.onRedo?.()));
    editGroup.appendChild(this._createBtn('Clear', 'Clear', () => this.callbacks.onClear?.()));
    this.container.appendChild(editGroup);

    const actionGroup = this._createGroup('');

    const saveBtn = document.createElement('button');
    saveBtn.className = 'tool-btn save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      this.callbacks.onSave?.();
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tool-btn next-btn';
    nextBtn.textContent = 'Save + Next';
    nextBtn.addEventListener('click', () => {
      this.callbacks.onNext?.();
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
      this.guideEditBtn.textContent = this.guideEditMode ? 'Editing Box' : 'Adjust Box';
    }
  }
}
