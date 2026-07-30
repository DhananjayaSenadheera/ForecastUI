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
    // A SET must never carry a clear reason: the server 400s a reason on a request that is
    // not clearing anything (clear_reason_not_applicable).
    expect(String(calls[0].init.body)).not.toContain('clearReason');
  });

  it('clears the date with an EXPLICIT null AND the reason the server now requires', async () => {
    // Omitting the key means "leave it alone", which is the opposite of what "Remove date"
    // asks for: the request would come back 200 with the date still on the row. And a bare
    // { plantedDate: null } is now a 400 (clear_reason_required) — the removal has to say why.
    const { api, calls } = await liveApi();
    await api.clearWatchlistPlantedDate('c1', { reason: 'harvested' });

    expect(calls[0].url).toBe('http://api.test/api/portfolio/watchlist/c1');
    expect(calls[0].init.method).toBe('PUT');
    expect(body(calls[0])).toEqual({ plantedDate: null, clearReason: 'harvested' });
    expect(Object.keys(body(calls[0]))).toEqual(['plantedDate', 'clearReason']);
    expect(String(calls[0].init.body)).toContain('"plantedDate":null');
    // No note key at all when the farmer wrote none — never an empty string, which would be
    // a note with nothing in it.
    expect(String(calls[0].init.body)).not.toContain('clearReasonNote');
    expect(String(calls[0].init.body)).not.toContain('marketIds');
  });

  it('carries the farmer’s note TRIMMED, exactly as the server measures it', async () => {
    const { api, calls } = await liveApi();
    await api.clearWatchlistPlantedDate('c1', {
      reason: 'cropFailed',
      note: '  heavy rain in July  ',
    });

    expect(body(calls[0])).toEqual({
      plantedDate: null,
      clearReason: 'cropFailed',
      clearReasonNote: 'heavy rain in July',
    });
    expect(Object.keys(body(calls[0]))).toEqual([
      'plantedDate',
      'clearReason',
      'clearReasonNote',
    ]);
  });

  it('drops a blank note rather than sending one with nothing in it', async () => {
    const { api, calls } = await liveApi();
    await api.clearWatchlistPlantedDate('c1', { reason: 'other', note: '   \n  ' });

    expect(body(calls[0])).toEqual({ plantedDate: null, clearReason: 'other' });
    expect(String(calls[0].init.body)).not.toContain('clearReasonNote');
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

// Demo mode is the same product with no server behind it, so it must refuse what the server
// refuses. If the fixture happily "removed" a date that was not there, a demo would teach a
// farmer (and a reviewer) a rule the live route does not have.
describe('fixtures — the demo mirrors the wire’s refusals, it does not smooth them over', () => {
  it('refuses a removal when there is no date to remove (clear_reason_not_applicable)', async () => {
    const fx = await import('../api/fixtures');
    const cropId = 'c0000003-0000-0000-0000-000000000003'; // Tomato, seeded with no date

    // Nothing planted yet: there is no date the reason could explain.
    expect(() => fx.fxClearWatchlistPlantedDate(cropId, { reason: 'harvested' })).toThrow(
      'clear_reason_not_applicable',
    );

    // Record one, and the SAME call now succeeds and really clears it...
    fx.fxUpdateWatchlistPlantedDate(cropId, '2026-05-04');
    const result = fx.fxClearWatchlistPlantedDate(cropId, { reason: 'harvested' });
    expect(result.item.plantedDate).toBeNull();
    expect(result.plantedDateChanged).toBe(true);

    // ...and a second removal is refused again, because the row is back to having no date.
    expect(() => fx.fxClearWatchlistPlantedDate(cropId, { reason: 'harvested' })).toThrow(
      'clear_reason_not_applicable',
    );
  });

  it('refuses an unknown reason and an over-long note, exactly as the route does', async () => {
    const fx = await import('../api/fixtures');
    const cropId = 'c0000002-0000-0000-0000-000000000002'; // Beans
    fx.fxUpdateWatchlistPlantedDate(cropId, '2026-05-04');

    expect(() =>
      // A reason no build knows: the demo must not invent an acceptance for it.
      fx.fxClearWatchlistPlantedDate(cropId, { reason: 'soldTheField' as never }),
    ).toThrow('invalid_clear_reason');
    expect(() =>
      fx.fxClearWatchlistPlantedDate(cropId, { reason: 'other', note: 'x'.repeat(301) }),
    ).toThrow('clear_reason_note_too_long');
    // Refused means UNCHANGED: the date is still on the row.
    const rows = fx.fxWatchlist();
    expect(rows.find((r) => r.cropId === cropId)?.plantedDate).toBe('2026-05-04');
  });
});
