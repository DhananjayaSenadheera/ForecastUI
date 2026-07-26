// Harvest-forecast presentation logic. Pure helpers so band geometry, the low-trust
// trigger and verdict tone are unit-tested and ForecastResult stays presentational.
// A range is never a bare min–max: the centre is always marked. Low confidence or an
// explicit lowTrust flag triggers the amber "rough estimate" caution. Red is reserved for
// the "Not recommended" verdict on the best-crops screen, so a critical tone is clamped to
// neutral here.
import {
  RecommendationLevel,
  type ConfidenceString,
  type FactorDirection,
  type ForecastFactor,
  type HarvestForecast,
} from '../api/types';

/**
 * Marked-centre position (0–100%) of the central estimate inside the P10–P90 band.
 * Degenerate or inverted bands collapse to the middle so the marker stays on the track.
 */
export function bandCentrePct(lower: number, predicted: number, upper: number): number {
  const span = upper - lower;
  if (!(span > 0)) return 50;
  const pct = ((predicted - lower) / span) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Show the amber "rough estimate" treatment when the API flags stale/fallback data OR the
 * frozen confidence string is "Low". Never dress a fallback up as a precise prediction.
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

// "Why this forecast?" factor breakdown. Pure helpers so the shared-scale weight-bar
// geometry and the direction/label mapping stay tested.

/** Direction glyph paired ALWAYS with a text word (never color/glyph-only). */
export const factorGlyph: Record<FactorDirection, string> = {
  up: '↑',
  down: '↓',
  neutral: '→',
};

/** i18n key for a factor direction's plain-language word. */
export function factorDirectionKey(d: FactorDirection): 'factor.dir.up' | 'factor.dir.down' | 'factor.dir.neutral' {
  return d === 'up' ? 'factor.dir.up' : d === 'down' ? 'factor.dir.down' : 'factor.dir.neutral';
}

/** i18n key for a factor's farmer-language label (`factor.codes.<code>`). */
export function factorLabelKey(code: string): string {
  return `factor.codes.${code}`;
}

/**
 * i18n key for a factor's full causal sentence (cause -> everyday consequence ->
 * direction): `factor.sentence.<code>.<up|down>`.
 * `neutral` collapses to one generic key (`factor.sentenceNeutral`, interpolating the
 * factor label) because "this barely mattered" reads the same whatever the factor is.
 */
export function factorSentenceKey(code: string, direction: FactorDirection): string {
  return direction === 'neutral' ? 'factor.sentenceNeutral' : `factor.sentence.${code}.${direction}`;
}

/** How much a factor moved the number, in WORDS (the bar is only supplementary). */
export type FactorStrength = 'strong' | 'medium' | 'small';

/**
 * Cut-offs for the strength WORD, as a share of the DISPLAYED total. The API sends each
 * factor's share of total attribution and the panel shows the top 4, so shares are
 * re-normalised over what is actually on screen: an even 4-way split is 25% each, so 40%+
 * is the dominant driver and under 20% is a bit-part. Deliberately coarse.
 */
export const FACTOR_STRENGTH_STRONG = 0.4;
export const FACTOR_STRENGTH_MEDIUM = 0.2;

/** Sum of the positive weights actually DISPLAYED — the strength denominator. */
export function totalFactorWeight(factors: ForecastFactor[]): number {
  return factors.reduce((s, f) => (typeof f.weight === 'number' && f.weight > 0 ? s + f.weight : s), 0);
}

/**
 * Strength word for one factor as a share of the displayed total. Returns null when there
 * is no honest basis for a word (weight missing or zero, or no positive total).
 */
export function factorStrength(
  weight: number | undefined | null,
  totalWeight: number,
): FactorStrength | null {
  if (typeof weight !== 'number' || !(weight > 0) || !(totalWeight > 0)) return null;
  const share = weight / totalWeight;
  if (share >= FACTOR_STRENGTH_STRONG) return 'strong';
  if (share >= FACTOR_STRENGTH_MEDIUM) return 'medium';
  return 'small';
}

/** i18n key for a strength word (`factor.strength.<strong|medium|small>`). */
export function factorStrengthKey(s: FactorStrength): string {
  return `factor.strength.${s}`;
}

/** Largest positive weight in the set (0 if none) — the shared-scale reference. */
export function maxFactorWeight(factors: ForecastFactor[]): number {
  return factors.reduce((m, f) => (typeof f.weight === 'number' && f.weight > m ? f.weight : m), 0);
}

/**
 * Weight bar length (0–100%) on the panel's shared scale. Returns null when there is
 * nothing honest to draw, so the row omits the bar instead of showing a misleading one.
 */
export function factorWeightPct(weight: number | undefined | null, maxWeight: number): number | null {
  if (typeof weight !== 'number' || !(weight > 0) || !(maxWeight > 0)) return null;
  return Math.min(100, Math.max(0, (weight / maxWeight) * 100));
}
