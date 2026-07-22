// =============================================================================
// Crop forecast-readiness presentation logic (crop-status colouring, owner
// request 2026-07-22). Pure, framework-free helpers so the honesty rules are
// unit-tested and the badge/tint components stay presentational.
//
// HONESTY RULES baked in here (mirrors api/types.ts CropReadiness contract):
//   - modelActive=false OR a failed fetch => NULL map => no tint anywhere. We
//     never paint every crop amber off a payload that can't support the claim.
//   - With an active model, a crop ABSENT from the map is a brand-new crop =>
//     'collecting' (same as an explicit ready=false).
//   - GUID case is normalized (the model payload lowercases ids; UI ids vary).
// COLOUR LAW (tokens.css): green/amber tints only — RED stays reserved for the
// "Not recommended" verdict; the colour is ALWAYS paired with glyph + label.
// =============================================================================
import type { CropReadiness } from '../api/types';

export type CropReadinessStatus = 'ready' | 'collecting';

export type ReadinessMap = Map<string, CropReadinessStatus>;

/**
 * Build the per-crop status lookup, or null when readiness is unknowable
 * (failed fetch or inactive model) — null means "show no tint anywhere".
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
