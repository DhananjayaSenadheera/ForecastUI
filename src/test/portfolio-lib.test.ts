import { describe, it, expect } from 'vitest';
import type {
  Market,
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioHomeMarket,
  PortfolioPrediction,
  WatchlistItem,
} from '../api/types';
import {
  PRICE_AGE_NOTE_DAYS,
  chartMarketIdFor,
  dashboardEmptyState,
  daysBetweenYmd,
  diffWatchlist,
  harvestLinkFor,
  isDeratedPrediction,
  orderMarketsForPicker,
  priceAgeDays,
  showsNationalLabel,
  trendGlyph,
  trendLabelKey,
  watchlistMarketId,
} from '../lib/portfolio';

const DAMBULLA: PortfolioHomeMarket = {
  marketId: 'm1',
  name: 'Dambulla Dedicated Economic Centre',
  isEconomicCenter: true,
  isDefault: true,
};
const KANDY: PortfolioHomeMarket = {
  marketId: 'm3',
  name: 'Kandy',
  isEconomicCenter: false,
  isDefault: false,
};

function item(over: Partial<PortfolioDashboardItem> = {}): PortfolioDashboardItem {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000003',
    price: null,
    priceUnavailableReason: 'no_recent_price',
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

describe('lib/portfolio — national-forecast labelling (PRD §3.6)', () => {
  it('labels predictions as national under a NON economic-centre home market', () => {
    expect(showsNationalLabel(KANDY)).toBe(true);
  });

  it('does not label them at the economic centre (the model is anchored there)', () => {
    expect(showsNationalLabel(DAMBULLA)).toBe(false);
  });

  it('does not label them when no home market is re-pointing anything', () => {
    expect(showsNationalLabel(null)).toBe(false);
  });
});

describe('lib/portfolio — fallback predictions are de-rated, never hidden', () => {
  it('treats any predictor whose name carries "fallback" as a fallback', () => {
    expect(isDeratedPrediction(prediction('crop_mean_fallback'))).toBe(true);
    expect(isDeratedPrediction(prediction('global_median_fallback'))).toBe(true);
  });

  it('treats a model predictor as a model prediction', () => {
    expect(isDeratedPrediction(prediction('residual'))).toBe(false);
  });

  it('has nothing to de-rate when there is no prediction at all', () => {
    expect(isDeratedPrediction(null)).toBe(false);
  });
});

describe('lib/portfolio — the two distinct empty states (PRD §5.2)', () => {
  const dash = (items: PortfolioDashboardItem[]): PortfolioDashboard => ({
    homeMarket: DAMBULLA,
    items,
  });

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

  it('one crop with only a PRICE is already the ok state', () => {
    const priced = item({
      price: {
        price: 200,
        observedDate: '2026-07-25',
        marketId: 'm1',
        marketName: 'Dambulla',
        isFallbackMarket: false,
        direction: null,
        changePct: null,
        previousPrice: null,
        previousObservedDate: null,
      },
      priceUnavailableReason: null,
    });
    expect(dashboardEmptyState(dash([priced]))).toBe('ok');
  });
});

describe('lib/portfolio — watchlist diff drives exactly the calls we make', () => {
  it('splits a new selection into adds and removes', () => {
    expect(diffWatchlist(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('reports no work when the selection is unchanged (order-insensitive)', () => {
    expect(diffWatchlist(['a', 'b'], ['b', 'a'])).toEqual({ added: [], removed: [] });
  });

  it('keeps the tap order of the additions and de-duplicates both sides', () => {
    expect(diffWatchlist(['a', 'a'], ['c', 'b', 'c'])).toEqual({
      added: ['c', 'b'],
      removed: ['a'],
    });
  });

  it('clearing the whole list removes everything and adds nothing', () => {
    expect(diffWatchlist(['a', 'b'], [])).toEqual({ added: [], removed: ['a', 'b'] });
  });
});

describe('lib/portfolio — market helpers', () => {
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

  it('offers the economic centre first, then the rest by name', () => {
    const ordered = orderMarketsForPicker([
      mk('m3', 'Kandy', false),
      mk('m2', 'Colombo', false),
      mk('m1', 'Dambulla', true),
    ]);
    expect(ordered.map((m) => m.name)).toEqual(['Dambulla', 'Colombo', 'Kandy']);
  });

  it('reads the one stored home market off the watchlist rows', () => {
    const rows: WatchlistItem[] = [
      {
        cropId: 'c1',
        cropName: 'Tomato',
        cropCode: null,
        preferredMarketId: null,
        preferredMarketName: null,
        createdAtUtc: '2026-07-20T00:00:00Z',
      },
      {
        cropId: 'c2',
        cropName: 'Beans',
        cropCode: null,
        preferredMarketId: 'm1',
        preferredMarketName: 'Dambulla',
        createdAtUtc: '2026-07-20T00:00:00Z',
      },
    ];
    expect(watchlistMarketId(rows)).toBe('m1');
    expect(watchlistMarketId([])).toBeNull();
  });

  it('charts the market that ACTUALLY served the price, not the home market', () => {
    const served = item({
      price: {
        price: 200,
        observedDate: '2026-07-25',
        marketId: 'm1',
        marketName: 'Dambulla',
        isFallbackMarket: true,
        direction: null,
        changePct: null,
        previousPrice: null,
        previousObservedDate: null,
      },
      priceUnavailableReason: null,
    });
    expect(chartMarketIdFor(served, KANDY)).toBe('m1');
  });

  it('falls back to the home market when there is no price to anchor on', () => {
    expect(chartMarketIdFor(item(), KANDY)).toBe('m3');
    expect(chartMarketIdFor(null, null)).toBeNull();
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
