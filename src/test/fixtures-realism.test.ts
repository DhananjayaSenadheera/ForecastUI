import { describe, it, expect } from 'vitest';
import {
  CROP_REFERENCE,
  cropReferencePrice,
  fxCrops,
  fxForecastFor,
  fxTimelineFor,
} from '../api/fixtures';

// FE-19: the compare/prices bug was that every crop without a dedicated fixture
// fell back to Capsicum's 552 reference, so most crop pairs read identical prices.
// These tests lock in that EVERY crop now has a distinct, self-consistent series.
const PLANT = '2026-07-10';
const ids = fxCrops.map((c) => c.id);

describe('FE-19 fixture realism — distinct per-crop series', () => {
  it('gives every fxCrops crop a distinct reference price', () => {
    const refs = ids.map((id) => cropReferencePrice(id));
    expect(new Set(refs).size).toBe(ids.length);
    // Every crop is in the source-of-truth table (no default fallback needed).
    for (const id of ids) expect(CROP_REFERENCE[id]).toBeTypeOf('number');
  });

  it('no two crops have an identical 12-month timeline series (pairwise)', () => {
    const seen = new Map<string, string>();
    for (const id of ids) {
      const tl = fxTimelineFor(id);
      const sig = JSON.stringify({ h: tl.history, f: tl.forecast });
      if (seen.has(sig)) {
        throw new Error(`timeline for ${id} is identical to ${seen.get(sig)}`);
      }
      seen.set(sig, id);
    }
    expect(seen.size).toBe(ids.length);
  });

  it('forecast predictedPrice differs across all crops', () => {
    const predicted = ids.map((id) => fxForecastFor(id, PLANT).predictedPrice);
    expect(new Set(predicted).size).toBe(ids.length);
  });

  it('the Capsicum/Tomato compare regression is fixed (distinct series + prices)', () => {
    const capId = 'c0000001-0000-0000-0000-000000000001';
    const tomId = 'c0000003-0000-0000-0000-000000000003';
    const cap = fxTimelineFor(capId);
    const tom = fxTimelineFor(tomId);
    expect(JSON.stringify(cap.history)).not.toBe(JSON.stringify(tom.history));
    expect(fxForecastFor(capId, PLANT).predictedPrice).not.toBe(
      fxForecastFor(tomId, PLANT).predictedPrice,
    );
  });

  it('keeps the pinned confidence-tier fixtures intact (Capsicum/Beans/Passion)', () => {
    expect(fxForecastFor('c0000001-0000-0000-0000-000000000001', PLANT).predictedPrice).toBe(552);
    expect(fxForecastFor('c0000002-0000-0000-0000-000000000002', PLANT).predictedPrice).toBe(310);
    expect(fxForecastFor('c0000004-0000-0000-0000-000000000004', PLANT).predictedPrice).toBe(210);
    // Passion keeps its deliberately THIN 4-month history.
    expect(fxTimelineFor('c0000004-0000-0000-0000-000000000004').history).toHaveLength(4);
    // Generated crops still get a full 12-month history.
    expect(fxTimelineFor('c0000003-0000-0000-0000-000000000003').history).toHaveLength(12);
  });

  it('a generated crop stays deterministic across calls', () => {
    const a = fxTimelineFor('c0000012-0000-0000-0000-000000000012'); // Banana
    const b = fxTimelineFor('c0000012-0000-0000-0000-000000000012');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
