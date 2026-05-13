/**
 * storage.js - localStorage persistence for Fontto app state
 */

const STORAGE_KEY = 'fontto-jamo-lib-v1';
const DRAFT_STORAGE_KEY = 'fontto-jamo-drafts-v1';
const GUIDE_BOX_STORAGE_KEY = 'fontto-guide-boxes-v1';
const SYLLABLE_IMPORT_STORAGE_KEY = 'fontto-syllable-imports-v1';
const TEMPLATE_SOURCE_STORAGE_KEY = 'fontto-template-sources-v1';
const DOWNLOAD_ACCESS_STORAGE_KEY = 'fontto-download-access-v1';
const PENDING_PARTS_STORAGE_KEY = 'fontto-pending-parts-v1';
const SYLLABLE_OVERRIDE_STORAGE_KEY = 'fontto-syllable-overrides-v1';
const DELETED_SYLLABLE_STORAGE_KEY = 'fontto-deleted-syllables-v1';

const STATE_BUNDLE_CURRENT_KEY = 'fontto-state-bundle-current-v1';
const STATE_BUNDLE_BACKUP_KEY = 'fontto-state-bundle-backup-v1';
const STATE_BUNDLE_META_KEY = 'fontto-state-bundle-meta-v1';

function createDefaultState() {
  return {
    jamoLib: {},
    jamoDrafts: {},
    guideOverrides: {},
    syllableImports: {},
    templateImportedSlots: [],
    downloadAccess: {
      unlocked: false,
      fontName: '',
      unlockedAt: '',
    },
    pendingParts: {},
    __storageInfo: {
      source: 'default',
      recovered: false,
      backupAvailable: false,
      savedAt: '',
      backupSavedAt: '',
    },
  };
}

function normalizeState(state = {}) {
  const base = createDefaultState();
  return {
    ...base,
    ...state,
    jamoLib: state?.jamoLib && typeof state.jamoLib === 'object' ? state.jamoLib : {},
    jamoDrafts: state?.jamoDrafts && typeof state.jamoDrafts === 'object' ? state.jamoDrafts : {},
    guideOverrides: state?.guideOverrides && typeof state.guideOverrides === 'object' ? state.guideOverrides : {},
    syllableImports: state?.syllableImports && typeof state.syllableImports === 'object' ? state.syllableImports : {},
    templateImportedSlots: Array.isArray(state?.templateImportedSlots) ? state.templateImportedSlots : [],
    downloadAccess: {
      unlocked: Boolean(state?.downloadAccess?.unlocked),
      fontName: typeof state?.downloadAccess?.fontName === 'string' ? state.downloadAccess.fontName : '',
      unlockedAt: typeof state?.downloadAccess?.unlockedAt === 'string' ? state.downloadAccess.unlockedAt : '',
    },
    pendingParts: state?.pendingParts && typeof state.pendingParts === 'object' ? state.pendingParts : {},
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBundle(raw) {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!isPlainObject(parsed)) return null;
  return normalizeState(parsed);
}

function readMeta() {
  try {
    const raw = window.localStorage.getItem(STATE_BUNDLE_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readLegacyState() {
  const state = createDefaultState();

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (isPlainObject(parsed)) {
      state.jamoLib = parsed;
    }
  }

  const draftRaw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  if (draftRaw) {
    const parsedDrafts = JSON.parse(draftRaw);
    if (isPlainObject(parsedDrafts)) {
      state.jamoDrafts = parsedDrafts;
    }
  }

  const guideRaw = window.localStorage.getItem(GUIDE_BOX_STORAGE_KEY);
  if (guideRaw) {
    const parsedGuides = JSON.parse(guideRaw);
    if (isPlainObject(parsedGuides)) {
      state.guideOverrides = parsedGuides;
    }
  }

  const syllableRaw = window.localStorage.getItem(SYLLABLE_IMPORT_STORAGE_KEY);
  if (syllableRaw) {
    const parsedSyllables = JSON.parse(syllableRaw);
    if (isPlainObject(parsedSyllables)) {
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

  const downloadAccessRaw = window.localStorage.getItem(DOWNLOAD_ACCESS_STORAGE_KEY);
  if (downloadAccessRaw) {
    const parsedDownloadAccess = JSON.parse(downloadAccessRaw);
    if (isPlainObject(parsedDownloadAccess)) {
      state.downloadAccess = {
        unlocked: Boolean(parsedDownloadAccess.unlocked),
        fontName: typeof parsedDownloadAccess.fontName === 'string' ? parsedDownloadAccess.fontName : '',
        unlockedAt: typeof parsedDownloadAccess.unlockedAt === 'string' ? parsedDownloadAccess.unlockedAt : '',
      };
    }
  }

  const pendingPartsRaw = window.localStorage.getItem(PENDING_PARTS_STORAGE_KEY);
  if (pendingPartsRaw) {
    const parsedPendingParts = JSON.parse(pendingPartsRaw);
    if (isPlainObject(parsedPendingParts)) {
      state.pendingParts = parsedPendingParts;
    }
  }

  return normalizeState(state);
}

function writeLegacyKeys(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.jamoLib));
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state.jamoDrafts));
  window.localStorage.setItem(GUIDE_BOX_STORAGE_KEY, JSON.stringify(state.guideOverrides));
  window.localStorage.setItem(SYLLABLE_IMPORT_STORAGE_KEY, JSON.stringify(state.syllableImports));
  window.localStorage.setItem(TEMPLATE_SOURCE_STORAGE_KEY, JSON.stringify(state.templateImportedSlots || []));
  window.localStorage.setItem(DOWNLOAD_ACCESS_STORAGE_KEY, JSON.stringify(state.downloadAccess || {
    unlocked: false,
    fontName: '',
    unlockedAt: '',
  }));
  window.localStorage.setItem(PENDING_PARTS_STORAGE_KEY, JSON.stringify(state.pendingParts || {}));
}

/**
 * Load all saved state from localStorage.
 * Prefers bundled state, then backup bundle, then legacy split keys.
 */
export function loadState() {
  const fallback = createDefaultState();

  try {
    const meta = readMeta();
    const currentRaw = window.localStorage.getItem(STATE_BUNDLE_CURRENT_KEY);
    const current = parseBundle(currentRaw);
    if (current) {
      current.__storageInfo = {
        source: 'current',
        recovered: false,
        backupAvailable: Boolean(window.localStorage.getItem(STATE_BUNDLE_BACKUP_KEY)),
        savedAt: typeof meta.currentSavedAt === 'string' ? meta.currentSavedAt : '',
        backupSavedAt: typeof meta.backupSavedAt === 'string' ? meta.backupSavedAt : '',
      };
      return current;
    }

    const backupRaw = window.localStorage.getItem(STATE_BUNDLE_BACKUP_KEY);
    const backup = parseBundle(backupRaw);
    if (backup) {
      backup.__storageInfo = {
        source: 'backup',
        recovered: true,
        backupAvailable: true,
        savedAt: typeof meta.currentSavedAt === 'string' ? meta.currentSavedAt : '',
        backupSavedAt: typeof meta.backupSavedAt === 'string' ? meta.backupSavedAt : '',
      };
      return backup;
    }

    const legacy = readLegacyState();
    legacy.__storageInfo = {
      source: 'legacy',
      recovered: false,
      backupAvailable: false,
      savedAt: '',
      backupSavedAt: '',
    };
    return legacy;
  } catch (error) {
    console.warn('Failed to load saved Fontto state:', error);
    try {
      const backupRaw = window.localStorage.getItem(STATE_BUNDLE_BACKUP_KEY);
      const backup = parseBundle(backupRaw);
      if (backup) {
        backup.__storageInfo = {
          source: 'backup',
          recovered: true,
          backupAvailable: true,
          savedAt: '',
          backupSavedAt: '',
        };
        return backup;
      }
    } catch (backupError) {
      console.warn('Failed to recover Fontto backup state:', backupError);
    }
  }

  return fallback;
}

/**
 * Persist all state to localStorage.
 * Writes the previous current snapshot to a backup slot before replacing it.
 */
export function saveState(state) {
  try {
    const normalized = normalizeState(state);
    const nextRaw = JSON.stringify(normalized);
    const currentRaw = window.localStorage.getItem(STATE_BUNDLE_CURRENT_KEY);
    const now = new Date().toISOString();
    const previousMeta = readMeta();

    if (currentRaw) {
      window.localStorage.setItem(STATE_BUNDLE_BACKUP_KEY, currentRaw);
    } else {
      window.localStorage.setItem(STATE_BUNDLE_BACKUP_KEY, nextRaw);
    }

    window.localStorage.setItem(STATE_BUNDLE_CURRENT_KEY, nextRaw);
    window.localStorage.setItem(STATE_BUNDLE_META_KEY, JSON.stringify({
      currentSavedAt: now,
      backupSavedAt: currentRaw
        ? (typeof previousMeta.currentSavedAt === 'string' ? previousMeta.currentSavedAt : now)
        : now,
    }));

    writeLegacyKeys(normalized);
  } catch (error) {
    console.warn('Failed to persist Fontto state:', error);
  }
}

export function clearState() {
  try {
    [
      STORAGE_KEY,
      DRAFT_STORAGE_KEY,
      GUIDE_BOX_STORAGE_KEY,
      SYLLABLE_IMPORT_STORAGE_KEY,
      TEMPLATE_SOURCE_STORAGE_KEY,
      DOWNLOAD_ACCESS_STORAGE_KEY,
      PENDING_PARTS_STORAGE_KEY,
      SYLLABLE_OVERRIDE_STORAGE_KEY,
      DELETED_SYLLABLE_STORAGE_KEY,
      STATE_BUNDLE_CURRENT_KEY,
      STATE_BUNDLE_BACKUP_KEY,
      STATE_BUNDLE_META_KEY,
    ].forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.warn('Failed to clear saved Fontto state:', error);
  }
}
