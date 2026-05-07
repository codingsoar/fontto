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

    const penGroup = this._createGroup('펜');
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

    const styleGroup = this._createGroup('획');
    const styleToggle = document.createElement('button');
    styleToggle.className = 'tool-btn style-toggle';
    styleToggle.textContent = '✒️';
    styleToggle.title = '고정 획 두께와 가변 획 두께 전환';
    styleToggle.addEventListener('click', () => {
      this.variableWidth = !this.variableWidth;
      styleToggle.textContent = this.variableWidth ? '🖌️' : '✒️';
      styleToggle.classList.toggle('active', this.variableWidth);
      this.callbacks.onVariableWidth?.(this.variableWidth);
    });
    styleGroup.appendChild(styleToggle);
    this.container.appendChild(styleGroup);

    const guideGroup = this._createGroup('가이드');
    const guideEditBtn = document.createElement('button');
    guideEditBtn.className = 'tool-btn guide-edit-btn';
    guideEditBtn.textContent = '📦';
    guideEditBtn.title = '대상 박스 이동 또는 크기 조정';
    guideEditBtn.addEventListener('click', () => {
      this.setGuideEditMode(!this.guideEditMode);
      this.callbacks.onToggleGuideEdit?.(this.guideEditMode);
    });

    const guideResetBtn = document.createElement('button');
    guideResetBtn.className = 'tool-btn guide-reset-btn';
    guideResetBtn.textContent = '↺';
    guideResetBtn.title = '대상 박스를 기본 가이드로 초기화';
    guideResetBtn.addEventListener('click', () => {
      this.callbacks.onResetGuideBox?.();
    });

    guideGroup.appendChild(guideEditBtn);
    guideGroup.appendChild(guideResetBtn);
    this.container.appendChild(guideGroup);
    this.guideEditBtn = guideEditBtn;

    const partsGroup = this._createGroup('부분');
    const strokeSelectBtn = document.createElement('button');
    strokeSelectBtn.className = 'tool-btn stroke-select-btn';
    strokeSelectBtn.textContent = '🎯';
    strokeSelectBtn.title = '개별 획 선택, 이동 또는 삭제';
    strokeSelectBtn.addEventListener('click', () => {
      this.setStrokeSelectMode(!this.strokeSelectMode);
      this.callbacks.onToggleStrokeSelect?.(this.strokeSelectMode);
    });

    const partButtons = [
      { text: '✅', title: '현재 글자의 모든 획 선택', cb: () => this.callbacks.onSelectAllStrokes?.() },
      { text: '🫥', title: '현재 획 선택 해제', cb: () => this.callbacks.onClearStrokeSelection?.() },
      { text: '🧬', title: '선택한 획 복제', cb: () => this.callbacks.onDuplicateSelectedStrokes?.() },
      { text: '✂️', title: '선택한 획만 남기고 나머지 삭제', cb: () => this.callbacks.onKeepSelectedStrokes?.() },
      { text: '🗑️', title: '선택한 획 삭제', cb: () => this.callbacks.onDeleteSelectedStrokes?.() },
    ];

    partsGroup.appendChild(strokeSelectBtn);
    partButtons.forEach((item) => partsGroup.appendChild(this._createBtn(item.text, item.title, item.cb)));
    this.container.appendChild(partsGroup);
    this.strokeSelectBtn = strokeSelectBtn;

    const nudgeGroup = this._createGroup('이동');
    [
      { label: '⬅️', dx: -4, dy: 0, title: '선택한 획을 왼쪽으로 이동' },
      { label: '⬆️', dx: 0, dy: -4, title: '선택한 획을 위로 이동' },
      { label: '⬇️', dx: 0, dy: 4, title: '선택한 획을 아래로 이동' },
      { label: '➡️', dx: 4, dy: 0, title: '선택한 획을 오른쪽으로 이동' },
    ].forEach((item) => {
      nudgeGroup.appendChild(this._createBtn(item.label, item.title, () => {
        this.callbacks.onNudgeSelectedStrokes?.(item.dx, item.dy);
      }));
    });
    this.container.appendChild(nudgeGroup);

    const transformGroup = this._createGroup('변형');
    [
      { text: '↺', title: '선택한 획을 반시계 방향으로 회전', cb: () => this.callbacks.onRotateSelectedStrokes?.(-8) },
      { text: '↻', title: '선택한 획을 시계 방향으로 회전', cb: () => this.callbacks.onRotateSelectedStrokes?.(8) },
      { text: '↔️−', title: '선택한 획의 가로 폭 줄이기', cb: () => this.callbacks.onScaleSelectedStrokes?.(0.94, 1) },
      { text: '↔️+', title: '선택한 획의 가로 폭 늘리기', cb: () => this.callbacks.onScaleSelectedStrokes?.(1.06, 1) },
      { text: '↕️−', title: '선택한 획의 세로 높이 줄이기', cb: () => this.callbacks.onScaleSelectedStrokes?.(1, 0.94) },
      { text: '↕️+', title: '선택한 획의 세로 높이 늘리기', cb: () => this.callbacks.onScaleSelectedStrokes?.(1, 1.06) },
    ].forEach((item) => transformGroup.appendChild(this._createBtn(item.text, item.title, item.cb)));
    this.container.appendChild(transformGroup);

    const layerGroup = this._createGroup('순서');
    layerGroup.appendChild(this._createBtn('🔼', '선택한 획을 앞으로 보내기', () => {
      this.callbacks.onBringSelectedToFront?.();
    }));
    layerGroup.appendChild(this._createBtn('🔽', '선택한 획을 뒤로 보내기', () => {
      this.callbacks.onSendSelectedToBack?.();
    }));
    this.container.appendChild(layerGroup);

    const editGroup = this._createGroup('편집');
    editGroup.appendChild(this._createBtn('↶', '실행 취소', () => this.callbacks.onUndo?.()));
    editGroup.appendChild(this._createBtn('↷', '다시 실행', () => this.callbacks.onRedo?.()));
    editGroup.appendChild(this._createBtn('🧹', '비우기', () => this.callbacks.onClear?.()));
    this.container.appendChild(editGroup);

    const actionGroup = this._createGroup('');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'tool-btn save-btn';
    saveBtn.textContent = '💾';
    saveBtn.title = '그림을 재사용 가능한 부분으로 저장';
    saveBtn.addEventListener('click', () => this.callbacks.onSave?.());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tool-btn next-btn';
    nextBtn.textContent = '💾➡️';
    nextBtn.title = '이 부분을 저장하고 다음 가이드로 이동';
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
