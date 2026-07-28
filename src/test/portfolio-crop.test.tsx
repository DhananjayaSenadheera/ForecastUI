import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../i18n';
import PortfolioCropPage from '../pages/PortfolioCropPage';
import { api } from '../api/client';
import type {
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PriceHistoryPoint,
} from '../api/types';

// Wire shape as the live API serves it: the price lives INSIDE a market block, one block per
// market the crop is watched at, and there is no top-level home market.
const DAMBULLA_BLOCK: PortfolioDashboardMarket = {
  marketId: 'm1',
  name: 'Dambulla Dedicated Economic Centre',
  shortCode: 'DEC',
  isDefaultMarket: false,
  price: {
    price: 210,
    observedDate: '2026-07-25',
    direction: 'down',
    changePct: -2.5,
    previousPrice: 215,
    previousObservedDate: '2026-07-21',
  },
  priceUnavailableReason: null,
};
const KANDY_BLOCK: PortfolioDashboardMarket = {
  ...DAMBULLA_BLOCK,
  marketId: 'm3',
  name: 'Kandy',
  shortCode: 'KAN',
};

const HISTORY: PriceHistoryPoint[] = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  minPrice: 200 + i,
  maxPrice: 230 + i,
}));

function tomato(over: Partial<PortfolioDashboardItem> = {}): PortfolioDashboardItem {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000003',
    plantedDate: null,
    markets: [DAMBULLA_BLOCK],
    prediction: {
      predictedPrice: 240,
      lowerBound: 190,
      upperBound: 300,
      confidence: 'Medium',
      activePredictor: 'residual',
      modelVersion: 'v17',
      snapshotDate: '2026-07-27',
      harvestDate: '2026-10-30',
    },
    predictionUnavailableReason: null,
    ...over,
  };
}

function renderPage(cropId = 'c1', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/portfolio/crop/${cropId}${search}`]}>
      <Routes>
        <Route path="/portfolio/crop/:cropId" element={<PortfolioCropPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockDashboard(dashboard: PortfolioDashboard, history: PriceHistoryPoint[] = HISTORY) {
  vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue(dashboard);
  vi.spyOn(api, 'getPriceHistory').mockResolvedValue(history);
}

describe('PortfolioCropPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the crop’s price, prediction and a chart with its table alternative', async () => {
    mockDashboard({ items: [tomato()] });
    renderPage();

    await screen.findByRole('heading', { name: 'Tomato', level: 1 });
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
    expect(screen.getByText(/Likely price range: Rs\. 190 – 300/)).toBeInTheDocument();
    // The chart is never the only representation of the numbers.
    await waitFor(() => expect(document.querySelector('.pr-svg')).toBeInTheDocument());
    expect(screen.getByText('View as table')).toBeInTheDocument();
  });

  it('deep-links to the full national forecast with a crop-specific accessible name', async () => {
    mockDashboard({ items: [tomato()] });
    renderPage();

    const link = await screen.findByRole('link', { name: 'See the full forecast for Tomato' });
    expect(link).toHaveAttribute('href', '/my-harvest?crop=c1');
  });

  it('charts the market whose number is printed above it — markets[0], not any other', async () => {
    mockDashboard({ items: [tomato({ markets: [KANDY_BLOCK, DAMBULLA_BLOCK] })] });
    renderPage();

    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm3'));
    expect(api.getPriceHistory).not.toHaveBeenCalledWith('c1', 'm1');
    // And the page names that market, so the chart and the number agree out loud.
    expect(screen.getAllByText('Kandy').length).toBeGreaterThan(0);
  });

  it('honours ?market= — the card hands over the tab the farmer was reading', async () => {
    // Tapping "See details" from the Dambulla tab of a Kandy-led card must not silently
    // change which market the numbers are about.
    mockDashboard({ items: [tomato({ markets: [KANDY_BLOCK, DAMBULLA_BLOCK] })] });
    renderPage('c1', '?market=m1');

    await screen.findByText('Dambulla Dedicated Economic Centre');
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm1'));
    expect(api.getPriceHistory).not.toHaveBeenCalledWith('c1', 'm3');
  });

  it('falls back to markets[0] for a ?market= this crop is not watched at', async () => {
    // A stale bookmark, a removed market or a hand-edited URL. The parameter is a VIEW
    // hint, never a claim: an unusable one is ignored silently rather than erroring or
    // blanking the page — there is always a right market to show.
    mockDashboard({ items: [tomato({ markets: [KANDY_BLOCK, DAMBULLA_BLOCK] })] });
    renderPage('c1', '?market=not-a-market');

    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm3'));
    expect(api.getPriceHistory).not.toHaveBeenCalledWith('c1', 'm1');
    expect(screen.getAllByText('Kandy').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('matches the route id case-insensitively (GUIDs travel in mixed case)', async () => {
    mockDashboard({ items: [tomato({ cropId: 'AB12CD34-0000-0000-0000-000000000001' })] });
    renderPage('ab12cd34-0000-0000-0000-000000000001');

    await screen.findByRole('heading', { name: 'Tomato', level: 1 });
  });

  it('settles on the empty-chart state when there is no market to chart at all', async () => {
    // No market block at all: nothing to fetch. The region must resolve to the honest empty
    // chart, NOT sit on a skeleton announcing aria-busy work that never comes.
    mockDashboard({ items: [tomato({ markets: [] })] });
    renderPage();

    await screen.findByText('No recent price data for this crop at this market yet.');
    expect(api.getPriceHistory).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
    // The prediction beside it is untouched by the missing price.
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
  });

  it('is an honest dead end for a crop that is not on the watchlist', async () => {
    mockDashboard({ items: [] });
    renderPage('c9');

    await screen.findByText('This crop is not in your crops');
    // The dissolved settings screen is gone: the way back is the page that now owns it.
    expect(screen.getByRole('link', { name: 'Add crops' })).toHaveAttribute('href', '/portfolio');
    expect(screen.queryByText(/Rs\./)).toBeNull();
  });

  it('shows an error with a retry when the dashboard cannot be read', async () => {
    vi.spyOn(api, 'getPortfolioDashboard').mockRejectedValue(new Error('down'));
    vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps the price and prediction when the history fetch fails (fail-soft chart)', async () => {
    vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue({ items: [tomato()] });
    vi.spyOn(api, 'getPriceHistory').mockRejectedValue(new Error('offline'));
    renderPage();

    await screen.findByText('Rs. 210');
    await waitFor(() =>
      expect(screen.getByText('No recent price data for this crop at this market yet.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
