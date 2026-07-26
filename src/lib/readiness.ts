// Crop forecast-readiness presentation logic. Pure helpers so the honesty rules are
// unit-tested and the badge/tint components stay presentational.
// modelActive=false or a failed fetch gives a NULL map, which means no tint anywhere: we
// never paint every crop amber off a payload that cannot support the claim. With an active
// model, a crop absent from the map is brand new and reads as 'collecting'. GUID case is
// normalised. Green/amber tints only — red stays reserved for "Not recommended" — and the
// colour is always paired with a glyph and a label.
import type { CropReadiness } from '../api/types';

export type CropReadinessStatus = 'ready' | 'collecting';

export type ReadinessMap = Map<string, CropReadinessStatus>;

/**
 * Build the per-crop status lookup, or null when readiness is unknowable (failed fetch or
 * inactive model). Null means "show no tint anywhere".
 */
export function buildReadinessMap(r: CropReadiness | null): ReadinessMap | null {
  if (!r || !r.modelActive) return null;
  const map: ReadinessMap = new Map();
  for (const c of r.crops) {
    map.set(c.cropId.toLowerCase(), c.ready ? 'ready' : 'collecting');
  }
  return map;
}

/** Status for one crop: null map -> null (no tint); unknown crop -> 'collecting'. */
export function readinessFor(map: ReadinessMap | null, cropId: string): CropReadinessStatus | null {
  if (!map) return null;
  return map.get(cropId.toLowerCase()) ?? 'collecting';
}

/** i18n label key for a status badge (glyph + word — colour never alone). */
export function readinessLabelKey(status: CropReadinessStatus): 'crop.readyBadge' | 'crop.collectingBadge' {
  return status === 'ready' ? 'crop.readyBadge' : 'crop.collectingBadge';
}
