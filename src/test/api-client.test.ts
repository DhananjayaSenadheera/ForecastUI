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

  it('serves the indicator catalog + macro series fixtures (API-11)', async () => {
    const catalog = await api.getIndicatorCatalog();
    // catalog lists both CCPI macro series the page pins, tagged kind 'macro'
    const macro = catalog.filter((c) => c.kind === 'macro').map((c) => c.key);
    expect(macro).toContain('CCPI_BASE2021');
    expect(macro).toContain('CCPI_HEADLINE_YOY_BASE2021');
    // the YoY series is real data (has points) and carries a multi-vintage row:
    // two entries share the latest referenceDate (provisional then revised).
    const yoy = await api.getIndicatorMacro('CCPI_HEADLINE_YOY_BASE2021');
    expect(yoy.length).toBeGreaterThan(0);
    const byRef = new Map<string, number>();
    for (const p of yoy) byRef.set(p.referenceDate, (byRef.get(p.referenceDate) ?? 0) + 1);
    expect([...byRef.values()].some((n) => n > 1)).toBe(true);
    // every macro point carries BOTH dates verbatim (never collapsed)
    expect(yoy.every((p) => !!p.referenceDate && !!p.publishedAt)).toBe(true);
    // unknown series -> empty (200 [] semantics), never a throw
    expect(await api.getIndicatorMacro('NOPE')).toEqual([]);
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

  // ---- ADM-6 indicators (API-11, backend merged) --------------------------
  it('getIndicatorCatalog hits /api/indicators/catalog', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getIndicatorCatalog();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/indicators/catalog');
  });

  it('getIndicatorMacro hits /api/macro-series?key={seriesKey} (macro uses `key`)', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getIndicatorMacro('CCPI_HEADLINE_YOY_BASE2021');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:5282/api/macro-series?key=CCPI_HEADLINE_YOY_BASE2021',
    );
  });

  it('getIndicatorDaily hits /api/indicators?code={code} (daily uses `code`)', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getIndicatorDaily('USD_LKR');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/indicators?code=USD_LKR');
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

  // ---- ADM-5 festival calendar (API-10, backend merged) -------------------
  it('getFestivals hits /api/festival-calendar/get/all', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getFestivals();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/festival-calendar/get/all');
  });

  it('createFestival POSTs /api/festival-calendar/create with the dto WRAPPED under festivalCalendarCreateDto', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes(true));
    vi.stubGlobal('fetch', fetchMock);
    const dto = {
      festivalKey: 'AVURUDU',
      date: '2027-04-14',
      leadUpDays: 0, // paired-day value must survive the wire verbatim (never coerced)
      isProvisional: true,
      source: 'Public holidays gazette 2027',
    };
    await (await liveApi()).createFestival(dto);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/festival-calendar/create');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ festivalCalendarCreateDto: dto });
  });

  it('updateFestival PUTs /api/festival-calendar/update with the dto WRAPPED under festivalCalendarUpdateDto', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes({ id: 'f-1', trainingDataWarning: null }));
    vi.stubGlobal('fetch', fetchMock);
    const dto = {
      id: 'f-1',
      festivalKey: 'THAI_PONGAL',
      date: '2027-01-14',
      leadUpDays: 10,
      isProvisional: false,
      source: 'Public holidays gazette 2027',
    };
    await (await liveApi()).updateFestival(dto);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/festival-calendar/update');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ festivalCalendarUpdateDto: dto });
  });

  it('deleteFestival DELETEs /api/festival-calendar/delete/{id}', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes({ id: 'f-9', trainingDataWarning: null }));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).deleteFestival('f-9');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/festival-calendar/delete/f-9');
    expect(init.method).toBe('DELETE');
  });

  // ---- ADM-7 news events (API-12, backend merged) -------------------------
  it('getNewsEvents hits /api/news-events/get/all', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes([]));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).getNewsEvents();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5282/api/news-events/get/all');
  });

  it('createNewsEvent POSTs /api/news-events/create with the dto WRAPPED under newsEventCreateDto', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes(true));
    vi.stubGlobal('fetch', fetchMock);
    const dto = {
      eventType: 6,
      direction: 1,
      title: 'Diesel price raised',
      description: 'Transport costs up.',
      publishedAt: '2026-07-11',
      sourceUrl: 'https://ceypetco.gov.lk/',
      affectedCropIds: ['crop-1'],
    };
    await (await liveApi()).createNewsEvent(dto);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/news-events/create');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ newsEventCreateDto: dto });
  });

  it('updateNewsEvent PUTs /api/news-events/update with the dto WRAPPED under newsEventUpdateDto and NO publishedAt', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes('e-1'));
    vi.stubGlobal('fetch', fetchMock);
    const dto = {
      id: 'e-1',
      eventType: 2,
      direction: -1,
      title: 'Budget review',
      description: null,
      sourceUrl: null,
      affectedCropIds: [],
      affectedMarketIds: ['mkt-1'],
    };
    await (await liveApi()).updateNewsEvent(dto);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/news-events/update');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    // envelope shape pinned; publishedAt is immutable -> the wire dto must NOT carry it
    expect(body).toEqual({ newsEventUpdateDto: dto });
    expect('publishedAt' in body.newsEventUpdateDto).toBe(false);
  });

  it('deleteNewsEvent DELETEs /api/news-events/delete/{id}', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => fakeRes('e-9'));
    vi.stubGlobal('fetch', fetchMock);
    await (await liveApi()).deleteNewsEvent('e-9');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5282/api/news-events/delete/e-9');
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

// Fixture-mode festival mutations (API-10): the demo working copy mirrors the server's
// past-date training-data warning + keeps leadUpDays=0 verbatim so the page is demo-able.
describe('API client (fixture mode — festival-calendar mutations)', () => {
  const PAST_FESTIVAL = 'f0000007-0000-0000-0000-000000000007'; // AVURUDU 2026-04-14 (past, today = 2026-07-16)
  const FUTURE_FESTIVAL = 'f0000010-0000-0000-0000-000000000010'; // CHRISTMAS 2026-12-25 (future)

  it('createFestival accepts leadUpDays=0 and stores it verbatim (paired-day value not coerced)', async () => {
    const before = (await api.getFestivals()).length;
    const ok = await api.createFestival({
      festivalKey: 'AVURUDU',
      date: '2027-04-14',
      leadUpDays: 0,
      isProvisional: false,
      source: 'Public holidays gazette 2027',
    });
    expect(ok).toBe(true);
    const after = await api.getFestivals();
    expect(after.length).toBe(before + 1);
    const added = after.find((f) => f.date === '2027-04-14' && f.festivalKey === 'AVURUDU');
    expect(added?.leadUpDays).toBe(0);
  });

  it('updateFestival warns (non-null) when the festival date is in the past', async () => {
    const res = await api.updateFestival({
      id: PAST_FESTIVAL,
      festivalKey: 'AVURUDU',
      date: '2026-04-14',
      leadUpDays: 21,
      isProvisional: false,
      source: 'Public holidays gazette 2026',
    });
    expect(res.id).toBe(PAST_FESTIVAL);
    expect(res.trainingDataWarning).not.toBeNull();
  });

  it('updateFestival does NOT warn (null) when both old + new dates are in the future', async () => {
    const res = await api.updateFestival({
      id: FUTURE_FESTIVAL,
      festivalKey: 'CHRISTMAS',
      date: '2027-12-25',
      leadUpDays: 21,
      isProvisional: false,
      source: 'Fixed date',
    });
    expect(res.trainingDataWarning).toBeNull();
  });

  it('deleteFestival warns for a past-dated festival and removes it from the working copy', async () => {
    const before = (await api.getFestivals()).length;
    const res = await api.deleteFestival('f0000001-0000-0000-0000-000000000001'); // THAI_PONGAL 2025-01-14 (past)
    expect(res.trainingDataWarning).not.toBeNull();
    expect((await api.getFestivals()).length).toBe(before - 1);
  });
});

// Fixture-mode news mutations (API-12): capture-only, so NO trainingDataWarning — create returns
// a bare boolean, update/delete return the bare id. The demo working copy persists add/edit/delete
// through the refetch and preserves the immutable publishedAt on edit.
describe('API client (fixture mode — news-event mutations)', () => {
  const EVENT_ID = 'e0000003-0000-0000-0000-000000000003'; // Budget review, publishedAt 2026-05-28

  it('createNewsEvent appends to the working copy and returns true (bare boolean)', async () => {
    const before = (await api.getNewsEvents()).length;
    const ok = await api.createNewsEvent({
      eventType: 8,
      direction: 0,
      title: 'Fixture-added event',
      publishedAt: '2026-07-14',
    });
    expect(ok).toBe(true);
    const after = await api.getNewsEvents();
    expect(after.length).toBe(before + 1);
    const added = after.find((e) => e.title === 'Fixture-added event');
    expect(added?.affectedMarketIds).toEqual([]); // no picker -> defaults to []
  });

  it('updateNewsEvent returns the bare id and preserves the immutable publishedAt', async () => {
    const prev = (await api.getNewsEvents()).find((e) => e.id === EVENT_ID)!;
    const res = await api.updateNewsEvent({
      id: EVENT_ID,
      eventType: prev.eventType,
      direction: -1,
      title: 'Budget review — edited',
      affectedCropIds: [],
      affectedMarketIds: prev.affectedMarketIds,
    });
    expect(res).toBe(EVENT_ID); // bare Guid, NOT a { id, trainingDataWarning } object
    const after = (await api.getNewsEvents()).find((e) => e.id === EVENT_ID)!;
    expect(after.title).toBe('Budget review — edited');
    expect(after.direction).toBe(-1);
    expect(after.publishedAt).toBe(prev.publishedAt); // vintage date untouched
  });

  it('deleteNewsEvent returns the bare id and removes it from the working copy', async () => {
    const before = (await api.getNewsEvents()).length;
    const res = await api.deleteNewsEvent('e0000005-0000-0000-0000-000000000005');
    expect(res).toBe('e0000005-0000-0000-0000-000000000005');
    expect((await api.getNewsEvents()).length).toBe(before - 1);
  });
});
