// =============================================================================
// Namespaced localStorage helpers (FE-16). Every read/write is wrapped in
// try/catch so private-mode / quota / disabled-storage failures degrade SILENTLY
// to current behaviour — a storage error must never throw during render.
//
// PRIVACY: we persist ONLY crop ids + planting dates + a boolean UI preference.
// Never any personal data. Shapes are versioned ({ v: N, … }) so a future change
// can reject/ignore an old blob instead of mis-reading it.
// =============================================================================

export const STORAGE_KEYS = {
  lastHarvest: 'agriforecast.lastHarvest',
  recentCrops: 'agriforecast.recentCrops',
  textSize: 'agriforecast.textSize',
} as const;

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota / disabled — non-fatal, the value just won't persist */
  }
}

function readJSON<T>(key: string): T | null {
  const raw = readRaw(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* circular / non-serialisable — cannot happen for our shapes, guarded anyway */
  }
}

// ---- last-forecast crop + planting date -------------------------------------
const LAST_HARVEST_V = 1;
export interface LastHarvest {
  cropId: string;
  plantDate: string; // "YYYY-MM-DD"
}
interface StoredLastHarvest {
  v: number;
  cropId: string;
  plantDate: string;
}

export function readLastHarvest(): LastHarvest | null {
  const s = readJSON<StoredLastHarvest>(STORAGE_KEYS.lastHarvest);
  if (!s || s.v !== LAST_HARVEST_V) return null;
  if (typeof s.cropId !== 'string' || typeof s.plantDate !== 'string') return null;
  if (!s.cropId || !s.plantDate) return null;
  return { cropId: s.cropId, plantDate: s.plantDate };
}

export function writeLastHarvest(cropId: string, plantDate: string): void {
  if (!cropId || !plantDate) return;
  writeJSON(STORAGE_KEYS.lastHarvest, { v: LAST_HARVEST_V, cropId, plantDate });
}

// ---- recent crops (up to 3 distinct, most-recent first) ---------------------
const RECENT_V = 1;
export const RECENT_MAX = 3;
interface StoredRecent {
  v: number;
  ids: string[];
}

export function readRecentCrops(): string[] {
  const s = readJSON<StoredRecent>(STORAGE_KEYS.recentCrops);
  if (!s || s.v !== RECENT_V || !Array.isArray(s.ids)) return [];
  return s.ids.filter((x) => typeof x === 'string' && x).slice(0, RECENT_MAX);
}

/** Prepend a freshly-picked crop id (dedupe, cap at 3). Returns the new list. */
export function pushRecentCrop(cropId: string): string[] {
  if (!cropId) return readRecentCrops();
  const prev = readRecentCrops().filter((id) => id !== cropId);
  const next = [cropId, ...prev].slice(0, RECENT_MAX);
  writeJSON(STORAGE_KEYS.recentCrops, { v: RECENT_V, ids: next });
  return next;
}

// ---- large-text a11y preference ---------------------------------------------
const TEXT_SIZE_V = 1;
export const LARGE_TEXT_CLASS = 'a11y-large';
interface StoredTextSize {
  v: number;
  large: boolean;
}

export function readLargeText(): boolean {
  const s = readJSON<StoredTextSize>(STORAGE_KEYS.textSize);
  return Boolean(s && s.v === TEXT_SIZE_V && s.large === true);
}

export function writeLargeText(large: boolean): void {
  writeJSON(STORAGE_KEYS.textSize, { v: TEXT_SIZE_V, large });
}

/**
 * Apply the persisted text-size class to <html> BEFORE first paint (called from
 * the main.tsx bootstrap, so there is no flash of small text). Guards a missing
 * `document` so it is harmless in a non-DOM (test/SSR-less) context.
 */
export function applyStoredTextSize(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(LARGE_TEXT_CLASS, readLargeText());
}
