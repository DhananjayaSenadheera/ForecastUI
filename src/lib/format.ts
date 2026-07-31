// Formatting + contract mapping. The load-bearing logic (confidence mapping, price and
// date formatting) lives here and is unit-tested; components just call it.
// The "Low"/"Medium"/"High" API strings are FROZEN: never remap the string, only pick a
// translated display label and a tone. Low confidence is caution (amber), never dressed up
// as precise.
import {
  ForecastConfidenceCode,
  MarketType,
  PolicyDirection,
  PolicyType,
  RecommendationLevel,
  type ConfidenceString,
  type IngestionRunStatus,
  type PolicyStatus,
  type VerificationCheck,
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

// Numbers / currency / dates — locale-aware via Intl, no library. LKR shows as "Rs." and
// prices carry no decimals: the number is the hero.
const localeFor: Record<string, string> = { si: 'si-LK', ta: 'ta-LK', en: 'en-LK' };

function resolveLocale(lang: string): string {
  return localeFor[lang] ?? 'en-LK';
}

/** Whole-rupee price. rsLabel comes from i18n (t('common.rs')) so it translates.
 *  `digits` > 0 keeps the exact decimals instead of rounding — used only where the
 *  rounding itself would be dishonest (the admin accuracy tab reports the error of the
 *  very number it prints, so a rounded Rs. 28 for a served 27.50 would misstate it). */
export function formatPrice(value: number, lang: string, rsLabel = 'Rs.', digits = 0): string {
  const n = new Intl.NumberFormat(resolveLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(digits === 0 ? Math.round(value) : value);
  return `${rsLabel} ${n}`;
}

/** A P10–P90 band as a labelled range — never a bare single number. */
export function formatRange(
  low: number,
  high: number,
  lang: string,
  rsLabel = 'Rs.',
  digits = 0,
): string {
  const nf = new Intl.NumberFormat(resolveLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const round = (v: number) => (digits === 0 ? Math.round(v) : v);
  return `${rsLabel} ${nf.format(round(low))} – ${nf.format(round(high))}`;
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

/** Locale-aware date + TIME for a Z-suffixed ISO datetime (ingestion timestamps).
 *  Renders in the user's locale/zone; safe on bad input (echoes the raw string). */
export function formatDateTime(value: string, lang: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(resolveLocale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Clamp a remembered "YYYY-MM-DD" planting date into the allowed window: the date when it
 * is a valid ISO day within [min,max], otherwise `fallback` (today). ISO date strings sort
 * lexicographically, so string comparison is a correct range check.
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

// Admin enum mappers: int -> i18n label key, the same idiom as the confidence mapper. An
// UNKNOWN int degrades to a muted raw label ("#<n>") and never crashes the table;
// labelKey === null tells the caller to render `fallback` muted.

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

/** Direction display: glyph + word, never colour alone. Bullish is green, bearish amber;
 *  red stays reserved for the farmer "Not recommended" verdict, and green/amber survives
 *  red-green colour blindness. */
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
 * Derive a policy flag's lifecycle status from its effective window:
 *   Active    — effectiveFrom <= today <= (effectiveTo or open-ended)
 *   Scheduled — effectiveFrom > today
 *   Expired   — effectiveTo < today
 * Compares calendar dates, so a datetime's clock time never flips the status.
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

// Ingestion-run mappers: wire value -> { tone (CSS modifier), i18n labelKey }. A text label
// is always shown alongside the tone — never colour only — and unknown wire values degrade
// to a neutral tone rather than crashing the table.

/** Ingestion run status -> badge tone + label. Also accepts the status snapshot's last-run
 *  "partial" rollup, so the run rows and the last-run badge share one mapper. */
export function mapRunStatus(status: IngestionRunStatus | 'partial' | string): {
  tone: 'succeeded' | 'running' | 'failed' | 'skipped' | 'partial' | 'unknown';
  labelKey: string;
} {
  switch (status) {
    case 'succeeded':
      return { tone: 'succeeded', labelKey: 'admin.ingestion.runStatus.succeeded' };
    case 'running':
      return { tone: 'running', labelKey: 'admin.ingestion.runStatus.running' };
    case 'failed':
      return { tone: 'failed', labelKey: 'admin.ingestion.runStatus.failed' };
    case 'skipped':
      return { tone: 'skipped', labelKey: 'admin.ingestion.runStatus.skipped' };
    case 'partial':
      return { tone: 'partial', labelKey: 'admin.ingestion.runStatus.partial' };
    default:
      return { tone: 'unknown', labelKey: 'admin.ingestion.runStatus.unknown' };
  }
}

/** Verification verdict (frozen Pass/Warn/Fail spelling) -> tone + label. RED is
 *  reserved app-wide for a hard failure — a Fail verdict earns it here honestly. */
export function mapVerificationVerdict(v: string): {
  tone: 'pass' | 'warn' | 'fail' | 'unknown';
  labelKey: string;
} {
  switch (v) {
    case 'Pass':
      return { tone: 'pass', labelKey: 'admin.ingestion.verdict.pass' };
    case 'Warn':
      return { tone: 'warn', labelKey: 'admin.ingestion.verdict.warn' };
    case 'Fail':
      return { tone: 'fail', labelKey: 'admin.ingestion.verdict.fail' };
    default:
      return { tone: 'unknown', labelKey: 'admin.ingestion.verdict.unknown' };
  }
}

// Logs-hub mappers (model training + user activity), same idiom: wire value -> tone + i18n
// labelKey, with the text label always shown. Unknown values degrade, never crash.

/** Model-training MAE -> a 2-decimal locale-aware string (null when the metric is absent).
 *  MAE is a raw metric, not currency: no Rs. prefix, no rounding, and never colour-coded. */
export function formatMae(value: number | null | undefined, lang: string): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(lang), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Promotion-gate outcome (decisionPromoted) -> tone + label. This is the GATE's
 *  verdict at train time — independent of whether the row is currently LIVE. */
export function mapGateOutcome(decisionPromoted: boolean): {
  tone: 'promoted' | 'declined';
  labelKey: string;
} {
  return decisionPromoted
    ? { tone: 'promoted', labelKey: 'admin.logs.training.gate.promoted' }
    : { tone: 'declined', labelKey: 'admin.logs.training.gate.declined' };
}

const USER_ACTIVITY_KEYS: Record<string, string> = {
  loginSucceeded: 'admin.logs.userActivity.event.loginSucceeded',
  loginFailed: 'admin.logs.userActivity.event.loginFailed',
  userRegistered: 'admin.logs.userActivity.event.userRegistered',
  roleChanged: 'admin.logs.userActivity.event.roleChanged',
  userDeleted: 'admin.logs.userActivity.event.userDeleted',
  // Content changes (admin edits to reference data) — all neutral in tone: an edit is
  // neither good news nor a warning, it is a record of who changed what.
  policyFlagChanged: 'admin.logs.userActivity.event.policyFlagChanged',
  festivalChanged: 'admin.logs.userActivity.event.festivalChanged',
  newsEventChanged: 'admin.logs.userActivity.event.newsEventChanged',
  cropChanged: 'admin.logs.userActivity.event.cropChanged',
  marketChanged: 'admin.logs.userActivity.event.marketChanged',
  // Pipeline actions (an admin driving the ingestion service by hand) — neutral too:
  // starting a pass is a recorded action, not a success or a warning.
  ingestionServiceStarted: 'admin.logs.userActivity.event.ingestionServiceStarted',
  ingestionServiceStopRequested: 'admin.logs.userActivity.event.ingestionServiceStopRequested',
  // Farmer actions — the farmer's own record, changed by the farmer. Neutral: a planting
  // date removed because the crop was harvested is not good news or bad news, it is what
  // happened, and the reason the farmer gave rides along in the Details column.
  plantedDateRemoved: 'admin.logs.userActivity.event.plantedDateRemoved',
  // The sales log (Phase 2). Neutral for the same reason: a farmer recording what they got
  // for their crop is a record of what happened, not a success or a warning to an admin.
  saleRecorded: 'admin.logs.userActivity.event.saleRecorded',
  saleUpdated: 'admin.logs.userActivity.event.saleUpdated',
  saleDeleted: 'admin.logs.userActivity.event.saleDeleted',
};

/** User-activity event type -> label + badge tone. loginFailed is amber (a failed,
 *  unverified attempt), userRegistered green, the rest neutral — including the farmer-
 *  authored ones, which are records of what a farmer did with their own crops and are
 *  neither a success nor a warning to an admin reading the log. Unknown wire strings
 *  degrade to a muted raw fallback (labelKey null). */
export function mapUserActivityEvent(type: string): {
  labelKey: string | null;
  fallback: string;
  tone: 'good' | 'warn' | 'neutral';
} {
  const labelKey = USER_ACTIVITY_KEYS[type] ?? null;
  const tone = type === 'loginFailed' ? 'warn' : type === 'userRegistered' ? 'good' : 'neutral';
  return { labelKey, fallback: type, tone };
}

/** Truncate a GUID for display (first `head` chars + ellipsis); full value belongs in
 *  a title attribute. Short/empty ids pass through unchanged. null -> '' (caller shows
 *  a muted "system" placeholder). */
export function truncateId(id: string | null | undefined, head = 8): string {
  if (!id) return '';
  return id.length > head ? `${id.slice(0, head)}…` : id;
}

/** Split a fully-qualified .NET exception type ("System.InvalidOperationException")
 *  into its de-emphasised namespace prefix ("System.") + the class name the reader
 *  actually scans ("InvalidOperationException"). A type with no dot (or empty) has no
 *  namespace — the whole string is the name. The full value belongs in a title attr. */
export function splitExceptionType(type: string): { namespace: string; name: string } {
  const i = (type ?? '').lastIndexOf('.');
  if (i < 0) return { namespace: '', name: type ?? '' };
  return { namespace: type.slice(0, i + 1), name: type.slice(i + 1) };
}

// Forecast-accuracy formatters (admin accuracy tab). The wire carries THREE units on one
// response and printing one as another misreports accuracy outright, so each gets its own
// function:
//   PERCENT NUMBERS  mape / medianApe / percentageError  (12.34 = 12.34%)
//   RUPEES PER KILO  signedBias                          (-12.58 = Rs 12.58/kg too high)
//   FRACTION RATES   intervalCoverage / directionalAccuracy (0.7500 = 75%)
// Every one returns null for a null/absent metric — the caller renders a no-data marker.
// A metric that is not computable yet is NEVER printed as 0.

/** Percent NUMBER -> locale percent string ("12.34%"). */
export function formatPercentNumber(
  value: number | null | undefined,
  lang: string,
  digits = 2,
): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(lang), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

/** Signed percent NUMBER -> locale percent string with an explicit sign ("+3.21%").
 *  Used for a row's percentageError, where the DIRECTION is the point: positive means
 *  the forecast came in above the actual price. NOT for signedBias, which is money —
 *  see formatSignedPrice. */
export function formatSignedPercentNumber(
  value: number | null | undefined,
  lang: string,
  digits = 2,
): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(lang), {
    style: 'percent',
    signDisplay: 'exceptZero',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

/** A signed MONEY amount with the sign in front of the currency ("-Rs. 12.58"), for
 *  signedBias — the mean of (predicted − actual) in RUPEES PER KILO, not a percentage.
 *  The sign carries the whole meaning (above zero = forecasts ran high), so it is always
 *  shown except on an exact zero. Decimals are kept: this is an error figure, and
 *  rounding an error away is how a Rs 0.49/kg bias becomes "Rs 0". */
export function formatSignedPrice(
  value: number | null | undefined,
  lang: string,
  rsLabel = 'Rs.',
  digits = 2,
): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const n = new Intl.NumberFormat(resolveLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  return `${sign}${rsLabel} ${n}`;
}

/** FRACTION rate -> locale percent string (0.75 -> "75.0%"). */
export function formatRatePercent(
  value: number | null | undefined,
  lang: string,
  digits = 1,
): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(lang), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** A coverage GAP fraction -> its size in percentage points, unsigned (-0.05 -> "5.0").
 *  The direction is carried by a WORD ("below"/"above" nominal), never by the sign
 *  alone, so the sentence still reads correctly out loud. */
export function formatPointsAbs(
  value: number | null | undefined,
  lang: string,
  digits = 1,
): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value) * 100);
}

/**
 * How many decimals a figure the FARMER recorded is printed with: none when it is whole
 * (60 kg, not 60.00 kg), two otherwise (215.50, never 216).
 *
 * THE ONLY definition of that rule. It is exported because the price on a sale row goes
 * through formatPrice (which owns the "Rs." label and its spacing) while the quantity goes
 * through formatExactAmount below — two call sites, one rule, so they can never disagree
 * about what precision a recorded number is shown at.
 */
export function exactDigits(value: number): 0 | 2 {
  return Number.isInteger(value) ? 0 : 2;
}

/**
 * A number the FARMER themselves recorded, printed exactly (see exactDigits).
 *
 * Deliberately not formatPrice's default rounding. That rounding is right for a forecast —
 * nobody gains from "Rs. 214.83 at harvest" — but rounding a figure the farmer typed into
 * their own book misstates what they told us, which is the one thing their own records may
 * never do. Locale-aware, like every other number in the app.
 */
export function formatExactAmount(value: number, lang: string): string {
  const digits = exactDigits(value);
  return new Intl.NumberFormat(resolveLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Plain integer count (null -> null, so the caller shows a no-data marker). */
export function formatCount(value: number | null | undefined, lang: string): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(lang), { maximumFractionDigits: 0 }).format(value);
}

// Model versions are strings ("v17"), and the backend deliberately leaves their ORDER to
// the UI. Plain string order is wrong for them: "v9" > "v17" lexically, which would put
// a year-old model above the current one in both the filter and the breakdown table.
const versionCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Newest model version first, comparing embedded numbers numerically (v17 before v9).
 *  A row with no recorded version sorts last — it is the oldest thing there is. */
export function compareModelVersionsDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return versionCollator.compare(b, a);
}

/** Is this predictor a MODEL prediction or a FALLBACK? The two are never blended
 *  (PRD §3.4), so the split has to be visible on the surface as well as in the data.
 *  Anything whose name carries "fallback" is a fallback; every other predictor is
 *  treated as a model, which keeps a predictor this build has never heard of honest
 *  (it shows under its own verbatim name either way). */
export function predictorKind(activePredictor: string): 'model' | 'fallback' {
  return (activePredictor ?? '').toLowerCase().includes('fallback') ? 'fallback' : 'model';
}

/** Snapshot maturity state -> glyph + label + badge tone. Glyph AND word always ship
 *  together (colour is never the sole signal), and no state is red: `actual_unavailable`
 *  and `not_maturable` are neutral facts about the data, not errors. Unknown wire values
 *  degrade to the raw string in a neutral badge. */
export function mapMaturityState(state: string): {
  labelKey: string | null;
  fallback: string;
  glyph: string;
  tone: 'good' | 'neutral' | 'skipped' | 'unknown';
} {
  switch (state) {
    case 'matured':
      return {
        labelKey: 'admin.forecastAccuracy.state.matured',
        fallback: state,
        glyph: '✓',
        tone: 'good',
      };
    case 'pending':
      return {
        labelKey: 'admin.forecastAccuracy.state.pending',
        fallback: state,
        glyph: '…',
        tone: 'neutral',
      };
    case 'actual_unavailable':
      return {
        labelKey: 'admin.forecastAccuracy.state.actualUnavailable',
        fallback: state,
        glyph: '?',
        tone: 'skipped',
      };
    case 'not_maturable':
      return {
        labelKey: 'admin.forecastAccuracy.state.notMaturable',
        fallback: state,
        glyph: '–',
        tone: 'skipped',
      };
    default:
      return { labelKey: null, fallback: state, glyph: '•', tone: 'unknown' };
  }
}

/** Individual check severity (PASS/WARN/FAIL inside checksJson) -> tone + label. */
export function mapCheckSeverity(sev: string): {
  tone: 'pass' | 'warn' | 'fail' | 'unknown';
  labelKey: string;
} {
  switch (sev.toUpperCase()) {
    case 'PASS':
      return { tone: 'pass', labelKey: 'admin.ingestion.verdict.pass' };
    case 'WARN':
      return { tone: 'warn', labelKey: 'admin.ingestion.verdict.warn' };
    case 'FAIL':
      return { tone: 'fail', labelKey: 'admin.ingestion.verdict.fail' };
    default:
      return { tone: 'unknown', labelKey: 'admin.ingestion.verdict.unknown' };
  }
}

/**
 * Parse a run's `checksJson` STRING into VerificationCheck[]. Returns null on ANY failure —
 * invalid JSON, a non-array, or a non-object element — so the caller renders a plain
 * "checks unavailable" note instead of crashing. Malformed rows are coerced to safe
 * defaults, keeping one bad check from hiding the rest.
 */
export function parseVerificationChecks(checksJson: string | null | undefined): VerificationCheck[] | null {
  if (!checksJson) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(checksJson);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  return raw.map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return {
      name: typeof o.name === 'string' ? o.name : '',
      severity: typeof o.severity === 'string' ? o.severity : '',
      message: typeof o.message === 'string' ? o.message : '',
      counts: o.counts && typeof o.counts === 'object' ? (o.counts as Record<string, unknown>) : undefined,
    };
  });
}
