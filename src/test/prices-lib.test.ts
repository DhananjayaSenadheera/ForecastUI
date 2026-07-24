import { describe, it, expect } from 'vitest';
import type { Market, PriceHistoryPoint } from '../api/types';
import {
  assignMarketColors,
  buildMarketBars,
  buildPriceLineGeometry,
  isShortHistory,
  marketColorVar,
  summarizeMarkets,
  toPricePoints,
  SHORT_PRICE_DAYS,
} from '../lib/prices';

const hist = (rows: Array<[string, number, number]>): PriceHistoryPoint[] =>
  rows.map(([date, minPrice, maxPrice]) => ({ date, minPrice, maxPrice }));

const SERIES = hist([
  ['2026-07-06', 440, 500],
  ['2026-07-07', 450, 520],
  ['2026-07-08', 460, 540],
  ['2026-07-09', 455, 530],
  ['2026-07-10', 470, 552],
]);

describe('prices lib — single-market line geometry', () => {
  it('returns null for an empty series (empty state is a component concern)', () => {
    expect(buildPriceLineGeometry([])).toBeNull();
  });

  it('computes a mid midpoint between daily low and high', () => {
    const pts = toPricePoints(SERIES);
    expect(pts[0].mid).toBe(470); // (440+500)/2
    expect(pts[4].mid).toBe(511); // (470+552)/2
  });

  it('draws the min–max envelope so max is never below min in SVG coords', () => {
    const geo = buildPriceLineGeometry(SERIES, { width: 640, height: 220 })!;
    expect(geo).not.toBeNull();
    // SVG y grows downward: the max edge (yMax) sits ABOVE the min edge (yMin).
    for (const p of geo.points) {
      expect(p.yMax).toBeLessThanOrEqual(p.yMin);
      expect(p.yMid).toBeLessThanOrEqual(p.yMin);
      expect(p.yMid).toBeGreaterThanOrEqual(p.yMax);
    }
    expect(geo.bandPolygon.length).toBeGreaterThan(0);
    expect(geo.midPolyline.split(' ').length).toBe(SERIES.length);
  });

  it('flags a short history under the threshold', () => {
    expect(isShortHistory(SERIES.slice(0, SHORT_PRICE_DAYS - 1))).toBe(true);
    expect(isShortHistory(SERIES)).toBe(false);
    expect(isShortHistory([])).toBe(false);
  });
});

describe('prices lib — market colours (stable by id order, never by rank)', () => {
  it('cycles the Okabe–Ito quartet', () => {
    expect(marketColorVar(0)).toBe('var(--cat-1)');
    expect(marketColorVar(3)).toBe('var(--cat-4)');
    expect(marketColorVar(4)).toBe('var(--cat-1)'); // wraps
  });

  it('assigns colours by ascending market id, regardless of input order', () => {
    const a = assignMarketColors(['m3', 'm1', 'm2']);
    const b = assignMarketColors(['m1', 'm2', 'm3']);
    expect(a.get('m1')).toBe('var(--cat-1)');
    expect(a.get('m2')).toBe('var(--cat-2)');
    expect(a.get('m3')).toBe('var(--cat-3)');
    // order of input does not change the mapping
    expect(a.get('m2')).toBe(b.get('m2'));
  });
});

describe('prices lib — market comparison', () => {
  const markets: Market[] = [
    { id: 'm1', name: 'Dambulla', district: 'Matale', marketType: 1, isEconomicCenter: true, hasStoredData: true, lastStoredDate: '2026-07-10', isTrainingSource: true },
    { id: 'm2', name: 'Colombo', district: 'Colombo', marketType: 1, isEconomicCenter: false, hasStoredData: true, lastStoredDate: '2026-07-10', isTrainingSource: true },
    { id: 'm3', name: 'Kandy', district: 'Kandy', marketType: 1, isEconomicCenter: false, hasStoredData: false, lastStoredDate: null, isTrainingSource: false },
  ];
  const byMarket: Record<string, PriceHistoryPoint[]> = {
    m1: hist([['2026-07-09', 400, 440], ['2026-07-10', 410, 450]]),
    m2: hist([['2026-07-09', 520, 560], ['2026-07-10', 530, 580]]),
    m3: [], // no data — honestly excluded
  };

  it('summarises only markets that have data, keeping stable colours', () => {
    const s = summarizeMarkets(markets, byMarket);
    expect(s.map((x) => x.marketId)).toEqual(['m1', 'm2']); // m3 excluded
    expect(s[0].colorVar).toBe('var(--cat-1)'); // m1 by id order
    expect(s[1].colorVar).toBe('var(--cat-2)'); // m2 by id order
    // m1 avg = ((420)+(430))/2 = 425
    expect(s[0].avg).toBe(425);
    expect(s[0].min).toBe(400);
    expect(s[0].max).toBe(450);
  });

  it('builds shared-scale bars with avg pct on a common axis', () => {
    const s = summarizeMarkets(markets, byMarket);
    const { axisMax, bars } = buildMarketBars(s);
    expect(bars.length).toBe(2);
    expect(axisMax).toBeGreaterThanOrEqual(580); // encloses the dearest max
    // both bars share the same axisMax
    for (const b of bars) {
      expect(b.pct).toBeGreaterThan(0);
      expect(b.pct).toBeLessThanOrEqual(100);
      expect(b.maxPct).toBeGreaterThanOrEqual(b.minPct);
    }
  });
});
