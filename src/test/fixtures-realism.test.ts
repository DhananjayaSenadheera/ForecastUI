import { describe, it, expect } from 'vitest';
import {
  CROP_REFERENCE,
  cropReferencePrice,
  fxCrops,
  fxForecastFor,
  fxHarvestWindowFor,
  fxTimelineFor,
} from '../api/fixtures';
import { RecommendationLevel } from '../api/types';
import { ymdLocal } from '../lib/format';

/** Local date arithmetic — the fixtures' own addDays is not exported. */
function addDaysForTest(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return ymdLocal(dt);
}

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

  // The invariant PR #58 established in production, mirrored here: /predict and
  // /harvest-window build the same what-if row from the same anchor, so for a given
  // planting date they return identical p10/p50/p90 and the same harvest date
  // (Python's TestForecastAgreement). The fixtures used to break it — every date
  // returned one fixed price and only harvestDate moved — which made demo mode a
  // working replica of the very bug that was fixed, and made "tap a bar to compare
  // planting dates" look like it did nothing.
  describe('fixture forecast agrees with the window strip, date by date', () => {
    const today = ymdLocal(new Date());
    const rankable = ['c0000002-0000-0000-0000-000000000002', 'c0000007-0000-0000-0000-000000000007']; // Beans (rising), Cabbage (falling)

    it('matches the window point for the first, middle and last bar of the sweep', () => {
      for (const id of rankable) {
        const w = fxHarvestWindowFor(id, 60, today);
        expect(w.rankable).toBe(true);
        const probes = [0, 1, 17, 30, 59, w.points.length - 1];
        for (const i of probes) {
          const p = w.points[i];
          const card = fxForecastFor(id, p.plantDate);
          expect(card.predictedPrice).toBe(p.predictedPrice);
          expect(card.lowerBound).toBe(p.lowerBound);
          expect(card.upperBound).toBe(p.upperBound);
          expect(card.harvestDate).toBe(p.harvestDate);
        }
      }
    });

    it('actually MOVES with the date — the point of the whole exercise', () => {
      const w = fxHarvestWindowFor(rankable[0], 60, today);
      const prices = w.points.map((p) => fxForecastFor(rankable[0], p.plantDate).predictedPrice);
      expect(new Set(prices).size).toBeGreaterThan(10);
      expect(Math.max(...prices)).toBeGreaterThan(Math.min(...prices) * 1.02);
    });

    it('keeps harvestDate consistent with the growth period it reports', () => {
      const w = fxHarvestWindowFor(rankable[1], 60, today);
      const card = fxForecastFor(rankable[1], w.points[20].plantDate);
      expect(card.growthPeriodDays).not.toBeNull();
      expect(card.harvestDate).toBe(addDaysForTest(card.plantDate, card.growthPeriodDays!));
    });

    it('leaves dates OUTSIDE the sweep on the pinned tier fixture', () => {
      // Back-dated planting has no window point to agree with, so there is nothing
      // to be consistent WITH — inventing agreement there would be the dishonest
      // choice, and it is what keeps the confidence-tier showcase stable.
      expect(fxForecastFor('c0000002-0000-0000-0000-000000000002', PLANT).predictedPrice).toBe(310);
    });

    it('lets the VERDICT move with the date too, using the .NET thresholds', () => {
      // A price that changes beside a verdict that cannot is its own dishonesty:
      // Cabbage's whole sweep sits below today, so every date must read as a loss
      // or near-flat — never "favorable".
      const w = fxHarvestWindowFor(rankable[1], 60, today);
      for (const p of [w.points[0], w.points[30], w.points[59]]) {
        const card = fxForecastFor(rankable[1], p.plantDate);
        expect(card.predictedPrice).toBeLessThan(card.currentPrice);
        expect(card.recommendationLevel).toBeLessThanOrEqual(RecommendationLevel.RecommendedWithRisk);
        expect(card.upsidePct).toBeLessThanOrEqual(0);
      }
    });
  });

  it('a generated crop stays deterministic across calls', () => {
    const a = fxTimelineFor('c0000012-0000-0000-0000-000000000012'); // Banana
    const b = fxTimelineFor('c0000012-0000-0000-0000-000000000012');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
