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
  MarketType,
  PolicyDirection,
  PolicyType,
  RecommendationLevel,
  type ConfidenceString,
  type PolicyStatus,
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

/**
 * Clamp a remembered "YYYY-MM-DD" planting date into the allowed window. Returns
 * the date when it is a valid ISO day AND within [min,max]; otherwise falls back
 * to `fallback` (today). Keeps a restored plant date honest — a stale value can
 * never leak an out-of-range date into the picker. (ISO YYYY-MM-DD strings sort
 * lexicographically, so string comparison is a correct range check.)
 */
export function clampPlantDateToRange(
  date: string,
  fallback: string,
  min: string,
  max: string,
): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fallback;
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return fallback;
  if (date < min || date > max) return fallback;
  return date;
}

// ===========================================================================
// ADMIN CONSOLE mappers (ADM-2 / ADM-3). Int enum -> i18n label key, following the
// existing confidence/verdict mapper pattern. UNKNOWN ints degrade to a muted raw
// label ("#<n>") and NEVER crash — a future backend enum value must not blank the
// admin table. `labelKey === null` signals the caller to render `fallback` muted.
// ===========================================================================

/** An enum display: i18n key when the int is known, else a muted raw fallback. */
export interface EnumLabel {
  /** i18n key when the wire int is a known enum member; null when unknown. */
  labelKey: string | null;
  /** Raw label to show (muted) when labelKey is null. */
  fallback: string;
}

const POLICY_TYPE_KEYS: Record<number, string> = {
  [PolicyType.Subsidy]: 'admin.policy.type.subsidy',
  [PolicyType.ImportBan]: 'admin.policy.type.importBan',
  [PolicyType.ExportBan]: 'admin.policy.type.exportBan',
  [PolicyType.PriceCeiling]: 'admin.policy.type.priceCeiling',
  [PolicyType.PriceFloor]: 'admin.policy.type.priceFloor',
  [PolicyType.FertiliserSubsidy]: 'admin.policy.type.fertiliserSubsidy',
  [PolicyType.FuelPriceChange]: 'admin.policy.type.fuelPriceChange',
  [PolicyType.Other]: 'admin.policy.type.other',
  [PolicyType.Budget]: 'admin.policy.type.budget',
};

/** PolicyType int -> label. Unknown int -> muted "#<n>" (never crash). */
export function mapPolicyType(type: number): EnumLabel {
  const labelKey = POLICY_TYPE_KEYS[type] ?? null;
  return { labelKey, fallback: `#${type}` };
}

/** Direction display: glyph + word, never colour-ONLY. Toned badges (owner request
 *  2026-07-12): bullish=green (--good), bearish=amber (--warn). RED stays reserved
 *  for the farmer "Not recommended" verdict, and green/amber survives red-green CVD. */
export interface DirectionLabel extends EnumLabel {
  /** Text glyph paired with the word (▲ Bullish / ▼ Bearish / – Neutral). */
  glyph: string;
  /** Badge tone -> .is-<tone> CSS modifier; null (unknown int) keeps neutral styling. */
  tone: 'bullish' | 'bearish' | 'neutral' | null;
}

/** PolicyDirection int -> glyph + label + tone. Handles the -1 (Bearish); unknown -> "•". */
export function mapPolicyDirection(direction: number): DirectionLabel {
  switch (direction) {
    case PolicyDirection.Bullish:
      return { labelKey: 'admin.policy.dir.bullish', glyph: '▲', fallback: '#1', tone: 'bullish' };
    case PolicyDirection.Bearish:
      return { labelKey: 'admin.policy.dir.bearish', glyph: '▼', fallback: '#-1', tone: 'bearish' };
    case PolicyDirection.Neutral:
      return { labelKey: 'admin.policy.dir.neutral', glyph: '–', fallback: '#0', tone: 'neutral' };
    default:
      return { labelKey: null, glyph: '•', fallback: `#${direction}`, tone: null };
  }
}

const MARKET_TYPE_KEYS: Record<number, string> = {
  [MarketType.Wholesale]: 'admin.markets.type.wholesale',
  [MarketType.Retail]: 'admin.markets.type.retail',
  [MarketType.DEC]: 'admin.markets.type.dec',
  [MarketType.NationalAggregate]: 'admin.markets.type.nationalAggregate',
};

/** MarketType int -> label. Unknown int -> muted "#<n>" (never crash). */
export function mapMarketType(type: number): EnumLabel {
  const labelKey = MARKET_TYPE_KEYS[type] ?? null;
  return { labelKey, fallback: `#${type}` };
}

/**
 * Derive a policy flag's lifecycle status from its effective window, client-side:
 *   Active    — effectiveFrom <= today <= (effectiveTo or open-ended)
 *   Scheduled — effectiveFrom > today (not started yet)
 *   Expired   — effectiveTo < today (window closed)
 * Compares calendar dates (YYYY-MM-DD) so a datetime's clock time never flips the
 * status; ISO date strings sort lexicographically, so string comparison is correct.
 */
export function derivePolicyStatus(
  effectiveFrom: string,
  effectiveTo: string | null,
  today: Date = new Date(),
): PolicyStatus {
  const todayYmd = ymdLocal(today);
  const fromYmd = (effectiveFrom ?? '').slice(0, 10);
  const toYmd = effectiveTo ? effectiveTo.slice(0, 10) : null;
  if (fromYmd && fromYmd > todayYmd) return 'scheduled';
  if (toYmd && toYmd < todayYmd) return 'expired';
  return 'active';
}

/**
 * "YYYY-MM-DD" from the user's LOCAL calendar date. Never use
 * toISOString().slice(0,10) for calendar dates: it converts to UTC first,
 * which is yesterday until 05:30 AM in Sri Lanka (UTC+5:30).
 */
export function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
