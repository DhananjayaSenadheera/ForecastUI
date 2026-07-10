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
