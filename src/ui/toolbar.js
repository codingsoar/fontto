export class Toolbar {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.guideEditMode = false;
    this.strokeSelectMode = false;
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('toolbar');

    const actionGroup = this._createGroup('저장');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'tool-btn save-btn';
    saveBtn.textContent = '저장';
    saveBtn.title = '현재 위치 저장';
    saveBtn.addEventListener('click', () => this.callbacks.onSave?.());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tool-btn next-btn';
    nextBtn.textContent = '저장 후 다음';
    nextBtn.title = '현재 위치를 저장하고 다음 항목으로 이동';
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

  setGuideEditMode(enabled) {
    this.guideEditMode = !!enabled;
  }

  setStrokeSelectMode(enabled) {
    this.strokeSelectMode = !!enabled;
  }
}
