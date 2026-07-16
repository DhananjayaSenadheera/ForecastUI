// =============================================================================
// FIXTURE DATA — VITE_API_MODE=fixtures serves these instead of hitting the API.
// Used for offline dev, tests, and not-yet-built endpoints (markets/prices = API
// gaps #1/#2). This is DEMO data behind an env flag — it is fenced here and MUST
// NOT be presented as real prices in production (VITE_API_MODE unset => live API).
// Values are illustrative and mirror the design-sample numbers; NOT real HARTI data.
// =============================================================================
import { ymdLocal } from '../lib/format';
import {
  ForecastConfidenceCode,
  MarketType,
  PolicyDirection,
  PolicyType,
  PriceTrend,
  RecommendationLevel,
  type AdminUser,
  type BestCrop,
  type ConfidenceString,
  type Crop,
  type CropTimeline,
  type DailyIndicatorPoint,
  type FestivalEntry,
  type HarvestForecast,
  type MacroSeriesPoint,
  type Market,
  type MarketLatestPrice,
  type MarketMover,
  type MarketOverview,
  type NewsEvent,
  type PolicyFlag,
  type PriceHistoryPoint,
  type SeriesCatalogEntry,
} from './types';

// NOTE (localized crop names): nameSi/nameTa below are DRAFT translations for
// realistic dev + search exercise. They are pending native-speaker review (same
// caveat as the locale files) and are NOT final agronomy copy. TODO native review.
// category.code follows the CropCategories contract: VEG (Vegetable) / FRT (Fruit).
// growthDays are typical field values for dev only (not authoritative agronomy).
const VEG = { code: 'VEG', name: 'Vegetable' };
const FRT = { code: 'FRT', name: 'Fruit' };

export const fxCrops: Crop[] = [
  { id: 'c0000001-0000-0000-0000-000000000001', name: 'Capsicum', nameSi: 'මාළු මිරිස්', nameTa: 'குடைமிளகாய்', cropCode: 'VEG000012', category: VEG, growthDays: 97, externalProductId: 12, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000002-0000-0000-0000-000000000002', name: 'Beans', nameSi: 'බෝංචි', nameTa: 'பீன்ஸ்', cropCode: 'VEG000007', category: VEG, growthDays: 65, externalProductId: 7, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000003-0000-0000-0000-000000000003', name: 'Tomato', nameSi: 'තක්කාලි', nameTa: 'தக்காளி', cropCode: 'VEG000003', category: VEG, growthDays: 95, externalProductId: 3, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000005-0000-0000-0000-000000000005', name: 'Green Chilli', nameSi: 'අමු මිරිස්', nameTa: 'பச்சை மிளகாய்', cropCode: 'VEG000018', category: VEG, growthDays: 120, externalProductId: 18, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000006-0000-0000-0000-000000000006', name: 'Carrot', nameSi: 'කැරට්', nameTa: 'கரட்', cropCode: 'VEG000021', category: VEG, growthDays: 90, externalProductId: 21, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000007-0000-0000-0000-000000000007', name: 'Cabbage', nameSi: 'ගෝවා', nameTa: 'முட்டைக்கோஸ்', cropCode: 'VEG000022', category: VEG, growthDays: 90, externalProductId: 22, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000008-0000-0000-0000-000000000008', name: 'Brinjal', nameSi: 'වම්බටු', nameTa: 'கத்தரிக்காய்', cropCode: 'VEG000009', category: VEG, growthDays: 120, externalProductId: 9, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000009-0000-0000-0000-000000000009', name: 'Pumpkin', nameSi: 'වට්ටක්කා', nameTa: 'பூசணி', cropCode: 'VEG000025', category: VEG, growthDays: 110, externalProductId: 25, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000010-0000-0000-0000-000000000010', name: 'Leeks', nameSi: 'ලීක්ස්', nameTa: 'லீக்ஸ்', cropCode: 'VEG000030', category: VEG, growthDays: 120, externalProductId: 30, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000011-0000-0000-0000-000000000011', name: 'Beetroot', nameSi: 'බීට්රූට්', nameTa: 'பீட்ரூட்', cropCode: 'VEG000031', category: VEG, growthDays: 90, externalProductId: 31, source: 'DEC', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000004-0000-0000-0000-000000000004', name: 'Passion Fruit', nameSi: 'පැෂන් ෆෘට්', nameTa: 'பேஷன் பழம்', cropCode: 'FRT000019', category: FRT, growthDays: 180, externalProductId: null, source: 'HARTI', createdAt: '2026-03-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000012-0000-0000-0000-000000000012', name: 'Banana', nameSi: 'කෙසෙල්', nameTa: 'வாழை', cropCode: 'FRT000002', category: FRT, growthDays: 300, externalProductId: 2, source: 'HARTI', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'c0000013-0000-0000-0000-000000000013', name: 'Papaya', nameSi: 'පැපොල්', nameTa: 'பப்பாளி', cropCode: 'FRT000004', category: FRT, growthDays: 270, externalProductId: 4, source: 'HARTI', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
];

// =============================================================================
// FE-19 — PER-CROP REFERENCE PRICE (single source of truth).
//
// BUG FIXED: previously every crop WITHOUT a dedicated fixture fell back to
// Capsicum's 552 reference (fxForecastFor/fxTimelineFor/fxPriceHistoryFor all
// defaulted to Capsicum), so the Compare screen showed identical prices for most
// crop pairs. Now EVERY fxCrops crop has a DISTINCT reference (Rs/kg wholesale
// level) and the timeline / harvest / price-history / overview / compare surfaces
// all derive from this ONE table, so they agree per crop and differ across crops.
//
// Values match fxBestCrops.averagePrice where those exist (Capsicum 552, Green
// Chilli 430, Tomato 360, Beans 310, Carrot 280, Passion 240, Cabbage 95) and are
// plausible distinct Sri Lanka wholesale levels for the remaining crops. DEMO data.
// =============================================================================
export const CROP_REFERENCE: Record<string, number> = {
  'c0000001-0000-0000-0000-000000000001': 552, // Capsicum
  'c0000005-0000-0000-0000-000000000005': 430, // Green Chilli
  'c0000003-0000-0000-0000-000000000003': 360, // Tomato
  'c0000002-0000-0000-0000-000000000002': 310, // Beans
  'c0000010-0000-0000-0000-000000000010': 300, // Leeks
  'c0000006-0000-0000-0000-000000000006': 280, // Carrot
  'c0000004-0000-0000-0000-000000000004': 240, // Passion Fruit
  'c0000008-0000-0000-0000-000000000008': 210, // Brinjal
  'c0000011-0000-0000-0000-000000000011': 175, // Beetroot
  'c0000012-0000-0000-0000-000000000012': 160, // Banana
  'c0000013-0000-0000-0000-000000000013': 130, // Papaya
  'c0000009-0000-0000-0000-000000000009': 100, // Pumpkin
  'c0000007-0000-0000-0000-000000000007': 95, // Cabbage
};
const DEFAULT_REFERENCE = 300; // used only for a crop id absent from the table

/** Reference (average) Rs/kg price for a crop — the single source of truth. */
export function cropReferencePrice(cropId: string): number {
  return CROP_REFERENCE[cropId] ?? DEFAULT_REFERENCE;
}

export const fxHarvestForecast: HarvestForecast = {
  cropId: 'c0000001-0000-0000-0000-000000000001',
  cropName: 'Capsicum',
  plantDate: '2026-07-10',
  harvestDate: '2026-10-15',
  growthPeriodDays: 97,
  currentPrice: 460,
  predictedPrice: 552,
  lowerBound: 233,
  upperBound: 694,
  confidence: 'High',
  activePredictor: 'residual',
  modelVersion: 'v13',
  explanation: 'Based on 9 years of Dambulla prices for this crop.',
  recommendationLevel: RecommendationLevel.Recommended,
  reason: 'Enough recent price data and a steady upward trend.',
  upsidePct: 20,
  intervalWidthPct: 83,
  lowTrust: false,
  // FE-6 structured factors (API-5, provisional). Codes match real model features
  // (price lags/rolling means, festival calendar, seasonal supply, monsoon). Weights
  // are relative magnitudes on a shared scale (demo values, not authoritative).
  topFactors: [
    { code: 'recent_price_trend', direction: 'up', weight: 0.9 },
    { code: 'festival_demand', direction: 'up', weight: 0.7 },
    { code: 'seasonal_supply', direction: 'up', weight: 0.5 },
    { code: 'weather_monsoon', direction: 'neutral', weight: 0.3 },
  ],
};

// A MEDIUM-confidence fixture (Beans) so the middle "Fair ●●○○" tier is demo-able.
export const fxHarvestForecastMedium: HarvestForecast = {
  cropId: 'c0000002-0000-0000-0000-000000000002',
  cropName: 'Beans',
  plantDate: '2026-07-10',
  harvestDate: '2026-09-13',
  growthPeriodDays: 65,
  currentPrice: 290,
  predictedPrice: 310,
  lowerBound: 240,
  upperBound: 420,
  confidence: 'Medium',
  activePredictor: 'residual',
  modelVersion: 'v13',
  explanation: 'Based on a few years of Dambulla prices — reasonable, but not rock-solid.',
  recommendationLevel: RecommendationLevel.Recommended,
  reason: 'Some recent price data and a fairly steady trend.',
  upsidePct: 7,
  intervalWidthPct: 58,
  lowTrust: false,
  // Two factors — exercises a shorter structured list on a Medium-tier crop.
  topFactors: [
    { code: 'recent_price_trend', direction: 'up', weight: 0.6 },
    { code: 'seasonal_supply', direction: 'neutral', weight: 0.4 },
  ],
};

// A deliberately LOW-confidence / fallback fixture so uncertainty UI is exercised
// honestly (crop_mean_fallback predictor + lowTrust flag => amber "rough estimate").
export const fxHarvestForecastLow: HarvestForecast = {
  cropId: 'c0000004-0000-0000-0000-000000000004',
  cropName: 'Passion Fruit',
  plantDate: '2026-07-10',
  harvestDate: '2026-11-20',
  growthPeriodDays: 133,
  currentPrice: 180,
  predictedPrice: 210,
  lowerBound: 90,
  upperBound: 360,
  confidence: 'Low',
  activePredictor: 'crop_mean_fallback',
  modelVersion: null,
  explanation: 'This crop does not yet have enough price history for the ML model.',
  recommendationLevel: RecommendationLevel.RecommendedWithRisk,
  reason: 'Little data — treat this as a rough guide, not a promise.',
  upsidePct: 17,
  intervalWidthPct: 129,
  lowTrust: true,
  // NO topFactors: the fallback predictor has no structured breakdown, so the
  // WhyForecast panel must degrade to the free-text explanation + honest note.
};

// Per-crop forecast resolver for fixture mode: maps the crop id to its confidence
// tier so every state is demo-able (Tomato/Capsicum=High, Beans=Medium, Passion=Low).
// The requested plantDate is echoed back and harvestDate is derived from it +
// growthPeriodDays, matching the server behaviour so the demo stays honest.
// Hand-authored confidence-tier fixtures (High/Medium/Low) keep their PINNED
// values so the tier showcase (Capsicum=High, Beans=Medium, Passion=Low) stays
// demoable and stable. Every OTHER crop is generated from CROP_REFERENCE below.
const fxHarvestByCrop: Record<string, HarvestForecast> = {
  'c0000001-0000-0000-0000-000000000001': fxHarvestForecast, // Capsicum (High)
  'c0000002-0000-0000-0000-000000000002': fxHarvestForecastMedium, // Beans
  'c0000004-0000-0000-0000-000000000004': fxHarvestForecastLow, // Passion Fruit
};

function addDays(ymd: string, days: number | null): string | null {
  if (days == null) return null;
  const d = new Date(ymd + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

// ---------------------------------------------------------------------------
// FE-19 deterministic per-crop generator. From a crop's reference price + a
// stable per-crop "shape" (amplitude / phase / trend seeded from the crop id) we
// synthesise a 12-month history + a 3-point forecast that is REALISTIC, DISTINCT
// per crop, and STABLE across runs (no Date.now / unseeded Math.random). The same
// shape drives the harvest forecast so the hero, chart, prices and compare agree.
// ---------------------------------------------------------------------------
const TIMELINE_MONTHS = [
  '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01',
  '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
] as const;
const FORECAST_DATES = ['2026-08-10', '2026-09-10', '2026-10-15'] as const;

/** FNV-1a hash of a string -> unsigned 32-bit; deterministic per crop id. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface CropShape {
  amp: number; // seasonal swing, fraction of reference
  phase: number; // seasonal phase (radians)
  trend: number; // 12-month drift, fraction of reference
}
function cropShape(cropId: string): CropShape {
  const h = hashStr(cropId);
  return {
    amp: 0.05 + ((h % 100) / 100) * 0.12, // 0.05–0.17
    phase: (((h >>> 7) % 360) * Math.PI) / 180, // 0–2π
    trend: -0.05 + (((h >>> 15) % 100) / 100) * 0.16, // -0.05–0.11
  };
}

/** Tiny deterministic per-crop, per-index wobble in ~[-0.02, 0.02]. */
function shapeJitter(cropId: string, i: number): number {
  const h = hashStr(`${cropId}#${i}`);
  return ((h % 41) - 20) / 1000;
}

function confCodeToString(c: ForecastConfidenceCode): ConfidenceString {
  return c === ForecastConfidenceCode.High ? 'High' : c === ForecastConfidenceCode.Low ? 'Low' : 'Medium';
}

function genHistory(cropId: string, ref: number, shape: CropShape): { month: string; avgPrice: number }[] {
  const n = TIMELINE_MONTHS.length;
  return TIMELINE_MONTHS.map((month, i) => {
    const frac = i / (n - 1);
    const seasonal = shape.amp * Math.sin((i / 12) * Math.PI * 2 + shape.phase);
    const avg = ref * (1 + shape.trend * frac + seasonal + shapeJitter(cropId, i));
    return { month, avgPrice: Math.max(1, Math.round(avg)) };
  });
}

function genForecast(shape: CropShape, lastAvg: number) {
  return FORECAST_DATES.map((date, k) => {
    const h = k + 1;
    const drift = shape.trend * 0.5 * h + shape.amp * 0.4 * Math.sin(shape.phase + h);
    const predicted = Math.max(1, Math.round(lastAvg * (1 + drift)));
    const widthFrac = 0.16 + 0.09 * h; // band widens with horizon
    return {
      horizonMonths: h,
      date,
      predictedPrice: predicted,
      lowerBound: Math.max(1, Math.round(predicted * (1 - widthFrac))),
      upperBound: Math.round(predicted * (1 + widthFrac)),
    };
  });
}

/** Generated 12-month timeline for a crop that has no hand-authored fixture. */
function genTimeline(cropId: string): CropTimeline {
  const ref = cropReferencePrice(cropId);
  const shape = cropShape(cropId);
  const history = genHistory(cropId, ref, shape);
  const forecast = genForecast(shape, history[history.length - 1].avgPrice);
  const crop = fxCrops.find((c) => c.id === cropId);
  const bc = fxBestCrops.find((c) => c.cropId === cropId);
  const confidence = bc ? confCodeToString(bc.confidence) : 'Medium';
  return {
    cropName: crop?.name ?? null,
    activePredictor: 'residual',
    confidence,
    modelVersion: 'v13',
    explanation: 'Based on recent Dambulla prices for this crop.',
    history,
    forecast,
  };
}

/** Generated harvest forecast for a crop with no hand-authored fixture. */
function genHarvest(cropId: string, plantDate: string): HarvestForecast {
  const shape = cropShape(cropId);
  const tl = genTimeline(cropId);
  const current = tl.history[tl.history.length - 1].avgPrice;
  const hp = tl.forecast[tl.forecast.length - 1];
  const crop = fxCrops.find((c) => c.id === cropId);
  const bc = fxBestCrops.find((c) => c.cropId === cropId);
  const growthDays = crop?.growthDays ?? 90;
  const predicted = hp.predictedPrice;
  return {
    cropId,
    cropName: crop?.name ?? null,
    plantDate,
    harvestDate: addDays(plantDate, growthDays) ?? hp.date,
    growthPeriodDays: growthDays,
    currentPrice: current,
    predictedPrice: predicted,
    lowerBound: hp.lowerBound,
    upperBound: hp.upperBound,
    confidence: bc ? confCodeToString(bc.confidence) : 'Medium',
    activePredictor: 'residual',
    modelVersion: 'v13',
    explanation: 'Based on recent Dambulla prices for this crop.',
    recommendationLevel: bc?.recommendationLevel ?? RecommendationLevel.Recommended,
    reason: 'Some recent price data and a fairly steady trend.',
    upsidePct: Math.round(((predicted - current) / current) * 100),
    intervalWidthPct: Math.round(((hp.upperBound - hp.lowerBound) / predicted) * 100),
    lowTrust: false,
    topFactors: [
      { code: 'recent_price_trend', direction: shape.trend >= 0 ? 'up' : 'down', weight: 0.6 },
      { code: 'seasonal_supply', direction: 'neutral', weight: 0.4 },
    ],
  };
}

export function fxForecastFor(cropId: string, plantDate: string): HarvestForecast {
  const base = fxHarvestByCrop[cropId];
  if (base) {
    return {
      ...base,
      cropId,
      plantDate,
      harvestDate: addDays(plantDate, base.growthPeriodDays) ?? base.harvestDate,
    };
  }
  return genHarvest(cropId, plantDate); // distinct per-crop synthetic forecast
}

// HIGH-tier, full 12-month history (Capsicum). Forecast cones out to the harvest.
export const fxTimeline: CropTimeline = {
  cropName: 'Capsicum',
  activePredictor: 'residual',
  confidence: 'High',
  modelVersion: 'v13',
  explanation: 'Based on 9 years of Dambulla prices for this crop.',
  history: [
    { month: '2025-08', avgPrice: 420 },
    { month: '2025-09', avgPrice: 445 },
    { month: '2025-10', avgPrice: 510 },
    { month: '2025-11', avgPrice: 498 },
    { month: '2025-12', avgPrice: 470 },
    { month: '2026-01', avgPrice: 455 },
    { month: '2026-02', avgPrice: 462 },
    { month: '2026-03', avgPrice: 448 },
    { month: '2026-04', avgPrice: 440 },
    { month: '2026-05', avgPrice: 452 },
    { month: '2026-06', avgPrice: 468 },
    { month: '2026-07', avgPrice: 460 },
  ],
  forecast: [
    { horizonMonths: 1, date: '2026-08-10', predictedPrice: 470, lowerBound: 300, upperBound: 640 },
    { horizonMonths: 2, date: '2026-09-10', predictedPrice: 505, lowerBound: 300, upperBound: 710 },
    { horizonMonths: 3, date: '2026-10-15', predictedPrice: 552, lowerBound: 233, upperBound: 694 },
  ],
};

// MEDIUM-tier, full history (Beans). Steadier trend, moderate band width.
export const fxTimelineMedium: CropTimeline = {
  cropName: 'Beans',
  activePredictor: 'residual',
  confidence: 'Medium',
  modelVersion: 'v13',
  explanation: 'Based on a few years of Dambulla prices — reasonable, but not rock-solid.',
  history: [
    { month: '2025-08', avgPrice: 260 },
    { month: '2025-09', avgPrice: 275 },
    { month: '2025-10', avgPrice: 300 },
    { month: '2025-11', avgPrice: 288 },
    { month: '2025-12', avgPrice: 272 },
    { month: '2026-01', avgPrice: 265 },
    { month: '2026-02', avgPrice: 280 },
    { month: '2026-03', avgPrice: 292 },
    { month: '2026-04', avgPrice: 300 },
    { month: '2026-05', avgPrice: 295 },
    { month: '2026-06', avgPrice: 285 },
    { month: '2026-07', avgPrice: 290 },
  ],
  forecast: [
    { horizonMonths: 1, date: '2026-08-11', predictedPrice: 298, lowerBound: 250, upperBound: 380 },
    { horizonMonths: 2, date: '2026-09-13', predictedPrice: 310, lowerBound: 240, upperBound: 420 },
  ],
};

// LOW-tier / fallback (Passion Fruit): deliberately THIN history (4 months) + a
// WIDE amber band so the low-trust chart treatment + short-history note are demo-able.
// Honest by construction — we do not fabricate months that don't exist.
export const fxTimelineLow: CropTimeline = {
  cropName: 'Passion Fruit',
  activePredictor: 'crop_mean_fallback',
  confidence: 'Low',
  modelVersion: null,
  explanation: 'This crop does not yet have enough price history for the ML model.',
  history: [
    { month: '2026-04', avgPrice: 200 },
    { month: '2026-05', avgPrice: 165 },
    { month: '2026-06', avgPrice: 195 },
    { month: '2026-07', avgPrice: 180 },
  ],
  forecast: [
    { horizonMonths: 1, date: '2026-08-20', predictedPrice: 195, lowerBound: 110, upperBound: 300 },
    { horizonMonths: 2, date: '2026-09-20', predictedPrice: 205, lowerBound: 100, upperBound: 330 },
    { horizonMonths: 3, date: '2026-11-20', predictedPrice: 210, lowerBound: 90, upperBound: 360 },
  ],
};

// Per-crop timeline resolver for fixture mode — mirrors fxHarvestByCrop so the
// chart's confidence story lines up with the FE-4 hero for the same crop.
const fxTimelineByCrop: Record<string, CropTimeline> = {
  'c0000001-0000-0000-0000-000000000001': fxTimeline, // Capsicum (High, 12mo)
  'c0000002-0000-0000-0000-000000000002': fxTimelineMedium, // Beans (Medium)
  'c0000004-0000-0000-0000-000000000004': fxTimelineLow, // Passion Fruit (Low, thin)
};

export function fxTimelineFor(cropId: string): CropTimeline {
  // Hand-authored tier fixtures for Capsicum/Beans/Passion; every other crop gets
  // a DISTINCT generated series from its reference price (no more Capsicum fallback).
  return fxTimelineByCrop[cropId] ?? genTimeline(cropId);
}

// Full-spectrum ranked list so FE-7 exercises every honest state: two strong/High
// rows, middling Medium rows, one LOW-confidence "Little data" caution row, and one
// visible "Not recommended" (RED — the ONLY place red is allowed). Crop ids match
// fxCrops so the row → My-Harvest cross-link (?crop=<id>) preselects the right crop.
// seasonFit is PROVISIONAL demo data (API-3) present on two rows; the live route
// omits it and the badge must degrade silently. Ranked high → low by design.
export const fxBestCrops: BestCrop[] = [
  { cropId: 'c0000001-0000-0000-0000-000000000001', cropName: 'Capsicum', cropCode: 'VEG000012', averagePrice: 552, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.StronglyRecommended, seasonFit: { inSeason: true, season: 'Yala' } },
  { cropId: 'c0000005-0000-0000-0000-000000000005', cropName: 'Green Chilli', cropCode: 'VEG000018', averagePrice: 430, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.Recommended },
  { cropId: 'c0000003-0000-0000-0000-000000000003', cropName: 'Tomato', cropCode: 'VEG000003', averagePrice: 360, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.Medium, recommendationLevel: RecommendationLevel.Recommended },
  { cropId: 'c0000002-0000-0000-0000-000000000002', cropName: 'Beans', cropCode: 'VEG000007', averagePrice: 310, trend: PriceTrend.Stable, confidence: ForecastConfidenceCode.Medium, recommendationLevel: RecommendationLevel.Recommended, seasonFit: { inSeason: true, season: 'Yala' } },
  { cropId: 'c0000006-0000-0000-0000-000000000006', cropName: 'Carrot', cropCode: 'VEG000021', averagePrice: 280, trend: PriceTrend.Stable, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.Recommended },
  { cropId: 'c0000004-0000-0000-0000-000000000004', cropName: 'Passion Fruit', cropCode: 'FRT000019', averagePrice: 240, trend: PriceTrend.Down, confidence: ForecastConfidenceCode.Low, recommendationLevel: RecommendationLevel.RecommendedWithRisk },
  { cropId: 'c0000007-0000-0000-0000-000000000007', cropName: 'Cabbage', cropCode: 'VEG000022', averagePrice: 95, trend: PriceTrend.Down, confidence: ForecastConfidenceCode.Medium, recommendationLevel: RecommendationLevel.NotRecommended },
];

// ---- FIXTURE-ONLY (no live endpoint — API gaps #1 / #2) ----
export const fxMarkets: Market[] = [
  { id: 'm0000001-0000-0000-0000-000000000001', name: 'Dambulla Dedicated Economic Centre', district: 'Matale', marketType: 1, isEconomicCenter: true },
  { id: 'm0000002-0000-0000-0000-000000000002', name: 'Colombo (Pettah)', district: 'Colombo', marketType: 1, isEconomicCenter: false },
  { id: 'm0000003-0000-0000-0000-000000000003', name: 'Kandy', district: 'Kandy', marketType: 1, isEconomicCenter: false },
  { id: 'm0000004-0000-0000-0000-000000000004', name: 'Meegoda', district: 'Colombo', marketType: 1, isEconomicCenter: false },
];

export const fxPriceHistory: PriceHistoryPoint[] = [
  { date: '2026-07-06', minPrice: 440, maxPrice: 500 },
  { date: '2026-07-07', minPrice: 450, maxPrice: 520 },
  { date: '2026-07-08', minPrice: 460, maxPrice: 540 },
  { date: '2026-07-09', minPrice: 455, maxPrice: 530 },
  { date: '2026-07-10', minPrice: 470, maxPrice: 552 },
];

// ---------------------------------------------------------------------------
// FE-12 prices browsing — per-market daily price history (API gap #2).
//
// CONTRACT NOTE (provisional): the eventual live route is
//   GET /api/prices/crop/{cropId}/history?marketId=...  ->  PriceHistoryPoint[]
// returning ONE market's daily low–high series. Until API-2 lands, fixtures
// SYNTHESISE a plausible 14-day series per (crop, market) so the single-market
// line AND the cross-market comparison are demo-able. Values are DEMO-ONLY
// (illustrative Rs. levels consistent with the other fixtures), NOT real HARTI
// data. Dambulla (the economic centre) reads cheapest; Colombo (Pettah) dearest;
// Meegoda is deliberately THIN (3 days) so the "only N days" note is exercised.
// The generator is deterministic so tests and the demo stay stable.
// ---------------------------------------------------------------------------
const PRICE_ANCHOR = '2026-07-10'; // last day of the demo window (matches fixtures)
const PRICE_WINDOW_DAYS = 14;

interface MarketPriceProfile {
  level: number; // multiplier vs the crop's reference price
  spread: number; // daily low–high width as a fraction of the mid
  days: number; // series length (Meegoda is thin on purpose)
}
const MARKET_PROFILES: Record<string, MarketPriceProfile> = {
  'm0000001-0000-0000-0000-000000000001': { level: 0.9, spread: 0.1, days: PRICE_WINDOW_DAYS }, // Dambulla DEC — cheapest
  'm0000002-0000-0000-0000-000000000002': { level: 1.16, spread: 0.13, days: PRICE_WINDOW_DAYS }, // Colombo (Pettah) — dearest
  'm0000003-0000-0000-0000-000000000003': { level: 1.0, spread: 0.11, days: PRICE_WINDOW_DAYS }, // Kandy
  'm0000004-0000-0000-0000-000000000004': { level: 1.05, spread: 0.12, days: 3 }, // Meegoda — thin
};
const DEFAULT_MARKET_ID = 'm0000001-0000-0000-0000-000000000001'; // economic centre

/** Deterministic small offset in ~[-0.03, 0.03] from a market id + day index. */
function seededJitter(marketId: string, d: number): number {
  let h = 0;
  const s = `${marketId}:${d}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return ((h % 61) - 30) / 1000;
}

export function fxPriceHistoryFor(cropId: string, marketId?: string): PriceHistoryPoint[] {
  const ref = cropReferencePrice(cropId);
  const id = marketId ?? DEFAULT_MARKET_ID;
  const prof = MARKET_PROFILES[id] ?? { level: 1, spread: 0.1, days: PRICE_WINDOW_DAYS };
  const out: PriceHistoryPoint[] = [];
  for (let d = 0; d < prof.days; d++) {
    const wave = 0.05 * Math.sin((d / Math.max(1, prof.days - 1)) * Math.PI * 1.5);
    const mid = ref * prof.level * (1 + wave + seededJitter(id, d));
    const half = (mid * prof.spread) / 2;
    const date = addDays(PRICE_ANCHOR, -(prof.days - 1 - d)) ?? PRICE_ANCHOR;
    out.push({ date, minPrice: Math.round(mid - half), maxPrice: Math.round(mid + half) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// FE-1 market overview (API-7). LIVE contract, but no live route yet, so fixtures
// stand in for offline dev + tests. Values are CONSISTENT with the other fixtures:
// - movers reuse the best-crops / forecast price levels (Capsicum in the 540s-550s,
//   Green Chilli ~430, etc.) and carry a GENUINE spread of risers AND fallers.
// - latestPrices + their sparklines are DERIVED from fxPriceHistoryFor so the "latest
//   price" strip agrees with the Prices page for the same crop/market (Dambulla DEC =
//   cheapest economic centre; Meegoda is deliberately THIN -> a 3-point SPARSE spark
//   to exercise the thin-sparkline rendering). DEMO data behind the fixtures flag.
// ---------------------------------------------------------------------------
const DAMBULLA_ID = 'm0000001-0000-0000-0000-000000000001';
const PETTAH_ID = 'm0000002-0000-0000-0000-000000000002';
const MEEGODA_ID = 'm0000004-0000-0000-0000-000000000004';
const DAMBULLA = 'Dambulla Dedicated Economic Centre';
const PETTAH = 'Colombo (Pettah)';
const MEEGODA = 'Meegoda';

const mover = (
  cropId: string,
  cropName: string,
  marketName: string,
  previousPrice: number,
  latestPrice: number,
): MarketMover => ({
  cropId,
  cropName,
  marketName,
  latestPrice,
  previousPrice,
  // one decimal, matching a server-rounded percent
  changePct: Math.round(((latestPrice - previousPrice) / previousPrice) * 1000) / 10,
  direction: latestPrice >= previousPrice ? 'up' : 'down',
});

/** Latest observed price + sparkline for a crop, derived from the price-history fixture. */
function latestPrice(
  cropId: string,
  cropName: string,
  marketName: string,
  marketId: string,
): MarketLatestPrice {
  const hist = fxPriceHistoryFor(cropId, marketId);
  const last = hist[hist.length - 1];
  return {
    cropId,
    cropName,
    marketName,
    date: last.date,
    price: Math.round((last.minPrice + last.maxPrice) / 2),
    minPrice: last.minPrice,
    maxPrice: last.maxPrice,
    spark: hist.map((h) => ({ date: h.date, price: Math.round((h.minPrice + h.maxPrice) / 2) })),
  };
}

// Up to 5 risers THEN up to 5 fallers, server order preserved (never re-sorted).
const ALL_MOVERS: MarketMover[] = [
  mover('c0000001-0000-0000-0000-000000000001', 'Capsicum', DAMBULLA, 480, 552), // +15.0%
  mover('c0000005-0000-0000-0000-000000000005', 'Green Chilli', PETTAH, 387, 430), // +11.1%
  mover('c0000010-0000-0000-0000-000000000010', 'Leeks', DAMBULLA, 280, 302), // +7.9%
  mover('c0000002-0000-0000-0000-000000000002', 'Beans', DAMBULLA, 292, 310), // +6.2%
  mover('c0000006-0000-0000-0000-000000000006', 'Carrot', DAMBULLA, 269, 280), // +4.1%
  mover('c0000007-0000-0000-0000-000000000007', 'Cabbage', DAMBULLA, 108, 95), // -12.0%
  mover('c0000009-0000-0000-0000-000000000009', 'Pumpkin', DAMBULLA, 86, 80), // -7.0%
  mover('c0000008-0000-0000-0000-000000000008', 'Brinjal', DAMBULLA, 240, 226), // -5.8%
  mover('c0000003-0000-0000-0000-000000000003', 'Tomato', DAMBULLA, 198, 182), // -8.1%
  mover('c0000011-0000-0000-0000-000000000011', 'Beetroot', DAMBULLA, 150, 144), // -4.0%
];

// Up to 8 crops. Green Chilli reads from Colombo (Pettah) = dearest market; Passion
// Fruit from Meegoda (thin, 3 days) => a SPARSE 3-point spark; rest at Dambulla DEC.
const LATEST_PRICES: MarketLatestPrice[] = [
  latestPrice('c0000001-0000-0000-0000-000000000001', 'Capsicum', DAMBULLA, DAMBULLA_ID),
  latestPrice('c0000005-0000-0000-0000-000000000005', 'Green Chilli', PETTAH, PETTAH_ID),
  latestPrice('c0000002-0000-0000-0000-000000000002', 'Beans', DAMBULLA, DAMBULLA_ID),
  latestPrice('c0000003-0000-0000-0000-000000000003', 'Tomato', DAMBULLA, DAMBULLA_ID),
  latestPrice('c0000006-0000-0000-0000-000000000006', 'Carrot', DAMBULLA, DAMBULLA_ID),
  latestPrice('c0000007-0000-0000-0000-000000000007', 'Cabbage', DAMBULLA, DAMBULLA_ID),
  latestPrice('c0000004-0000-0000-0000-000000000004', 'Passion Fruit', MEEGODA, MEEGODA_ID),
];

// FE-15: the overview window selector (7 / 30 / 90 days) drives this. Fixtures VARY
// by window so the control visibly changes the snapshot — a short 7-day window
// surfaces fewer movers (3 up / 3 down) and slightly fewer crops/markets with data;
// a long 90-day window a few more. windowDays always ECHOES the requested `days` so
// the "based on the last N days" caption stays honest. asOf/latestPrices are stable
// (the newest observed prices don't change with the summary window).
export function fxMarketOverviewFor(days = 30): MarketOverview {
  const risers = ALL_MOVERS.filter((m) => m.direction === 'up');
  const fallers = ALL_MOVERS.filter((m) => m.direction === 'down');
  let nUp = risers.length;
  let nDown = fallers.length;
  let marketsWithData = 10;
  let cropsWithData = 24;
  if (days <= 7) {
    nUp = 3;
    nDown = 3;
    marketsWithData = 8;
    cropsWithData = 18;
  } else if (days >= 90) {
    marketsWithData = 12;
    cropsWithData = 28;
  }
  return {
    asOf: PRICE_ANCHOR, // '2026-07-10'
    windowDays: days,
    marketsWithData,
    cropsWithData,
    movers: [...risers.slice(0, nUp), ...fallers.slice(0, nDown)],
    latestPrices: LATEST_PRICES,
  };
}

export const fxMarketOverview: MarketOverview = fxMarketOverviewFor(30);

// ===========================================================================
// ADMIN CONSOLE fixtures (ADM-2 / ADM-3). DEMO data behind VITE_API_MODE=fixtures.
// Policy flags mirror the REAL .NET HasData seed rows (a1f1c001-…) plus a few extra
// rows so the admin table exercises every PolicyType, both non-neutral directions,
// and all three derived statuses (Active / Scheduled / Expired). "today" for the
// demo is ~2026-07-12. NOT authoritative policy data — illustrative for dev/tests.
// ===========================================================================
export const fxPolicyFlags: PolicyFlag[] = [
  {
    id: 'a1f1c001-0000-0000-0000-000000000001',
    policyType: PolicyType.ImportBan,
    title: 'Chemical fertiliser & agrochemical import ban',
    description:
      'Government banned imports of chemical fertilisers, pesticides and weedicides, forcing a nationwide shift to organic farming. Cut yields sharply across paddy and vegetables, pushing harvest-time prices up.',
    effectiveFrom: '2021-05-06T00:00:00',
    effectiveTo: '2021-11-24T00:00:00',
    direction: PolicyDirection.Bullish,
    source: 'Government of Sri Lanka',
    referenceUrl:
      'https://en.wikipedia.org/wiki/2021%E2%80%932022_Sri_Lankan_political_crisis',
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  {
    id: 'a1f1c001-0000-0000-0000-000000000002',
    policyType: PolicyType.FertiliserSubsidy,
    title: 'Aswesuma / fertiliser cash subsidy for paddy farmers',
    description:
      'Reinstated fertiliser support for the 2022/23 Maha season via direct cash and subsidised fertiliser to paddy farmers, easing input costs and partially recovering yields.',
    effectiveFrom: '2022-10-01T00:00:00',
    effectiveTo: '2023-03-31T00:00:00',
    direction: PolicyDirection.Bearish,
    source: 'Ministry of Agriculture, Sri Lanka',
    referenceUrl: null,
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  {
    id: 'a1f1c001-0000-0000-0000-000000000003',
    policyType: PolicyType.FuelPriceChange,
    title: 'Monthly fuel price formula (CPC pricing formula)',
    description:
      'Introduction of a transparent monthly fuel pricing formula. Transport/diesel cost feeds into farm-gate to wholesale transport margins; ongoing, still in effect.',
    effectiveFrom: '2022-09-01T00:00:00',
    effectiveTo: null,
    direction: PolicyDirection.Neutral,
    source: 'Ceylon Petroleum Corporation',
    referenceUrl: null,
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  {
    id: 'a1f1c001-0000-0000-0000-000000000004',
    policyType: PolicyType.ImportBan,
    title: 'Big onion & potato import restrictions',
    description:
      'Import controls / suspension on big onions and potatoes to protect local growers around the harvest window, tightening domestic supply and lifting prices.',
    effectiveFrom: '2020-07-01T00:00:00',
    effectiveTo: '2021-02-28T00:00:00',
    direction: PolicyDirection.Bullish,
    source: 'Department of Imports and Exports Control, Sri Lanka',
    referenceUrl: null,
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  {
    id: 'a1f1c001-0000-0000-0000-000000000005',
    policyType: PolicyType.PriceCeiling,
    title: 'Maximum retail price on rice varieties',
    description:
      'Consumer Affairs Authority imposed maximum retail prices (price ceilings) on Nadu, Samba and Keeri Samba rice to curb retail inflation during the economic crisis.',
    effectiveFrom: '2023-02-13T00:00:00',
    effectiveTo: '2024-01-31T00:00:00',
    direction: PolicyDirection.Bearish,
    source: 'Consumer Affairs Authority, Sri Lanka',
    referenceUrl: null,
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  {
    id: 'a1f1c001-0000-0000-0000-000000000006',
    policyType: PolicyType.FertiliserSubsidy,
    title: 'Fertiliser subsidy scheme continuation (2023/24)',
    description:
      'Continued subsidised fertiliser distribution to paddy farmers for the 2023/24 Maha season, supporting normalised yields; still in effect.',
    effectiveFrom: '2023-10-01T00:00:00',
    effectiveTo: null,
    direction: PolicyDirection.Bearish,
    source: 'Ministry of Agriculture, Sri Lanka',
    referenceUrl: null,
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  // ---- extra demo rows to exercise Budget / ExportBan / PriceFloor + scheduled ----
  {
    id: 'a1f1c001-0000-0000-0000-000000000007',
    policyType: PolicyType.Budget,
    title: '2026 Budget — agriculture modernisation allocation',
    description:
      'Annual budget allocation for seed, irrigation and farm-mechanisation support. Broad, slow-acting measure with no clear single-season price direction.',
    effectiveFrom: '2025-11-18T00:00:00',
    effectiveTo: null,
    direction: PolicyDirection.Neutral,
    source: 'Ministry of Finance, Sri Lanka',
    referenceUrl: 'https://www.treasury.gov.lk/',
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  {
    id: 'a1f1c001-0000-0000-0000-000000000008',
    policyType: PolicyType.ExportBan,
    title: 'Temporary vegetable export restriction (supply shortage)',
    description:
      'Short-term restriction on selected vegetable exports to keep domestic supply stable during a shortage. Still in effect.',
    effectiveFrom: '2026-01-10T00:00:00',
    effectiveTo: null,
    direction: PolicyDirection.Bearish,
    source: 'Department of Imports and Exports Control, Sri Lanka',
    referenceUrl: null,
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
  {
    id: 'a1f1c001-0000-0000-0000-000000000009',
    policyType: PolicyType.PriceFloor,
    title: 'Guaranteed paddy price floor — 2026 Maha season',
    description:
      'Scheduled guaranteed minimum purchase price for paddy in the upcoming Maha season, intended to support farm-gate prices at harvest.',
    effectiveFrom: '2026-09-15T00:00:00',
    effectiveTo: '2027-03-31T00:00:00',
    direction: PolicyDirection.Bullish,
    source: 'Ministry of Agriculture, Sri Lanka',
    referenceUrl: null,
    createdAtUtc: '2026-07-01T00:00:00Z',
  },
];

/** Fixture resolver for GET /api/policy-flag/get/all. When `asOfDate` (YYYY-MM-DD)
 *  is given, mirror the backend GetActiveAsOfAsync: only flags whose window contains
 *  that date (from <= asOf <= to-or-open). ISO date strings compare lexicographically. */
export function fxPolicyFlagsFor(asOfDate?: string): PolicyFlag[] {
  if (!asOfDate) return fxPolicyFlags;
  const d = asOfDate.slice(0, 10);
  return fxPolicyFlags.filter((f) => {
    const from = f.effectiveFrom.slice(0, 10);
    const to = f.effectiveTo ? f.effectiveTo.slice(0, 10) : null;
    return from <= d && (to === null || d <= to);
  });
}

// ---------------------------------------------------------------------------
// ADMIN markets registry (ADM-3). Mirrors the REAL 12 seeded markets (verified
// against AgriForecast.Infrastructure DbContext Market HasData, 2026-07-12): true
// GUIDs, names, districts, MarketType, and IsEconomicCenter. Only Dambulla
// (MKT00000001) carries IsEconomicCenter=true; note Keppetipola/Thambuttegama/etc.
// are MarketType.DEC yet IsEconomicCenter=false (MarketType classifies the kind,
// IsEconomicCenter flags the single feature-reference DEC). No live GET route yet
// (API gap #1) — this stands in until the markets API lands.
// ---------------------------------------------------------------------------
export const fxAdminMarkets: Market[] = [
  { id: 'b2a20001-0000-0000-0000-000000000001', name: 'Dambulla Dedicated Economic Centre', district: 'Matale', marketType: MarketType.DEC, isEconomicCenter: true },
  { id: 'b2a20001-0000-0000-0000-000000000002', name: 'Keppetipola Dedicated Economic Centre', district: 'Badulla', marketType: MarketType.DEC, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000003', name: 'Thambuttegama Dedicated Economic Centre', district: 'Anuradhapura', marketType: MarketType.DEC, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000004', name: 'Pettah (HARTI wholesale)', district: 'Colombo', marketType: MarketType.Wholesale, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000005', name: 'Narahenpita (HARTI retail)', district: 'Colombo', marketType: MarketType.Retail, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000006', name: 'CBSL national average (pseudo-market)', district: null, marketType: MarketType.NationalAggregate, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000007', name: 'Kandy (HARTI wholesale)', district: 'Kandy', marketType: MarketType.Wholesale, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000008', name: 'Meegoda Dedicated Economic Centre', district: 'Colombo', marketType: MarketType.DEC, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000009', name: 'Norochchole (HARTI wholesale)', district: 'Puttalam', marketType: MarketType.Wholesale, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000010', name: 'Nuwara Eliya Dedicated Economic Centre', district: 'Nuwara Eliya', marketType: MarketType.DEC, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000011', name: 'Bandarawela (HARTI wholesale)', district: 'Badulla', marketType: MarketType.Wholesale, isEconomicCenter: false },
  { id: 'b2a20001-0000-0000-0000-000000000012', name: 'Veyangoda Dedicated Economic Centre', district: 'Gampaha', marketType: MarketType.DEC, isEconomicCenter: false },
];

// ---------------------------------------------------------------------------
// ADM-4 users (PROVISIONAL — no live endpoint). 13 demo accounts incl. the `admin`
// account (used to simulate the admin role in fixtures login) and `claudetest` (the
// real-data E2E test farmer). Mutations in the page operate on a COPY of this array
// in component state — this seed is never mutated. DEMO data behind the fixtures flag.
// ---------------------------------------------------------------------------
export const fxAdminUsers: AdminUser[] = [
  { id: 'd0000001-0000-0000-0000-000000000001', username: 'admin', email: 'admin@agriforecast.lk', role: 'Admin', createdAt: '2026-01-02T08:00:00Z', updatedAt: '2026-06-30T10:00:00Z' },
  { id: 'd0000002-0000-0000-0000-000000000002', username: 'claudetest', email: 'claudetest@agriforecast.lk', role: 'Farmer', createdAt: '2026-07-12T06:00:00Z', updatedAt: '2026-07-12T06:00:00Z' },
  { id: 'd0000003-0000-0000-0000-000000000003', username: 'nimal_perera', email: 'nimal.perera@example.lk', role: 'Farmer', createdAt: '2026-02-11T09:20:00Z', updatedAt: '2026-05-01T09:20:00Z' },
  { id: 'd0000004-0000-0000-0000-000000000004', username: 'kamala_silva', email: 'kamala.silva@example.lk', role: 'Farmer', createdAt: '2026-02-18T11:00:00Z', updatedAt: '2026-06-14T11:00:00Z' },
  { id: 'd0000005-0000-0000-0000-000000000005', username: 'sunil_bandara', email: 'sunil.bandara@example.lk', role: 'Farmer', createdAt: '2026-03-03T07:45:00Z', updatedAt: '2026-03-03T07:45:00Z' },
  { id: 'd0000006-0000-0000-0000-000000000006', username: 'ruwan_fernando', email: 'ruwan.fernando@example.lk', role: 'Admin', createdAt: '2026-01-20T13:30:00Z', updatedAt: '2026-07-02T13:30:00Z' },
  { id: 'd0000007-0000-0000-0000-000000000007', username: 'anushka_jaya', email: 'anushka.jaya@example.lk', role: 'Farmer', createdAt: '2026-03-22T10:10:00Z', updatedAt: '2026-06-28T10:10:00Z' },
  { id: 'd0000008-0000-0000-0000-000000000008', username: 'thilaka_mendis', email: 'thilaka.mendis@example.lk', role: 'Farmer', createdAt: '2026-04-05T08:05:00Z', updatedAt: '2026-04-05T08:05:00Z' },
  { id: 'd0000009-0000-0000-0000-000000000009', username: 'pradeep_kumar', email: 'pradeep.kumar@example.lk', role: 'Farmer', createdAt: '2026-04-19T14:50:00Z', updatedAt: '2026-06-01T14:50:00Z' },
  { id: 'd0000010-0000-0000-0000-000000000010', username: 'ishara_wick', email: 'ishara.wickramasinghe@example.lk', role: 'Farmer', createdAt: '2026-05-02T09:00:00Z', updatedAt: '2026-05-02T09:00:00Z' },
  { id: 'd0000011-0000-0000-0000-000000000011', username: 'malani_rathnayake', email: 'malani.rathnayake@example.lk', role: 'Farmer', createdAt: '2026-05-16T12:15:00Z', updatedAt: '2026-07-05T12:15:00Z' },
  { id: 'd0000012-0000-0000-0000-000000000012', username: 'chandana_gunawardena', email: 'chandana.g@example.lk', role: 'Farmer', createdAt: '2026-06-04T07:30:00Z', updatedAt: '2026-06-04T07:30:00Z' },
  { id: 'd0000013-0000-0000-0000-000000000013', username: 'dilani_seneviratne', email: 'dilani.seneviratne@example.lk', role: 'Farmer', createdAt: '2026-06-25T15:40:00Z', updatedAt: '2026-07-08T15:40:00Z' },
];

// ---------------------------------------------------------------------------
// ADM-5 festival calendar (PROVISIONAL). One row per occurrence-year — movable
// festivals (Avurudu/Vesak/Thai Pongal/Deepavali) repeat annually with dates that
// shift, so 2025 and 2026 are SEPARATE rows. 2026 poya/movable dates are marked
// isProvisional until officially gazetted. This table feeds the forecasting model.
// DEMO data behind the fixtures flag; dates are plausible, not the official gazette.
// ---------------------------------------------------------------------------
export const fxFestivals: FestivalEntry[] = [
  { id: 'f0000001-0000-0000-0000-000000000001', festivalKey: 'THAI_PONGAL', date: '2025-01-14', leadUpDays: 10, isProvisional: false, source: 'Public holidays gazette 2025', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000002-0000-0000-0000-000000000002', festivalKey: 'AVURUDU', date: '2025-04-14', leadUpDays: 21, isProvisional: false, source: 'Public holidays gazette 2025', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000003-0000-0000-0000-000000000003', festivalKey: 'VESAK', date: '2025-05-12', leadUpDays: 14, isProvisional: false, source: 'Public holidays gazette 2025', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000004-0000-0000-0000-000000000004', festivalKey: 'DEEPAVALI', date: '2025-10-20', leadUpDays: 14, isProvisional: false, source: 'Public holidays gazette 2025', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000005-0000-0000-0000-000000000005', festivalKey: 'CHRISTMAS', date: '2025-12-25', leadUpDays: 21, isProvisional: false, source: 'Fixed date', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000006-0000-0000-0000-000000000006', festivalKey: 'THAI_PONGAL', date: '2026-01-14', leadUpDays: 10, isProvisional: false, source: 'Public holidays gazette 2026', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000007-0000-0000-0000-000000000007', festivalKey: 'AVURUDU', date: '2026-04-14', leadUpDays: 21, isProvisional: false, source: 'Public holidays gazette 2026', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000008-0000-0000-0000-000000000008', festivalKey: 'VESAK', date: '2026-05-01', leadUpDays: 14, isProvisional: true, source: 'Provisional poya estimate', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000009-0000-0000-0000-000000000009', festivalKey: 'DEEPAVALI', date: '2026-11-08', leadUpDays: 14, isProvisional: true, source: 'Provisional estimate', createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'f0000010-0000-0000-0000-000000000010', festivalKey: 'CHRISTMAS', date: '2026-12-25', leadUpDays: 21, isProvisional: false, source: 'Fixed date', createdAtUtc: '2026-07-01T00:00:00Z' },
];

// ---------------------------------------------------------------------------
// ADM-6 indicators (PROVISIONAL). Two series kinds:
//  • daily USD_LKR — ~90 days ending at the price anchor, deterministic wave in the
//    ~295–310 range (plausible 2026 level). NOT a real FX feed.
//  • monthly CCPI (vintage-aware) — 12 months, each with a referenceDate (month end)
//    AND a publishedAt ~3 weeks later (real release lag). Both dates always shown.
// ---------------------------------------------------------------------------
const USD_LKR_DAYS = 90;
function genUsdLkr(): DailyIndicatorPoint[] {
  const out: DailyIndicatorPoint[] = [];
  for (let d = 0; d < USD_LKR_DAYS; d++) {
    const t = d / (USD_LKR_DAYS - 1);
    const wave = Math.sin(t * Math.PI * 3) * 4 + Math.sin(t * Math.PI * 7) * 1.5;
    const drift = t * 6; // gentle depreciation over the window
    const value = Math.round((299 + drift + wave + seededJitter('USD_LKR', d) * 30) * 100) / 100;
    const date = addDays(PRICE_ANCHOR, -(USD_LKR_DAYS - 1 - d)) ?? PRICE_ANCHOR;
    out.push({ date, indicatorCode: 'USD_LKR', value, source: 'CBSL (demo)' });
  }
  return out;
}
export const fxUsdLkr: DailyIndicatorPoint[] = genUsdLkr();

const CCPI_MONTH_ENDS = [
  '2025-07-31', '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31',
  '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
] as const;
export const fxCcpi: MacroSeriesPoint[] = CCPI_MONTH_ENDS.map((refEnd, i) => ({
  seriesKey: 'CCPI_BASE2021',
  referenceDate: refEnd,
  // release ~3 weeks after the month end (real DCS/CBSL publication lag)
  publishedAt: addDays(refEnd, 21) ?? refEnd,
  value: Math.round((196 + i * 0.8 + Math.sin(i / 2) * 0.6) * 10) / 10,
  source: 'DCS / CBSL (demo)',
}));

// Ready-made headline YoY inflation (%) — the series the gauge now reads directly
// (no client-side MoM derivation). Plausible 2025-26 trajectory drifting up out of the
// "mild" band into "elevated". The LATEST month carries TWO vintages of the SAME
// referenceDate — a provisional 8.1% then a revised 8.3% — so the page's multi-vintage
// handling (latest publishedAt wins, superseded row surfaced) is demo-able with no backend.
const CCPI_YOY_VALUES = [2.1, 2.4, 2.8, 3.3, 3.9, 4.5, 5.2, 5.8, 6.4, 7.1, 7.8, 8.3] as const;
export const fxCcpiYoy: MacroSeriesPoint[] = CCPI_MONTH_ENDS.flatMap((refEnd, i) => {
  const publishedAt = addDays(refEnd, 21) ?? refEnd;
  const base: MacroSeriesPoint = {
    seriesKey: 'CCPI_HEADLINE_YOY_BASE2021',
    referenceDate: refEnd,
    publishedAt,
    value: CCPI_YOY_VALUES[i],
    source: 'DCS / CBSL (demo)',
  };
  if (i < CCPI_MONTH_ENDS.length - 1) return [base];
  // Latest month: earlier provisional vintage + a later revised vintage (revision wins).
  const provisional: MacroSeriesPoint = {
    ...base,
    publishedAt: addDays(refEnd, 14) ?? refEnd,
    value: 8.1,
  };
  return [provisional, base];
});

export const fxIndicatorCatalogRows: SeriesCatalogEntry[] = [
  { key: 'USD_LKR', kind: 'indicator', latestDate: PRICE_ANCHOR, count: fxUsdLkr.length },
  { key: 'CCPI_BASE2021', kind: 'macro', latestDate: '2026-06-30', count: fxCcpi.length },
  { key: 'CCPI_HEADLINE_YOY_BASE2021', kind: 'macro', latestDate: '2026-06-30', count: fxCcpiYoy.length },
];

export function fxIndicatorCatalog(): SeriesCatalogEntry[] {
  return fxIndicatorCatalogRows.map((r) => ({ ...r }));
}
export function fxIndicatorDaily(code: string): DailyIndicatorPoint[] {
  return code === 'USD_LKR' ? fxUsdLkr : [];
}
export function fxIndicatorMacro(seriesKey: string): MacroSeriesPoint[] {
  if (seriesKey === 'CCPI_BASE2021') return fxCcpi;
  if (seriesKey === 'CCPI_HEADLINE_YOY_BASE2021') return fxCcpiYoy;
  return [];
}

// ---------------------------------------------------------------------------
// ADM-7 structured news events (PROVISIONAL). 7 realistic events spanning fuel,
// fertiliser, budget, import duty, export, weather. eventType reuses PolicyType and
// direction reuses PolicyDirection (Bearish = -1). affectedCropIds reference fxCrops.
// Mutations in the page operate on a COPY in component state; this seed is untouched.
// ---------------------------------------------------------------------------
export const fxNewsEvents: NewsEvent[] = [
  { id: 'e0000001-0000-0000-0000-000000000001', eventType: PolicyType.FuelPriceChange, direction: PolicyDirection.Bullish, title: 'Diesel price raised by Rs. 25/litre', description: 'CPC monthly revision lifted auto-diesel; transport costs from farm to wholesale expected to rise.', publishedAt: '2026-07-01', sourceUrl: 'https://ceypetco.gov.lk/', affectedCropIds: [], createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'e0000002-0000-0000-0000-000000000002', eventType: PolicyType.FertiliserSubsidy, direction: PolicyDirection.Bearish, title: 'Second fertiliser subsidy tranche released', description: 'Ministry released the 2026 Yala fertiliser cash tranche to registered paddy and vegetable farmers.', publishedAt: '2026-06-12', sourceUrl: null, affectedCropIds: ['c0000002-0000-0000-0000-000000000002', 'c0000003-0000-0000-0000-000000000003'], createdAtUtc: '2026-06-12T00:00:00Z' },
  { id: 'e0000003-0000-0000-0000-000000000003', eventType: PolicyType.Budget, direction: PolicyDirection.Neutral, title: 'Mid-year budget review — no major agri change', description: 'Interim fiscal review kept existing agriculture allocations broadly unchanged.', publishedAt: '2026-05-28', sourceUrl: 'https://www.treasury.gov.lk/', affectedCropIds: [], createdAtUtc: '2026-05-28T00:00:00Z' },
  { id: 'e0000004-0000-0000-0000-000000000004', eventType: PolicyType.ImportBan, direction: PolicyDirection.Bullish, title: 'Import duty raised on big onions', description: 'A higher special commodity levy on imported big onions to protect local growers ahead of harvest.', publishedAt: '2026-05-10', sourceUrl: null, affectedCropIds: [], createdAtUtc: '2026-05-10T00:00:00Z' },
  { id: 'e0000005-0000-0000-0000-000000000005', eventType: PolicyType.ExportBan, direction: PolicyDirection.Bearish, title: 'Temporary green chilli export pause', description: 'Short export pause on green chilli to ease a domestic supply squeeze.', publishedAt: '2026-04-22', sourceUrl: null, affectedCropIds: ['c0000005-0000-0000-0000-000000000005'], createdAtUtc: '2026-04-22T00:00:00Z' },
  { id: 'e0000006-0000-0000-0000-000000000006', eventType: PolicyType.Other, direction: PolicyDirection.Bullish, title: 'Heavy monsoon rains in Nuwara Eliya district', description: 'Prolonged rain damaged up-country vegetable crops; short-term supply tightening expected.', publishedAt: '2026-04-05', sourceUrl: null, affectedCropIds: ['c0000006-0000-0000-0000-000000000006', 'c0000007-0000-0000-0000-000000000007'], createdAtUtc: '2026-04-05T00:00:00Z' },
  { id: 'e0000007-0000-0000-0000-000000000007', eventType: PolicyType.PriceCeiling, direction: PolicyDirection.Bearish, title: 'Retail price cap reintroduced on selected vegetables', description: 'CAA set maximum retail prices on a few staple vegetables during a festival demand spike.', publishedAt: '2026-03-30', sourceUrl: null, affectedCropIds: ['c0000003-0000-0000-0000-000000000003'], createdAtUtc: '2026-03-30T00:00:00Z' },
];
