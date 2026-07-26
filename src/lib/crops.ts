// Crop-picker logic. Pure helpers so the localized display name, search filter and
// category grouping are unit-tested and CropPicker stays presentational.
// Crops may arrive without a category or localized names, so the display name falls back
// to the English `name` and missing categories collapse into one "All crops" group.
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
 * Filter crops by free text, matching English + Sinhala + Tamil names (and the code) so a
 * farmer typing in any script still finds their crop. An empty query returns the list.
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
 * Group crops by DISPLAY category, preserving first-seen order. If no crop carries a
 * category, returns a single null-coded group so the UI shows one flat list.
 * Sub-category rollup is client-side: the API sends VEG / VEG-UP / VEG-LOW verbatim, so
 * every code whose categoryLabelKey maps to the same label shares ONE group — otherwise
 * the picker renders three headings all reading "Vegetables". Unknown codes keep their own
 * group so the API-provided name still shows.
 */
export function groupCropsByCategory(crops: Crop[]): CropGroup[] {
  const anyCategory = crops.some((c) => c.category?.code);
  if (!anyCategory) {
    return crops.length ? [{ code: null, name: null, crops }] : [];
  }
  const groups = new Map<string, CropGroup>();
  const order: string[] = [];
  for (const c of crops) {
    const code = c.category?.code ?? null;
    const labelKey = categoryLabelKey(code);
    const bucket = labelKey !== 'crop.catAll' ? labelKey : (code ?? '_other');
    if (!groups.has(bucket)) {
      groups.set(bucket, { code, name: c.category?.name ?? null, crops: [] });
      order.push(bucket);
    }
    groups.get(bucket)!.crops.push(c);
  }
  return order.map((bucket) => groups.get(bucket)!);
}

/**
 * Parse the comma-separated crop-id list from the compare deep-link (?crops=). Trims,
 * drops empties, dedupes and caps at `max`. Checking the ids against the loaded crop list
 * is the caller's job.
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
