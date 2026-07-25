import { describe, it, expect } from 'vitest';
import { RecommendationLevel } from '../api/types';
import {
  bandCentrePct,
  confidenceLabelKey,
  factorDirectionKey,
  factorGlyph,
  factorLabelKey,
  factorSentenceKey,
  factorStrength,
  factorStrengthKey,
  factorWeightPct,
  forecastVerdictTone,
  isLowTrust,
  maxFactorWeight,
  totalFactorWeight,
} from '../lib/forecast';
import type { ForecastFactor } from '../api/types';

describe('bandCentrePct (marked-centre position, never a bare interval)', () => {
  it('places the centre proportionally inside the P10–P90 band', () => {
    expect(bandCentrePct(233, 552, 694)).toBeCloseTo(69.19, 1);
    expect(bandCentrePct(100, 150, 200)).toBe(50);
  });

  it('clamps out-of-range / degenerate bands to the track', () => {
    expect(bandCentrePct(100, 50, 200)).toBe(0); // centre below floor -> clamp low
    expect(bandCentrePct(100, 300, 200)).toBe(100); // centre above ceiling -> clamp high
    expect(bandCentrePct(200, 200, 200)).toBe(50); // zero-width band -> middle
  });
});

describe('isLowTrust (honest low-trust trigger)', () => {
  it('triggers on the explicit lowTrust flag OR the frozen Low confidence string', () => {
    expect(isLowTrust({ confidence: 'Low', lowTrust: false })).toBe(true);
    expect(isLowTrust({ confidence: 'High', lowTrust: true })).toBe(true);
    expect(isLowTrust({ confidence: 'High', lowTrust: false })).toBe(false);
    expect(isLowTrust({ confidence: 'Medium', lowTrust: false })).toBe(false);
  });
});

describe('forecastVerdictTone (red reserved for FE-7)', () => {
  it('never returns a critical/red tone; clamps NotRecommended to neutral', () => {
    expect(forecastVerdictTone(RecommendationLevel.StronglyRecommended)).toBe('good');
    expect(forecastVerdictTone(RecommendationLevel.Recommended)).toBe('good');
    expect(forecastVerdictTone(RecommendationLevel.RecommendedWithRisk)).toBe('warn');
    expect(forecastVerdictTone(RecommendationLevel.NotRecommended)).toBe('neutral');
  });
});

describe('confidenceLabelKey (frozen strings, translate label only)', () => {
  it('maps the frozen strings to display label keys without remapping', () => {
    expect(confidenceLabelKey('High')).toBe('confidence.good');
    expect(confidenceLabelKey('Medium')).toBe('confidence.fair');
    expect(confidenceLabelKey('Low')).toBe('confidence.low');
  });
});

describe('factor direction/label mapping (FE-6)', () => {
  it('maps each direction to a glyph and a plain-language i18n key', () => {
    expect(factorGlyph.up).toBe('↑');
    expect(factorGlyph.down).toBe('↓');
    expect(factorGlyph.neutral).toBe('→');
    expect(factorDirectionKey('up')).toBe('factor.dir.up');
    expect(factorDirectionKey('down')).toBe('factor.dir.down');
    expect(factorDirectionKey('neutral')).toBe('factor.dir.neutral');
  });

  it('namespaces a reason code to its i18n label key', () => {
    expect(factorLabelKey('festival_demand')).toBe('factor.codes.festival_demand');
  });
});

describe('factor weight bar (shared-scale, FE-6)', () => {
  it('finds the largest positive weight as the shared-scale reference', () => {
    expect(maxFactorWeight([{ code: 'a', direction: 'up', weight: 0.5 }, { code: 'b', direction: 'up', weight: 0.9 }])).toBe(0.9);
    expect(maxFactorWeight([{ code: 'a', direction: 'up' }])).toBe(0);
    expect(maxFactorWeight([])).toBe(0);
  });

  it('scales each weight against the panel max (full bar at the max)', () => {
    expect(factorWeightPct(0.9, 0.9)).toBe(100);
    expect(factorWeightPct(0.45, 0.9)).toBe(50);
    expect(factorWeightPct(0.3, 0.9)).toBeCloseTo(33.33, 1);
  });

  it('returns null (draw no bar) when there is nothing honest to show', () => {
    expect(factorWeightPct(undefined, 0.9)).toBeNull();
    expect(factorWeightPct(0, 0.9)).toBeNull();
    expect(factorWeightPct(0.5, 0)).toBeNull(); // no positive reference
  });
});

describe('factor causal sentence keys (FE-6 redesign)', () => {
  it('keys a sentence by code AND direction — up/down are different states', () => {
    expect(factorSentenceKey('seasonal_supply', 'up')).toBe('factor.sentence.seasonal_supply.up');
    expect(factorSentenceKey('seasonal_supply', 'down')).toBe('factor.sentence.seasonal_supply.down');
    expect(factorSentenceKey('economic_conditions', 'up')).toBe('factor.sentence.economic_conditions.up');
  });

  it('collapses every neutral factor onto one generic key (label is interpolated)', () => {
    expect(factorSentenceKey('seasonal_supply', 'neutral')).toBe('factor.sentenceNeutral');
    expect(factorSentenceKey('weather_monsoon', 'neutral')).toBe('factor.sentenceNeutral');
  });
});

describe('factor strength WORD (magnitude never lives in the bar alone)', () => {
  const f = (weight?: number): ForecastFactor => ({ code: 'x', direction: 'up', weight });

  it('sums only the positive displayed weights as the denominator', () => {
    expect(totalFactorWeight([f(0.44), f(0.24), f(0.14), f(0.01)])).toBeCloseTo(0.83, 5);
    expect(totalFactorWeight([f(0.5), f(undefined), f(0)])).toBe(0.5);
    expect(totalFactorWeight([])).toBe(0);
  });

  it('buckets the share of the displayed total: >=40% strong, >=20% medium, else small', () => {
    expect(factorStrength(0.4, 1)).toBe('strong'); // exactly at the boundary
    expect(factorStrength(0.39, 1)).toBe('medium');
    expect(factorStrength(0.2, 1)).toBe('medium'); // exactly at the boundary
    expect(factorStrength(0.19, 1)).toBe('small');
    expect(factorStrength(0.01, 1)).toBe('small');
  });

  it('is relative, not absolute: a small weight is strong when it dominates', () => {
    // one factor carrying the whole (small) displayed total is still the driver
    expect(factorStrength(0.05, 0.06)).toBe('strong');
    // and a big weight is small when everything else is bigger
    expect(factorStrength(0.3, 3)).toBe('small');
  });

  it('claims no strength when there is no honest basis for a word', () => {
    expect(factorStrength(undefined, 1)).toBeNull();
    expect(factorStrength(0, 1)).toBeNull();
    expect(factorStrength(0.5, 0)).toBeNull();
  });

  it('namespaces the strength word for translation', () => {
    expect(factorStrengthKey('strong')).toBe('factor.strength.strong');
    expect(factorStrengthKey('small')).toBe('factor.strength.small');
  });
});
