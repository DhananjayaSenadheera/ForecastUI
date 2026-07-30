import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import { RecommendationLevel } from '../api/types';
import type {
  HarvestForecast,
  Market,
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PortfolioPrediction,
} from '../api/types';
import {
  CHART_RANGE_DAYS,
  MAX_MARKETS_PER_CROP,
  MAX_WATCHED_CROPS,
  PLANTED_DATE_MIN,
  PRICE_AGE_NOTE_DAYS,
  chartMarketIdFor,
  cropDetailLink,
  dashboardEmptyState,
  daysBetweenYmd,
  harvestLinkFor,
  isDeratedPrediction,
  isPlantedDateAllowed,
  marketCodeLabel,
  orderMarketsForPicker,
  plantedDateMax,
  predictionFromHarvestForecast,
  priceAgeDays,
  primaryMarket,
  sameMarketSet,
  selectedMarketFor,
  sliceHistoryByRange,
  showsNationalLabel,
  toggleMarketSelection,
  trendGlyph,
  trendLabelKey,
  watchlistErrorKey,
  watchlistErrorParams,
} from '../lib/portfolio';
import { isRealYmd, plantDateParam } from '../lib/plantDate';

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

// Real seeded short codes (Markets.ShortCode) — never a name-derived stand-in, so a test
// can never bless a code the registry does not actually serve.
const mk = (id: string, name: string, shortCode: string, ec: boolean): Market => ({
  id,
  name,
  shortCode,
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
  it('labels predictions as national beside a market that is NOT the anchor', () => {
    expect(showsNationalLabel(block({ marketId: 'm3', name: 'Kandy' }))).toBe(true);
  });

  it('does not label the DEFAULT block — that block IS the centre standing in', () => {
    expect(showsNationalLabel(block({ isDefaultMarket: true }))).toBe(false);
  });

  it('FAILS TOWARDS the label for every other market, and for none at all', () => {
    // The one decision this makes is "is this the centre standing in for an unchosen
    // market?". Everything else gets the label: a national forecast said to be national is
    // at worst redundant, whereas omitting it makes a national number look like a local
    // one. Never invert this. It holds even for the economic centre chosen BY HAND (m1
    // here), which is why the registry lookup that used to special-case it is gone.
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

  it('gives each clear-reason refusal its own sentence too, and never blames the farmer', () => {
    // These five are states the confirm is built to make impossible. If one ever does reach a
    // farmer it must still say what was missing — a "shouldn't happen" that arrives as a
    // shrug throws away the only useful thing the server said.
    const keys = [
      watchlistErrorKey('clear_reason_required'),
      watchlistErrorKey('clear_reason_not_applicable'),
      watchlistErrorKey('invalid_clear_reason'),
      watchlistErrorKey('clear_reason_note_without_reason'),
      watchlistErrorKey('clear_reason_note_too_long'),
    ];
    expect(keys).toEqual([
      'pages.portfolio.errClearReasonRequired',
      'pages.portfolio.errClearReasonNotApplicable',
      'pages.portfolio.errInvalidClearReason',
      'pages.portfolio.errClearReasonNoteWithoutReason',
      'pages.portfolio.errClearReasonNoteTooLong',
    ]);
    expect(new Set(keys).size).toBe(5);
    // Every one of them exists in English and reads as a sentence a farmer can act on: it
    // says what is needed, never "you did something wrong", and never claims the date went.
    for (const key of keys) {
      const sentence = i18n.getResource('en', 'translation', key) as string;
      expect(typeof sentence).toBe('string');
      expect(sentence.length).toBeGreaterThan(20);
      expect(sentence).not.toMatch(/\byou (must|failed|cannot)\b/i);
      expect(sentence).not.toMatch(/removed successfully|date was removed/i);
    }
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
      mk('m3', 'Kandy', 'KAN', false),
      mk('m2', 'Colombo', 'PET', false),
      mk('m1', 'Dambulla', 'DEC', true),
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

  it('charts the SELECTED market once a surface lets the farmer switch (step 6 tabs)', () => {
    const kandy = block({ marketId: 'm3', name: 'Kandy', shortCode: 'KAN' });
    const both = item({ markets: [kandy, block()] });
    // The card's chart follows its tab; a page with no switcher passes nothing and keeps
    // markets[0]. One function, two callers — never two notions of "the chart's market".
    expect(chartMarketIdFor(both, 'm1')).toBe('m1');
    expect(chartMarketIdFor(both, null)).toBe('m3');
  });
});

describe('lib/portfolio — cropDetailLink carries the card’s market', () => {
  const kandy = block({ marketId: 'm3', name: 'Kandy', shortCode: 'KAN' });
  const both = item({ markets: [kandy, block()] });

  it('omits ?market= when the selection IS markets[0], keeping one canonical URL', () => {
    expect(cropDetailLink(both, 'm3')).toBe('/portfolio/crop/c1');
    expect(cropDetailLink(both, null)).toBe('/portfolio/crop/c1');
    // Case-insensitively: GUIDs travel in mixed case, and a case difference is not a
    // different market — it would otherwise pin a redundant parameter into every bookmark.
    expect(cropDetailLink(both, 'M3')).toBe('/portfolio/crop/c1');
  });

  it('carries the market when the card is on any other tab', () => {
    expect(cropDetailLink(both, 'm1')).toBe('/portfolio/crop/c1?market=m1');
  });

  it('escapes both ids rather than pasting them into a URL raw', () => {
    const odd = item({ cropId: 'c 1', markets: [block({ marketId: 'm/1' }), kandy] });
    expect(cropDetailLink(odd, 'm 2')).toBe('/portfolio/crop/c%201?market=m%202');
  });
});

describe('lib/portfolio — selectedMarketFor (one market for every market-scoped thing)', () => {
  const kandy = block({ marketId: 'm3', name: 'Kandy', shortCode: 'KAN' });
  const dambulla = block();

  it('returns the selected block when the id names one of the crop’s markets', () => {
    expect(selectedMarketFor(item({ markets: [kandy, dambulla] }), 'm1')?.name).toBe(
      'Dambulla Dedicated Economic Centre',
    );
  });

  it('matches the id case-insensitively (GUIDs travel in mixed case)', () => {
    const upper = block({ marketId: 'M1-AAAA' });
    expect(selectedMarketFor(item({ markets: [kandy, upper] }), 'm1-aaaa')?.marketId).toBe(
      'M1-AAAA',
    );
  });

  it('falls back to markets[0] with no selection, and for a market the crop no longer has', () => {
    const both = item({ markets: [kandy, dambulla] });
    expect(selectedMarketFor(both, null)?.marketId).toBe('m3');
    // The regression this guards: dropping a watched market while its tab was open must
    // fall back to the card's lead market, never blank the whole card.
    expect(selectedMarketFor(both, 'm999')?.marketId).toBe('m3');
  });

  it('has no market for a null item or a (contract-forbidden) empty list', () => {
    expect(selectedMarketFor(null, 'm1')).toBeNull();
    expect(selectedMarketFor(item({ markets: [] }), 'm1')).toBeNull();
  });
});

describe('lib/portfolio — marketCodeLabel (a chip is never blank)', () => {
  it('shows the registry’s own short code', () => {
    expect(marketCodeLabel({ shortCode: 'KEP', name: 'Keppetipola' })).toBe('KEP');
  });

  it('falls back to the FULL NAME when the wire carries no code, never to an invented one', () => {
    // shortCode may be empty by contract. A name-derived stand-in would teach the farmer a
    // code that does not exist; a blank chip would be a control with no visible label.
    expect(marketCodeLabel({ shortCode: '', name: 'Keppetipola' })).toBe('Keppetipola');
    expect(marketCodeLabel({ shortCode: '   ', name: 'Keppetipola' })).toBe('Keppetipola');
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

describe('lib/portfolio — the planting date the farmer records', () => {
  const today = '2026-07-28';

  it('accepts a real day inside the contract, including both ends', () => {
    expect(isPlantedDateAllowed('2026-05-04', today)).toBe(true);
    expect(isPlantedDateAllowed(today, today)).toBe(true);
    expect(isPlantedDateAllowed(PLANTED_DATE_MIN, today)).toBe(true);
  });

  it('refuses what the server would refuse, before the round trip', () => {
    // The server's ceiling is UTC-today + 1 day; the field stops at local today, which is
    // never later than that. A planting is something that has happened.
    expect(isPlantedDateAllowed('2026-07-29', today)).toBe(false);
    expect(isPlantedDateAllowed('1999-12-31', today)).toBe(false);
    expect(plantedDateMax(today)).toBe(today);
  });

  it('refuses anything that is not a real ISO day', () => {
    expect(isPlantedDateAllowed('', today)).toBe(false);
    expect(isPlantedDateAllowed('04-05-2026', today)).toBe(false);
    expect(isPlantedDateAllowed('2026-13-01', today)).toBe(false);
  });
});

describe('lib/plantDate — the ?date= hint handed to My harvest', () => {
  const min = '2025-07-28';
  const max = '2026-09-26';

  it('passes a usable date through unchanged', () => {
    expect(plantDateParam('2026-05-04', min, max)).toBe('2026-05-04');
  });

  it('DROPS a date the field cannot hold rather than clamping it to another day', () => {
    // Clamping would forecast a planting the farmer never named — silently, under a link
    // they tapped for a different one.
    expect(plantDateParam('2020-01-01', min, max)).toBeNull();
    expect(plantDateParam('2030-01-01', min, max)).toBeNull();
  });

  it('ignores garbage and an absent parameter alike', () => {
    expect(plantDateParam(null, min, max)).toBeNull();
    expect(plantDateParam('yesterday', min, max)).toBeNull();
    expect(plantDateParam('2026-02-30', min, max)).toBeNull();
  });

  it('rejects a day that only LOOKS real — Date silently rolls those over', () => {
    // new Date('2026-02-30T00:00:00') is the 2nd of March, not an error. Both the field
    // guard and this hint round-trip the parsed parts to catch it.
    expect(isRealYmd('2026-02-30')).toBe(false);
    expect(isRealYmd('2025-02-29')).toBe(false);
    expect(isRealYmd('2024-02-29')).toBe(true);
    expect(isRealYmd('2026-04-31')).toBe(false);
  });
});

describe('lib/portfolio — one prediction shape for both forecast routes', () => {
  const forecast: HarvestForecast = {
    cropId: 'c1',
    cropName: 'Tomato',
    plantDate: '2026-05-04',
    harvestDate: '2026-08-12',
    growthPeriodDays: 100,
    currentPrice: 210,
    predictedPrice: 240,
    lowerBound: 190,
    upperBound: 300,
    confidence: 'Low',
    activePredictor: 'crop_mean_fallback',
    modelVersion: 'v17',
    explanation: '',
    recommendationLevel: RecommendationLevel.Recommended,
    reason: '',
    upsidePct: 14.3,
    intervalWidthPct: 45.8,
    lowTrust: true,
  };

  it('reads the harvest route into the display shape, verbatim', () => {
    // NO snapshotDate: that field is the nightly snapshot's own as-of day, and filling it
    // in from plantDate would leave one field name meaning two things by provenance.
    // Nothing is rounded, blended or upgraded on the way through.
    expect(predictionFromHarvestForecast(forecast)).toEqual({
      predictedPrice: 240,
      lowerBound: 190,
      upperBound: 300,
      confidence: 'Low',
      activePredictor: 'crop_mean_fallback',
      modelVersion: 'v17',
      harvestDate: '2026-08-12',
    });
  });

  it('carries NO snapshotDate — one field name may not mean two things', () => {
    expect('snapshotDate' in predictionFromHarvestForecast(forecast)).toBe(false);
  });

  it('keeps the de-rating verdict the allowlist already gives it', () => {
    expect(isDeratedPrediction(predictionFromHarvestForecast(forecast))).toBe(true);
    expect(
      isDeratedPrediction(
        predictionFromHarvestForecast({ ...forecast, activePredictor: 'residual' }),
      ),
    ).toBe(false);
  });
});

describe('lib/portfolio — the full-forecast link carries the planting', () => {
  it('appends the farmer’s own date when they have recorded one', () => {
    expect(harvestLinkFor('c1', '2026-05-04')).toBe('/my-harvest?crop=c1&date=2026-05-04');
  });

  it('stays the plain crop link when there is no date', () => {
    expect(harvestLinkFor('c1', null)).toBe('/my-harvest?crop=c1');
    expect(harvestLinkFor('c1')).toBe('/my-harvest?crop=c1');
  });
});

describe('lib/portfolio — the card chart’s 1M / 3M zoom', () => {
  // A year of daily points, so a window really can exclude something.
  const series = Array.from({ length: 200 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), minPrice: 100 + i, maxPrice: 140 + i };
  });

  it('keeps only the last 30 / 90 days of the series', () => {
    expect(sliceHistoryByRange(series, '1m')).toHaveLength(31);
    expect(sliceHistoryByRange(series, '3m')).toHaveLength(91);
    // Inclusive of both ends, and it is a TAIL: the newest point is always in.
    expect(sliceHistoryByRange(series, '1m').at(-1)).toEqual(series.at(-1));
  });

  it('anchors on the newest OBSERVATION, not on today', () => {
    // The whole reason: a market that stopped publishing weeks ago must still draw a chart.
    // Anchored on "now" this returns nothing and the empty chart says "no recent price
    // data" — which would be false, the data exists and is simply older than the window.
    const stale = series.slice(0, 40); // ends 2026-02-09, months behind any real "today"
    const zoomed = sliceHistoryByRange(stale, '1m');
    expect(zoomed.length).toBeGreaterThan(1);
    expect(zoomed.at(-1)).toEqual(stale.at(-1));
  });

  it('is order-independent — it scans for the newest date rather than trusting the array', () => {
    const shuffled = [...series].reverse();
    expect(sliceHistoryByRange(shuffled, '1m')).toHaveLength(31);
  });

  it('never invents or drops a series it cannot window', () => {
    expect(sliceHistoryByRange([], '1m')).toEqual([]);
    const one = [{ date: '2026-07-01', minPrice: 10, maxPrice: 20 }];
    expect(sliceHistoryByRange(one, '1m')).toEqual(one);
    // Unparsable dates are not a reason to blank a chart.
    const junk = [{ date: 'not-a-date', minPrice: 10, maxPrice: 20 }];
    expect(sliceHistoryByRange(junk, '3m')).toEqual(junk);
  });

  it('agrees with the days it advertises', () => {
    expect(CHART_RANGE_DAYS['1m']).toBe(30);
    expect(CHART_RANGE_DAYS['3m']).toBe(90);
  });
});
