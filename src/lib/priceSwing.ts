// Price swing — "how much does this crop's price move?", derived CLIENT-SIDE from the
// observed price history of the market whose price we are actually showing (PRD §5.4,
// decision (a)). It is a description of the displayed series, nothing more.
//
// HONESTY RULES baked in here, not in the component:
//  - It is NOT the model's volatility and NOT `intervalWidthPct` (that is prediction
//    interval width — a different quantity that must never be relabelled as market
//    volatility). Nothing on the server produces this number; it is ours and it is
//    computed from published prices only.
//  - Thin data returns NULL, and null renders NOTHING. Calling three noisy days "steady"
//    would be a fabricated reassurance; saying nothing is the honest answer.
//  - Levels ship as glyph + word in neutral colours. Never red: red is reserved app-wide
//    for the "Not recommended" verdict, and a swinging price is not a bad crop.
import type { PriceHistoryPoint } from '../api/types';

export type PriceSwingLevel = 'steady' | 'moderate' | 'big';

/** Minimum observations before we will make ANY claim. Mirrors the server-side
 *  VOL_MIN_OBS=8 reserved for the optional Phase-2 `volatility30d`, so the two metrics
 *  agree about what "too thin to speak" means even though they measure different series. */
export const SWING_MIN_OBS = 8;

/** Coefficient-of-variation cut points (sample sd / mean, unitless so crops at Rs 30 and
 *  Rs 500 are comparable). Sri Lankan wholesale vegetable series typically sit around
 *  10–15% CV over a 90-day window; below ~8% a farmer sees a price that barely moves, and
 *  above ~20% the week-to-week difference is large enough to change a selling decision. */
export const SWING_MODERATE_CV = 0.08;
export const SWING_BIG_CV = 0.2;

export interface PriceSwing {
  level: PriceSwingLevel;
  /** Coefficient of variation of the daily midpoint. Kept for the a11y sentence/tests. */
  cv: number;
  /** How many daily observations the claim rests on — shown so the basis is visible. */
  observations: number;
}

/**
 * Classify a crop's price swing from its observed daily history, or NULL when the history
 * is too thin (< SWING_MIN_OBS days) or the mean is non-positive to divide by.
 * Uses the daily midpoint of the published low–high, and the SAMPLE standard deviation
 * (ddof = 1) — with a handful of days the population sd would understate the spread.
 */
export function classifyPriceSwing(history: PriceHistoryPoint[] | null | undefined): PriceSwing | null {
  if (!history || history.length < SWING_MIN_OBS) return null;
  const mids = history.map((h) => (h.minPrice + h.maxPrice) / 2);
  const n = mids.length;
  const mean = mids.reduce((a, b) => a + b, 0) / n;
  if (!(mean > 0)) return null; // a zero/negative mean cannot carry a ratio
  const variance = mids.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  const cv = Math.sqrt(variance) / mean;
  const level: PriceSwingLevel =
    cv < SWING_MODERATE_CV ? 'steady' : cv < SWING_BIG_CV ? 'moderate' : 'big';
  return { level, cv, observations: n };
}

/** Level glyph — a 1/2/3-block intensity meter. ALWAYS paired with the word by the
 *  component; the glyph alone never carries the meaning. Plain geometric blocks, chosen
 *  because they render on low-end Android fonts where arrows/waves often do not. */
export const swingGlyph: Record<PriceSwingLevel, string> = {
  steady: '▪',
  moderate: '▪▪',
  big: '▪▪▪',
};

/** i18n key for a level's plain-language word (portfolio.swing.* namespace). */
export function swingLabelKey(
  level: PriceSwingLevel,
): 'portfolio.swing.steady' | 'portfolio.swing.moderate' | 'portfolio.swing.big' {
  return `portfolio.swing.${level}` as
    | 'portfolio.swing.steady'
    | 'portfolio.swing.moderate'
    | 'portfolio.swing.big';
}
