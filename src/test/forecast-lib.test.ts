import { describe, it, expect } from 'vitest';
import { RecommendationLevel } from '../api/types';
import {
  bandCentrePct,
  confidenceLabelKey,
  factorDirectionKey,
  factorGlyph,
  factorLabelKey,
  factorWeightPct,
  forecastVerdictTone,
  isLowTrust,
  maxFactorWeight,
} from '../lib/forecast';

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
