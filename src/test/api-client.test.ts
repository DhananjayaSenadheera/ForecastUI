import { describe, it, expect } from 'vitest';
import { api, apiMode } from '../api/client';
import {
  ForecastConfidenceCode,
  RecommendationLevel,
  type BestCrop,
  type HarvestForecast,
} from '../api/types';

// These run with VITE_API_MODE=fixtures (set in the test script) so no network.
describe('API client (fixture mode)', () => {
  it('is in fixture mode under test', () => {
    expect(apiMode).toBe('fixtures');
  });

  it('returns a typed HarvestForecast with a frozen confidence string', async () => {
    const f: HarvestForecast = await api.getHarvestForecast('c1', '2026-07-10');
    expect(f.confidence).toMatch(/^(Low|Medium|High)$/);
    expect(typeof f.predictedPrice).toBe('number');
    expect(f.lowerBound).toBeLessThanOrEqual(f.upperBound);
    expect(typeof f.lowTrust).toBe('boolean');
  });

  it('returns best crops with integer enum fields (not strings)', async () => {
    const crops: BestCrop[] = await api.getBestCrops();
    expect(crops.length).toBeGreaterThan(0);
    const c = crops[0];
    expect(Object.values(ForecastConfidenceCode)).toContain(c.confidence);
    expect(Object.values(RecommendationLevel)).toContain(c.recommendationLevel);
    expect(c.cropCode).toMatch(/^(VEG|FRT)\d+/);
  });

  it('serves fixture-only markets + price history (API gaps #1/#2)', async () => {
    const markets = await api.getMarkets();
    expect(markets.some((m) => m.isEconomicCenter)).toBe(true);
    const history = await api.getPriceHistory('c1');
    expect(history[0]).toHaveProperty('minPrice');
    expect(history[0]).toHaveProperty('maxPrice');
  });
});
