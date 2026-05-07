/**
 * storage.js — localStorage persistence for Fontto app state
 */

const STORAGE_KEY = 'fontto-jamo-lib-v1';
const DRAFT_STORAGE_KEY = 'fontto-jamo-drafts-v1';
const GUIDE_BOX_STORAGE_KEY = 'fontto-guide-boxes-v1';
const SYLLABLE_IMPORT_STORAGE_KEY = 'fontto-syllable-imports-v1';
const TEMPLATE_SOURCE_STORAGE_KEY = 'fontto-template-sources-v1';

/**
 * Load all saved state from localStorage
 * @returns {{ jamoLib: Object, jamoDrafts: Object, guideOverrides: Object, syllableImports: Object, templateImportedSlots: Array }}
 */
export function loadState() {
  const state = {
    jamoLib: {},
    jamoDrafts: {},
    guideOverrides: {},
    syllableImports: {},
    templateImportedSlots: [],
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.jamoLib = parsed;
      }
    }

    const draftRaw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (draftRaw) {
      const parsedDrafts = JSON.parse(draftRaw);
      if (parsedDrafts && typeof parsedDrafts === 'object') {
        state.jamoDrafts = parsedDrafts;
      }
    }

    const guideRaw = window.localStorage.getItem(GUIDE_BOX_STORAGE_KEY);
    if (guideRaw) {
      const parsedGuides = JSON.parse(guideRaw);
      if (parsedGuides && typeof parsedGuides === 'object') {
        state.guideOverrides = parsedGuides;
      }
    }

    const syllableRaw = window.localStorage.getItem(SYLLABLE_IMPORT_STORAGE_KEY);
    if (syllableRaw) {
      const parsedSyllables = JSON.parse(syllableRaw);
      if (parsedSyllables && typeof parsedSyllables === 'object') {
        state.syllableImports = parsedSyllables;
      }
    }

    const templateRaw = window.localStorage.getItem(TEMPLATE_SOURCE_STORAGE_KEY);
    if (templateRaw) {
      const parsedTemplateSources = JSON.parse(templateRaw);
      if (Array.isArray(parsedTemplateSources)) {
        state.templateImportedSlots = parsedTemplateSources;
      }
    }
  } catch (error) {
    console.warn('Failed to load saved jamo library:', error);
  }

  return state;
}

/**
 * Persist all state to localStorage
 * @param {{ jamoLib: Object, jamoDrafts: Object, guideOverrides: Object, syllableImports: Object, templateImportedSlots: Array }} state
 */
export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.jamoLib));
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state.jamoDrafts));
    window.localStorage.setItem(GUIDE_BOX_STORAGE_KEY, JSON.stringify(state.guideOverrides));
    window.localStorage.setItem(SYLLABLE_IMPORT_STORAGE_KEY, JSON.stringify(state.syllableImports));
    window.localStorage.setItem(TEMPLATE_SOURCE_STORAGE_KEY, JSON.stringify(state.templateImportedSlots || []));
  } catch (error) {
    console.warn('Failed to persist jamo library:', error);
  }
}
