import { describe, it, expect } from 'vitest';
import { buildCompareGeometry, type CompareSeriesInput } from '../lib/timeline';
import { parseCropIdList } from '../lib/crops';
import type { CropTimeline } from '../api/types';

function tl(overrides: Partial<CropTimeline>): CropTimeline {
  return {
    cropName: 'X',
    activePredictor: 'residual',
    confidence: 'High',
    modelVersion: 'v13',
    explanation: '',
    history: [],
    forecast: [],
    ...overrides,
  };
}

const FULL: CompareSeriesInput = {
  cropId: 'a',
  label: 'Capsicum',
  timeline: tl({
    history: [
      { month: '2026-05', avgPrice: 400 },
      { month: '2026-06', avgPrice: 460 },
    ],
    forecast: [{ horizonMonths: 1, date: '2026-07-10', predictedPrice: 500, lowerBound: 300, upperBound: 700 }],
  }),
};

const THIN: CompareSeriesInput = {
  cropId: 'b',
  label: 'Passion',
  timeline: tl({
    history: [{ month: '2026-06', avgPrice: 180 }],
    forecast: [{ horizonMonths: 1, date: '2026-07-20', predictedPrice: 200, lowerBound: 90, upperBound: 360 }],
  }),
};

describe('parseCropIdList (FE-14 deep-link parsing)', () => {
  it('splits, trims, dedupes and caps', () => {
    expect(parseCropIdList('a, b ,c', 3)).toEqual(['a', 'b', 'c']);
    expect(parseCropIdList('a,a,b', 3)).toEqual(['a', 'b']); // dedupe, first-seen order
    expect(parseCropIdList('a,b,c,d', 3)).toEqual(['a', 'b', 'c']); // cap at max
    expect(parseCropIdList('', 3)).toEqual([]);
    expect(parseCropIdList(null, 3)).toEqual([]);
    expect(parseCropIdList(' , ,', 3)).toEqual([]); // all empty
  });
});

describe('buildCompareGeometry (FE-14 shared-scale overlay)', () => {
  it('returns null for no drawable points', () => {
    expect(buildCompareGeometry([])).toBeNull();
    expect(buildCompareGeometry([{ cropId: 'z', label: 'Z', timeline: tl({}) }])).toBeNull();
  });

  it('puts every crop on ONE shared y-domain spanning all series values', () => {
    const geo = buildCompareGeometry([FULL, THIN])!;
    expect(geo).not.toBeNull();
    // Domain must enclose the global min (Passion low 90) and max (Capsicum high 700).
    expect(geo.domain.min).toBeLessThanOrEqual(90);
    expect(geo.domain.max).toBeGreaterThanOrEqual(700);
    // One geometry entry per input series, order preserved.
    expect(geo.series.map((s) => s.cropId)).toEqual(['a', 'b']);
  });

  it('draws history (solid) + forecast (dashed) polylines and a band per crop', () => {
    const geo = buildCompareGeometry([FULL])!;
    const s = geo.series[0];
    expect(s.historyPolyline.split(' ').length).toBe(2); // two history months
    expect(s.forecastPolyline).not.toBe(''); // anchored forecast line
    expect(s.bandPolygon).not.toBe(''); // P10–P90 band present
    expect(s.hasForecast).toBe(true);
    expect(s.end).not.toBeNull(); // direct-label anchor
  });

  it('honours the shared date x-axis so a thin series starts later (higher x)', () => {
    // Capsicum history starts 2026-05; Passion history starts 2026-06 → its first
    // history x must sit to the right of Capsicum's first history x on the shared axis.
    const geo = buildCompareGeometry([FULL, THIN])!;
    const capFirstX = Number(geo.series[0].historyPolyline.split(' ')[0].split(',')[0]);
    const passionFirstX = Number(geo.series[1].historyPolyline.split(' ')[0].split(',')[0]);
    expect(passionFirstX).toBeGreaterThan(capFirstX);
  });
});
