import { describe, it, expect } from 'vitest';
import {
  biggestMover,
  moverDirectionKey,
  moverGlyph,
  overviewHasData,
  partitionMovers,
} from '../lib/overview';
import { buildSparkline } from '../lib/prices';
import type { MarketMover, MarketOverview } from '../api/types';

const mv = (cropId: string, direction: 'up' | 'down', changePct: number): MarketMover => ({
  cropId,
  cropName: cropId,
  marketName: 'Dambulla',
  latestPrice: 100,
  previousPrice: 100,
  changePct,
  direction,
});

describe('overview lib — movers', () => {
  const movers = [mv('a', 'up', 15), mv('b', 'up', 6), mv('c', 'down', -12), mv('d', 'down', -4)];

  it('partitions into risers/fallers, preserving server order (never re-sorts)', () => {
    const { risers, fallers } = partitionMovers(movers);
    expect(risers.map((m) => m.cropId)).toEqual(['a', 'b']);
    expect(fallers.map((m) => m.cropId)).toEqual(['c', 'd']);
  });

  it('picks the biggest mover by absolute change', () => {
    // -12 has a larger magnitude than +15? no — 15 > 12, so 'a'; verify abs logic with a fall
    expect(biggestMover(movers)?.cropId).toBe('a');
    expect(biggestMover([mv('x', 'up', 5), mv('y', 'down', -20)])?.cropId).toBe('y');
    expect(biggestMover([])).toBeNull();
  });

  it('maps direction to a glyph + i18n key, never a colour', () => {
    expect(moverGlyph.up).toBe('▲');
    expect(moverGlyph.down).toBe('▼');
    expect(moverDirectionKey('up')).toBe('pages.overview.rising');
    expect(moverDirectionKey('down')).toBe('pages.overview.falling');
  });

  it('reads asOf honestly for the empty state', () => {
    const base: MarketOverview = {
      asOf: null,
      windowDays: 30,
      marketsWithData: 0,
      cropsWithData: 0,
      movers: [],
      latestPrices: [],
    };
    expect(overviewHasData(base)).toBe(false);
    expect(overviewHasData({ ...base, asOf: '2026-07-10' })).toBe(true);
  });
});

describe('overview lib — sparkline geometry', () => {
  it('returns null for an empty series (nothing to draw)', () => {
    expect(buildSparkline([])).toBeNull();
  });

  it('lays out a multi-point trend line with an end dot', () => {
    const geo = buildSparkline([
      { date: '2026-07-08', price: 100 },
      { date: '2026-07-09', price: 120 },
      { date: '2026-07-10', price: 140 },
    ])!;
    expect(geo.singlePoint).toBe(false);
    expect(geo.min).toBe(100);
    expect(geo.max).toBe(140);
    // three coordinate pairs in the polyline
    expect(geo.polyline.trim().split(' ')).toHaveLength(3);
    // rising series => latest point sits higher (smaller y) than the first
    const ys = geo.polyline.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys[2]).toBeLessThan(ys[0]);
    expect(geo.last.y).toBeCloseTo(ys[2]);
  });

  it('degrades a single point to a centred dot (no fake line)', () => {
    const geo = buildSparkline([{ date: '2026-07-10', price: 90 }], { width: 100, height: 24 })!;
    expect(geo.singlePoint).toBe(true);
    expect(geo.last.x).toBeCloseTo(50);
    expect(geo.last.y).toBeCloseTo(12);
  });
});
