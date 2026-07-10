import { describe, it, expect } from 'vitest';
import {
  ForecastConfidenceCode,
  RecommendationLevel,
} from '../api/types';
import {
  formatPrice,
  formatRange,
  formatDate,
  mapConfidenceString,
  mapConfidenceCode,
  mapVerdict,
} from '../lib/format';

describe('confidence mapping (honest-uncertainty, frozen strings)', () => {
  it('maps the frozen confidence strings to display buckets without remapping them', () => {
    expect(mapConfidenceString('High')).toMatchObject({ labelKey: 'confidence.good', tone: 'good', dots: 3 });
    expect(mapConfidenceString('Medium')).toMatchObject({ labelKey: 'confidence.fair', tone: 'fair', dots: 2 });
    expect(mapConfidenceString('Low')).toMatchObject({ labelKey: 'confidence.low', tone: 'low', dots: 1 });
  });

  it('maps the integer ForecastConfidence enum the same way (best-crops path)', () => {
    expect(mapConfidenceCode(ForecastConfidenceCode.High).tone).toBe('good');
    expect(mapConfidenceCode(ForecastConfidenceCode.Medium).tone).toBe('fair');
    expect(mapConfidenceCode(ForecastConfidenceCode.Low).tone).toBe('low');
  });
});

describe('verdict mapping (amber little-data, red only for not-recommended)', () => {
  it('reserves critical/red for NotRecommended and amber for RecommendedWithRisk', () => {
    expect(mapVerdict(RecommendationLevel.StronglyRecommended).tone).toBe('good');
    expect(mapVerdict(RecommendationLevel.Recommended).tone).toBe('good');
    expect(mapVerdict(RecommendationLevel.RecommendedWithRisk)).toMatchObject({
      labelKey: 'verdict.littleData',
      tone: 'warn',
    });
    expect(mapVerdict(RecommendationLevel.NotRecommended).tone).toBe('critical');
  });
});

describe('number / currency / date formatting', () => {
  it('rounds prices to whole rupees with the translated Rs. label', () => {
    expect(formatPrice(551.6, 'en', 'Rs.')).toBe('Rs. 552');
    expect(formatPrice(240, 'en', 'රු.')).toBe('රු. 240');
  });

  it('renders a P10–P90 band as a labelled range, never a bare number', () => {
    expect(formatRange(233, 694, 'en', 'Rs.')).toBe('Rs. 233 – 694');
  });

  it('formats dates locale-aware and survives bad input', () => {
    expect(formatDate('2026-10-15', 'en')).toContain('2026');
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
  });
});
