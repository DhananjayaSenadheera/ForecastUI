// =============================================================================
// AgriForecast typed API contract (FE-2). Audited against the LIVE .NET API on
// 2026-07-10 (ForecastController, CropController + Application DTOs/enums).
//
// SERIALIZATION NOTE (load-bearing): the API registers NO JsonStringEnumConverter,
// so C# enums serialize as INTEGERS, while string properties pass through as-is.
//   - HarvestForecast.confidence  -> STRING "Low" | "Medium" | "High"  (frozen)
//   - HarvestForecast.recommendationLevel -> NUMBER 0..3 (RecommendationLevel enum)
//   - BestCrop.confidence -> NUMBER 0..2 (ForecastConfidence enum)  <-- NOT a string
//   - BestCrop.trend      -> NUMBER 0..2 (PriceTrend enum)
//   - BestCrop.recommendationLevel -> NUMBER 0..3
// The "Low"/"Medium"/"High" STRINGS are frozen in the contract — only the display
// label is translated (Low->"Low"/අඩුයි/குறைவு, Medium->"Fair", High->"Good").
// =============================================================================

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

// ---------------------------------------------------------------------------
// Crops — GET /api/crops/get/all , GET /api/crops/get/{id}
// (Crop_GetDto is thin TODAY; CropCode / category / agronomy / localized names
// are API gap #3 — not yet on the live route.) FE-3 consumes them as OPTIONAL so
// the crop picker degrades gracefully: no category -> a single "All crops" group;
// no localized name -> the English `name` is shown/searched. Fixtures fill these
// in for realistic dev; live payloads may omit them and the UI must not break.
// ---------------------------------------------------------------------------

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
  // ---- API gap #3 (optional; present in fixtures, may be absent live) ----
  cropCode?: string | null; // VEG######/FRT###### — display only
  category?: CropCategoryRef | null; // grouping; absent -> single group
  growthDays?: number | null; // typical growth period (agronomy profile)
  nameSi?: string | null; // localized display name (Sinhala)
  nameTa?: string | null; // localized display name (Tamil)
}

// POST /api/crops/create — body is the CropCreateCommand (createDto wrapper).
// The Feb scaffold sent { createDto: { name } } which is now WRONG: category is
// mandatory (CropCategories table) and codes are VEG######/FRT######.
export interface CropCreateDto {
  name: string;
  externalProductId?: number | null;
  source?: string | null;
  cropCategoryId: string; // Guid — REQUIRED, must exist in CropCategories
}
export interface CropCreateCommand {
  createDto: CropCreateDto;
}

// ---------------------------------------------------------------------------
// Structured "why this forecast?" factor (FE-6) — PROVISIONAL, gated on API-5.
//
// CONTRACT PROPOSAL for agri-dotnet (API-5, blocked until after 2026-07-16):
// the LIVE HarvestForecast today carries ONLY free-text `explanation`/`reason`,
// which are NOT translatable. API-5 should add an OPTIONAL `topFactors` array of
// STABLE REASON CODES so the UI can map each to farmer-language i18n strings
// (that is the entire point: codes translate, English prose does not).
//
//   {
//     "code": "recent_price_trend",   // stable snake_case id -> i18n key
//                                      //   `factor.codes.<code>`; unknown codes
//                                      //   degrade (UI shows the raw code muted).
//     "direction": "up",              // "up" | "down" | "neutral" — glyph+word,
//                                      //   NEVER color-only, NEVER a verdict.
//     "weight": 0.9                    // OPTIONAL relative magnitude, positive;
//                                      //   compared on a SHARED scale within the
//                                      //   panel (max -> full bar). Unit-agnostic.
//   }
//
// Codes SHOULD map to real model features (price lags / rolling means, festival
// calendar, monsoon/season, planting extent). When `topFactors` is absent/empty
// (fallback predictor, or pre-API-5), the panel degrades to the free-text
// `explanation` + an honest "no detailed breakdown yet" note — never fabricated.
// ---------------------------------------------------------------------------
export type FactorDirection = 'up' | 'down' | 'neutral';

export interface ForecastFactor {
  /** Stable reason code; UI maps to `factor.codes.<code>` i18n label. */
  code: string;
  /** Which way this factor pushes the price. Rendered as glyph + word. */
  direction: FactorDirection;
  /** Optional relative magnitude (positive); shared-scale bar within the panel. */
  weight?: number;
}

// ---------------------------------------------------------------------------
// Harvest forecast — GET /api/forecast/crop/{cropId}/harvest?plantDate=YYYY-MM-DD
// (HarvestForecast_GetDto). The honest-uncertainty payload.
// ---------------------------------------------------------------------------
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
  // ---- API-5 (optional; absent on the live route today, present in fixtures) ----
  topFactors?: ForecastFactor[] | null; // structured "why this forecast?" breakdown
}

// ---------------------------------------------------------------------------
// Timeline — GET /api/forecast/crop/{cropId}/timeline?months=12&asOf=YYYY-MM-DD
// (CropTimelineDto). Feeds FE-5 chart; a table alternative is mandatory.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Best crops — GET /api/forecast/best-crops?lookbackMonths=3 (BestCrop_GetDto[]).
// NOTE the enum confidence here (integer), unlike the harvest string.
//
// CONTRACT GAP (FE-7): this row carries only `averagePrice` — NO P10–P90 band /
// lower–upper bounds (those live on the per-crop harvest/timeline routes). So the
// FE-7 comparison renders a SHARED-SCALE expected-price bar (all rows on one
// Rs. 0–max axis, lengths comparable, the expected price marked), NOT a fabricated
// range band. We never invent an interval this endpoint does not return.
// ---------------------------------------------------------------------------

/**
 * Season-fit (Yala/Maha) — PROVISIONAL shape, gated on API-3 / owner decision #5.
 * The LIVE best-crops route does NOT expose this yet; fixtures include it on a
 * couple of crops so the badge slot is demo-able. When absent the UI degrades
 * SILENTLY (no badge) — a live omission must never break the row.
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

// ---------------------------------------------------------------------------
// Market overview — GET /api/forecast/market-overview?days=30 (MarketOverview_GetDto).
//
// CONTRACT (API-7 — LOCKED 2026-07-11; the .NET route is being built against this
// EXACT camelCase shape in parallel, so it must be consumed verbatim, NOT invented).
// Feeds the landing dashboard (FE-1 OverviewPage): KPI tiles + risers/fallers movers
// + a "latest prices" strip with per-crop sparklines. All fields are honest counts /
// observed prices the endpoint actually computes — the UI never fabricates a mover,
// a spark point, or a KPI the payload does not carry.
//
//   asOf            "YYYY-MM-DD" of the newest data in the window, or NULL when the
//                   window has NO data at all (null + empty arrays => honest
//                   "no market data yet" state; never a fake skeleton/number).
//   windowDays      the price window this snapshot summarises (echoes the `days` arg).
//   marketsWithData count of markets that reported at least one price in the window.
//   cropsWithData   count of crops that had at least one price in the window.
//   movers          up to 5 RISERS then up to 5 FALLERS (server order preserved as-is
//                   — never re-sorted client-side). `direction` is a STRING "up"|"down"
//                   rendered as glyph + word; movers are NEVER colour-coded (RED is
//                   reserved app-wide for the "Not recommended" verdict).
//   latestPrices    up to 8 crops' most-recent observed price + a short sparkline.
//   spark           up to 14 chronological daily points; MAY be sparse/short — the
//                   sparkline degrades honestly (dot-only for 1 point, none for 0).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// FIXTURE-ONLY endpoints (NOT built on the API yet — API gaps #1 / #2).
// Shapes are the FE proposal from the PRD gap list; treat as provisional.
// ---------------------------------------------------------------------------
export interface Market {
  id: string;
  name: string;
  district: string | null;
  marketType: number;
  isEconomicCenter: boolean;
}
export interface PriceHistoryPoint {
  date: string; // "YYYY-MM-DD"
  minPrice: number;
  maxPrice: number;
}
