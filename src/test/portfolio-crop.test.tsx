import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../i18n';
import PortfolioCropPage from '../pages/PortfolioCropPage';
import { api } from '../api/client';
import type { PortfolioDashboard, PortfolioDashboardItem, PriceHistoryPoint } from '../api/types';

const DAMBULLA = {
  marketId: 'm1',
  name: 'Dambulla Dedicated Economic Centre',
  isEconomicCenter: true,
  isDefault: false,
};
const KANDY = { marketId: 'm3', name: 'Kandy', isEconomicCenter: false, isDefault: false };

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
    price: {
      price: 210,
      observedDate: '2026-07-25',
      marketId: 'm1',
      marketName: 'Dambulla Dedicated Economic Centre',
      isFallbackMarket: false,
      direction: 'down',
      changePct: -2.5,
      previousPrice: 215,
      previousObservedDate: '2026-07-21',
    },
    priceUnavailableReason: null,
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

function renderPage(cropId = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/portfolio/crop/${cropId}`]}>
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
    mockDashboard({ homeMarket: DAMBULLA, items: [tomato()] });
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
    mockDashboard({ homeMarket: DAMBULLA, items: [tomato()] });
    renderPage();

    const link = await screen.findByRole('link', { name: 'See the full forecast for Tomato' });
    expect(link).toHaveAttribute('href', '/my-harvest?crop=c1');
  });

  it('charts the market that actually served the price, not the home market', async () => {
    mockDashboard({
      homeMarket: KANDY,
      items: [tomato({ price: { ...tomato().price!, marketId: 'm1', isFallbackMarket: true } })],
    });
    renderPage();

    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm1'));
    expect(screen.getByText(/Your market had no price for this crop/)).toBeInTheDocument();
  });

  it('matches the route id case-insensitively (GUIDs travel in mixed case)', async () => {
    mockDashboard({
      homeMarket: DAMBULLA,
      items: [tomato({ cropId: 'AB12CD34-0000-0000-0000-000000000001' })],
    });
    renderPage('ab12cd34-0000-0000-0000-000000000001');

    await screen.findByRole('heading', { name: 'Tomato', level: 1 });
  });

  it('is an honest dead end for a crop that is not on the watchlist', async () => {
    mockDashboard({ homeMarket: DAMBULLA, items: [] });
    renderPage('c9');

    await screen.findByText('This crop is not in your crops');
    expect(screen.getByRole('link', { name: 'Add crops' })).toHaveAttribute(
      'href',
      '/portfolio/settings',
    );
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
    vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue({
      homeMarket: DAMBULLA,
      items: [tomato()],
    });
    vi.spyOn(api, 'getPriceHistory').mockRejectedValue(new Error('offline'));
    renderPage();

    await screen.findByText('Rs. 210');
    await waitFor(() =>
      expect(screen.getByText('No recent price data for this crop at this market yet.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
