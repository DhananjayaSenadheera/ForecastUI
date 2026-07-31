// What actually goes on the wire for the sales writes, and what the demo refuses.
//
// The rest of the suite runs in fixtures mode, where every api.* method short-circuits and no
// request is ever built. These tests re-import the client with VITE_API_MODE=live and a
// stubbed fetch, so the JSON body itself is asserted — the difference between "we call the
// right function" and "we send the right document".
//
// The keys are pinned with Object.keys, not just toEqual, because ABSENCE is the contract
// here: on a POST an absent optional key is "nothing to record", and on a PUT — a full
// replace — an absent key CLEARS what was stored. A `null` or an empty string in either
// position would be a different request with a different meaning.
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
      return new Response(JSON.stringify({ id: 's1' }), {
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

describe('GET /api/portfolio/sales — the request', () => {
  it('asks the SERVER to page, and carries the crop filter when there is one', async () => {
    const { api, calls } = await liveApi();
    await api.getSales(2, 20, 'c1');
    expect(calls[0].url).toBe('http://api.test/api/portfolio/sales?page=2&pageSize=20&cropId=c1');
    expect(calls[0].init.method).toBeUndefined(); // a GET, with no body
  });

  it('omits cropId entirely for the whole book — never sends an empty filter', async () => {
    const { api, calls } = await liveApi();
    await api.getSales(1, 10);
    expect(calls[0].url).toBe('http://api.test/api/portfolio/sales?page=1&pageSize=10');
    expect(calls[0].url).not.toContain('cropId');
  });
});

describe('POST /api/portfolio/sales — the create body', () => {
  it('sends every answer the farmer gave, in the contract’s own field order', async () => {
    const { api, calls } = await liveApi();
    await api.recordSale({
      cropId: 'c1',
      marketId: 'm1',
      saleDate: '2026-07-20',
      pricePerKg: 215.5,
      quantityKg: 60,
      note: 'sold to the same buyer',
    });

    expect(calls[0].url).toBe('http://api.test/api/portfolio/sales');
    expect(calls[0].init.method).toBe('POST');
    expect(body(calls[0])).toEqual({
      cropId: 'c1',
      marketId: 'm1',
      saleDate: '2026-07-20',
      pricePerKg: 215.5,
      quantityKg: 60,
      note: 'sold to the same buyer',
    });
    expect(Object.keys(body(calls[0]))).toEqual([
      'cropId',
      'marketId',
      'saleDate',
      'pricePerKg',
      'quantityKg',
      'note',
    ]);
  });

  it('OMITS every optional key the farmer left blank — never null, never ""', async () => {
    // "I am not saying where I sold" is silence on the wire, not `marketId: null`.
    const { api, calls } = await liveApi();
    await api.recordSale({
      cropId: 'c1',
      marketId: '',
      saleDate: '2026-07-20',
      pricePerKg: 200,
      quantityKg: null,
      note: '   \n ',
    });

    expect(body(calls[0])).toEqual({ cropId: 'c1', saleDate: '2026-07-20', pricePerKg: 200 });
    expect(Object.keys(body(calls[0]))).toEqual(['cropId', 'saleDate', 'pricePerKg']);
    const raw = String(calls[0].init.body);
    expect(raw).not.toContain('marketId');
    expect(raw).not.toContain('quantityKg');
    expect(raw).not.toContain('note');
    expect(raw).not.toContain('null');
  });

  it('carries the note TRIMMED, exactly as the server measures its limit', async () => {
    const { api, calls } = await liveApi();
    await api.recordSale({
      cropId: 'c1',
      saleDate: '2026-07-20',
      pricePerKg: 200,
      note: '  paid next day  ',
    });
    expect(body(calls[0]).note).toBe('paid next day');
  });
});

describe('PUT /api/portfolio/sales/{id} — the edit body (FULL REPLACE)', () => {
  it('addresses the sale in the path and sends the whole mutable record', async () => {
    const { api, calls } = await liveApi();
    await api.updateSale('s9', {
      marketId: 'm2',
      saleDate: '2026-07-21',
      pricePerKg: 190,
      quantityKg: 12.5,
      note: 'less than I hoped',
    });

    expect(calls[0].url).toBe('http://api.test/api/portfolio/sales/s9');
    expect(calls[0].init.method).toBe('PUT');
    expect(Object.keys(body(calls[0]))).toEqual([
      'marketId',
      'saleDate',
      'pricePerKg',
      'quantityKg',
      'note',
    ]);
  });

  it('CLEARS what the farmer emptied by leaving the key out, and never sends cropId', async () => {
    // The wire's full-replace rule is the whole reason this is safe: an omitted optional key
    // means "there is none now". cropId is not accepted at all — a sale stays about its crop.
    const { api, calls } = await liveApi();
    await api.updateSale('s9', {
      marketId: null,
      saleDate: '2026-07-21',
      pricePerKg: 190,
      quantityKg: null,
      note: '',
    });

    expect(body(calls[0])).toEqual({ saleDate: '2026-07-21', pricePerKg: 190 });
    expect(Object.keys(body(calls[0]))).toEqual(['saleDate', 'pricePerKg']);
    expect(String(calls[0].init.body)).not.toContain('cropId');
  });
});

describe('DELETE /api/portfolio/sales/{id}', () => {
  it('addresses the sale in the path and sends no body', async () => {
    const { api, calls } = await liveApi();
    await api.deleteSale('s9');
    expect(calls[0].url).toBe('http://api.test/api/portfolio/sales/s9');
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].init.body).toBeUndefined();
  });
});

// Demo mode is the same product with no server behind it, so it must refuse what the server
// refuses. A fixture that happily saved a price of 0 or a sale dated next week would teach a
// farmer — and a reviewer reading the copy in fixtures mode — rules the live route does not
// have, and the first live save would be the first time anyone met the real ones.
describe('fixtures — the demo mirrors the wire’s refusals', () => {
  const TOMATO = 'c0000003-0000-0000-0000-000000000003';
  const DAMBULLA = 'm0000001-0000-0000-0000-000000000001';

  async function fxMod() {
    vi.resetModules();
    return import('../api/fixtures');
  }

  const good = { cropId: TOMATO, saleDate: '2026-01-05', pricePerKg: 200 };

  it('refuses a crop and a market it does not know', async () => {
    const fx = await fxMod();
    expect(() => fx.fxRecordSale({ ...good, cropId: 'not-a-crop' })).toThrow('unknown_crop');
    expect(() => fx.fxRecordSale({ ...good, marketId: 'not-a-market' })).toThrow('unknown_market');
  });

  it('refuses a date that is not a date, and one that has not happened yet', async () => {
    const fx = await fxMod();
    expect(() => fx.fxRecordSale({ ...good, saleDate: 'yesterday' })).toThrow('invalid_sale_date');
    expect(() => fx.fxRecordSale({ ...good, saleDate: '2099-01-01' })).toThrow('sale_date_future');
  });

  it('refuses a price of zero and a price above the ceiling — two different answers', async () => {
    const fx = await fxMod();
    expect(() => fx.fxRecordSale({ ...good, pricePerKg: 0 })).toThrow('invalid_price');
    expect(() => fx.fxRecordSale({ ...good, pricePerKg: -1 })).toThrow('invalid_price');
    expect(() => fx.fxRecordSale({ ...good, pricePerKg: 100000.01 })).toThrow('price_out_of_range');
    // The boundary itself is accepted, on both sides of the wire.
    expect(fx.fxRecordSale({ ...good, pricePerKg: 100000 }).pricePerKg).toBe(100000);
  });

  it('refuses a bad quantity with ONE code — the contract has no quantity range code', async () => {
    const fx = await fxMod();
    expect(() => fx.fxRecordSale({ ...good, quantityKg: 0 })).toThrow('invalid_quantity');
    expect(() => fx.fxRecordSale({ ...good, quantityKg: 100000.01 })).toThrow('invalid_quantity');
  });

  it('measures the note limit on the TRIMMED value, and rejects rather than truncates', async () => {
    const fx = await fxMod();
    // 506 raw, 500 trimmed: accepted, and stored WHOLE (never shortened to fit).
    const okNote = `   ${'x'.repeat(500)}   `;
    const saved = fx.fxRecordSale({ ...good, note: okNote });
    expect(saved.note).toHaveLength(500);
    // 501 trimmed: refused.
    expect(() => fx.fxRecordSale({ ...good, note: 'x'.repeat(501) })).toThrow('note_too_long');
  });

  it('answers sale_not_found for an edit or a delete of something already gone', async () => {
    const fx = await fxMod();
    expect(() => fx.fxUpdateSale('no-such-sale', good)).toThrow('sale_not_found');
    expect(() => fx.fxDeleteSale('no-such-sale')).toThrow('sale_not_found');

    const created = fx.fxRecordSale(good);
    fx.fxDeleteSale(created.id);
    // Gone means gone: a second delete is a refusal, not a polite success.
    expect(() => fx.fxDeleteSale(created.id)).toThrow('sale_not_found');
  });

  it('replaces the WHOLE record on an update: an absent optional clears it', async () => {
    const fx = await fxMod();
    const created = fx.fxRecordSale({
      ...good,
      marketId: DAMBULLA,
      quantityKg: 40,
      note: 'first buyer',
    });
    const updated = fx.fxUpdateSale(created.id, { saleDate: '2026-01-06', pricePerKg: 210 });
    expect(updated.marketId).toBeNull();
    expect(updated.marketName).toBeNull();
    expect(updated.marketShortCode).toBeNull();
    expect(updated.quantityKg).toBeNull();
    expect(updated.note).toBeNull();
    // ...and the crop is untouched, because the wire does not accept one.
    expect(updated.cropId).toBe(TOMATO);
  });

  it('orders by sale day, then by when it was entered — the server’s own order', async () => {
    const fx = await fxMod();
    const rows = fx.fxGetSales(1, 50).items;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      expect(prev.saleDate >= cur.saleDate).toBe(true);
      if (prev.saleDate === cur.saleDate) {
        expect(prev.createdAtUtc >= cur.createdAtUtc).toBe(true);
      }
    }
    // Two seeded sales share 2026-07-18, so the tie-break above is really exercised.
    expect(rows.filter((r) => r.saleDate === '2026-07-18').length).toBeGreaterThan(1);
  });

  it('clamps the page size to 50 and echoes back what it really served', async () => {
    const fx = await fxMod();
    const page = fx.fxGetSales(1, 500);
    expect(page.pageSize).toBe(50);
    expect(page.page).toBe(1);
    expect(fx.fxGetSales(0, 20).page).toBe(1);
  });

  it('narrows to one crop, case-insensitively, without touching the others', async () => {
    const fx = await fxMod();
    const all = fx.fxGetSales(1, 50).total;
    const mine = fx.fxGetSales(1, 50, TOMATO.toUpperCase());
    expect(mine.total).toBeGreaterThan(0);
    expect(mine.total).toBeLessThan(all);
    expect(mine.items.every((s) => s.cropId === TOMATO)).toBe(true);
  });
});

// The refusal has to REACH the farmer as itself in fixtures mode too, or the one mode a
// reviewer reads the copy in shows "something went wrong" for all nine distinct answers.
describe('fixtures mode — a refusal arrives with its code, like the live path', () => {
  it('turns the store’s refusal into an ApiError carrying the wire code', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_MODE', 'fixtures');
    const { api, ApiError } = await import('../api/client');
    await expect(api.deleteSale('no-such-sale')).rejects.toMatchObject({
      code: 'sale_not_found',
      status: 404,
    });
    await expect(
      api.recordSale({ cropId: 'nope', saleDate: '2026-01-05', pricePerKg: 10 }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      api.recordSale({ cropId: 'nope', saleDate: '2026-01-05', pricePerKg: 10 }),
    ).rejects.toMatchObject({ code: 'unknown_crop', status: 400 });
  });
});
