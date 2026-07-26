// Best-crops presentation logic. Pure helpers so the load-bearing bits (shared-scale
// geometry, sort order, trend and caveat mapping) are unit-tested and the page stays
// presentational.
// The endpoint returns only `averagePrice` (no P10–P90 band), so the comparison is a
// shared-scale bar on one Rs. 0–max axis — we never invent an interval the API does not
// return. Trend is an arrow glyph + text label, never colour alone, and "Not recommended"
// rows stay visible with a plain caveat (red is reserved for that verdict).
import { niceScale } from './timeline';
import {
  ForecastConfidenceCode,
  PriceTrend,
  RecommendationLevel,
  type BestCrop,
} from '../api/types';

export interface ScaleRow {
  cropId: string;
  price: number;
  /** 0–100% of the shared axis — position of the marked expected price. */
  pct: number;
}
export interface SharedScale {
  /** Common axis ceiling (nice-rounded) shared by EVERY row. */
  axisMax: number;
  /** Evenly spaced Rs. tick values for an optional axis legend. */
  ticks: number[];
  rows: ScaleRow[];
}

/**
 * Lay every crop's expected price on ONE shared Rs. 0–axisMax scale so bar lengths are
 * comparable. axisMax is nice-rounded above the dearest crop.
 */
export function buildSharedScale(crops: Pick<BestCrop, 'cropId' | 'averagePrice'>[]): SharedScale {
  const max = crops.reduce((m, c) => Math.max(m, c.averagePrice), 0);
  // Axis ceiling = the dearest crop, so its bar fills the track and every other row reads
  // as a proportion of it. niceScale only supplies optional legend ticks.
  const axisMax = max > 0 ? max : 1;
  const { ticks } = niceScale(0, axisMax, 4);
  const rows: ScaleRow[] = crops.map((c) => ({
    cropId: c.cropId,
    price: c.averagePrice,
    pct: Math.min(100, Math.max(0, (c.averagePrice / axisMax) * 100)),
  }));
  return { axisMax, ticks, rows };
}

export type BestCropSortKey = 'rank' | 'price' | 'confidence';
export type SortDir = 'asc' | 'desc';

/**
 * Sort a copy of the ranked list. 'rank' keeps the API order (desc) or reverses it (asc)
 * — the server's order IS the rank. 'price' and 'confidence' are stable.
 */
export function sortBestCrops(crops: BestCrop[], key: BestCropSortKey, dir: SortDir): BestCrop[] {
  if (key === 'rank') {
    const arr = crops.slice();
    return dir === 'desc' ? arr : arr.reverse();
  }
  const indexed = crops.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => {
    const base =
      key === 'price'
        ? a.c.averagePrice - b.c.averagePrice
        : a.c.confidence - b.c.confidence;
    const d = dir === 'asc' ? base : -base;
    if (d !== 0) return d;
    return a.i - b.i; // stable — ties keep incoming order regardless of direction
  });
  return indexed.map((x) => x.c);
}

/** ARIA sort state for a column header given the active sort. */
export function ariaSortFor(col: BestCropSortKey, active: BestCropSortKey, dir: SortDir): 'ascending' | 'descending' | 'none' {
  if (col !== active) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}

// Trend is an arrow glyph paired with a text label — never colour alone.
export type TrendTone = 'up' | 'flat' | 'down';
export interface TrendMeta {
  arrow: '↑' | '→' | '↓';
  /** i18n key for the visible trend word. */
  labelKey: string;
  tone: TrendTone;
}
export function trendMeta(trend: PriceTrend): TrendMeta {
  switch (trend) {
    case PriceTrend.Up:
      return { arrow: '↑', labelKey: 'pages.bestCrops.trendUp', tone: 'up' };
    case PriceTrend.Down:
      return { arrow: '↓', labelKey: 'pages.bestCrops.trendDown', tone: 'down' };
    case PriceTrend.Stable:
    default:
      return { arrow: '→', labelKey: 'pages.bestCrops.trendFlat', tone: 'flat' };
  }
}

/** A row is low-confidence (amber bar) when the frozen confidence code is Low. */
export function isLowConfidenceRow(c: Pick<BestCrop, 'confidence'>): boolean {
  return c.confidence === ForecastConfidenceCode.Low;
}

/**
 * Plain-language caveat key, derived from the enums the API does return. Not-recommended
 * and little-data rows carry a farmer-facing reason; everything else returns null.
 */
export function bestCropCaveatKey(
  c: Pick<BestCrop, 'recommendationLevel' | 'confidence'>,
): 'pages.bestCrops.caveatNotRec' | 'pages.bestCrops.caveatLittleData' | null {
  if (c.recommendationLevel === RecommendationLevel.NotRecommended) return 'pages.bestCrops.caveatNotRec';
  if (c.recommendationLevel === RecommendationLevel.RecommendedWithRisk || isLowConfidenceRow(c)) {
    return 'pages.bestCrops.caveatLittleData';
  }
  return null;
}
