import { describe, it, expect } from 'vitest';
import {
  ariaSortFor,
  bestCropCaveatKey,
  buildSharedScale,
  isLowConfidenceRow,
  sortBestCrops,
  trendMeta,
} from '../lib/bestcrops';
import { fxBestCrops } from '../api/fixtures';
import { ForecastConfidenceCode, PriceTrend, RecommendationLevel, type BestCrop } from '../api/types';

describe('buildSharedScale (one Rs. axis across ALL rows)', () => {
  const scale = buildSharedScale(fxBestCrops);

  it('rounds a single axis ceiling above the dearest crop', () => {
    const maxPrice = Math.max(...fxBestCrops.map((c) => c.averagePrice));
    expect(scale.axisMax).toBeGreaterThanOrEqual(maxPrice);
    expect(scale.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it('computes every row against the SAME axisMax (comparable lengths)', () => {
    for (const r of scale.rows) {
      expect(r.pct).toBeCloseTo((r.price / scale.axisMax) * 100, 5);
      expect(r.pct).toBeGreaterThanOrEqual(0);
      expect(r.pct).toBeLessThanOrEqual(100);
    }
    // a dearer crop always has a longer bar
    const capsicum = scale.rows.find((r) => r.price === 552)!;
    const cabbage = scale.rows.find((r) => r.price === 95)!;
    expect(capsicum.pct).toBeGreaterThan(cabbage.pct);
  });

  it('never divides by zero on an all-empty list', () => {
    const s = buildSharedScale([]);
    expect(s.axisMax).toBeGreaterThan(0);
    expect(s.rows).toEqual([]);
  });
});

describe('sortBestCrops', () => {
  it('rank preserves the API order (desc) and reverses it (asc)', () => {
    const desc = sortBestCrops(fxBestCrops, 'rank', 'desc');
    expect(desc.map((c) => c.cropId)).toEqual(fxBestCrops.map((c) => c.cropId));
    const asc = sortBestCrops(fxBestCrops, 'rank', 'asc');
    expect(asc.map((c) => c.cropId)).toEqual([...fxBestCrops].reverse().map((c) => c.cropId));
  });

  it('sorts by expected price both directions', () => {
    const desc = sortBestCrops(fxBestCrops, 'price', 'desc').map((c) => c.averagePrice);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    const asc = sortBestCrops(fxBestCrops, 'price', 'asc').map((c) => c.averagePrice);
    expect(asc[0]).toBe(Math.min(...fxBestCrops.map((c) => c.averagePrice)));
  });

  it('sorts by confidence, high first on desc', () => {
    const desc = sortBestCrops(fxBestCrops, 'confidence', 'desc');
    expect(desc[0].confidence).toBe(ForecastConfidenceCode.High);
    expect(desc[desc.length - 1].confidence).toBe(ForecastConfidenceCode.Low);
  });

  it('is stable — equal keys keep incoming order', () => {
    const rows: BestCrop[] = [
      { cropId: 'a', cropName: 'A', cropCode: 'VEG1', averagePrice: 100, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.Recommended },
      { cropId: 'b', cropName: 'B', cropCode: 'VEG2', averagePrice: 100, trend: PriceTrend.Up, confidence: ForecastConfidenceCode.High, recommendationLevel: RecommendationLevel.Recommended },
    ];
    expect(sortBestCrops(rows, 'price', 'desc').map((c) => c.cropId)).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const before = fxBestCrops.map((c) => c.cropId);
    sortBestCrops(fxBestCrops, 'price', 'asc');
    expect(fxBestCrops.map((c) => c.cropId)).toEqual(before);
  });
});

describe('ariaSortFor', () => {
  it('reports the active column direction and none for others', () => {
    expect(ariaSortFor('price', 'price', 'asc')).toBe('ascending');
    expect(ariaSortFor('price', 'price', 'desc')).toBe('descending');
    expect(ariaSortFor('rank', 'price', 'desc')).toBe('none');
  });
});

describe('trendMeta (arrow glyph + text label; never colour alone)', () => {
  it('maps every PriceTrend to an arrow, a label key and a tone', () => {
    expect(trendMeta(PriceTrend.Up)).toEqual({ arrow: '↑', labelKey: 'pages.bestCrops.trendUp', tone: 'up' });
    expect(trendMeta(PriceTrend.Stable)).toEqual({ arrow: '→', labelKey: 'pages.bestCrops.trendFlat', tone: 'flat' });
    expect(trendMeta(PriceTrend.Down)).toEqual({ arrow: '↓', labelKey: 'pages.bestCrops.trendDown', tone: 'down' });
  });
});

describe('honest-row caveats', () => {
  it('flags Not-recommended and little-data / low-confidence rows only', () => {
    expect(bestCropCaveatKey({ recommendationLevel: RecommendationLevel.NotRecommended, confidence: ForecastConfidenceCode.Medium })).toBe('pages.bestCrops.caveatNotRec');
    expect(bestCropCaveatKey({ recommendationLevel: RecommendationLevel.RecommendedWithRisk, confidence: ForecastConfidenceCode.Low })).toBe('pages.bestCrops.caveatLittleData');
    expect(bestCropCaveatKey({ recommendationLevel: RecommendationLevel.Recommended, confidence: ForecastConfidenceCode.Low })).toBe('pages.bestCrops.caveatLittleData');
    expect(bestCropCaveatKey({ recommendationLevel: RecommendationLevel.StronglyRecommended, confidence: ForecastConfidenceCode.High })).toBeNull();
  });

  it('isLowConfidenceRow tracks the frozen Low confidence code', () => {
    expect(isLowConfidenceRow({ confidence: ForecastConfidenceCode.Low })).toBe(true);
    expect(isLowConfidenceRow({ confidence: ForecastConfidenceCode.High })).toBe(false);
  });
});
