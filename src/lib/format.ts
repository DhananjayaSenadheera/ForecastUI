// =============================================================================
// Formatting + contract mapping (FE-2). This is where the load-bearing logic
// lives (confidence mapping, price/date formatting) — covered by unit tests.
// Presentation components stay dumb and call these.
//
// HONEST-UNCERTAINTY RULE: the "Low"/"Medium"/"High" API strings are FROZEN.
// We NEVER remap the string — only choose a translated DISPLAY label + a semantic
// tone. Low confidence is caution (amber), never dressed up as precise.
// =============================================================================
import {
  ForecastConfidenceCode,
  RecommendationLevel,
  type ConfidenceString,
} from '../api/types';

/** Display buckets. Tone drives icon+color pairing (color is never sole signal). */
export type ConfidenceDisplay = {
  /** i18n key under "confidence.*" */
  labelKey: 'confidence.good' | 'confidence.fair' | 'confidence.low';
  tone: 'good' | 'fair' | 'low';
  /** filled pictograph dots out of 4 (Good=3, Fair=2, Low=1) */
  dots: 1 | 2 | 3;
};

/** Harvest forecast confidence: frozen string -> display. Never remap the string. */
export function mapConfidenceString(c: ConfidenceString): ConfidenceDisplay {
  switch (c) {
    case 'High':
      return { labelKey: 'confidence.good', tone: 'good', dots: 3 };
    case 'Medium':
      return { labelKey: 'confidence.fair', tone: 'fair', dots: 2 };
    case 'Low':
      return { labelKey: 'confidence.low', tone: 'low', dots: 1 };
  }
}

/** BestCrop confidence arrives as the integer ForecastConfidence enum, not a string. */
export function mapConfidenceCode(code: ForecastConfidenceCode): ConfidenceDisplay {
  switch (code) {
    case ForecastConfidenceCode.High:
      return { labelKey: 'confidence.good', tone: 'good', dots: 3 };
    case ForecastConfidenceCode.Medium:
      return { labelKey: 'confidence.fair', tone: 'fair', dots: 2 };
    case ForecastConfidenceCode.Low:
    default:
      return { labelKey: 'confidence.low', tone: 'low', dots: 1 };
  }
}

export type VerdictDisplay = {
  labelKey:
    | 'verdict.recommended'
    | 'verdict.possible'
    | 'verdict.littleData'
    | 'verdict.notRecommended';
  /** FE-1 mapping: amber for little-data caution, RED reserved for Not recommended. */
  tone: 'good' | 'neutral' | 'warn' | 'critical';
};

export function mapVerdict(level: RecommendationLevel): VerdictDisplay {
  switch (level) {
    case RecommendationLevel.StronglyRecommended:
    case RecommendationLevel.Recommended:
      return { labelKey: 'verdict.recommended', tone: 'good' };
    case RecommendationLevel.RecommendedWithRisk:
      return { labelKey: 'verdict.littleData', tone: 'warn' };
    case RecommendationLevel.NotRecommended:
    default:
      return { labelKey: 'verdict.notRecommended', tone: 'critical' };
  }
}

// ---------------------------------------------------------------------------
// Numbers / currency / dates — locale-aware (Intl, no library).
// LKR shown as "Rs." per design samples; farmers read the plain numeral (PRD:
// non-literate users are numerate — the number is the hero, so no decimals on kg).
// ---------------------------------------------------------------------------
const localeFor: Record<string, string> = { si: 'si-LK', ta: 'ta-LK', en: 'en-LK' };

function resolveLocale(lang: string): string {
  return localeFor[lang] ?? 'en-LK';
}

/** Whole-rupee price. rsLabel comes from i18n (t('common.rs')) so it translates. */
export function formatPrice(value: number, lang: string, rsLabel = 'Rs.'): string {
  const n = new Intl.NumberFormat(resolveLocale(lang), {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
  return `${rsLabel} ${n}`;
}

/** A P10–P90 band as a labelled range — never a bare single number. */
export function formatRange(low: number, high: number, lang: string, rsLabel = 'Rs.'): string {
  const nf = new Intl.NumberFormat(resolveLocale(lang), { maximumFractionDigits: 0 });
  return `${rsLabel} ${nf.format(Math.round(low))} – ${nf.format(Math.round(high))}`;
}

/** Locale-aware date. Accepts "YYYY-MM-DD" or Date; safe on bad input. */
export function formatDate(value: string | Date, lang: string): string {
  const d = typeof value === 'string' ? new Date(value + 'T00:00:00') : value;
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '';
  return new Intl.DateTimeFormat(resolveLocale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
