import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import i18n from '../i18n';
import OverviewPage from '../pages/OverviewPage';
import { api, ApiError } from '../api/client';
import type { MarketOverview } from '../api/types';

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <OverviewPage />
    </MemoryRouter>,
  );
}

const EMPTY_OVERVIEW: MarketOverview = {
  asOf: null,
  windowDays: 30,
  marketsWithData: 0,
  cropsWithData: 0,
  movers: [],
  latestPrices: [],
};

describe('OverviewPage (FE-1 market overview dashboard)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the fixture happy path: KPIs, movers (order preserved), sparklines + table alt, teaser', async () => {
    renderOverview();

    // KPI tiles
    await screen.findByText('Data as of');
    expect(screen.getByText('Markets covered')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // marketsWithData
    expect(screen.getByText('24')).toBeInTheDocument(); // cropsWithData
    // biggest mover KPI = Capsicum (largest |change|)
    expect(screen.getByText('Biggest mover')).toBeInTheDocument();

    // Movers: risers listed in server order (Capsicum before Beans)
    const movers = screen.getByLabelText('Price movers');
    const crops = within(movers)
      .getAllByText(/Capsicum|Beans|Green Chilli|Cabbage/)
      .map((n) => n.textContent);
    expect(crops.indexOf('Capsicum')).toBeLessThan(crops.indexOf('Beans'));
    // a mover row deep-links into My harvest
    const capLink = within(movers).getAllByRole('link')[0];
    expect(capLink.getAttribute('href')).toContain('/my-harvest?crop=');

    // Latest prices: sparklines with aria sentences + one <details> table alternative
    const latest = screen.getByLabelText('Latest prices');
    await waitFor(() => expect(latest.querySelectorAll('.ov-spark').length).toBeGreaterThan(0));
    const sparkImgs = within(latest).getAllByRole('img');
    expect(sparkImgs.some((s) => /per kg/.test(s.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(within(latest).getByText('View as table')).toBeInTheDocument();
    expect(within(latest).getByText('Earliest')).toBeInTheDocument();

    // Best-crops teaser
    const teaser = await screen.findByLabelText('Best crops to plant now');
    expect(within(teaser).getByText('See all')).toBeInTheDocument();
    await within(teaser).findByText('Capsicum');
  });

  it('shows the honest "no market data yet" state when asOf is null', async () => {
    vi.spyOn(api, 'getMarketOverview').mockResolvedValue(EMPTY_OVERVIEW);
    renderOverview();
    await screen.findByText('No market data yet');
    // KPI row is not rendered in the empty state
    expect(screen.queryByText('Markets covered')).not.toBeInTheDocument();
    // teaser is independent and still renders
    expect(await screen.findByLabelText('Best crops to plant now')).toBeInTheDocument();
  });

  it('isolates a teaser failure — overview still renders, teaser shows a soft note', async () => {
    vi.spyOn(api, 'getBestCrops').mockRejectedValueOnce(new ApiError('boom', 500));
    renderOverview();
    // overview KPIs load fine
    await screen.findByText('Data as of');
    // teaser degrades to a note, not an app-wide error
    const teaser = await screen.findByLabelText('Best crops to plant now');
    expect(within(teaser).getByText(/Could not load crop suggestions/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a retryable error for the overview group but keeps the teaser alive', async () => {
    vi.spyOn(api, 'getMarketOverview').mockRejectedValueOnce(new ApiError('boom', 500));
    renderOverview();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    // teaser fetch is independent -> still renders
    expect(await screen.findByLabelText('Best crops to plant now')).toBeInTheDocument();
  });

  it('keeps internal task IDs out of farmer-facing copy', async () => {
    renderOverview();
    await screen.findByText('Data as of');
    expect(screen.queryByText(/FE-\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/API[ -]?#?\d/)).not.toBeInTheDocument();
  });
});
