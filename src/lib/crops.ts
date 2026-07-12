// =============================================================================
// Crop-picker logic (FE-3). Pure, framework-free helpers so the load-bearing
// bits (localized display name, search filter, category grouping) are unit-tested
// and the CropPicker component stays presentational.
//
// GRACEFUL DEGRADATION: crops may arrive from the live API WITHOUT category or
// localized names (API gap #3). Display name falls back to the English `name`;
// missing categories collapse into a single "All crops" group.
// =============================================================================
import type { AppLanguage } from '../i18n';
import type { Crop } from '../api/types';

/** Localized crop label. Falls back to English `name` when a translation is absent. */
export function cropDisplayName(crop: Crop, lang: AppLanguage | string): string {
  if (lang === 'si' && crop.nameSi) return crop.nameSi;
  if (lang === 'ta' && crop.nameTa) return crop.nameTa;
  return crop.name;
}

/** All name strings a crop can be matched against (English + any localized names). */
function searchHaystack(crop: Crop): string {
  return [crop.name, crop.nameSi, crop.nameTa, crop.cropCode]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Filter crops by a free-text query. Matches across English + Sinhala + Tamil
 * names (and the code) so a farmer typing in any script still finds their crop.
 * Empty/whitespace query returns the list unchanged.
 */
export function filterCrops(crops: Crop[], query: string): Crop[] {
  const q = query.trim().toLowerCase();
  if (!q) return crops;
  return crops.filter((c) => searchHaystack(c).includes(q));
}

export interface CropGroup {
  /** Category code (VEG/FRT/…) or null for the single "all" fallback group. */
  code: string | null;
  /** English category name from the API (component localizes by code). */
  name: string | null;
  crops: Crop[];
}

/**
 * Group crops by category, preserving first-seen category order. If NO crop
 * carries a category (live API gap #3), returns a single null-coded group so the
 * UI shows one flat "All crops" list instead of breaking.
 */
export function groupCropsByCategory(crops: Crop[]): CropGroup[] {
  const anyCategory = crops.some((c) => c.category?.code);
  if (!anyCategory) {
    return crops.length ? [{ code: null, name: null, crops }] : [];
  }
  const groups = new Map<string, CropGroup>();
  const order: string[] = [];
  for (const c of crops) {
    const code = c.category?.code ?? '_other';
    if (!groups.has(code)) {
      groups.set(code, { code: c.category?.code ?? null, name: c.category?.name ?? null, crops: [] });
      order.push(code);
    }
    groups.get(code)!.crops.push(c);
  }
  return order.map((code) => groups.get(code)!);
}

/**
 * Parse a comma-separated crop-id list (the FE-14 compare deep-link `?crops=`).
 * Trims, drops empties, dedupes (first-seen order preserved), and caps at `max`.
 * Pure string handling — validity against the loaded crop list is the caller's job.
 */
export function parseCropIdList(raw: string | null, max: number): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** i18n key for a category code; unknown codes fall back to the API name / "all". */
export function categoryLabelKey(code: string | null): string {
  switch (code) {
    case 'VEG':
    case 'VEG-UP':
    case 'VEG-LOW':
      return 'crop.catVegetables';
    case 'FRT':
      return 'crop.catFruits';
    default:
      return 'crop.catAll';
  }
}
