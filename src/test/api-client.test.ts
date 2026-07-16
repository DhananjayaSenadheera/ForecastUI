import { describe, it, expect, vi, afterEach } from 'vitest';
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

  it('short-circuits markets + price history to fixtures (API-1/2, no network)', async () => {
    // In fixtures mode the live URL is never hit; assert the fixture shapes come back.
    const markets = await api.getMarkets();
    expect(markets.some((m) => m.isEconomicCenter)).toBe(true);
    const history = await api.getPriceHistory('c1');
    expect(history[0]).toHaveProperty('minPrice');
    expect(history[0]).toHaveProperty('maxPrice');
  });

  it('serves the market overview fixture (API-7) with movers + latest prices', async () => {
    const ov = await api.getMarketOverview(30);
    expect(ov.windowDays).toBe(30);
    expect(ov.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // both risers and fallers present; direction is the frozen wire string
    expect(ov.movers.some((m) => m.direction === 'up')).toBe(true);
    expect(ov.movers.some((m) => m.direction === 'down')).toBe(true);
    expect(ov.movers.every((m) => m.direction === 'up' || m.direction === 'down')).toBe(true);
    // latest prices carry a spark; at least one is sparse (< 5 points)
    expect(ov.latestPrices.length).toBeGreaterThan(0);
    expect(ov.latestPrices.some((p) => p.spark.length < 5 && p.spark.length > 0)).toBe(true);
  });
});

// The suite above runs in fixtures mode (vite.config test.env), so the live URL is
// never exercised there. Here we re-import the client with VITE_API_MODE=live and a
// stubbed fetch to pin the EXACT markets/price-history URLs (API-1/2, backend PR #24).
describe('API client (live mode — markets + price history URLs)', () => {
  function fakeRes(body: unknown): Response {
    return {
      ok: true,
      status: 200,
      statusText: '',
      headers: new Headers(),
      json: async () => body,
    } as unknown as Response;
  }

  async function liveApi() {
    vi.resetModules();
    vi.stubEnv('VITE_API_MODE', 'live');
    return (await import('../api/client')).api;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('getMarkets hits /api/markets/get/all?hasPrices=true (price-carrying subset)', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getMarkets();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/markets/get/all?hasPrices=true');
  });

  it('getAdminMarkets hits /api/markets/get/all (full 12-market registry)', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getAdminMarkets();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/markets/get/all');
  });

  it('getPriceHistory passes marketId + an explicit days=90 window', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getPriceHistory('crop-1', 'mkt-9');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/prices/crop/crop-1/history?marketId=mkt-9&days=90');
  });

  it('getPriceHistory omits marketId when not given (cross-market envelope), still days=90', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getPriceHistory('crop-1');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/prices/crop/crop-1/history?days=90');
  });

  // ---- ADM-4 users (API-9, backend PR #26) --------------------------------
  it('getAdminUsers hits /api/users/get/all with no paging params (default 500 cap)', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getAdminUsers();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/users/get/all');
  });

  it('updateUserRole PUTs /api/users/update-role with a {userId, role} body', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes({ id: 'u1', role: 'Admin' }));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).updateUserRole('u1', 'Admin');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/users/update-role');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ userId: 'u1', role: 'Admin' });
  });

  it('deleteUser DELETEs /api/users/delete/{id}', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes(true));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).deleteUser('u-42');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/users/delete/u-42');
    expect(init.method).toBe('DELETE');
  });

  // ---- ADM-2 policy-flag mutations (API-13, backend merged) ---------------
  it('updatePolicyFlag PUTs /api/policy-flag/update with the dto WRAPPED under policyFlagUpdateDto', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes({ id: 'pf-1', trainingDataWarning: null }));
    vi.stubGlobal('fetch', fetchMock);
    const dto = {
      id: 'pf-1',
      policyType: 1,
      title: 'Import ban',
      description: null,
      effectiveFrom: '2021-05-06',
      effectiveTo: '2021-11-24',
      direction: 1,
      source: 'Government of Sri Lanka',
      referenceUrl: null,
    };
    await (await liveApi()).updatePolicyFlag(dto);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/policy-flag/update');
    expect(init.method).toBe('PUT');
    // Wrapped body shape is load-bearing (mirrors the crops createDto wrapper).
    expect(JSON.parse(init.body as string)).toEqual({ policyFlagUpdateDto: dto });
  });

  it('deletePolicyFlag DELETEs /api/policy-flag/delete/{id}', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes({ id: 'pf-9', trainingDataWarning: null }));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).deletePolicyFlag('pf-9');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/policy-flag/delete/pf-9');
    expect(init.method).toBe('DELETE');
  });
});

// Fixture-mode mutation semantics: the demo working copy mirrors the server's
// past-window training-data warning so the amber banner is demo-able with no backend.
describe('API client (fixture mode — policy-flag mutation warnings)', () => {
  const PAST_FLAG = 'a1f1c001-0000-0000-0000-000000000001'; // 2021 import ban (past)
  const FUTURE_FLAG = 'a1f1c001-0000-0000-0000-000000000009'; // 2026-09-15 price floor (future)

  it('updatePolicyFlag warns (non-null) when the edited window starts in the past', async () => {
    const res = await api.updatePolicyFlag({
      id: PAST_FLAG,
      policyType: 1,
      title: 'Chemical fertiliser & agrochemical import ban',
      effectiveFrom: '2021-05-06',
      effectiveTo: '2021-11-24',
      direction: 1,
      source: 'Government of Sri Lanka',
    });
    expect(res.id).toBe(PAST_FLAG);
    expect(res.trainingDataWarning).not.toBeNull();
  });

  it('updatePolicyFlag does NOT warn (null) when both old + new windows are in the future', async () => {
    const res = await api.updatePolicyFlag({
      id: FUTURE_FLAG,
      policyType: 4,
      title: 'Guaranteed paddy price floor — 2026 Maha season',
      effectiveFrom: '2027-01-01',
      effectiveTo: '2027-06-30',
      direction: 1,
      source: 'Ministry of Agriculture, Sri Lanka',
    });
    expect(res.trainingDataWarning).toBeNull();
  });

  it('deletePolicyFlag warns for a past-dated flag and removes it from the working copy', async () => {
    const before = (await api.getPolicyFlags()).length;
    const res = await api.deletePolicyFlag('a1f1c001-0000-0000-0000-000000000002'); // 2022 subsidy (past)
    expect(res.trainingDataWarning).not.toBeNull();
    expect((await api.getPolicyFlags()).length).toBe(before - 1);
  });
});
