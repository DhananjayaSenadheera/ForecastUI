import { describe, it, expect } from 'vitest';
import type {
  Market,
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PortfolioPrediction,
} from '../api/types';
import {
  MAX_MARKETS_PER_CROP,
  MAX_WATCHED_CROPS,
  PRICE_AGE_NOTE_DAYS,
  chartMarketIdFor,
  dashboardEmptyState,
  daysBetweenYmd,
  economicCenterIdSet,
  harvestLinkFor,
  isDeratedPrediction,
  orderMarketsForPicker,
  priceAgeDays,
  primaryMarket,
  sameMarketSet,
  showsNationalLabel,
  toggleMarketSelection,
  trendGlyph,
  trendLabelKey,
  watchlistErrorKey,
  watchlistErrorParams,
} from '../lib/portfolio';

function block(over: Partial<PortfolioDashboardMarket> = {}): PortfolioDashboardMarket {
  return {
    marketId: 'm1',
    name: 'Dambulla Dedicated Economic Centre',
    shortCode: 'DEC',
    isDefaultMarket: false,
    price: null,
    priceUnavailableReason: 'no_recent_price',
    ...over,
  };
}

const PRICED = block({
  price: {
    price: 200,
    observedDate: '2026-07-25',
    direction: null,
    changePct: null,
    previousPrice: null,
    previousObservedDate: null,
  },
  priceUnavailableReason: null,
});

function item(over: Partial<PortfolioDashboardItem> = {}): PortfolioDashboardItem {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000003',
    plantedDate: null,
    markets: [block()],
    prediction: null,
    predictionUnavailableReason: 'no_snapshot',
    ...over,
  };
}

function prediction(activePredictor: string): PortfolioPrediction {
  return {
    predictedPrice: 210,
    lowerBound: 180,
    upperBound: 250,
    confidence: 'Low',
    activePredictor,
    modelVersion: 'v17',
    snapshotDate: '2026-07-27',
    harvestDate: '2026-10-30',
  };
}

const mk = (id: string, name: string, ec: boolean): Market => ({
  id,
  name,
  district: null,
  marketType: 1,
  isEconomicCenter: ec,
  hasStoredData: true,
  lastStoredDate: null,
  isTrainingSource: true,
});

describe('lib/portfolio — the card leads with markets[0]', () => {
  it('takes the FIRST market on the wire and never re-sorts (oldest-chosen wins)', () => {
    const kandy = block({ marketId: 'm3', name: 'Kandy', shortCode: 'KAN' });
    const dambulla = block({ marketId: 'm1' });
    expect(primaryMarket(item({ markets: [kandy, dambulla] }))?.marketId).toBe('m3');
    expect(primaryMarket(item({ markets: [dambulla, kandy] }))?.marketId).toBe('m1');
  });

  it('returns null rather than throwing on the contract-forbidden empty list', () => {
    expect(primaryMarket(item({ markets: [] }))).toBeNull();
  });
});

describe('lib/portfolio — national-forecast labelling (PRD §3.6)', () => {
  const centres = economicCenterIdSet([mk('m1', 'Dambulla', true), mk('m3', 'Kandy', false)]);

  it('labels predictions as national beside a market that is NOT the anchor', () => {
    expect(showsNationalLabel(block({ marketId: 'm3', name: 'Kandy' }), centres)).toBe(true);
  });

  it('does not label them at the economic centre (the model is anchored there)', () => {
    expect(showsNationalLabel(block({ marketId: 'm1' }), centres)).toBe(false);
  });

  it('matches economic-centre ids case-insensitively (GUIDs travel in mixed case)', () => {
    const mixed = economicCenterIdSet([mk('M1-AAAA', 'Dambulla', true)]);
    expect(showsNationalLabel(block({ marketId: 'm1-aaaa' }), mixed)).toBe(false);
  });

  it('does not label the DEFAULT block — that block IS the centre standing in', () => {
    expect(showsNationalLabel(block({ isDefaultMarket: true }))).toBe(false);
  });

  it('FAILS TOWARDS the label when the registry is unavailable', () => {
    // A national forecast said to be national is at worst redundant; the opposite default
    // would make a national number look like a local one. Never invert this.
    expect(showsNationalLabel(block({ marketId: 'm1' }))).toBe(true);
    expect(showsNationalLabel(null)).toBe(true);
  });
});

describe('lib/portfolio — only a known model predictor earns full trust', () => {
  it('shows full trust for exactly the servable model kinds, case-insensitively', () => {
    expect(isDeratedPrediction(prediction('model'))).toBe(false);
    expect(isDeratedPrediction(prediction('residual'))).toBe(false);
    expect(isDeratedPrediction(prediction('Residual'))).toBe(false);
  });

  it('de-rates every named fallback', () => {
    expect(isDeratedPrediction(prediction('crop_mean_fallback'))).toBe(true);
    expect(isDeratedPrediction(prediction('global_median_fallback'))).toBe(true);
  });

  it('de-rates a predictor this build has never heard of (allowlist, not a substring test)', () => {
    // None of these carries "fallback", and a denylist would render them at full model
    // trust. "unavailable" already exists on the harvest-window route; the others are the
    // shape a future rung would take. Unknown must fall on the cautious side.
    expect(isDeratedPrediction(prediction('unavailable'))).toBe(true);
    expect(isDeratedPrediction(prediction('category_mean'))).toBe(true);
    expect(isDeratedPrediction(prediction('seasonal_naive'))).toBe(true);
    expect(isDeratedPrediction(prediction(''))).toBe(true);
  });

  it('has nothing to de-rate when there is no prediction at all', () => {
    expect(isDeratedPrediction(null)).toBe(false);
  });
});

describe('lib/portfolio — the two distinct empty states (PRD §5.2)', () => {
  const dash = (items: PortfolioDashboardItem[]): PortfolioDashboard => ({ items });

  it('an empty watchlist is "no-watchlist" (an invitation, not an admission)', () => {
    expect(dashboardEmptyState(dash([]))).toBe('no-watchlist');
  });

  it('watched crops with nothing known about ANY of them is "no-data"', () => {
    expect(dashboardEmptyState(dash([item(), item({ cropId: 'c2' })]))).toBe('no-data');
  });

  it('one crop with only a PREDICTION is already the ok state', () => {
    expect(dashboardEmptyState(dash([item(), item({ prediction: prediction('residual') })]))).toBe(
      'ok',
    );
  });

  it('a price at ANY of a crop’s markets is the ok state, not only at the first', () => {
    // The scan must reach every block: a crop whose second market has the only price is
    // not a crop we know nothing about.
    expect(dashboardEmptyState(dash([item({ markets: [block(), PRICED] })]))).toBe('ok');
  });
});

describe('lib/portfolio — caps are one constant, and the client says no before the server', () => {
  it('mirrors the backend WatchlistLimits exactly', () => {
    expect(MAX_WATCHED_CROPS).toBe(10);
    expect(MAX_MARKETS_PER_CROP).toBe(3);
  });

  it('adds a market up to the cap and REFUSES the fourth, saying it was blocked', () => {
    let sel: string[] = [];
    for (const id of ['m1', 'm2', 'm3']) {
      const r = toggleMarketSelection(sel, id);
      expect(r.blocked).toBe(false);
      sel = r.next;
    }
    const fourth = toggleMarketSelection(sel, 'm4');
    expect(fourth.blocked).toBe(true);
    // Silently dropping it would be the bug: the farmer taps and nothing happens.
    expect(fourth.next).toEqual(['m1', 'm2', 'm3']);
  });

  it('always allows a REMOVAL, even from an over-cap set that arrived from the server', () => {
    const r = toggleMarketSelection(['m1', 'm2', 'm3', 'm4'], 'm2');
    expect(r).toEqual({ next: ['m1', 'm3', 'm4'], blocked: false });
  });

  it('keeps the pick order the farmer tapped', () => {
    expect(toggleMarketSelection(['m3'], 'm1').next).toEqual(['m3', 'm1']);
  });
});

describe('lib/portfolio — a market selection is a SET, not a sequence', () => {
  it('treats the same markets in a different order as UNCHANGED', () => {
    // The regression: the server keeps its own ChosenAt order, so re-ticking
    // [Kandy, Dambulla] as [Dambulla, Kandy] is not an edit. Comparing positionally left a
    // "Save markets" button lit forever, firing no-op PUTs the farmer could not clear.
    expect(sameMarketSet(['m3', 'm1'], ['m1', 'm3'])).toBe(true);
  });

  it('spots a real difference in either direction', () => {
    expect(sameMarketSet(['m1'], ['m3'])).toBe(false);
    expect(sameMarketSet(['m1', 'm3'], ['m1'])).toBe(false);
    expect(sameMarketSet([], ['m1'])).toBe(false);
  });

  it('matches case-insensitively — GUIDs travel in mixed case', () => {
    expect(sameMarketSet(['AB-01'], ['ab-01'])).toBe(true);
  });

  it('two empty selections are the same selection', () => {
    expect(sameMarketSet([], [])).toBe(true);
  });

  it('does not let a duplicated id compare equal to a genuinely smaller set', () => {
    // Both directions: a one-sided dedupe guard is no guard at all — with the duplicate on
    // the RIGHT, every element still resolves inside the left set and the lengths match.
    expect(sameMarketSet(['m1', 'm1'], ['m1', 'm3'])).toBe(false);
    expect(sameMarketSet(['m1', 'm3'], ['m1', 'm1'])).toBe(false);
    // A repeated id is malformed input the picker cannot produce, so it is never "the same"
    // as anything — including itself. That is the safe direction: a duplicate arriving from
    // the wire leaves the row offering to save the cleaned-up set, rather than locking the
    // farmer out of fixing it.
    expect(sameMarketSet(['m1', 'm1'], ['m1', 'm1'])).toBe(false);
  });
});

describe('lib/portfolio — the cap sentences read the constants, never a hardcoded number', () => {
  it('hands each cap sentence its own constant', () => {
    expect(watchlistErrorParams('pages.portfolio.errWatchlistFull')).toEqual({
      max: MAX_WATCHED_CROPS,
    });
    expect(watchlistErrorParams('pages.portfolio.errTooManyMarkets')).toEqual({
      max: MAX_MARKETS_PER_CROP,
    });
  });

  it('passes nothing to a sentence that names no cap', () => {
    expect(watchlistErrorParams('pages.portfolio.errEntryNotFound')).toEqual({});
    expect(watchlistErrorParams('common.errorBody')).toEqual({});
  });
});

describe('lib/portfolio — every refusal keeps its own sentence', () => {
  it('maps each wire code to its OWN key, never a shared "could not save"', () => {
    const keys = [
      watchlistErrorKey('watchlist_full'),
      watchlistErrorKey('too_many_markets'),
      watchlistErrorKey('invalid_planted_date'),
      watchlistErrorKey('watchlist_entry_not_found'),
    ];
    expect(keys).toEqual([
      'pages.portfolio.errWatchlistFull',
      'pages.portfolio.errTooManyMarkets',
      'pages.portfolio.errInvalidPlantedDate',
      'pages.portfolio.errEntryNotFound',
    ]);
    expect(new Set(keys).size).toBe(4);
  });

  it('falls back to the generic sentence for a code it has never seen, or none at all', () => {
    expect(watchlistErrorKey(null)).toBe('common.errorBody');
    expect(watchlistErrorKey(undefined)).toBe('common.errorBody');
    expect(watchlistErrorKey('some_future_code')).toBe('common.errorBody');
  });
});

describe('lib/portfolio — market helpers', () => {
  it('offers the economic centre first, then the rest by name', () => {
    const ordered = orderMarketsForPicker([
      mk('m3', 'Kandy', false),
      mk('m2', 'Colombo', false),
      mk('m1', 'Dambulla', true),
    ]);
    expect(ordered.map((m) => m.name)).toEqual(['Dambulla', 'Colombo', 'Kandy']);
  });

  it('charts the market whose number is printed above the chart', () => {
    const kandy = block({ marketId: 'm3', name: 'Kandy' });
    expect(chartMarketIdFor(item({ markets: [kandy, block()] }))).toBe('m3');
  });

  it('has nothing to chart without an item or a market', () => {
    expect(chartMarketIdFor(null)).toBeNull();
    expect(chartMarketIdFor(item({ markets: [] }))).toBeNull();
  });
});

describe('lib/portfolio — trend words (null direction is never "steady")', () => {
  it('maps each direction to its own word key', () => {
    expect(trendLabelKey('up')).toBe('pages.portfolio.trendUp');
    expect(trendLabelKey('down')).toBe('pages.portfolio.trendDown');
    expect(trendLabelKey('steady')).toBe('pages.portfolio.trendSteady');
  });

  it('ships a distinct glyph per direction, none of them a colour swatch', () => {
    expect(new Set(Object.values(trendGlyph)).size).toBe(3);
  });
});

describe('lib/portfolio — date maths avoid the UTC+5:30 trap', () => {
  it('counts whole days between two local ymd dates', () => {
    expect(daysBetweenYmd('2026-07-20', '2026-07-27')).toBe(7);
    expect(daysBetweenYmd('2026-07-27', '2026-07-27')).toBe(0);
  });

  it('counts across a month and a DST-free year boundary', () => {
    expect(daysBetweenYmd('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetweenYmd('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('returns null rather than a wrong number for unusable input', () => {
    expect(daysBetweenYmd('', '2026-07-27')).toBeNull();
    expect(daysBetweenYmd('27-07-2026', '2026-07-27')).toBeNull();
  });

  it('never reports a negative age for a price dated in the future', () => {
    expect(priceAgeDays('2026-08-01', '2026-07-27')).toBe(0);
  });

  it('reports a real age, and the note threshold is a week-plus', () => {
    expect(priceAgeDays('2026-05-27', '2026-07-27')).toBe(61);
    expect(PRICE_AGE_NOTE_DAYS).toBeGreaterThan(7);
  });
});

describe('lib/portfolio — deep link to the full forecast', () => {
  it('points at My harvest with the crop preselected (PRD §5.1)', () => {
    expect(harvestLinkFor('c0000003-0000-0000-0000-000000000003')).toBe(
      '/my-harvest?crop=c0000003-0000-0000-0000-000000000003',
    );
  });
});
