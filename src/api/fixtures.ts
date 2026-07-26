// FIXTURE DATA — served instead of the API when VITE_API_MODE=fixtures.
// Demo values behind an env flag: illustrative, NOT real HARTI data, and never shown
// in production (VITE_API_MODE unset = live API).
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
  type CropReadiness,
  type CropTimeline,
  type DailyIndicatorPoint,
  type FestivalEntry,
  type HarvestForecast,
  type HarvestWindow,
  type IngestionRun,
  type IngestionRunPage,
  type IngestionStatus,
  type TrainingRun,
  type TrainingRunPage,
  type UserActivityEvent,
  type UserActivityPage,
  type MacroSeriesPoint,
  type Market,
  type MarketLatestPrice,
  type MarketMover,
  type MarketOverview,
  type NewsArticle,
  type NewsEvent,
  type PolicyFlag,
  type PriceHistoryPoint,
  type SeriesCatalogEntry,
  type SystemError,
  type SystemErrorPage,
} from './types';

// nameSi/nameTa below are DRAFT translations for dev and search only — pending native
// review, not final agronomy copy. TODO native review.
// category.code follows the CropCategories contract: VEG (Vegetable) / FRT (Fruit).
// growthDays are typical dev values, not authoritative agronomy.
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

// Per-crop reference price (Rs/kg wholesale) — the single source of truth for the
// generated fixtures. Timeline, harvest, price history, overview and compare all derive
// from this one table, so they agree per crop and differ across crops.
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
  // Structured factors. Weights follow the real contract (serving/explain.py): each
  // weight is that code's SHARE (0..1) of total absolute attribution, so the top 4 sum
  // to <= 1. A `neutral` direction is only emitted below a 1% share, so a neutral factor
  // must carry a near-zero weight. This set spans up/down/neutral and strong/medium/
  // small so the whole panel is demoable from one crop.
  topFactors: [
    { code: 'recent_price_trend', direction: 'up', weight: 0.44 }, // strong
    { code: 'festival_demand', direction: 'up', weight: 0.24 }, // medium
    { code: 'seasonal_supply', direction: 'down', weight: 0.14 }, // small
    { code: 'weather_monsoon', direction: 'neutral', weight: 0.01 }, // small / no push
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
  // Two factors — a shorter structured list on a Medium-tier crop, and the only
  // fixture exercising the market/economic codes (and a `down` economic row).
  topFactors: [
    { code: 'market_conditions', direction: 'up', weight: 0.38 }, // strong
    { code: 'economic_conditions', direction: 'down', weight: 0.22 }, // medium
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

// Per-crop forecast resolver for fixture mode. The three hand-authored tier fixtures
// (Capsicum=High, Beans=Medium, Passion=Low) keep their pinned values; every other crop
// is generated from CROP_REFERENCE. plantDate is echoed back and harvestDate is derived
// from it + growthPeriodDays, matching the server.
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

// Deterministic per-crop generator: from a crop's reference price and a stable shape
// (amplitude / phase / trend seeded from the crop id) it synthesises a 12-month history
// and a 3-point forecast that is distinct per crop and stable across runs (no Date.now,
// no unseeded Math.random).
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
/**
 * The drift is derived from the crop's DECLARED trend in fxBestCrops so two screens
 * cannot contradict each other (Cabbage was labelled Falling while its generated series
 * drifted up). It is also what makes the below-today state on the best-window panel
 * reachable in demo mode.
 */
function cropFalls(cropId: string): boolean {
  return fxBestCrops.find((b) => b.cropId === cropId)?.trend === PriceTrend.Down;
}

function cropShape(cropId: string): CropShape {
  const h = hashStr(cropId);
  const trend = -0.05 + (((h >>> 15) % 100) / 100) * 0.16; // -0.05–0.11
  return {
    amp: 0.05 + ((h % 100) / 100) * 0.12, // 0.05–0.17
    phase: (((h >>> 7) % 360) * Math.PI) / 180, // 0–2π
    // A crop the demo calls Falling falls: same magnitude, sign forced down.
    trend: cropFalls(cropId) ? -Math.abs(trend) - 0.05 : trend,
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
    // Shares of total attribution (see fxHarvestForecast for the contract note);
    // the neutral row stays under 1%, as the real explainer emits it.
    topFactors: [
      { code: 'recent_price_trend', direction: shape.trend >= 0 ? 'up' : 'down', weight: 0.46 },
      { code: 'seasonal_supply', direction: shape.trend >= 0 ? 'down' : 'up', weight: 0.31 },
      { code: 'weather_monsoon', direction: shape.trend >= 0 ? 'up' : 'down', weight: 0.16 },
      { code: 'economic_conditions', direction: 'neutral', weight: 0.007 },
    ],
  };
}

// THE PLANT-DATE INVARIANT. Live, /predict and /harvest-window build the SAME what-if
// row from the same anchor for a planting date (pinned by TestForecastAgreement), so the
// fixture forecast READS ITS NUMBERS FROM THE WINDOW. Dates outside the sweep
// (back-dated, or a crop the window cannot rank) have nothing to agree with, so they
// keep the hand-authored / generated tier fixture.
const FX_FORECAST_SWEEP = 90; // ≥ the 60 days the planting-date field allows

/** The window's own row for one planting date, or null if it does not rank it. */
function fxWindowRowFor(cropId: string, plantDate: string) {
  // Anchored at TODAY, exactly as MyHarvestPage requests the strip, so the point
  // the farmer tapped and the forecast they get back are the same row.
  const w = fxHarvestWindowFor(cropId, FX_FORECAST_SWEEP, ymdLocal(new Date()));
  if (!w.rankable) return null;
  const point = w.points.find((p) => p.plantDate === plantDate);
  // growthPeriodDays travels WITH the point: a payload whose harvestDate is not
  // plantDate + growthPeriodDays would be a lie the share text repeats.
  return point ? { point, growthPeriodDays: w.growthPeriodDays } : null;
}

/**
 * Mirrors the .NET verdict rule (GetHarvestForecastQueryHandler) so a fixture cannot
 * show a price that moved with the date beside a verdict that did not. The −5% deadband
 * between "below today" and "Not recommended" is what the panel's loss warning covers.
 */
function fxVerdictFor(
  currentPrice: number,
  p: { predictedPrice: number; lowerBound: number; upperBound: number },
  lowTrust: boolean,
) {
  const upside = (p.predictedPrice - currentPrice) / currentPrice;
  const width = (p.upperBound - p.lowerBound) / p.predictedPrice;
  let ceiling = lowTrust ? RecommendationLevel.Recommended : RecommendationLevel.StronglyRecommended;
  if (width > 0.6) ceiling = Math.min(ceiling, RecommendationLevel.RecommendedWithRisk);

  let raw: RecommendationLevel;
  let reason: string;
  if (upside < -0.05) {
    raw = RecommendationLevel.NotRecommended;
    reason = "Forecast below today's price - consider another crop.";
  } else if (upside < 0.08) {
    raw = RecommendationLevel.RecommendedWithRisk;
    reason = 'Roughly flat versus today - limited upside.';
  } else if (upside < 0.2) {
    raw = width <= 0.3 ? RecommendationLevel.Recommended : RecommendationLevel.RecommendedWithRisk;
    reason =
      width <= 0.3
        ? "Harvest price forecast above today's - favorable."
        : 'Higher harvest price likely, but the forecast is uncertain.';
  } else {
    raw =
      width <= 0.3
        ? RecommendationLevel.StronglyRecommended
        : width <= 0.6
          ? RecommendationLevel.Recommended
          : RecommendationLevel.RecommendedWithRisk;
    reason =
      width <= 0.3
        ? 'Strong harvest-price upside with a tight forecast - a good bet.'
        : 'Large potential upside, but the forecast is wide - some risk.';
  }
  return {
    recommendationLevel: Math.min(raw, ceiling) as RecommendationLevel,
    reason,
    upsidePct: Math.round(upside * 100),
    intervalWidthPct: Math.round(width * 100),
  };
}

export function fxForecastFor(cropId: string, plantDate: string): HarvestForecast {
  const tier = fxHarvestByCrop[cropId];
  const base: HarvestForecast = tier
    ? {
        ...tier,
        cropId,
        plantDate,
        harvestDate: addDays(plantDate, tier.growthPeriodDays) ?? tier.harvestDate,
      }
    : genHarvest(cropId, plantDate); // distinct per-crop synthetic forecast

  const row = fxWindowRowFor(cropId, plantDate);
  if (!row) return base;

  return {
    ...base,
    // Same row as the bar the farmer tapped — never a second opinion.
    predictedPrice: row.point.predictedPrice,
    lowerBound: row.point.lowerBound,
    upperBound: row.point.upperBound,
    harvestDate: row.point.harvestDate,
    growthPeriodDays: row.growthPeriodDays ?? base.growthPeriodDays,
    ...fxVerdictFor(base.currentPrice, row.point, base.lowTrust),
  };
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

// LOW tier / fallback (Passion Fruit): deliberately THIN history (4 months) plus a wide
// amber band, so the low-trust treatment is demoable. We never fabricate months.
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
// chart's confidence story lines up with the harvest hero for the same crop.
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

// Full-spectrum ranked list so every honest state is exercised: High rows, Medium rows,
// a Low-confidence "Little data" row and one "Not recommended" (the only place red is
// allowed). Crop ids match fxCrops so the ?crop=<id> cross-link works. seasonFit is
// provisional demo data on two rows; the live route omits it and the badge must degrade
// silently. Ranked high to low by design.
export const fxBestCrops: BestCrop[] = [
  { cropId: 'c0000001-0000-0000-0000-000000000001', cropName: 'Capsicum', cropCode: 'VEG000012', averagePrice: 552, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.StronglyRecommended, seasonFit: { inSeason: true, season: 'Yala' } },
  { cropId: 'c0000005-0000-0000-0000-000000000005', cropName: 'Green Chilli', cropCode: 'VEG000018', averagePrice: 430, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.Recommended },
  { cropId: 'c0000003-0000-0000-0000-000000000003', cropName: 'Tomato', cropCode: 'VEG000003', averagePrice: 360, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.Medium, recommendationLevel: RecommendationLevel.Recommended },
  { cropId: 'c0000002-0000-0000-0000-000000000002', cropName: 'Beans', cropCode: 'VEG000007', averagePrice: 310, trend: PriceTrend.Stable, confidence: ForecastConfidenceCode.Medium, recommendationLevel: RecommendationLevel.Recommended, seasonFit: { inSeason: true, season: 'Yala' } },
  { cropId: 'c0000006-0000-0000-0000-000000000006', cropName: 'Carrot', cropCode: 'VEG000021', averagePrice: 280, trend: PriceTrend.Stable, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.Recommended },
  { cropId: 'c0000004-0000-0000-0000-000000000004', cropName: 'Passion Fruit', cropCode: 'FRT000019', averagePrice: 240, trend: PriceTrend.Down, confidence: ForecastConfidenceCode.Low, recommendationLevel: RecommendationLevel.RecommendedWithRisk },
  { cropId: 'c0000007-0000-0000-0000-000000000007', cropName: 'Cabbage', cropCode: 'VEG000022', averagePrice: 95, trend: PriceTrend.Down, confidence: ForecastConfidenceCode.Medium, recommendationLevel: RecommendationLevel.NotRecommended },
];

// Crop readiness. The mix mirrors live reality: long-history DEC vegetables are ready,
// the HARTI fruits and two newer vegetables are still collecting.
export const fxCropReadiness: CropReadiness = {
  modelVersion: 'v17-fixture',
  minHistoryObs: 365,
  modelActive: true,
  crops: [
    { cropId: 'c0000001-0000-0000-0000-000000000001', ready: true, nObs: 980 }, // Capsicum
    { cropId: 'c0000002-0000-0000-0000-000000000002', ready: true, nObs: 940 }, // Beans
    { cropId: 'c0000003-0000-0000-0000-000000000003', ready: true, nObs: 955 }, // Tomato
    { cropId: 'c0000005-0000-0000-0000-000000000005', ready: true, nObs: 910 }, // Green Chilli
    { cropId: 'c0000006-0000-0000-0000-000000000006', ready: true, nObs: 890 }, // Carrot
    { cropId: 'c0000007-0000-0000-0000-000000000007', ready: true, nObs: 870 }, // Cabbage
    { cropId: 'c0000008-0000-0000-0000-000000000008', ready: true, nObs: 860 }, // Brinjal
    { cropId: 'c0000009-0000-0000-0000-000000000009', ready: false, nObs: 210 }, // Pumpkin
    { cropId: 'c0000010-0000-0000-0000-000000000010', ready: false, nObs: 150 }, // Leeks
    { cropId: 'c0000011-0000-0000-0000-000000000011', ready: true, nObs: 905 }, // Beetroot
    { cropId: 'c0000004-0000-0000-0000-000000000004', ready: false, nObs: 120 }, // Passion Fruit
    { cropId: 'c0000012-0000-0000-0000-000000000012', ready: false, nObs: 95 }, // Banana
    // Papaya deliberately ABSENT: exercises the brand-new-crop path (absence
    // with an active model renders exactly like ready=false).
  ],
};

// Best harvest window demo sweep. Mirrors both live outcomes: a model-served crop (ready
// in fxCropReadiness) gets a real-shaped curve and a best window picked the way the
// server picks it (highest rolling mean); a crop the model does not serve gets
// rankable=false / crop_not_model_served. The readiness split is reused deliberately, so
// the demo can never show a green crop tile with no window.
const FX_WINDOW_DAYS = 14;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function fxWindowPrice(anchor: number, dayIndex: number, falling: boolean): number {
  // Seasonal cycle + a demand bump centred ~7 weeks out, so the recommended
  // window sits mid-strip rather than at an edge (the interesting demo case).
  const seasonal = Math.sin((2 * Math.PI * dayIndex) / 180) * anchor * 0.09;
  const bump = Math.exp(-(((dayIndex - 48) / 13) ** 2)) * anchor * 0.14;
  // Both terms are non-negative across the 0–90 day sweep, so a rising crop's strip sits
  // at or above its anchor. A falling crop gets the mirror image, which makes its best
  // window the least-bad date rather than a gain.
  return falling ? anchor - seasonal - bump : anchor + seasonal + bump;
}

// horizonDays MUST be honoured, not hardcoded: the caller keeps the sweep length equal
// to the planting-date field's max, otherwise the demo offers dates the field silently
// clamps on tap.
export function fxHarvestWindowFor(cropId: string, horizonDays = 90, asOf?: string): HarvestWindow {
  const crop = fxCrops.find((c) => c.id === cropId);
  const readiness = fxCropReadiness.crops.find((c) => c.cropId === cropId);
  // Today's price comes from fxTimelineFor (NOT genTimeline) — the same place the harvest
  // fixture takes it — so the window panel and the forecast screen cannot disagree about
  // what today costs. Three crops have hand-authored timelines.
  const currentPrice = round2(fxTimelineFor(cropId).history.slice(-1)[0].avgPrice);
  // Sweeps forward from the REQUESTED date (the caller passes today), not from the fixed
  // demo anchor: a forward-looking panel must not open on dates already past.
  const start = asOf ?? ymdLocal(new Date());

  // Not served by the model (or absent from the readiness map entirely) -> the
  // curve would be flat, so we refuse rather than invent a winner.
  if (!readiness?.ready) {
    return {
      cropId,
      cropName: crop?.name ?? null,
      asOf: start,
      growthPeriodDays: crop?.growthDays ?? null,
      rankable: false,
      reasonCode: 'crop_not_model_served',
      activePredictor: 'unavailable',
      confidence: 'Low',
      modelVersion: 'v17-fixture',
      explanation:
        'We are still collecting data for this crop. Until the model covers it, ' +
        'every date would return the same price — so we will not guess.',
      windowDays: null,
      currentPrice,
      points: [],
      best: null,
    };
  }

  const ref = cropReferencePrice(cropId);
  const growthDays = crop?.growthDays ?? 90;
  const falling = cropFalls(cropId);
  // A falling crop's sweep is anchored at the lower of its reference price and today's
  // price, carried forward by one growth period of its declared 12-month drift, because
  // the earliest harvest is a whole growth period away. Anchoring at today's price would
  // put the first bar exactly ON today (the mirrored shape is 0 at day 0), and the panel's
  // warning only fires when no date beats today, so it would never show.
  const anchor = falling
    ? Math.min(ref, currentPrice) * (1 + cropShape(cropId).trend * (growthDays / 365))
    : ref;
  const prices = Array.from({ length: horizonDays + 1 }, (_, i) => fxWindowPrice(anchor, i, falling));

  // Best window = highest rolling mean, exactly as the server computes it.
  let bestStart = 0;
  let bestMean = -Infinity;
  for (let i = 0; i + FX_WINDOW_DAYS <= prices.length; i++) {
    const mean = prices.slice(i, i + FX_WINDOW_DAYS).reduce((a, b) => a + b, 0) / FX_WINDOW_DAYS;
    if (mean > bestMean) {
      bestMean = mean;
      bestStart = i;
    }
  }
  const bestEnd = bestStart + FX_WINDOW_DAYS - 1;

  const points = prices.map((p, i) => ({
    plantDate: addDays(start, i) ?? start,
    harvestDate: addDays(start, i + growthDays) ?? start,
    predictedPrice: round2(p),
    lowerBound: round2(p * 0.74),
    upperBound: round2(p * 1.27),
    inBestWindow: i >= bestStart && i <= bestEnd,
  }));

  const baseline = prices.reduce((a, b) => a + b, 0) / prices.length;
  return {
    cropId,
    cropName: crop?.name ?? null,
    asOf: start,
    growthPeriodDays: growthDays,
    rankable: true,
    reasonCode: 'ml_served',
    activePredictor: 'residual',
    confidence: 'Medium',
    modelVersion: 'v17-fixture',
    explanation:
      'Compares planting dates using the season and festival demand around each ' +
      "harvest date. Today's prices and weather are held constant, so this ranks " +
      'TIMING — it is not a weather forecast.',
    windowDays: FX_WINDOW_DAYS,
    currentPrice,
    points,
    best: {
      plantStart: points[bestStart].plantDate,
      plantEnd: points[bestEnd].plantDate,
      harvestStart: points[bestStart].harvestDate,
      harvestEnd: points[bestEnd].harvestDate,
      predictedPrice: round2(bestMean),
      lowerBound: round2(bestMean * 0.74),
      upperBound: round2(bestMean * 1.27),
      upliftPct: Math.round(((bestMean - baseline) / baseline) * 1000) / 10,
    },
  };
}

export const fxMarkets: Market[] = [
  { id: 'm0000001-0000-0000-0000-000000000001', name: 'Dambulla Dedicated Economic Centre', district: 'Matale', marketType: 1, isEconomicCenter: true, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'm0000002-0000-0000-0000-000000000002', name: 'Colombo (Pettah)', district: 'Colombo', marketType: 1, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'm0000003-0000-0000-0000-000000000003', name: 'Kandy', district: 'Kandy', marketType: 1, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'm0000004-0000-0000-0000-000000000004', name: 'Meegoda', district: 'Colombo', marketType: 1, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
];

export const fxPriceHistory: PriceHistoryPoint[] = [
  { date: '2026-07-06', minPrice: 440, maxPrice: 500 },
  { date: '2026-07-07', minPrice: 450, maxPrice: 520 },
  { date: '2026-07-08', minPrice: 460, maxPrice: 540 },
  { date: '2026-07-09', minPrice: 455, maxPrice: 530 },
  { date: '2026-07-10', minPrice: 470, maxPrice: 552 },
];

// Per-market daily price history. Fixtures synthesise a plausible 14-day series per
// (crop, market): Dambulla (the economic centre) cheapest, Colombo (Pettah) dearest, and
// Meegoda deliberately THIN (3 days) so the "only N days" note is exercised. Demo values,
// deterministic so tests and the demo stay stable.
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

// Market overview fixtures. Values stay consistent with the rest: movers reuse the
// best-crops / forecast price levels and include both risers and fallers; latestPrices
// and their sparklines are derived from fxPriceHistoryFor so the strip agrees with the
// Prices page (Meegoda is thin, giving a 3-point sparse spark).
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

// The overview window selector (7 / 30 / 90 days) drives this, and fixtures VARY by
// window so the control visibly changes the snapshot. windowDays always echoes the
// requested `days` so the "based on the last N days" caption stays honest. asOf and
// latestPrices are stable (newest observed prices don't change with the window).
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

// ADMIN CONSOLE fixtures. Policy flags mirror the real .NET seed rows plus a few extra
// rows so the table exercises every PolicyType, both non-neutral directions and all
// three derived statuses. "Today" for the demo is ~2026-07-12.
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
  // Extra demo rows to exercise Budget / ExportBan / PriceFloor and the scheduled status.
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

// ADMIN markets registry — mirrors the real 12 seeded markets (GUIDs, names, districts,
// MarketType, IsEconomicCenter). Only Dambulla has IsEconomicCenter=true; several rows
// are MarketType.DEC yet not the economic centre (MarketType classifies the kind,
// IsEconomicCenter flags the single feature-reference DEC).
// The monitoring fields exercise every UI state, including the CBSL national-average row
// that stores nothing and never trains.
export const fxAdminMarkets: Market[] = [
  { id: 'b2a20001-0000-0000-0000-000000000001', name: 'Dambulla Dedicated Economic Centre', district: 'Matale', marketType: MarketType.DEC, isEconomicCenter: true, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000002', name: 'Keppetipola Dedicated Economic Centre', district: 'Badulla', marketType: MarketType.DEC, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000003', name: 'Thambuttegama Dedicated Economic Centre', district: 'Anuradhapura', marketType: MarketType.DEC, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000004', name: 'Pettah (HARTI wholesale)', district: 'Colombo', marketType: MarketType.Wholesale, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000005', name: 'Narahenpita (HARTI retail)', district: 'Colombo', marketType: MarketType.Retail, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000006', name: 'CBSL national average (pseudo-market)', district: null, marketType: MarketType.NationalAggregate, isEconomicCenter: false, hasStoredData: false, lastStoredDate: null, isTrainingSource: false },
  { id: 'b2a20001-0000-0000-0000-000000000007', name: 'Kandy (HARTI wholesale)', district: 'Kandy', marketType: MarketType.Wholesale, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000008', name: 'Meegoda Dedicated Economic Centre', district: 'Colombo', marketType: MarketType.DEC, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000009', name: 'Norochchole (HARTI wholesale)', district: 'Puttalam', marketType: MarketType.Wholesale, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-15', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000010', name: 'Nuwara Eliya Dedicated Economic Centre', district: 'Nuwara Eliya', marketType: MarketType.DEC, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000011', name: 'Bandarawela (HARTI wholesale)', district: 'Badulla', marketType: MarketType.Wholesale, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-22', isTrainingSource: true },
  { id: 'b2a20001-0000-0000-0000-000000000012', name: 'Veyangoda Dedicated Economic Centre', district: 'Gampaha', marketType: MarketType.DEC, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-23', isTrainingSource: true },
];

// Admin users: 13 demo accounts including `admin` (which simulates the admin role in
// fixtures login) and `claudetest`. The page mutates a copy; this seed is never mutated.
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

// Festival calendar: one row per occurrence-year, because movable festivals repeat
// annually on shifting dates. 2026 dates are marked isProvisional until gazetted.
// Plausible demo dates, not the official gazette.
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

// Indicators: daily USD_LKR (~90 days, deterministic wave) and monthly CCPI, which
// is vintage-aware — each month carries a referenceDate (month end) and a publishedAt
// ~3 weeks later (the real release lag). Both dates are always shown.
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

// Ready-made headline YoY inflation (%), the series the gauge reads directly. The LATEST
// month carries TWO vintages of the same referenceDate (provisional 8.1 then revised
// 8.3) so the page's multi-vintage handling is demoable with no backend.
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

// Structured news events: 7 demo events. eventType reuses PolicyType and direction
// reuses PolicyDirection (Bearish = -1); affectedCropIds reference fxCrops.
export const fxNewsEvents: NewsEvent[] = [
  { id: 'e0000001-0000-0000-0000-000000000001', eventType: PolicyType.FuelPriceChange, direction: PolicyDirection.Bullish, title: 'Diesel price raised by Rs. 25/litre', description: 'CPC monthly revision lifted auto-diesel; transport costs from farm to wholesale expected to rise.', publishedAt: '2026-07-01', sourceUrl: 'https://ceypetco.gov.lk/', affectedCropIds: [], affectedMarketIds: [], createdAtUtc: '2026-07-01T00:00:00Z' },
  { id: 'e0000002-0000-0000-0000-000000000002', eventType: PolicyType.FertiliserSubsidy, direction: PolicyDirection.Bearish, title: 'Second fertiliser subsidy tranche released', description: 'Ministry released the 2026 Yala fertiliser cash tranche to registered paddy and vegetable farmers.', publishedAt: '2026-06-12', sourceUrl: null, affectedCropIds: ['c0000002-0000-0000-0000-000000000002', 'c0000003-0000-0000-0000-000000000003'], affectedMarketIds: [], createdAtUtc: '2026-06-12T00:00:00Z' },
  { id: 'e0000003-0000-0000-0000-000000000003', eventType: PolicyType.Budget, direction: PolicyDirection.Neutral, title: 'Mid-year budget review — no major agri change', description: 'Interim fiscal review kept existing agriculture allocations broadly unchanged.', publishedAt: '2026-05-28', sourceUrl: 'https://www.treasury.gov.lk/', affectedCropIds: [], affectedMarketIds: [], createdAtUtc: '2026-05-28T00:00:00Z' },
  { id: 'e0000004-0000-0000-0000-000000000004', eventType: PolicyType.ImportBan, direction: PolicyDirection.Bullish, title: 'Import duty raised on big onions', description: 'A higher special commodity levy on imported big onions to protect local growers ahead of harvest.', publishedAt: '2026-05-10', sourceUrl: null, affectedCropIds: [], affectedMarketIds: [], createdAtUtc: '2026-05-10T00:00:00Z' },
  { id: 'e0000005-0000-0000-0000-000000000005', eventType: PolicyType.ExportBan, direction: PolicyDirection.Bearish, title: 'Temporary green chilli export pause', description: 'Short export pause on green chilli to ease a domestic supply squeeze.', publishedAt: '2026-04-22', sourceUrl: null, affectedCropIds: ['c0000005-0000-0000-0000-000000000005'], affectedMarketIds: [], createdAtUtc: '2026-04-22T00:00:00Z' },
  { id: 'e0000006-0000-0000-0000-000000000006', eventType: PolicyType.Other, direction: PolicyDirection.Bullish, title: 'Heavy monsoon rains in Nuwara Eliya district', description: 'Prolonged rain damaged up-country vegetable crops; short-term supply tightening expected.', publishedAt: '2026-04-05', sourceUrl: null, affectedCropIds: ['c0000006-0000-0000-0000-000000000006', 'c0000007-0000-0000-0000-000000000007'], affectedMarketIds: [], createdAtUtc: '2026-04-05T00:00:00Z' },
  { id: 'e0000007-0000-0000-0000-000000000007', eventType: PolicyType.PriceCeiling, direction: PolicyDirection.Bearish, title: 'Retail price cap reintroduced on selected vegetables', description: 'CAA set maximum retail prices on a few staple vegetables during a festival demand spike.', publishedAt: '2026-03-30', sourceUrl: null, affectedCropIds: ['c0000003-0000-0000-0000-000000000003'], affectedMarketIds: [], createdAtUtc: '2026-03-30T00:00:00Z' },
];

// Ingested news ARTICLES (the read-only feed). Mirrors the Python-owned capture table:
// naive-UTC timestamps (no Z), one row with a null publish date and an HTML entity in the
// title, so the decode and fallback paths render in demo mode. Newest first.
export const fxNewsArticles: NewsArticle[] = [
  // Supply-shock topic (flood) -> bullish regardless of tone.
  { url: 'https://example.lk/news/flood-damage', source: 'lbo', title: 'Floods damage vegetable fields in Ratnapura', summary: 'Heavy rain flooded low-lying vegetable plots; transport to economic centres disrupted.', publishedDateUtc: '2026-07-22T12:10:00', retrievedAtUtc: '2026-07-22T12:41:00', language: 'en', topics: 'flood', sentimentScore: -0.6 },
  // General news (scored, no topic) + HTML entity in the title -> neutral.
  { url: 'https://example.lk/news/exports-milestone', source: 'lbo', title: 'Sri Lanka&#8217;s exports cross US$ 9 bn in first half', summary: 'Export earnings kept a steady climb through June, led by apparel and agri produce.', publishedDateUtc: '2026-07-22T11:05:06', retrievedAtUtc: '2026-07-22T11:47:37', language: 'en', topics: '', sentimentScore: 0.4 },
  // Input topic (fertiliser) + positive tone -> bearish (supply easing).
  { url: 'https://example.lk/news/fertiliser-shipment', source: 'lbo', title: 'New fertiliser shipment cleared for Yala season', summary: 'A bulk urea consignment cleared customs and will reach distribution centres this week.', publishedDateUtc: '2026-07-21T07:30:00', retrievedAtUtc: '2026-07-21T08:41:42', language: 'en', topics: 'fertiliser', sentimentScore: 0.5 },
  // Null publish date (feed omitted it) + not yet scored -> date falls back, direction "—".
  { url: 'https://example.lk/news/monsoon-update', source: 'lbo', title: 'Monsoon rains ease across up-country growing areas', summary: 'Met Department reports rainfall easing over Nuwara Eliya and Badulla growing districts.', publishedDateUtc: null, retrievedAtUtc: '2026-07-20T08:41:42', language: 'en', topics: null, sentimentScore: null },
];

// Ingestion runs: one batch of 7 source runs, including a FAILED HARTI row (503) and a
// WARN verification on the DEC run with realistic checksJson. fxIngestionRuns() simulates
// the server's paging and source filter.
const FX_BATCH = 'b1000000-0000-0000-0000-000000000001';

// checksJson is a JSON STRING on the wire — stringify a realistic VerificationCheck[].
const FX_DEC_CHECKS = JSON.stringify([
  { name: 'dec_row_count', severity: 'PASS', message: '320 rows fetched for 2026-07-14 to 2026-07-20', counts: { rows: 320 } },
  { name: 'dec_distinct_crops', severity: 'PASS', message: '12 distinct crops observed (>= 8 expected)', counts: { crops: 12 } },
  { name: 'dec_insert_ratio', severity: 'PASS', message: '44 inserted / 276 already known — within the normal de-dup range', counts: { inserted: 44, skipped: 276 } },
  { name: 'dec_price_sanity', severity: 'WARN', message: '2 prices sit above the 99th-percentile guard — kept, but flagged for review', counts: { flagged: 2 } },
  { name: 'dec_freshness', severity: 'PASS', message: 'latest observed date 2026-07-20 is within the 2-day tolerance', counts: { lagDays: 1 } },
]);

export const fxIngestionRunsAll: IngestionRun[] = [
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    batchId: FX_BATCH,
    source: 'DAMBULLA_DEC',
    startedUtc: '2026-07-21T19:05:12Z',
    finishedUtc: '2026-07-21T19:07:48Z',
    status: 'succeeded',
    coveredFromDate: '2026-07-14',
    coveredToDate: '2026-07-20',
    rowsFetched: 320,
    rowsInserted: 44,
    rowsSkipped: 276,
    distinctCrops: 12,
    errorSummary: null,
    verification: {
      overallStatus: 'Warn',
      ranAtUtc: '2026-07-21T19:11:02Z',
      nChecksPass: 4,
      nChecksWarn: 1,
      nChecksFail: 0,
      checksJson: FX_DEC_CHECKS,
    },
  },
  {
    id: 'd1000000-0000-0000-0000-000000000002',
    batchId: FX_BATCH,
    source: 'WEATHER',
    startedUtc: '2026-07-21T19:04:40Z',
    finishedUtc: '2026-07-21T19:05:05Z',
    status: 'succeeded',
    coveredFromDate: '2026-07-20',
    coveredToDate: '2026-07-21',
    rowsFetched: 168,
    rowsInserted: 168,
    rowsSkipped: 0,
    distinctCrops: null,
    errorSummary: null,
    verification: null,
  },
  {
    id: 'd1000000-0000-0000-0000-000000000003',
    batchId: FX_BATCH,
    source: 'ECONOMIC',
    startedUtc: '2026-07-21T19:04:20Z',
    finishedUtc: '2026-07-21T19:04:33Z',
    status: 'succeeded',
    coveredFromDate: '2026-07-18',
    coveredToDate: '2026-07-21',
    rowsFetched: 4,
    rowsInserted: 3,
    rowsSkipped: 1,
    distinctCrops: null,
    errorSummary: null,
    verification: null,
  },
  {
    id: 'd1000000-0000-0000-0000-000000000004',
    batchId: FX_BATCH,
    source: 'NEWS',
    startedUtc: '2026-07-21T19:04:05Z',
    finishedUtc: '2026-07-21T19:04:09Z',
    status: 'skipped',
    coveredFromDate: null,
    coveredToDate: null,
    rowsFetched: 0,
    rowsInserted: 0,
    rowsSkipped: 0,
    distinctCrops: null,
    errorSummary: null,
    verification: null,
  },
  {
    id: 'd1000000-0000-0000-0000-000000000005',
    batchId: FX_BATCH,
    source: 'HARTI',
    startedUtc: '2026-07-21T19:03:30Z',
    finishedUtc: '2026-07-21T19:04:02Z',
    status: 'failed',
    coveredFromDate: null,
    coveredToDate: null,
    rowsFetched: null,
    rowsInserted: null,
    rowsSkipped: null,
    distinctCrops: null,
    errorSummary: 'Upstream HARTI weekly bulletin portal returned HTTP 503 after 3 retries — no rows ingested this run.',
    verification: null,
  },
  {
    id: 'd1000000-0000-0000-0000-000000000006',
    batchId: FX_BATCH,
    source: 'CBSL',
    startedUtc: '2026-07-21T19:03:10Z',
    finishedUtc: '2026-07-21T19:03:22Z',
    status: 'succeeded',
    coveredFromDate: '2026-07-18',
    coveredToDate: '2026-07-21',
    rowsFetched: 4,
    rowsInserted: 4,
    rowsSkipped: 0,
    distinctCrops: null,
    errorSummary: null,
    verification: null,
  },
  {
    id: 'd1000000-0000-0000-0000-000000000007',
    batchId: FX_BATCH,
    source: 'CBSL_MACRO',
    startedUtc: '2026-07-21T19:03:00Z',
    finishedUtc: '2026-07-21T19:03:04Z',
    status: 'skipped',
    coveredFromDate: null,
    coveredToDate: null,
    rowsFetched: 0,
    rowsInserted: 0,
    rowsSkipped: 0,
    distinctCrops: null,
    errorSummary: null,
    verification: null,
  },
];

/** Simulate the SERVER's paging + optional source filter (never client-sliced by the
 *  page — the page always trusts {items,page,pageSize,total}). */
export function fxIngestionRuns(page = 1, pageSize = 20, source?: string): IngestionRunPage {
  const filtered = source ? fxIngestionRunsAll.filter((r) => r.source === source) : fxIngestionRunsAll;
  const total = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  return { items: filtered.slice(start, start + pageSize), page, pageSize, total };
}

export const fxIngestionStatusObj: IngestionStatus = {
  state: 'stopped',
  serviceAddress: 'unconfigured',
  lastRunAtUtc: '2026-07-21T19:07:48Z',
  lastRunStatus: 'partial', // partial — HARTI failed while the other sources succeeded
  lastVerification: {
    overallStatus: 'Warn',
    ranAtUtc: '2026-07-21T19:11:02Z',
    pipelineDate: '2026-07-20',
    nChecksPass: 12,
    nChecksWarn: 1,
    nChecksFail: 0,
  },
  sources: [
    { source: 'DAMBULLA_DEC', status: 'ok', lastSuccessUtc: '2026-07-21T19:07:48Z', lastObservedDate: '2026-07-20', lastMessage: '44 new price rows inserted' },
    { source: 'WEATHER', status: 'ok', lastSuccessUtc: '2026-07-21T19:05:05Z', lastObservedDate: '2026-07-21', lastMessage: null },
    { source: 'ECONOMIC', status: 'ok', lastSuccessUtc: '2026-07-21T19:04:33Z', lastObservedDate: '2026-07-21', lastMessage: null },
    { source: 'NEWS', status: 'ok', lastSuccessUtc: '2026-07-20T19:04:00Z', lastObservedDate: '2026-07-19', lastMessage: 'No new items this run' },
    { source: 'HARTI', status: 'failed', lastSuccessUtc: '2026-07-18T19:04:11Z', lastObservedDate: '2026-07-17', lastMessage: 'Upstream portal returned HTTP 503 after 3 retries' },
    { source: 'CBSL', status: 'ok', lastSuccessUtc: '2026-07-21T19:03:22Z', lastObservedDate: '2026-07-21', lastMessage: null },
    { source: 'CBSL_MACRO', status: 'disabled', lastSuccessUtc: null, lastObservedDate: null, lastMessage: 'Monthly series — scheduled at month end' },
  ],
};

export function fxIngestionStatus(): IngestionStatus {
  return fxIngestionStatusObj;
}

// Model-training fixtures: 17 runs (v17..v1), newest first. v17 is the current live model
// AND a manual override (promoted=true, decisionPromoted=false) — the edge case the UI
// must surface honestly. Exactly one row has promoted=true.
export const fxTrainingRunsAll: TrainingRun[] = [
  {
    version: 'v17',
    trainedAtUtc: '2026-07-21T02:14:30Z',
    promoted: true,
    decisionPromoted: false,
    promotionDecision:
      'Hybrid scored MAE 97.92 on the new evaluation frame. The promotion guardrail ' +
      'blocked the candidate because the frame changed since the incumbent was scored ' +
      '(cross-frame comparison). Override applied per the v14 lesson: re-scored the ' +
      'incumbent on the new frame, confirmed the candidate wins, and promoted manually.',
    bestMlKind: 'hybrid',
    bestMlMae: 97.92,
    bestBaselineKind: 'crop_mean',
    bestBaselineMae: 118.4,
    nTrainRows: 84120,
    nCrops: 96,
  },
  {
    version: 'v16',
    trainedAtUtc: '2026-07-14T02:12:08Z',
    promoted: false,
    decisionPromoted: true,
    promotionDecision: 'Candidate beat the incumbent by 4.1% MAE on a shared frame — promoted by gate.',
    bestMlKind: 'residual',
    bestMlMae: 101.7,
    bestBaselineKind: 'crop_mean',
    bestBaselineMae: 119.2,
    nTrainRows: 82910,
    nCrops: 96,
  },
  {
    version: 'v15',
    trainedAtUtc: '2026-07-07T02:11:44Z',
    promoted: false,
    decisionPromoted: false,
    promotionDecision: 'Candidate MAE 106.3 did not beat the incumbent (102.9) — declined by gate.',
    bestMlKind: 'residual',
    bestMlMae: 106.3,
    bestBaselineKind: 'crop_mean',
    bestBaselineMae: 120.1,
    nTrainRows: 81640,
    nCrops: 95,
  },
  {
    version: 'v14',
    trainedAtUtc: '2026-06-30T02:10:55Z',
    promoted: false,
    decisionPromoted: true,
    promotionDecision: 'Promoted by gate after re-scoring the incumbent on the changed frame.',
    bestMlKind: 'residual',
    bestMlMae: 102.9,
    bestBaselineKind: 'crop_mean',
    bestBaselineMae: 121.0,
    nTrainRows: 80510,
    nCrops: 95,
  },
  ...Array.from({ length: 13 }, (_, i): TrainingRun => {
    const n = 13 - i; // v13 .. v1
    const week = String(13 - i).padStart(2, '0');
    const decision = n % 3 === 0; // a few historical gate promotions
    const mlMae = 108 + i * 1.7;
    return {
      version: `v${n}`,
      trainedAtUtc: `2026-${n >= 10 ? '06' : n >= 5 ? '05' : '04'}-${week}T02:09:00Z`,
      promoted: false,
      decisionPromoted: decision,
      promotionDecision: decision
        ? 'Promoted by gate — beat the incumbent on a shared frame.'
        : 'Declined by gate — did not beat the incumbent.',
      bestMlKind: n % 2 === 0 ? 'residual' : 'model',
      bestMlMae: Number(mlMae.toFixed(2)),
      bestBaselineKind: 'crop_mean',
      bestBaselineMae: Number((122 + i * 0.9).toFixed(2)),
      nTrainRows: 60000 + n * 1500,
      nCrops: 90 + (n % 6),
    };
  }),
];

/** Simulate the SERVER's paging (never client-sliced by the page — the page always
 *  trusts {items,page,pageSize,total}). */
export function fxTrainingRuns(page = 1, pageSize = 25): TrainingRunPage {
  const total = fxTrainingRunsAll.length;
  const start = Math.max(0, (page - 1) * pageSize);
  return { items: fxTrainingRunsAll.slice(start, start + pageSize), page, pageSize, total };
}

// System log fixtures: every event type across all three groups, newest first, including
// a loginFailed row carrying usernameAttempted (an unverified attempt with no actor).
const FX_ADMIN_ID = 'a1111111-1111-4111-8111-111111111111';
const FX_FARMER_A = 'f2222222-2222-4222-8222-222222222222';
const FX_FARMER_B = 'f3333333-3333-4333-8333-333333333333';

export const fxUserActivityAll: UserActivityEvent[] = [
  { occurredUtc: '2026-07-21T10:15:33Z', eventType: 'festivalChanged', actorUserId: FX_ADMIN_ID, targetUserId: null, usernameAttempted: null, details: "Created 'Vesak festival 2027'." },
  { occurredUtc: '2026-07-21T09:58:07Z', eventType: 'policyFlagChanged', actorUserId: FX_ADMIN_ID, targetUserId: null, usernameAttempted: null, details: 'Added a fertiliser subsidy flag starting 2026-08-01.' },
  { occurredUtc: '2026-07-21T08:42:11Z', eventType: 'loginFailed', actorUserId: null, targetUserId: null, usernameAttempted: 'admin', details: 'Invalid username or password.' },
  { occurredUtc: '2026-07-21T08:41:52Z', eventType: 'loginSucceeded', actorUserId: FX_ADMIN_ID, targetUserId: null, usernameAttempted: null, details: null },
  { occurredUtc: '2026-07-21T07:30:04Z', eventType: 'roleChanged', actorUserId: FX_ADMIN_ID, targetUserId: FX_FARMER_A, usernameAttempted: null, details: 'Role changed Farmer → Admin.' },
  { occurredUtc: '2026-07-20T19:05:33Z', eventType: 'userRegistered', actorUserId: FX_FARMER_B, targetUserId: FX_FARMER_B, usernameAttempted: null, details: 'Self-registration (role Farmer).' },
  { occurredUtc: '2026-07-20T16:22:48Z', eventType: 'newsEventChanged', actorUserId: FX_ADMIN_ID, targetUserId: null, usernameAttempted: null, details: "Linked an article to 'Big Onion'." },
  { occurredUtc: '2026-07-20T14:19:02Z', eventType: 'loginSucceeded', actorUserId: FX_FARMER_A, targetUserId: null, usernameAttempted: null, details: null },
  { occurredUtc: '2026-07-20T14:18:47Z', eventType: 'loginFailed', actorUserId: null, targetUserId: null, usernameAttempted: 'kumara.p', details: 'Invalid username or password.' },
  { occurredUtc: '2026-07-19T21:47:15Z', eventType: 'userDeleted', actorUserId: FX_ADMIN_ID, targetUserId: FX_FARMER_B, usernameAttempted: null, details: 'Removed a duplicate test account.' },
  { occurredUtc: '2026-07-19T15:41:26Z', eventType: 'cropChanged', actorUserId: FX_ADMIN_ID, targetUserId: null, usernameAttempted: null, details: "Changed growth days for 'Carrot' (VEG000021) to 90." },
  { occurredUtc: '2026-07-19T09:12:00Z', eventType: 'loginSucceeded', actorUserId: FX_ADMIN_ID, targetUserId: null, usernameAttempted: null, details: null },
  { occurredUtc: '2026-07-18T16:03:29Z', eventType: 'loginFailed', actorUserId: null, targetUserId: null, usernameAttempted: 'nimal', details: 'Invalid username or password.' },
  { occurredUtc: '2026-07-18T08:55:41Z', eventType: 'userRegistered', actorUserId: FX_FARMER_A, targetUserId: FX_FARMER_A, usernameAttempted: null, details: 'Self-registration (role Farmer).' },
  { occurredUtc: '2026-07-17T11:22:10Z', eventType: 'loginSucceeded', actorUserId: FX_FARMER_A, targetUserId: null, usernameAttempted: null, details: null },
  { occurredUtc: '2026-07-16T13:40:58Z', eventType: 'roleChanged', actorUserId: FX_ADMIN_ID, targetUserId: FX_FARMER_A, usernameAttempted: null, details: 'Role changed Admin → Farmer.' },
  { occurredUtc: '2026-07-16T09:27:12Z', eventType: 'marketChanged', actorUserId: FX_ADMIN_ID, targetUserId: null, usernameAttempted: null, details: "Turned on monitoring for 'Dambulla' (MKT00000001)." },
];

/** Simulate the SERVER's paging + optional filter (never client-sliced by the page).
 *  Mirrors the wire semantics exactly: `type` is one exact wire string and WINS over
 *  `types`, which is an OR-set (the System log group filter); neither = everything. */
export function fxUserActivity(
  page = 1,
  pageSize = 25,
  filter: { type?: string; types?: readonly string[] } = {},
): UserActivityPage {
  const filtered = filter.type
    ? fxUserActivityAll.filter((e) => e.eventType === filter.type)
    : filter.types?.length
      ? fxUserActivityAll.filter((e) => filter.types!.includes(e.eventType))
      : fxUserActivityAll;
  const total = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  return { items: filtered.slice(start, start + pageSize), page, pageSize, total };
}

// System error fixtures: a few rows, newest first, exercising both drill-down states —
// one long multi-line stackTrace and one with null message and stackTrace. Kept small
// because this file is statically imported by client.ts.
export const fxSystemErrorsAll: SystemError[] = [
  {
    id: 3,
    occurredUtc: '2026-07-22T00:56:05Z',
    source: 'API',
    exceptionType: 'System.InvalidOperationException',
    message: 'Sequence contains no elements while resolving the latest forecast frame.',
    path: '/api/forecast/best-crops',
    method: 'GET',
    traceId: '0HNN7HFVC11H0:00000001',
    stackTrace:
      'System.InvalidOperationException: Sequence contains no elements\n' +
      '   at System.Linq.ThrowHelper.ThrowNoElementsException()\n' +
      '   at AgriForecast.Application.Forecast.BestCropsHandler.Handle(BestCropsQuery q)\n' +
      '   at AgriForecast.Api.Controllers.ForecastController.BestCrops()',
  },
  {
    id: 2,
    occurredUtc: '2026-07-21T18:12:40Z',
    source: 'API',
    exceptionType: 'System.NullReferenceException',
    message: null,
    path: '/api/crops/get/all',
    method: 'GET',
    traceId: '0HNN7H9AB2K44:00000007',
    stackTrace: null,
  },
  {
    id: 1,
    occurredUtc: '2026-07-20T09:03:17Z',
    source: 'API',
    exceptionType: 'System.TimeoutException',
    message: 'The prediction service did not respond within 30s.',
    path: '/api/forecast/crop/VEG000012/harvest',
    method: 'GET',
    traceId: '0HNN7GQ1P55T2:00000003',
    stackTrace:
      'System.TimeoutException: The operation has timed out.\n' +
      '   at AgriForecast.Infrastructure.Ml.PredictClient.PredictAsync(...)\n' +
      '   at AgriForecast.Application.Forecast.HarvestForecastHandler.Handle(...)',
  },
];

/** Simulate the SERVER's paging (never client-sliced by the page — the page always
 *  trusts {items,page,pageSize,total}). Order is OccurredUtc DESC (as seeded). */
export function fxSystemErrors(page = 1, pageSize = 25): SystemErrorPage {
  const total = fxSystemErrorsAll.length;
  const start = Math.max(0, (page - 1) * pageSize);
  return { items: fxSystemErrorsAll.slice(start, start + pageSize), page, pageSize, total };
}
