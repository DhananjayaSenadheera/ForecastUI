// Typed API contract for the .NET API.
// SERIALIZATION (load-bearing): the API registers no JsonStringEnumConverter, so C#
// enums arrive as INTEGERS while string properties pass through as-is:
//   HarvestForecast.confidence          -> STRING "Low" | "Medium" | "High" (frozen)
//   HarvestForecast.recommendationLevel -> NUMBER 0..3
//   BestCrop.confidence / trend / recommendationLevel -> NUMBERS
// The Low/Medium/High strings are FROZEN — never remap them, only translate the display
// label.

/** Frozen confidence contract strings (harvest forecast passes these through). */
export type ConfidenceString = 'Low' | 'Medium' | 'High';

/** RecommendationLevel enum (Domain.Enums.RecommendationLevel) — integer wire value. */
export enum RecommendationLevel {
  NotRecommended = 0,
  RecommendedWithRisk = 1,
  Recommended = 2,
  StronglyRecommended = 3,
}

/** PriceTrend enum (Domain.Enums.PriceTrend) — integer wire value. */
export enum PriceTrend {
  Down = 0,
  Stable = 1,
  Up = 2,
}

/** ForecastConfidence enum (Domain.Enums.ForecastConfidence) — integer wire value. */
export enum ForecastConfidenceCode {
  Low = 0,
  Medium = 1,
  High = 2,
}

// Crops — GET /api/crops/get/all, GET /api/crops/get/{id}.
// cropCode / category / agronomy / localized names are OPTIONAL: live payloads may omit
// them, so the picker degrades (no category -> one "All crops" group; no localized name
// -> the English name is shown and searched).

/** Crop category ref (CropCategories table). code = VEG | FRT | VEG-UP | VEG-LOW. */
export interface CropCategoryRef {
  code: string;
  name: string; // English name from the API; UI localizes by code where possible
}

export interface Crop {
  id: string; // Guid
  name: string;
  externalProductId: number | null;
  source: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string;
  // Optional below: present in fixtures, may be absent on a live payload.
  cropCode?: string | null; // VEG######/FRT###### — display only
  category?: CropCategoryRef | null; // grouping; absent -> single group
  growthDays?: number | null; // typical growth period (agronomy profile)
  nameSi?: string | null; // localized display name (Sinhala)
  nameTa?: string | null; // localized display name (Tamil)
}

// POST /api/crops/create — the body wraps the dto: { createDto: {...} }. Category is
// mandatory and codes are VEG######/FRT######.
export interface CropCreateDto {
  name: string;
  externalProductId?: number | null;
  source?: string | null;
  cropCategoryId: string; // Guid — REQUIRED, must exist in CropCategories
}
export interface CropCreateCommand {
  createDto: CropCreateDto;
}

// Structured "why this forecast?" factor. `topFactors` is an OPTIONAL array of stable
// reason CODES so the UI can map each to a farmer-language i18n string (codes translate,
// English prose does not). When it is absent or empty (the fallback predictor) the panel
// degrades to the free-text explanation plus an honest "no detailed breakdown yet" note
// — never fabricated factors.
export type FactorDirection = 'up' | 'down' | 'neutral';

export interface ForecastFactor {
  /** Stable reason code; UI maps to `factor.codes.<code>` i18n label. */
  code: string;
  /** Which way this factor pushes the price. Rendered as glyph + word. */
  direction: FactorDirection;
  /** Optional relative magnitude (positive); shared-scale bar within the panel. */
  weight?: number;
}

// Harvest forecast — GET /api/forecast/crop/{cropId}/harvest?plantDate=YYYY-MM-DD.
export interface HarvestForecast {
  cropId: string;
  cropName: string | null;
  plantDate: string; // "YYYY-MM-DD"
  harvestDate: string | null; // "YYYY-MM-DD"
  growthPeriodDays: number | null;
  currentPrice: number;
  predictedPrice: number; // central estimate (hero numeral)
  lowerBound: number; // P10 band floor
  upperBound: number; // P90 band ceiling
  confidence: ConfidenceString; // FROZEN string — translate label only
  activePredictor: string; // "residual" | "crop_mean_fallback" | ...
  modelVersion: string | null;
  explanation: string; // English prose today (reason codes = API gap #5)
  recommendationLevel: RecommendationLevel; // integer 0..3
  reason: string;
  upsidePct: number;
  intervalWidthPct: number;
  lowTrust: boolean; // true -> show "old data" notice with data age
  // Optional: absent on the live route today, present in fixtures.
  topFactors?: ForecastFactor[] | null; // structured "why this forecast?" breakdown
}

// Timeline — GET /api/forecast/crop/{cropId}/timeline?months=12&asOf=YYYY-MM-DD.
// Feeds the chart; a table alternative is mandatory.
export interface TimelineHistoryPoint {
  month: string; // "YYYY-MM"
  avgPrice: number;
}
export interface TimelineForecastPoint {
  horizonMonths: number;
  date: string; // "YYYY-MM-DD"
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
}
export interface CropTimeline {
  cropName: string | null;
  activePredictor: string; // "residual" | "crop_mean_fallback" | "unavailable"
  confidence: ConfidenceString;
  modelVersion: string | null;
  explanation: string;
  history: TimelineHistoryPoint[];
  forecast: TimelineForecastPoint[];
}

// Best harvest window — GET /api/forecast/crop/{id}/harvest-window. Ranks candidate
// planting dates by the price their harvest is forecast to fetch.
// `rankable` drives the UI: true -> `points` and `best` are populated; false -> `points`
// is empty and `best` is null, and the panel renders the honest "we cannot rank dates for
// this crop yet" state from reasonCode / explanation. NEVER synthesise a window
// client-side to fill the gap.
// The API ranks TIMING ONLY: today's prices and weather are held constant while the
// season/festival encoding varies, so it must not be presented as a weather forecast.

/** Why a window is (or is not) available. Unknown codes must degrade to the
 *  generic not-rankable copy, never crash the panel. */
export type HarvestWindowReason =
  | 'ml_served' // rankable
  | 'no_growth_period'
  | 'no_feature_row'
  | 'model_inactive'
  | 'crop_not_model_served'
  | 'scoring_failed'
  | 'flat_curve'
  | 'unavailable';

export interface HarvestWindowPoint {
  plantDate: string; // "YYYY-MM-DD"
  harvestDate: string; // "YYYY-MM-DD"
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  inBestWindow: boolean;
}

export interface HarvestWindowBest {
  plantStart: string;
  plantEnd: string;
  harvestStart: string;
  harvestEnd: string;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  /** Gain over planting at an AVERAGE date in the swept horizon (not vs the
   *  worst date, not vs today). Can be small; the UI hides it under ~1%. */
  upliftPct: number;
}

export interface HarvestWindow {
  cropId: string;
  cropName: string | null;
  asOf: string; // "YYYY-MM-DD"
  growthPeriodDays: number | null;
  rankable: boolean;
  reasonCode: HarvestWindowReason;
  activePredictor: string; // "model" | "residual" | "unavailable"
  confidence: ConfidenceString;
  modelVersion: string | null;
  explanation: string;
  windowDays: number | null;
  /** Today's average market price for this crop, same basis as
   *  `HarvestForecast.currentPrice` — the anchor the window is judged against.
   *  0 (or absent, on an API build that predates the field) means UNKNOWN: show
   *  the crop alone and skip the below-today comparison. NEVER render "Rs. 0". */
  currentPrice: number;
  points: HarvestWindowPoint[];
  best: HarvestWindowBest | null;
}

// Crop readiness — GET /api/forecast/crop-readiness. Drives the crop-status colouring:
// green for model-served crops, amber for fallback-served ones. `ready` mirrors the
// promoted model's real serving decision and is recomputed by every train run.
// Honesty rules: modelActive=false makes the per-crop split meaningless, so show NO tint
// at all; a crop absent from `crops` while modelActive is a brand-new crop and is treated
// exactly like ready=false; a failed fetch fails soft to no tint.
export interface CropReadinessItem {
  cropId: string; // Guid
  ready: boolean;
  nObs: number | null; // labelled-row count; null = unknown (old payloads)
}
export interface CropReadiness {
  modelVersion: string | null;
  minHistoryObs: number | null;
  modelActive: boolean;
  crops: CropReadinessItem[];
}

// Best crops — GET /api/forecast/best-crops?lookbackMonths=3. Confidence here is an
// INTEGER enum, unlike the harvest route's string.
// The row carries only `averagePrice` — no P10–P90 band — so the comparison renders a
// shared-scale expected-price bar and never a fabricated range.

/**
 * Season-fit (Yala/Maha) — PROVISIONAL. The live best-crops route does not expose this
 * yet; fixtures include it on a couple of crops. When absent the UI degrades SILENTLY
 * (no badge) — a live omission must never break the row.
 */
export interface SeasonFit {
  inSeason: boolean;
  season: string; // e.g. "Yala" | "Maha"
}

export interface BestCrop {
  cropId: string;
  cropName: string;
  cropCode: string; // VEG######/FRT######
  averagePrice: number;
  trend: PriceTrend; // integer 0..2
  confidence: ForecastConfidenceCode; // integer 0..2
  recommendationLevel: RecommendationLevel; // integer 0..3
  seasonFit?: SeasonFit | null; // API-3 (provisional) — absent on the live route today
}

// Market overview — GET /api/forecast/market-overview?days=30. Feeds the landing
// dashboard: KPI tiles, risers/fallers and a latest-prices strip with sparklines.
// asOf is null when the window has no data at all (null + empty arrays = the honest "no
// market data yet" state). windowDays echoes the requested `days`.
// movers arrive as up to 5 risers then up to 5 fallers in SERVER ORDER — never re-sorted
// client-side — and `direction` is a string rendered as glyph + word.
// spark holds up to 14 chronological daily points and may be short or sparse.

/** One riser/faller row. `direction` is the frozen wire string, not a colour. */
export interface MarketMover {
  cropId: string; // Guid — deep-links to /my-harvest?crop=<cropId>
  cropName: string;
  marketName: string;
  latestPrice: number;
  previousPrice: number;
  changePct: number; // signed percent change over the window
  direction: 'up' | 'down';
}

/** A single point in a latest-prices sparkline (observed daily price). */
export interface MarketSparkPoint {
  date: string; // "YYYY-MM-DD"
  price: number;
}

/** Latest observed price for one crop, with a short sparkline of recent days. */
export interface MarketLatestPrice {
  cropId: string; // Guid — deep-links to /my-harvest?crop=<cropId>
  cropName: string;
  marketName: string;
  date: string; // "YYYY-MM-DD" of the latest price
  price: number; // latest observed price (whole rupees)
  minPrice: number; // that day's observed low
  maxPrice: number; // that day's observed high
  spark: MarketSparkPoint[]; // up to 14 chronological points; may be sparse/short
}

export interface MarketOverview {
  asOf: string | null; // newest data date, or null when the window has no data
  windowDays: number;
  marketsWithData: number;
  cropsWithData: number;
  movers: MarketMover[]; // risers then fallers, server order preserved
  latestPrices: MarketLatestPrice[];
}

// AUTH (AuthController, anonymous, rate-limited):
//   POST /api/auth/register  body { "registerDto": { username, email, password } }
//   POST /api/auth/login     body { "loginDto":    { username, password } }
// BODIES ARE WRAPPED — sending the bare dto binds to nothing and validation fails (same
// wrapper as the crops createDto). LOGIN IS BY USERNAME, not email.
// 200 -> AuthResponseDto below. Failures arrive as
// { errors: [ { property: "Auth", message } ] }: 400 on register ("Username is already
// taken." / validation messages), 401 on login ("Invalid username or password." for both
// an unknown user and a bad password — deliberately non-enumerable, shown verbatim).
// Every data route needs a Bearer token; only the auth routes are anonymous.

/** POST /api/auth/{login,register} success body (Application AuthResponseDto). */
export interface AuthResponseDto {
  accessToken: string;
  expiresAtUtc: string; // ISO datetime — JWT expiry (no refresh token issued)
  username: string;
  email: string;
  role: string; // "Farmer" for self-registration
}

// Markets + price history. The wire shapes below match the .NET DTOs exactly, so both
// routes are consumed verbatim with no mapping layer:
//   GET /api/markets/get/all?hasPrices={bool}              -> Market[]
//   GET /api/prices/crop/{cropId}/history?marketId=&days=  -> PriceHistoryPoint[]
export interface Market {
  id: string;
  name: string;
  district: string | null;
  marketType: number; // MarketType enum (integer wire value) — see MarketType below
  isEconomicCenter: boolean;
  // --- Monitoring status (admin Markets registry) ---
  hasStoredData: boolean; // has >=1 stored price observation (any status) — literal storage
  lastStoredDate: string | null; // "YYYY-MM-DD" of the freshest stored row, or null when never
  isTrainingSource: boolean; // feature-safe AND has usable data → currently feeds model training
}
export interface PriceHistoryPoint {
  date: string; // "YYYY-MM-DD"
  minPrice: number;
  maxPrice: number;
}

/** MarketType enum (Domain.Enums.MarketType) — integer wire value, verified against
 *  the .NET seeds 2026-07-12. NO JsonStringEnumConverter, so this arrives as an int. */
export enum MarketType {
  Wholesale = 0,
  Retail = 1,
  DEC = 2, // Dedicated Economic Centre
  NationalAggregate = 3,
}

// ADMIN — policy flags. GET /api/policy-flag/get/all ([Authorize], camelCase).
// Enums arrive as INTEGERS and `direction` is NOT 0-based: Bearish = -1.
// EMPTY-RESULT QUIRK (load-bearing): an empty list comes back as HTTP 400 ("No policy
// flags found."), not 200 [] — likewise an ?asOfDate= with no active flags. The admin
// page treats a 400 on this route as the honest empty state, not an error.

/** PolicyType enum (Domain.Enums.PolicyType) — integer wire value. */
export enum PolicyType {
  Subsidy = 0,
  ImportBan = 1,
  ExportBan = 2,
  PriceCeiling = 3,
  PriceFloor = 4,
  FertiliserSubsidy = 5,
  FuelPriceChange = 6,
  Other = 7,
  Budget = 8,
}

/** PolicyDirection enum (Domain.Enums.PolicyDirection) — integer wire value.
 *  NOTE the -1: this is NOT a 0-based enum. */
export enum PolicyDirection {
  Bearish = -1, // expected to push prices down
  Neutral = 0,
  Bullish = 1, // expected to push prices up
}

/** GET /api/policy-flag/get/all -> PolicyFlag_GetDto[] (camelCase over the wire). */
export interface PolicyFlag {
  id: string; // Guid
  policyType: number; // PolicyType enum (integer)
  title: string;
  description: string | null;
  effectiveFrom: string; // ISO datetime
  effectiveTo: string | null; // ISO datetime | null (open-ended => still in effect)
  direction: number; // PolicyDirection enum (integer; Bearish = -1)
  source: string | null;
  referenceUrl: string | null;
  createdAtUtc: string; // ISO datetime
}

/** Derived client-side lifecycle status (NOT on the wire) — from effective dates. */
export type PolicyStatus = 'active' | 'scheduled' | 'expired';

// Policy-flag MUTATIONS (Admin-only):
//   PUT    /api/policy-flag/update      body { policyFlagUpdateDto }
//   DELETE /api/policy-flag/delete/{id}
// Both return PolicyFlagMutationResult. Update is a FULL-OBJECT replace, and source is
// REQUIRED because policy flags are as-of-joined into the model's training features.
// Enums stay integers on the wire; dates are date-only "YYYY-MM-DD".
export interface PolicyFlagUpdateDto {
  id: string; // Guid of the row being edited
  policyType: number; // PolicyType enum (integer)
  title: string;
  description?: string | null;
  effectiveFrom: string; // "YYYY-MM-DD"
  effectiveTo?: string | null; // "YYYY-MM-DD" | null (open-ended)
  direction: number; // PolicyDirection enum (integer; Bearish = -1)
  source?: string | null; // REQUIRED on mutation (validator): ML-training provenance
  referenceUrl?: string | null;
}

/** Update/delete response. trainingDataWarning is non-null when the effective window —
 *  the incoming one or the previous one — starts in the PAST, because policy flags are
 *  as-of-joined into the model's training data. The mutation still SUCCEEDED; the warning
 *  is informational (a retrain may be needed), never an error. Future-only => null. */
export interface PolicyFlagMutationResult {
  id: string; // Guid of the affected row
  trainingDataWarning: string | null;
}

// ADMIN CONSOLE wire shapes. Enums (eventType / direction) deliberately reuse
// PolicyType / PolicyDirection so the same tested mappers apply. Indicators, festivals
// and news are all live:
//   GET /api/indicators?code=&from=&to=   -> DailyIndicatorPoint[]
//   GET /api/macro-series?key=&from=&to=  -> MacroSeriesPoint[]
//   GET /api/indicators/catalog           -> SeriesCatalogEntry[]
// Params are literal: daily uses `code`, macro uses `key`. Empty -> 200 [], never 404.

/** Admin user row. User.Role is a STRING column on the backend ('Farmer' | 'Admin'), not
 *  an enum. */
export interface AdminUser {
  id: string; // Guid
  username: string;
  email: string;
  role: 'Farmer' | 'Admin';
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Body of POST /api/users/create (Admin-only). The public register fields plus `role`,
 *  which self-registration does not have. The response is a plain AdminUser — no token —
 *  so creating an account never touches the acting admin's own session. */
export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role: 'Farmer' | 'Admin';
}

// Festival calendar (live). Consumed verbatim; empty -> 200 []:
//   GET    /api/festival-calendar/get/all             -> FestivalEntry[]
//   POST   /api/festival-calendar/create    [Admin]   body { festivalCalendarCreateDto }
//   PUT    /api/festival-calendar/update    [Admin]   body { festivalCalendarUpdateDto }
//   DELETE /api/festival-calendar/delete/{id} [Admin]
// Validators mirrored client-side: festivalKey ^[A-Z0-9_]+$ <=50, date required,
// leadUpDays 0..90 with 0 a FIRST-CLASS value, source required on create and update.
// WIRE NOTE: `date` arrives as "YYYY-MM-DDT00:00:00" — slice to 10 before formatDate() or
// a date-input prefill. One row per occurrence-year.
export interface FestivalEntry {
  id: string; // Guid
  festivalKey: string; // e.g. 'AVURUDU' | 'THAI_PONGAL' | 'CHRISTMAS' | 'VESAK' | 'DEEPAVALI'
  date: string; // occurrence date — live sends "YYYY-MM-DDT00:00:00"; slice(0,10) for display
  leadUpDays: number; // demand build-up window (default 14); 0 is a valid paired-day value
  isProvisional: boolean; // date not yet officially confirmed
  source: string | null;
  createdAtUtc: string; // ISO datetime
}

/** POST /api/festival-calendar/create body wraps this under `festivalCalendarCreateDto` (mirrors
 *  the crops createDto / policyFlagUpdateDto wrappers). source REQUIRED (validator). */
export interface FestivalCreateDto {
  festivalKey: string; // uppercase ^[A-Z0-9_]+$ (open set)
  date: string; // "YYYY-MM-DD" (date-only)
  leadUpDays: number; // 0..90; 0 allowed (paired-day convention)
  isProvisional: boolean;
  source: string; // required on mutation
}

/** PUT /api/festival-calendar/update body wraps this under `festivalCalendarUpdateDto`.
 *  Full-object update = create fields + the id of the row being edited. */
export interface FestivalUpdateDto extends FestivalCreateDto {
  id: string; // Guid of the row being edited
}

/** Update/delete response — the same shape as PolicyFlagMutationResult. Festival dates
 *  feed the model's lead-up training features, so mutating a PAST-dated festival returns
 *  a non-null trainingDataWarning. The mutation still succeeded; the warning is
 *  informational, never an error. */
export type FestivalMutationResult = PolicyFlagMutationResult;

/** ADM-6 daily indicator point (e.g. USD_LKR). PROPOSAL. */
export interface DailyIndicatorPoint {
  date: string; // "YYYY-MM-DD"
  indicatorCode: string; // 'USD_LKR'
  value: number;
  source: string | null;
}

/** Vintage-aware macro point (e.g. CCPI). BOTH dates are load-bearing and must always be
 *  shown together: referenceDate is the period described, publishedAt is when the figure
 *  became knowable. Several vintages of one referenceDate can appear (a later publishedAt
 *  revises an earlier estimate); the latest wins for display, but the UI must surface
 *  that a revision exists rather than discard it silently. */
export interface MacroSeriesPoint {
  seriesKey: string; // e.g. 'CCPI_BASE2021' | 'CCPI_HEADLINE_YOY_BASE2021'
  referenceDate: string; // "YYYY-MM-DD" — period described
  publishedAt: string; // "YYYY-MM-DD" — when knowable
  value: number;
  source: string | null;
}

/** Series-catalog entry — GET /api/indicators/catalog. One directory across both data
 *  sources; `kind` says which route to call: 'indicator' -> GET /api/indicators?code=,
 *  'macro' -> GET /api/macro-series?key=. Empty DB -> 200 []. */
export interface SeriesCatalogEntry {
  key: string; // IndicatorCode (daily) or SeriesCode (macro)
  kind: 'indicator' | 'macro';
  latestDate: string; // "YYYY-MM-DD" — max Date / max ReferenceDate in the series
  count: number; // number of rows in the series
}

/** The two macro series the Indicators page pins: the index level (line chart) and the
 *  ready-made headline YoY inflation (gauge). Both live in the catalog. */
export const CCPI_INDEX_KEY = 'CCPI_BASE2021';
export const CCPI_YOY_KEY = 'CCPI_HEADLINE_YOY_BASE2021';

// Structured news events (live). camelCase, enums as INTEGERS. eventType
// (NewsEventType 0..8) mirrors PolicyType member-for-member so the page reuses the
// PolicyType label mapper; direction reuses PolicyDirection (Bearish = -1).
//   GET    /api/news-events/get/all       [Authorize] -> NewsEvent[]
//   POST   /api/news-events/create  [Admin] body { newsEventCreateDto } -> 200 true
//   PUT    /api/news-events/update  [Admin] body { newsEventUpdateDto } -> 200 Guid
//   DELETE /api/news-events/delete/{id} [Admin]                         -> 200 Guid
// News events are NOT ML feature inputs, so there is deliberately no trainingDataWarning
// and the mutation returns are BARE — not the { id, trainingDataWarning } shape used by
// policy flags and festivals.
// WIRE NOTE: `publishedAt` may arrive as "YYYY-MM-DDT00:00:00" — slice(0,10) before
// formatDate().
export interface NewsEvent {
  id: string; // Guid
  eventType: number; // NewsEventType enum (integer; mirrors PolicyType 0..8)
  direction: number; // PolicyDirection enum (integer; Bearish = -1)
  title: string;
  description: string | null;
  publishedAt: string; // knowledge/vintage date — live may send "YYYY-MM-DDT00:00:00"; slice(0,10)
  sourceUrl: string | null;
  affectedCropIds: string[]; // optional multi-pick from the crops list
  affectedMarketIds: string[]; // ADDITIVE (API-12): storage-ahead-of-UI; no market picker yet — preserved verbatim on edit
  createdAtUtc: string; // ISO datetime
}

/** POST /api/news-events/create body wraps this under `newsEventCreateDto`. publishedAt
 *  is REQUIRED (the immutable vintage date). affectedMarketIds is optional passthrough
 *  and omitted today — the FE has no market picker. */
export interface NewsEventCreateDto {
  eventType: number; // 0..8 (defined-enum)
  direction: number; // -1 | 0 | 1
  title: string;
  description?: string | null;
  publishedAt: string; // "YYYY-MM-DD" — required on create, immutable afterwards
  sourceUrl?: string | null;
  affectedCropIds?: string[];
  affectedMarketIds?: string[];
}

/** PUT /api/news-events/update body wraps this under `newsEventUpdateDto`. Full-object
 *  update = the create fields + id, MINUS publishedAt: the vintage date is immutable by
 *  construction, so the wire contract cannot carry it. affectedMarketIds is preserved
 *  verbatim from the stored row. */
export interface NewsEventUpdateDto {
  id: string; // Guid of the row being edited
  eventType: number;
  direction: number;
  title: string;
  description?: string | null;
  // NOTE: no publishedAt — immutable by construction (see NewsEvent block).
  sourceUrl?: string | null;
  affectedCropIds?: string[];
  affectedMarketIds?: string[];
}

/** One article the news INGESTION pipeline captured (the Python-owned NewsArticles
 *  table). Read-only feed on the admin News page, DISTINCT from the curated NewsEvent
 *  CRUD above — the two "news" stores never mix. GET /api/news-articles/get/latest?take=50
 *  (the server clamps take: default 50, max 200).
 *  url is the row identity. Timestamps are naive UTC with NO Z suffix; publishedDateUtc
 *  is null when the source feed omitted a date — fall back to retrievedAtUtc for display.
 *  title/summary may contain HTML entities — decode before rendering. */
export interface NewsArticle {
  url: string;
  source: string; // short feed key, e.g. "lbo"
  title: string;
  summary: string;
  publishedDateUtc: string | null;
  retrievedAtUtc: string;
  language: string; // e.g. "en"
  /** Per-article agri topic flags from the Python scorer, as a stable-order CSV
   *  ("flood,drought"). '' = scored, no topic fired (general news); null = not yet
   *  scored. The FE derives the category badge + direction from this (src/lib/news.ts). */
  topics: string | null;
  /** VADER compound sentiment in [-1, 1]; null = not yet scored. */
  sentimentScore: number | null;
}

// ADMIN — ingestion runs. Two read-only routes behind an Admin JWT:
// GET /api/admin/ingestion/status (a snapshot) and GET /api/admin/ingestion/runs
// (server-paged history). Timestamps are Z-suffixed UTC.
// run.verification.checksJson is a JSON STRING — parse defensively
// (parseVerificationChecks) and never crash on bad JSON.

/** Ingestion-service lifecycle state (top of the status snapshot). */
export type IngestionState = 'running' | 'stopped' | 'unknown';

/** Per-run status (each row). "skipped" = a scheduled run that found nothing new. */
export type IngestionRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

/** Last-run rollup on the status snapshot ("partial" = some sources failed). */
export type IngestionLastRunStatus = 'succeeded' | 'partial' | 'failed';

/** Verification verdict (frozen spelling — only the display LABEL is translated). */
export type VerificationVerdict = 'Pass' | 'Warn' | 'Fail';

/** Per-source health status in the status snapshot. */
export type IngestionSourceStatus = 'ok' | 'disabled' | 'failed';

/** The 7 valid `source` filter keys. An unknown key -> the API answers 400. */
export const INGESTION_SOURCES = [
  'DAMBULLA_DEC',
  'WEATHER',
  'ECONOMIC',
  'NEWS',
  'HARTI',
  'CBSL',
  'CBSL_MACRO',
] as const;
export type IngestionSourceKey = (typeof INGESTION_SOURCES)[number];

// ADMIN — ingestion service control. Two write routes behind an Admin JWT:
// POST /api/admin/ingestion/service/start and .../service/stop. Both answer 202 on
// acceptance and 409 with a machine-readable { error } code when the truth on the
// server does not match what this screen believed.

/** POST /api/admin/ingestion/service/start -> 202 { batchId }. The batch id ties the
 *  pass to the rows that appear in the runs table. */
export interface IngestionServiceStartResult {
  batchId: string;
}

/** POST /api/admin/ingestion/service/stop -> 202 {} (an empty body, not 204). */
export type IngestionServiceStopResult = Record<string, never>;

/** The 409 `error` codes both control routes can answer with.
 *  - already_running: a pass is in flight, so start was refused (not an error state).
 *  - not_running:     nothing to stop; this screen's snapshot was stale.
 *  - not_stoppable:   a pass IS running but the scheduled worker owns it, and the API
 *                     cannot cancel that. Say so plainly instead of pretending. */
export const INGESTION_SERVICE_ERRORS = ['already_running', 'not_running', 'not_stoppable'] as const;
export type IngestionServiceErrorCode = (typeof INGESTION_SERVICE_ERRORS)[number];

/** Narrow an ApiError.code to a known 409 code (anything else = an ordinary failure). */
export function isIngestionServiceError(code: string | null | undefined): code is IngestionServiceErrorCode {
  return !!code && (INGESTION_SERVICE_ERRORS as readonly string[]).includes(code);
}

/** One source's health row on the status snapshot. */
export interface IngestionSourceHealth {
  source: string; // one of INGESTION_SOURCES (kept as string — never crash on a new key)
  status: IngestionSourceStatus;
  lastSuccessUtc: string | null;
  lastObservedDate: string | null; // "YYYY-MM-DD" of the newest data row this source has
  lastMessage: string | null;
}

/** Verification rollup counts (shared by status.lastVerification + run.verification). */
export interface IngestionVerificationSummary {
  overallStatus: VerificationVerdict;
  ranAtUtc: string;
  pipelineDate?: string; // present on status.lastVerification; absent on a run's verification
  nChecksPass: number;
  nChecksWarn: number;
  nChecksFail: number;
}

/** GET /api/admin/ingestion/status — the pipeline snapshot (Admin JWT). */
export interface IngestionStatus {
  state: IngestionState;
  /** True only while a pass STARTED BY THIS API PROCESS is in flight — i.e. the only
   *  case POST /service/stop can actually cancel. It is set synchronously when the
   *  start request is accepted, so it is also the earliest honest signal that a pass
   *  began: `state` only turns 'running' once the pass's first run row commits.
   *  A scheduler-owned pass is state='running' with canStop=false. */
  canStop: boolean;
  serviceAddress: string; // e.g. "unconfigured" — rendered verbatim from the payload
  lastRunAtUtc: string | null;
  lastRunStatus: IngestionLastRunStatus | null;
  lastVerification: IngestionVerificationSummary | null;
  sources: IngestionSourceHealth[];
}

/** A run's verification block. checksJson is a JSON STRING (parse defensively). */
export interface IngestionRunVerification extends IngestionVerificationSummary {
  /** JSON STRING encoding VerificationCheck[]. Parse with parseVerificationChecks. */
  checksJson: string;
}

/** One ingestion run (a row in the runs list). */
export interface IngestionRun {
  id: string;
  batchId: string;
  source: string;
  startedUtc: string;
  finishedUtc: string | null;
  status: IngestionRunStatus;
  coveredFromDate: string | null;
  coveredToDate: string | null;
  rowsFetched: number | null;
  rowsInserted: number | null;
  rowsSkipped: number | null;
  distinctCrops: number | null;
  errorSummary: string | null;
  verification: IngestionRunVerification | null;
}

/** GET /api/admin/ingestion/runs — server-paged envelope ({items,page,pageSize,total}). */
export interface IngestionRunPage {
  items: IngestionRun[];
  page: number;
  pageSize: number;
  total: number;
}

// ADMIN — nightly pipeline health. GET /api/admin/pipeline/health (Admin JWT) answers
// one question: did last night's pipeline produce the data today's forecasts need?
// It is a rollup over the ingestion batch, the verification gate and the feature build,
// so an admin does not have to open three screens to notice a silent failure.

/** The states the pinned contract defines today. The server owns this vocabulary and may
 *  grow it, which is why `PipelineHealth.state` below is a plain string: a banner that
 *  crashed — or worse, guessed a colour — on a word this build has never seen would be
 *  a bigger bug than one that stays quiet. */
export const PIPELINE_HEALTH_STATES = [
  'green', // ran and finished cleanly — nothing to say
  'running', // still running right now — not yet news
  'partial', // ran, but some sources did not finish
  'failed', // ran and failed
  'gate_blocked', // stopped at the data-verification gate; the new data was NOT used
  'missing', // no run recorded at all for the expected date
] as const;
export type PipelineHealthState = (typeof PIPELINE_HEALTH_STATES)[number];

/** Narrow a wire string to a state this build knows how to render. */
export function isPipelineHealthState(s: string | null | undefined): s is PipelineHealthState {
  return !!s && (PIPELINE_HEALTH_STATES as readonly string[]).includes(s);
}

/** Feature-build outcome — the same four words an ingestion run's status uses, so
 *  mapRunStatus() renders it without a second vocabulary. */
export type FeatureBuildStatus = 'succeeded' | 'failed' | 'running' | 'skipped';

/** GET /api/admin/pipeline/health — the nightly-pipeline snapshot. */
export interface PipelineHealth {
  /** "YYYY-MM-DD" — the pipeline date this snapshot is about (last night's run). */
  expectedForDate: string;
  /** One of PIPELINE_HEALTH_STATES today; typed wide on purpose (see above). */
  state: string;
  batchId: string | null;
  startedUtc: string | null;
  /** Frozen verdict spelling, shared with ingestion verification (Pass/Warn/Fail). */
  verificationStatus: VerificationVerdict | null;
  featureBuildStatus: FeatureBuildStatus | null;
  /** When the server computed this snapshot (not when the pipeline ran). */
  checkedAtUtc: string;
}

// ADMIN — logs hub (model training + user activity). Both routes are Admin-only and
// return the same server-paged {items,page,pageSize,total} envelope as ingestion runs.
// Timestamps are Z-suffixed UTC.

/** One model-training run — GET /api/admin/logs/training, newest first.
 *  `promoted` (currently live; exactly one row is true) and `decisionPromoted` (the
 *  promotion gate's verdict at train time) are INDEPENDENT: promoted=true with
 *  decisionPromoted=false is a MANUAL OVERRIDE and both must be surfaced, with
 *  promotionDecision explaining why. MAE may be null when a kind produced no model. */
export interface TrainingRun {
  version: string;
  trainedAtUtc: string; // ISO Z
  promoted: boolean; // currently the LIVE served model (exactly one row true)
  decisionPromoted: boolean; // the promotion gate's verdict at train time
  promotionDecision: string | null; // free-text decision detail (drill-down; verbatim)
  bestMlKind: string | null;
  bestMlMae: number | null;
  bestBaselineKind: string | null;
  bestBaselineMae: number | null;
  nTrainRows: number | null;
  nCrops: number | null;
}

/** GET /api/admin/logs/training — server-paged envelope. */
export interface TrainingRunPage {
  items: TrainingRun[];
  page: number;
  pageSize: number;
  total: number;
}

/** The event-type wire strings, grouped the way the System log tab groups them. The
 *  server 400s any value outside the known set, so the client either omits the filter,
 *  sends one exact string via `type`, or a comma-joined subset via `types` — never free
 *  text. The sign-in and user-management strings are FROZEN; the content ones were added
 *  later and may never occur in a given deployment, which is harmless. */
export const USER_ACTIVITY_SIGN_IN_EVENT_TYPES = ['loginSucceeded', 'loginFailed'] as const;
export const USER_ACTIVITY_USER_MGMT_EVENT_TYPES = [
  'userRegistered',
  'roleChanged',
  'userDeleted',
] as const;
export const USER_ACTIVITY_CONTENT_EVENT_TYPES = [
  'policyFlagChanged',
  'festivalChanged',
  'newsEventChanged',
  'cropChanged',
  'marketChanged',
] as const;
/** Pipeline actions — an admin driving the ingestion service from the ingestion tab.
 *  STOP is "…StopRequested", not "…Stopped": the API only ASKS for a cancellation, so
 *  the event records the request, never a guaranteed halt. */
export const USER_ACTIVITY_PIPELINE_EVENT_TYPES = [
  'ingestionServiceStarted',
  'ingestionServiceStopRequested',
] as const;

/** Every wire string the client knows about (sign-in + user management + content +
 *  pipeline actions). */
export const USER_ACTIVITY_EVENT_TYPES = [
  ...USER_ACTIVITY_SIGN_IN_EVENT_TYPES,
  ...USER_ACTIVITY_USER_MGMT_EVENT_TYPES,
  ...USER_ACTIVITY_CONTENT_EVENT_TYPES,
  ...USER_ACTIVITY_PIPELINE_EVENT_TYPES,
] as const;
export type UserActivityEventType = (typeof USER_ACTIVITY_EVENT_TYPES)[number];

/** FORWARD-COMPAT: the server may log an event type this build has never heard of.
 *  Such a row renders verbatim in a neutral badge rather than breaking the table, so
 *  the wire type is "a known string, or any other string". */
export type UserActivityEventTypeWire = UserActivityEventType | (string & {});

/** One user-activity event — GET /api/admin/logs/user-activity (ordered OccurredUtc
 *  DESC). actorUserId/targetUserId are GUIDs (rendered truncated, full value in title);
 *  usernameAttempted is populated on a loginFailed (an UNVERIFIED attempt, shown quoted). */
export interface UserActivityEvent {
  occurredUtc: string; // ISO Z
  eventType: UserActivityEventTypeWire;
  actorUserId: string | null; // Guid
  targetUserId: string | null; // Guid
  usernameAttempted: string | null; // present on loginFailed (unverified)
  details: string | null;
}

/** GET /api/admin/logs/user-activity — server-paged envelope. */
export interface UserActivityPage {
  items: UserActivityEvent[];
  page: number;
  pageSize: number;
  total: number;
}

// ADMIN — system errors. GET /api/admin/logs/errors is Admin-only and returns the same
// server-paged envelope as the sibling tabs, newest first. No filter param.

/** One unhandled server error (a 500) — GET /api/admin/logs/errors, newest first. Only
 *  unhandled exceptions land here; 400-type client mistakes do not. `traceId` matches the
 *  id shown to the user who hit the error. Every field after id/source is nullable, and
 *  stackTrace can be up to 8000 chars. */
export interface SystemError {
  id: number;
  occurredUtc: string; // ISO Z
  source: string; // e.g. "API" — rendered verbatim
  exceptionType: string; // e.g. "System.InvalidOperationException"
  message: string | null;
  path: string | null; // request path only (no query/host)
  method: string | null; // HTTP method of the failing request
  traceId: string | null; // matches the id shown to the user who hit the error
  stackTrace: string | null; // up to 8000 chars; drill-down only
}

/** GET /api/admin/logs/errors — server-paged envelope. */
export interface SystemErrorPage {
  items: SystemError[];
  page: number;
  pageSize: number;
  total: number;
}

/** One parsed element of run.verification.checksJson. `severity` is defensive (any
 *  string) so a new backend severity never crashes the parse; the UI tones only the
 *  known PASS/WARN/FAIL values and shows the rest neutrally. */
export interface VerificationCheck {
  name: string;
  severity: string; // "PASS" | "WARN" | "FAIL"
  message: string;
  counts?: Record<string, unknown>;
}
