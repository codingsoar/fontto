# Fontto Worklog

## Current state

- Template import no longer writes directly into jamo slots by default.
- Filled template upload now produces imported syllable cards first.
- Imported cards can open `Edit Imported Syllable`.
- Stroke groups can be selected and assigned to targets with right-click.
- Imported preview images are stored as transparent background + white glyph.
- Preview panel shows imported images directly instead of only composed jamo output.
- Browser card click is wired through main app:
  - imported card -> open split/edit modal
  - normal card -> jump to glyph edit

## Recently fixed

- Template slot count fixed to full 126 slots.
- Guide glyph in template is centered in the dashed box.
- Template crop area widened so edge strokes are less likely to be cut off.
- Imported image extraction now supports transparent background + white glyph via alpha-based detection.
- Manual split extraction no longer paints a white background before analyzing imported images.
- Preview/background issue removed so imported glyphs render without a fake tile background.
- Broken Korean strings fixed in:
  - preview panel default text
  - preview modal textarea
  - invalid input messages
  - split target labels
  - index.html title/description/icon markup

## Important files

- `src/main.js`
  - template modal flow
  - imported syllable modal
  - split target labels
  - imported syllable state persistence
- `src/core/template-import.js`
  - template metrics
  - template import crop
  - raster mask extraction
  - transparent/white imported image handling
- `src/ui/preview-panel.js`
  - glyph browser click behavior
  - imported image preview rendering
- `src/index.css`
  - imported card image styling
  - context menu styling
- `index.html`
  - repaired broken metadata/title

## Open issues to check next

1. Confirm `Edit Imported Syllable` works for multiple imported cards, not just a few samples.
2. Verify right-click assignment UX is understandable:
   - selected group highlight
   - target button labels
   - assigned count updates
3. Check whether imported syllable cards should support:
   - direct "apply to another glyph" action
   - batch reuse of the same selected part across multiple glyphs
4. Review remaining broken Korean strings in repo comments or old UI text.
5. Consider showing the raw imported image in the split modal if detection fails again.

## Known design limitation

- Imported cards are still image-based sources until the user assigns parts and applies them.
- TTF export only uses saved path commands in `jamoLib`.
- Imported images themselves are never exported into TTF.

## Suggested next priority

1. Improve split modal usability.
2. Add explicit action for "select this part and apply it to other glyphs".
3. Add better visual confirmation after assignment/save.

## Validation status

- Last successful check: `npm run build`
