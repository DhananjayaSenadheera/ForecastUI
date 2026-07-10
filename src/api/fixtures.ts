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
  PriceTrend,
  RecommendationLevel,
  type BestCrop,
  type Crop,
  type CropTimeline,
  type HarvestForecast,
  type Market,
  type PriceHistoryPoint,
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
};

// Per-crop forecast resolver for fixture mode: maps the crop id to its confidence
// tier so every state is demo-able (Tomato/Capsicum=High, Beans=Medium, Passion=Low).
// The requested plantDate is echoed back and harvestDate is derived from it +
// growthPeriodDays, matching the server behaviour so the demo stays honest.
const fxHarvestByCrop: Record<string, HarvestForecast> = {
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

export function fxForecastFor(cropId: string, plantDate: string): HarvestForecast {
  const base = fxHarvestByCrop[cropId] ?? fxHarvestForecast; // default = High tier
  return {
    ...base,
    cropId,
    plantDate,
    harvestDate: addDays(plantDate, base.growthPeriodDays) ?? base.harvestDate,
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
  'c0000002-0000-0000-0000-000000000002': fxTimelineMedium, // Beans
  'c0000004-0000-0000-0000-000000000004': fxTimelineLow, // Passion Fruit
};

export function fxTimelineFor(cropId: string): CropTimeline {
  return fxTimelineByCrop[cropId] ?? fxTimeline; // default = High tier (Capsicum)
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
