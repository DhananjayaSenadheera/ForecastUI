import { describe, it, expect } from 'vitest';
import { buildTimelineGeometry, niceScale, isShortHistory, SHORT_HISTORY_MONTHS } from '../lib/timeline';
import { fxTimeline, fxTimelineLow } from '../api/fixtures';

describe('niceScale (clean Rs. gridlines, 3–4 ticks)', () => {
  it('rounds the domain out and returns evenly spaced ticks', () => {
    const s = niceScale(233, 710, 4);
    expect(s.niceMin).toBeLessThanOrEqual(233);
    expect(s.niceMax).toBeGreaterThanOrEqual(710);
    expect(s.ticks.length).toBeGreaterThanOrEqual(3);
    expect(s.ticks.length).toBeLessThanOrEqual(6);
    // evenly spaced
    const deltas = s.ticks.slice(1).map((v, i) => v - s.ticks[i]);
    expect(new Set(deltas).size).toBe(1);
  });

  it('does not divide-by-zero on a degenerate (flat) domain', () => {
    const s = niceScale(300, 300, 4);
    expect(s.niceMax).toBeGreaterThan(s.niceMin);
    expect(Number.isFinite(s.step)).toBe(true);
  });
});

describe('buildTimelineGeometry (band cone, markers, monotonic x)', () => {
  const geo = buildTimelineGeometry(fxTimeline, { harvestDate: '2026-10-15' });

  it('lays history and forecast on a monotonic increasing x-axis', () => {
    const hx = geo.history.map((p) => p.x);
    for (let i = 1; i < hx.length; i++) expect(hx[i]).toBeGreaterThan(hx[i - 1]);
    const fx = geo.forecast.map((p) => p.x);
    for (let i = 1; i < fx.length; i++) expect(fx[i]).toBeGreaterThan(fx[i - 1]);
    // forecast sits to the right of history
    expect(geo.forecast[0].x).toBeGreaterThan(geo.history[geo.history.length - 1].x);
  });

  it('places the Today marker at the last history point', () => {
    expect(geo.todayX).toBeCloseTo(geo.history[geo.history.length - 1].x, 1);
    expect(geo.todayY).toBeCloseTo(geo.history[geo.history.length - 1].y, 1);
  });

  it('band ALWAYS encloses the central line (never a false-precise line)', () => {
    for (const f of geo.forecast) {
      // SVG y grows downward: upper price -> smaller y, lower price -> larger y
      expect(f.yUpper).toBeLessThanOrEqual(f.y);
      expect(f.y).toBeLessThanOrEqual(f.yLower);
    }
  });

  it('snaps the harvest marker to the nearest forecast point by date', () => {
    expect(geo.harvest).not.toBeNull();
    const last = geo.forecast[geo.forecast.length - 1]; // 2026-10-15 is the last fc point
    expect(geo.harvest!.index).toBe(last.index);
    expect(geo.harvest!.x).toBeCloseTo(last.x, 1);
  });

  it('flags the harvest month among the x-axis labels', () => {
    expect(geo.xTicks.some((tk) => tk.isHarvest)).toBe(true);
    expect(geo.xTicks.some((tk) => tk.isToday)).toBe(true);
  });

  it('thins x labels so at most ~7 render (readable at 360px)', () => {
    expect(geo.xTicks.length).toBeLessThanOrEqual(9); // 7 cap + forced harvest/today/last
  });

  it('emits SVG strings for the history line, forecast line and band polygon', () => {
    expect(geo.historyPolyline.split(' ').length).toBe(fxTimeline.history.length);
    // forecast line = today anchor + each forecast point
    expect(geo.forecastPolyline.split(' ').length).toBe(fxTimeline.forecast.length + 1);
    expect(geo.bandPolygon.length).toBeGreaterThan(0);
  });
});

describe('isShortHistory (honest thin-data trigger)', () => {
  it('flags a thin series and clears a full 12-month one', () => {
    expect(isShortHistory(fxTimelineLow.history)).toBe(true); // 4 months
    expect(fxTimelineLow.history.length).toBeLessThan(SHORT_HISTORY_MONTHS);
    expect(isShortHistory(fxTimeline.history)).toBe(false); // 12 months
    expect(isShortHistory([])).toBe(false); // empty is handled as empty-state, not "short"
  });
});
