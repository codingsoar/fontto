- Request: Fontto 편집기 레이아웃 및 캔버스 렌더링 버그 수정
- Scope: `D:\fontto\src\index.css`, `D:\fontto\src\ui\drawing-canvas.js`, `D:\fontto\src\main.js`, `D:\fontto\src\ui\jamo-grid.js`, `D:\fontto\src\ui\preview-panel.js`, `D:\fontto\src\ui\toolbar.js`
- Implemented:
  1. 캔버스 영역 미표시 현상 처리를 위해 CSS Grid로 `editor-layout` 전면 재구성 (사이드바, 캔버스, 푸터 영역 분리).
  2. 캔버스 초기화 시 크기가 0으로 잡히는 문제를 `getBoundingClientRect` 0 반환 시 기본값(480x480) 부여 및 `requestAnimationFrame` 지연 초기화로 개선.
  3. `jamo-grid.js`, `preview-panel.js`, `toolbar.js`에서 DOM 초기화 시 `className`을 덮어써서 기존 CSS 클래스가 날아가는 버그를 `classList.add` 사용으로 수정.
  4. `main.js` 내 깨져 있던 `require_compose` 참조를 수정.
- Validation: 프론트엔드 핫 리로드(HMR) 작동 상태 점검, CSS Layout 및 클래스 추가 점검. (다만 서브에이전트가 "시작하기" 버튼 이벤트 후 에디터로 완전하게 넘어갔는지 추가 JS 수동 점검 요망).
- Files:
  - `D:\fontto\src\index.css`
  - `D:\fontto\src\main.js`
  - `D:\fontto\src\ui\drawing-canvas.js`
  - `D:\fontto\src\ui\jamo-grid.js`
  - `D:\fontto\src\ui\preview-panel.js`
  - `D:\fontto\src\ui\toolbar.js`
- Notes: Codex는 다음 단계로 랜딩 페이지에서 "시작하기" 클릭 시 에디터 전환 과정의 이벤트 혹은 렌더링에서 발생하는 런타임 에러 여부를 점검하고, 정상적으로 자모 입력 캔버스가 동작하는지 개발 서버 상에서 브라우저 디버깅을 이어나가시기 바랍니다.
---

- Date: 2026-04-24
- Request: Continue Fontto editor flow, improve real input quality, and add a full glyph review stage before final generation.
- Scope:
  - `D:\fontto\src\main.js`
  - `D:\fontto\src\ui\drawing-canvas.js`
  - `D:\fontto\src\ui\jamo-grid.js`
  - `D:\fontto\src\index.css`
  - `D:\fontto\package.json`
- Implemented:
  1. Added `dev:local` script in `package.json` for local testing with `vite --host 127.0.0.1 --port 5173`.
  2. Added local persistence for saved jamo data and draft stroke data in `main.js` using:
     - `fontto-jamo-lib-v1`
     - `fontto-jamo-drafts-v1`
  3. Added jamo draft restore flow:
     - saved jamo can now be re-opened and edited from the grid
     - draft stroke data is restored into the canvas
  4. Tightened generation gate:
     - font generation and review are now enabled only after all 62 required jamo are completed
     - incomplete state shows a toast instead of opening generation flow
  5. Fixed generation download handler duplication by switching to `onclick` assignment.
  6. Reworked `drawing-canvas.js` input pipeline:
     - migrated input to pointer events
     - added pointer capture
     - added `pointerrawupdate`
     - added `getCoalescedEvents()` sampling
     - improved stylus / pen behavior
  7. Added stroke processing pipeline:
     - distance-based simplification
     - lightweight smoothing
     - applied to both preview rendering and font path export
  8. Added glyph auto-normalization in `toPathCommands()`:
     - fit actual stroke bounds into UPM box
     - preserve aspect ratio
     - center glyph automatically
     - reduces issues when user draws too small or off-center
  9. Added review stage UI before final generation:
     - new `전체 글자 검수` button in header
     - paged review modal over all Hangul syllables
     - single-character search
     - selected glyph preview panel
     - direct jump from reviewed glyph to component jamo editor buttons
  10. Added `JamoGrid.selectItem(categoryId, jamo)` for direct programmatic jump into a target jamo.
- Validation:
  - `npm run build` passes after all changes.
  - Review modal code, pointer input refactor, and normalization logic are wired into the current app flow.
- Current product flow:
  1. User draws and saves all 62 required jamo.
  2. User opens `전체 글자 검수`.
  3. User browses generated syllables, finds a bad glyph, and jumps back to the relevant cho/jung/jong input.
  4. User edits source jamo.
  5. User re-opens review and confirms the fix.
  6. User generates and downloads final TTF.
- Important implementation note:
  - This project still edits generated glyphs indirectly through source jamo.
  - There is no per-syllable direct outline editor yet.
  - The review stage is currently a navigation and inspection layer, not a direct glyph sculpting tool.
- Next recommended tasks:
  1. Add filtered review presets:
     - common Korean syllables first
     - recently affected glyphs
     - search by jamo combination
  2. Preserve review modal context after editing:
     - return to last reviewed page/character after fixing a jamo
  3. Add quality heuristics before save:
     - warn if a jamo is too small
     - warn if bounding box is too skewed
     - warn if stroke count is suspiciously low
  4. Optional future architecture:
     - add true per-syllable override editing on top of generated composition if direct glyph correction becomes necessary
---

- Date: 2026-04-25
- Request: Continue the Hangul composition workflow, reduce composition artifacts, and change input from raw jamo cards to context-aware guided tasks.
- Scope:
  - `D:\fontto\src\core\composer.js`
  - `D:\fontto\src\core\hangul.js`
  - `D:\fontto\src\ui\jamo-grid.js`
  - `D:\fontto\src\ui\drawing-canvas.js`
  - `D:\fontto\src\ui\preview-panel.js`
  - `D:\fontto\src\main.js`
  - `D:\fontto\src\index.css`
- Implemented:
  1. Reworked syllable composition in `composer.js` around explicit contexts:
     - `cv`
     - `cvc_simple`
     - `cvc_compound`
  2. Added context-aware lookup in the composer:
     - tries context slot keys first
     - falls back to the legacy base jamo keys
  3. Changed compound final consonant handling:
     - `jong_cluster_*` assets are used first when available
     - otherwise the compound jong is decomposed and laid out inside the jong slot as a fallback
  4. Added separate input support for the 11 modern compound final consonants in `jamo-grid.js`:
     - `ㄳ, ㄵ, ㄶ, ㄺ, ㄻ, ㄼ, ㄽ, ㄾ, ㄿ, ㅀ, ㅄ`
  5. Fixed the compound jong list/example mismatch by aligning the examples with the actual 11 supported clusters.
  6. Added full review improvements in `main.js`:
     - review presets for all / common / recently affected / jamo-combo query
     - return-to-review flow after jumping back into jamo editing
     - review state persistence for the current page and selected glyph
  7. Removed the misleading review-card text label that visually made one slot look like multiple syllables.
  8. Fixed Korean IME preview behavior:
     - composition updates are deferred until `compositionend`
     - prevents temporary duplicated text such as `가갼` while typing `갼`
  9. Added guided task metadata in `jamo-grid.js`:
     - guide character
     - decomposed jamo sequence
     - highlighted target indices
     - target region box
     - context-aware storage keys
  10. Updated `drawing-canvas.js` guide rendering:
      - faint full-syllable background guide
      - masked target region highlight
      - decomposed jamo sequence at the top
      - active extraction target emphasized
  11. Updated `main.js` save flow to store one drawing under multiple keys when needed:
      - base input key for progress tracking
      - context-aware alias keys for later composition use
  12. Fixed completion counting so progress and required-count checks only use tracked input keys, not every alias stored in `jamoLib`.
- Validation:
  - `npm run build` passes after the latest guide + storage-key changes.
- Current architecture state:
  1. Input is no longer just "draw isolated jamo".
  2. The UI can now present a full syllable as the guide and indicate which internal jamo/slot is being captured.
  3. The saved drawing can be reused through multiple storage keys so the composer can pick a more context-specific asset later.
  4. The composition engine is prepared for more slot overrides, but the UI currently exposes only the guided tasks already added.
- Known limitations:
  1. The large guide syllable is highlighted by region/mask, not by exact per-component vector overlay yet.
  2. Some layout text in older files may still look garbled in terminal output because of encoding display, even though the app builds.
  3. Compound jong and dense syllable layout may still need more slot-specific tuning after real-device testing.
- Next recommended tasks:
  1. Test the new guided input flow on a tablet and tune the guide mask boxes for real stylus use.
  2. Add more context-specific input slots only where the current fallback composition still looks weak.
     - likely candidates: `cho_with_jong`, `jung_with_compound_jong`, `jong_compound_left`, `jong_compound_right`
  3. Add save-time quality checks for guided tasks:
     - too small inside target region
     - outside-region overflow
     - suspiciously low stroke count
  4. Consider migrating review rendering to use the same context task labels shown during input so the correction path is clearer.
---

- Date: 2026-04-25 17:53 +09:00
- Request: Investigate exported TTF issues and leave a clear handoff note for the next session.
- Scope:
  - `D:\fontto\src\ui\drawing-canvas.js`
  - `D:\fontto\src\core\font-generator.js`
  - `D:\fontto\ANTIGRAVITY_WORKLOG.md`
- Implemented:
  1. Investigated the font export path:
     - confirmed export uses `opentype.js`
     - confirmed the app writes all 11,172 Hangul syllables plus `.notdef` and `space`
     - verified the generated ArrayBuffer can be parsed again with `opentype.parse()`
  2. Identified the main structural risk in exported outlines:
     - stroke centerlines were being expanded into polygons with a simple per-point offset
     - sharp turns could create spikes or self-intersections
     - those shapes can render acceptably in canvas preview but still cause downstream font-app validation problems
  3. Reworked stroke outline generation in `drawing-canvas.js`:
     - added `_buildStrokePolygon()`
     - added averaged join normals for corners
     - clamped join scale to avoid extreme miters
     - deduplicated nearly identical polygon points before path export
  4. Hardened font export in `font-generator.js`:
     - added `sanitizeCommands()` before building each glyph path
     - drops invalid / non-finite commands
     - removes duplicate points
     - avoids emitting degenerate contours
     - normalizes coordinates with light rounding
  5. Improved font metadata stability:
     - now writes `fullName`
     - now writes a sanitized `postScriptName`
  6. Added export-time validation:
     - after `font.toArrayBuffer()`, the buffer is immediately reparsed with `opentype.parse()`
     - this catches obviously broken font serialization during generation instead of after download
- Validation:
  - `npm run build` passes.
  - Local dummy-library generation test passes:
    - generated font buffer successfully reparses
    - sample glyphs such as `가` and `각` return valid path commands
- Current assessment:
  1. The export pipeline is now more robust against malformed contours.
  2. If the user still sees a broken font file, the next likely cause is not global TTF serialization but a specific saved jamo shape that still creates a problematic contour pattern.
  3. In that case, the right debugging step is to isolate which exported syllable fails in the target font app and trace it back to its source jamo.
- Next recommended tasks:
  1. Re-export the font and test it in the same app/viewer that previously reported an error.
  2. If the error persists, record:
     - the exact app name
     - the error message
     - whether the whole font fails to load or only certain glyphs look broken
  3. If the problem is glyph-specific, add a debug mode that exports one selected syllable as SVG/path data for easier inspection.
  4. Consider adding optional contour cleanup for acute angle joins if handwritten zig-zag strokes still create unstable outlines in some font consumers.
---

- Date: 2026-04-26
- Request: Continue the current Fontto workstream from the existing handoff notes.
- Scope:
  - `D:\fontto\src\ui\drawing-canvas.js`
  - `D:\fontto\src\main.js`
  - `D:\fontto\ANTIGRAVITY_WORKLOG.md`
- Implemented:
  1. Expanded guided-input quality heuristics in `drawing-canvas.js`:
     - sparse input detection now checks total sampled path length, not just one short stroke
     - added off-center detection inside the target box
     - added thin-strip / skewed-shape detection when coverage is highly unbalanced
  2. Exposed the new quality signals in the editor panel:
     - added center offset percentage to the live quality summary
     - mapped new warning codes to clear English UI copy
  3. Kept save behavior consistent:
     - high-severity issues still trigger the existing confirm-before-save flow
     - medium warnings remain non-blocking but visible in the panel and toast
- Validation:
  - Pending: run `npm run build`
- Next recommended tasks:
  1. Build and manually test a few guided tasks that are intentionally too small, off-center, and overflowing to tune thresholds.
  2. If false positives show up on narrow vowels or finals, make thresholds category-aware using guide metadata.
  3. Add optional per-task visual overlays for centerline / coverage debugging if stylus-device tuning continues.
