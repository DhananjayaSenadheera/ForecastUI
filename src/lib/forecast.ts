// =============================================================================
// Harvest-forecast presentation logic (FE-4). Pure, framework-free helpers so the
// load-bearing bits (band geometry, honest low-trust trigger, verdict tone) are
// unit-tested and the ForecastResult component stays presentational.
//
// HONEST-UNCERTAINTY RULES baked in here:
//   - A range is NEVER a bare min–max: the centre is always marked. bandCentrePct
//     gives the marked-centre position inside the P10–P90 band.
//   - Low confidence OR an explicit lowTrust flag => amber "rough estimate" caution.
//   - RED is reserved for the "Not recommended" verdict (FE-7). In FE-4 the verdict
//     is a NEUTRAL hint, so a critical/red tone is clamped to neutral here.
// =============================================================================
import { RecommendationLevel, type ConfidenceString, type HarvestForecast } from '../api/types';

/**
 * Marked-centre position (0–100%) of the central estimate inside the P10–P90 band.
 * Degenerate/inverted bands collapse to the middle so the marker is never off-track.
 */
export function bandCentrePct(lower: number, predicted: number, upper: number): number {
  const span = upper - lower;
  if (!(span > 0)) return 50;
  const pct = ((predicted - lower) / span) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Honest low-trust trigger: show the amber "rough estimate" treatment when the API
 * flags stale/fallback data OR the frozen confidence string is "Low". Never dress a
 * fallback up as a precise prediction.
 */
export function isLowTrust(f: Pick<HarvestForecast, 'lowTrust' | 'confidence'>): boolean {
  return f.lowTrust === true || f.confidence === 'Low';
}

/** FE-4 verdict tone. RED ("critical") is FE-7-only, so it is clamped to neutral. */
export type ForecastVerdictTone = 'good' | 'warn' | 'neutral';
export function forecastVerdictTone(level: RecommendationLevel): ForecastVerdictTone {
  switch (level) {
    case RecommendationLevel.StronglyRecommended:
    case RecommendationLevel.Recommended:
      return 'good';
    case RecommendationLevel.RecommendedWithRisk:
      return 'warn';
    case RecommendationLevel.NotRecommended:
    default:
      return 'neutral'; // NOT red in FE-4 — the full verdict card is FE-7
  }
}

/** i18n label key for a confidence string's short display word (Good/Fair/Low). */
export function confidenceLabelKey(c: ConfidenceString): 'confidence.good' | 'confidence.fair' | 'confidence.low' {
  return c === 'High' ? 'confidence.good' : c === 'Medium' ? 'confidence.fair' : 'confidence.low';
}
