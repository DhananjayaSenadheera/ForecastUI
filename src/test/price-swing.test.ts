import { describe, it, expect } from 'vitest';
import type { PriceHistoryPoint } from '../api/types';
import {
  SWING_BIG_CV,
  SWING_MIN_OBS,
  SWING_MODERATE_CV,
  classifyPriceSwing,
  swingGlyph,
  swingLabelKey,
} from '../lib/priceSwing';

/** Build a history whose daily MIDPOINTS are exactly `mids` (the classifier reads the
 *  midpoint of the published low–high, so the spread around it must not matter). */
function history(mids: number[], spread = 10): PriceHistoryPoint[] {
  return mids.map((m, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    minPrice: m - spread / 2,
    maxPrice: m + spread / 2,
  }));
}

/** Sample (ddof=1) coefficient of variation — the reference the classifier must match. */
function cvOf(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

describe('lib/priceSwing — thin data says NOTHING (never a comforting "steady")', () => {
  it('returns null below the minimum observation count', () => {
    expect(classifyPriceSwing(history([100, 101, 100, 99, 100, 101, 100]))).toBeNull();
    expect(SWING_MIN_OBS).toBe(8);
  });

  it('returns null for an absent or empty history', () => {
    expect(classifyPriceSwing(null)).toBeNull();
    expect(classifyPriceSwing(undefined)).toBeNull();
    expect(classifyPriceSwing([])).toBeNull();
  });

  it('speaks as soon as it has exactly the minimum observations', () => {
    const swing = classifyPriceSwing(history(Array(SWING_MIN_OBS).fill(100)));
    expect(swing).not.toBeNull();
    expect(swing!.observations).toBe(SWING_MIN_OBS);
  });

  it('returns null when the mean cannot carry a ratio (no divide-by-zero level)', () => {
    expect(classifyPriceSwing(history(Array(10).fill(0), 0))).toBeNull();
  });
});

describe('lib/priceSwing — classification thresholds', () => {
  it('a flat series is steady', () => {
    const swing = classifyPriceSwing(history(Array(12).fill(150)));
    expect(swing).toEqual({ level: 'steady', cv: 0, observations: 12 });
  });

  it('classifies just BELOW the moderate cut point as steady', () => {
    const mids = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 120];
    expect(cvOf(mids)).toBeLessThan(SWING_MODERATE_CV);
    expect(classifyPriceSwing(history(mids))!.level).toBe('steady');
  });

  it('classifies between the two cut points as moderate', () => {
    const mids = [100, 110, 95, 105, 90, 115, 100, 108, 92, 112];
    const cv = cvOf(mids);
    expect(cv).toBeGreaterThanOrEqual(SWING_MODERATE_CV);
    expect(cv).toBeLessThan(SWING_BIG_CV);
    expect(classifyPriceSwing(history(mids))!.level).toBe('moderate');
  });

  it('classifies at or above the big cut point as big', () => {
    const mids = [60, 140, 70, 150, 80, 130, 65, 145, 75, 135];
    expect(cvOf(mids)).toBeGreaterThanOrEqual(SWING_BIG_CV);
    expect(classifyPriceSwing(history(mids))!.level).toBe('big');
  });

  it('reports the CV it actually used, matching a sample (ddof=1) computation', () => {
    const mids = [100, 110, 95, 105, 90, 115, 100, 108, 92, 112];
    expect(classifyPriceSwing(history(mids))!.cv).toBeCloseTo(cvOf(mids), 12);
  });

  it('reads the MIDPOINT, so a wider published low–high alone changes nothing', () => {
    const mids = [100, 110, 95, 105, 90, 115, 100, 108, 92, 112];
    const narrow = classifyPriceSwing(history(mids, 2))!;
    const wide = classifyPriceSwing(history(mids, 40))!;
    expect(wide.level).toBe(narrow.level);
    expect(wide.cv).toBeCloseTo(narrow.cv, 12);
  });

  it('is scale-free: the same shape at Rs 30 and Rs 500 gets the same level', () => {
    const shape = [1, 1.1, 0.95, 1.05, 0.9, 1.15, 1, 1.08, 0.92, 1.12];
    const cheap = classifyPriceSwing(history(shape.map((s) => s * 30)))!;
    const dear = classifyPriceSwing(history(shape.map((s) => s * 500)))!;
    expect(cheap.level).toBe(dear.level);
    expect(cheap.cv).toBeCloseTo(dear.cv, 10);
  });
});

describe('lib/priceSwing — presentation contract', () => {
  it('gives every level its own glyph AND its own word key (colour never alone)', () => {
    expect(new Set(Object.values(swingGlyph)).size).toBe(3);
    expect(swingLabelKey('steady')).toBe('portfolio.swing.steady');
    expect(swingLabelKey('moderate')).toBe('portfolio.swing.moderate');
    expect(swingLabelKey('big')).toBe('portfolio.swing.big');
  });

  it('escalates the glyph with the level, so the meter reads without colour', () => {
    expect(swingGlyph.steady.length).toBeLessThan(swingGlyph.moderate.length);
    expect(swingGlyph.moderate.length).toBeLessThan(swingGlyph.big.length);
  });
});
