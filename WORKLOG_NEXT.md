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
- Template import now persists through the shared app state saver instead of calling the removed `_persistJamoLib()` method.
- Template review cards now route through the current split modal implementation.
- Split modal now has explicit buttons for assigning selected groups to the active target, clearing selection, and clearing assignments, so right-click is no longer required.
- `git diff --check` trailing-whitespace issue in `src/core/jamo-derive.js` was cleaned up.

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

1. Test the current template workflow end to end in the browser:
   - download template
   - upload filled template
   - open multiple imported cards
   - select stroke groups
   - assign to targets
   - `Apply to Glyph Cards`
   - confirm input cards and glyph browser update immediately
2. Verify direct apply UX is understandable:
   - selected group highlight
   - target button labels
   - assigned count updates
   - completed target status
3. Test optional ASCII input:
   - uppercase A-Z
   - lowercase a-z
   - digits 0-9
   - symbols `. , ! ? : ; ' " ( ) [ ] - / @ # & *`
   - confirm generated TTF includes directly drawn ASCII where provided
4. Review remaining broken Korean strings in repo comments or old UI text.
5. Consider showing the raw imported image in the split modal if detection fails again.

## Known design limitation

- Imported cards are still image-based sources until the user assigns parts and applies them.
- TTF export only uses saved path commands in `jamoLib`.
- Imported images themselves are never exported into TTF.

## Suggested next priority

1. Manually test the current state before adding monetization.
2. Add better visual confirmation after direct assignment/save.
3. Start MVP monetization flow after testing:
   - free creation and preview
   - paid one-font TTF download
   - mock paid/unpaid state first
   - later connect Toss Payments or Stripe through a small verification API
   - initial price test: 9,900 KRW for one completed font download

## Validation status

- Last successful checks: `npm run build`, `git diff --check`
- Dev server: `http://127.0.0.1:5174/` (5173 was already in use)
- Current git state after last push: clean on `main...origin/main`
