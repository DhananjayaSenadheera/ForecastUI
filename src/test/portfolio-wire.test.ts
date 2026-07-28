// What actually goes on the wire for the watchlist writes.
//
// The rest of the suite runs in fixtures mode, where every api.* method short-circuits and
// no request is ever built. These tests re-import the client with VITE_API_MODE=live and a
// stubbed fetch, so the JSON body itself is asserted — the difference between "we call the
// right function" and "we send the right document".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Captured = { url: string; init: RequestInit };

async function liveApi(): Promise<{
  api: typeof import('../api/client').api;
  calls: Captured[];
}> {
  vi.resetModules();
  vi.stubEnv('VITE_API_MODE', 'live');
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  const calls: Captured[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ item: {}, marketsChanged: true, plantedDateChanged: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  const mod = await import('../api/client');
  return { api: mod.api, calls };
}

const body = (c: Captured) => JSON.parse(String(c.init.body));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('POST /api/portfolio/watchlist — the add body', () => {
  it('sends exactly { cropId, marketIds } with the markets the farmer picked', async () => {
    const { api, calls } = await liveApi();
    await api.addWatchlistCrop('c1', ['m1', 'm3']);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://api.test/api/portfolio/watchlist');
    expect(calls[0].init.method).toBe('POST');
    expect(body(calls[0])).toEqual({ cropId: 'c1', marketIds: ['m1', 'm3'] });
  });

  it('OMITS marketIds entirely when none were picked, rather than guessing one', async () => {
    const { api, calls } = await liveApi();
    await api.addWatchlistCrop('c1');
    expect(body(calls[0])).toEqual({ cropId: 'c1' });
    expect('marketIds' in body(calls[0])).toBe(false);
  });

  it('sends an explicit empty array when the farmer picked no market on purpose', async () => {
    const { api, calls } = await liveApi();
    await api.addWatchlistCrop('c1', []);
    expect(body(calls[0])).toEqual({ cropId: 'c1', marketIds: [] });
  });
});

describe('PUT /api/portfolio/watchlist/{cropId} — the markets body', () => {
  it('is a FULL REPLACE: the whole desired set goes up, addressed by crop', async () => {
    const { api, calls } = await liveApi();
    await api.updateWatchlistMarkets('c1', ['m3', 'm1']);

    expect(calls[0].url).toBe('http://api.test/api/portfolio/watchlist/c1');
    expect(calls[0].init.method).toBe('PUT');
    expect(body(calls[0])).toEqual({ marketIds: ['m3', 'm1'] });
  });

  it('clears a crop’s markets with [] — a real choice, not an omission', async () => {
    const { api, calls } = await liveApi();
    await api.updateWatchlistMarkets('c1', []);
    expect(body(calls[0])).toEqual({ marketIds: [] });
  });

  it('NEVER carries plantedDate — an omitted field is unchanged, a null one CLEARS it', async () => {
    // A markets edit that mentioned the field at all could wipe the date the farmer typed
    // on the card a moment earlier, so the key must be ABSENT, not null.
    const { api, calls } = await liveApi();
    await api.updateWatchlistMarkets('c1', ['m1']);
    expect(Object.keys(body(calls[0]))).toEqual(['marketIds']);
    expect(String(calls[0].init.body)).not.toContain('plantedDate');
  });
});

describe('PUT /api/portfolio/watchlist/{cropId} — the planting-date body (tri-state)', () => {
  it('sends the date ALONE: a date edit must not touch the farmer’s markets', async () => {
    const { api, calls } = await liveApi();
    await api.updateWatchlistPlantedDate('c1', '2026-05-04');

    expect(calls[0].url).toBe('http://api.test/api/portfolio/watchlist/c1');
    expect(calls[0].init.method).toBe('PUT');
    expect(body(calls[0])).toEqual({ plantedDate: '2026-05-04' });
    // The mirror image of the markets test above: an omitted marketIds is "unchanged",
    // but a present one is a FULL REPLACE and would silently drop markets.
    expect(Object.keys(body(calls[0]))).toEqual(['plantedDate']);
    expect(String(calls[0].init.body)).not.toContain('marketIds');
  });

  it('clears the date with an EXPLICIT null, never by omitting the key', async () => {
    // Omitting it means "leave it alone", which is the opposite of what "Remove date" asks
    // for: the request would come back 200 with the date still on the row.
    const { api, calls } = await liveApi();
    await api.updateWatchlistPlantedDate('c1', null);

    expect(body(calls[0])).toEqual({ plantedDate: null });
    expect(Object.keys(body(calls[0]))).toEqual(['plantedDate']);
    expect(String(calls[0].init.body)).toContain('"plantedDate":null');
  });
});

describe('DELETE /api/portfolio/watchlist/{cropId}', () => {
  it('addresses the crop in the path and sends no body', async () => {
    const { api, calls } = await liveApi();
    await api.removeWatchlistCrop('c1');
    expect(calls[0].url).toBe('http://api.test/api/portfolio/watchlist/c1');
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].init.body).toBeUndefined();
  });
});
