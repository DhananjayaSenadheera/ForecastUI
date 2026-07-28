import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import i18n from '../i18n';
import { formatDate } from '../lib/format';
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

// Two series with no value in common, so "which market is this chart drawing?" is
// answerable from the table alternative alone.
const KANDY_SERIES: PriceHistoryPoint[] = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  minPrice: 411,
  maxPrice: 421,
}));
const DAMBULLA_SERIES: PriceHistoryPoint[] = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  minPrice: 611,
  maxPrice: 621,
}));

/** A test-only control that changes ?market= WHILE the page stays mounted — the back/forward
 *  case the effect has to survive. */
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go
    </button>
  );
}

function renderWithNav(to: string) {
  return render(
    <MemoryRouter initialEntries={['/portfolio/crop/c1']}>
      <GoTo to={to} />
      <Routes>
        <Route path="/portfolio/crop/:cropId" element={<PortfolioCropPage />} />
      </Routes>
    </MemoryRouter>,
  );
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

  it('SAYS which planting its forecast assumes, so the card and this page cannot collide', async () => {
    // The card one hop back answers for the farmer's own planting date. Two prices under
    // two headings that both read "forecast at harvest" is the "two answers to one
    // question" bug this app keeps closing — so each surface names its own anchor.
    mockDashboard({ items: [tomato()] });
    renderPage();

    await screen.findByText('About Rs. 240 at harvest');
    expect(
      screen.getByText(
        `This is our daily forecast for this crop, worked out for a planting on ${formatDate('2026-07-27', 'en')} — not for your own planting date.`,
      ),
    ).toBeInTheDocument();
  });

  it('points at the card for the farmer’s OWN planting, without fetching anything', async () => {
    // plantedDate rides on the dashboard item this page already loaded: a pointer, not a
    // second forecast — a third number on a third screen is a third thing to keep in step.
    mockDashboard({ items: [tomato({ plantedDate: '2026-05-04' })] });
    const forecastRoute = vi.spyOn(api, 'getHarvestForecast');
    renderPage();

    await screen.findByText(
      `You planted on ${formatDate('2026-05-04', 'en')} — your crop card shows the forecast for that planting.`,
    );
    // One dashboard call and nothing else: the pointer costs no round trip.
    expect(api.getPortfolioDashboard).toHaveBeenCalledTimes(1);
    expect(forecastRoute).not.toHaveBeenCalled();
  });

  it('says nothing about a planting the farmer has not recorded', async () => {
    mockDashboard({ items: [tomato()] });
    renderPage();
    await screen.findByText('About Rs. 240 at harvest');
    expect(screen.queryByText(/You planted on/)).toBeNull();
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

  it('never draws the OLD market’s series under the new market’s name', async () => {
    // ?market= changing while mounted (browser back/forward between two variants) used to
    // flip the title and the price instantly while the chart and its <details> table kept
    // drawing the previous market for the length of the request — the chart silently
    // contradicting the number above it, which is the one thing this page must not do.
    // The second fetch is held open on purpose: the bug lives INSIDE that window, and a
    // mock that resolves immediately closes it before any assertion can look.
    let release: (h: PriceHistoryPoint[]) => void = () => {};
    vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue({
      items: [tomato({ markets: [KANDY_BLOCK, DAMBULLA_BLOCK] })],
    });
    vi.spyOn(api, 'getPriceHistory').mockImplementation((_c, marketId) =>
      marketId === 'm1'
        ? new Promise<PriceHistoryPoint[]>((res) => {
            release = res;
          })
        : Promise.resolve(KANDY_SERIES),
    );
    renderWithNav('/portfolio/crop/c1?market=m1');

    // Kandy first: markets[0], no parameter.
    await waitFor(() => expect(screen.getAllByText('Rs. 411').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'go' }));

    // The heading flips to Dambulla straight away — it reads from the wire, not the fetch.
    await waitFor(() =>
      expect(document.querySelector('.pf-card__market-name')?.textContent).toBe(
        'Dambulla Dedicated Economic Centre',
      ),
    );
    // …and from that instant Kandy's numbers are GONE. A skeleton here is the honest
    // answer; Kandy's rows under a Dambulla heading are not.
    expect(screen.queryAllByText('Rs. 411')).toHaveLength(0);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    release(DAMBULLA_SERIES);
    await waitFor(() => expect(screen.getAllByText('Rs. 611').length).toBeGreaterThan(0));
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  });

  it('drops the swing claim when the new market’s history fails to load', async () => {
    // setSwing only ever ran on SUCCESS, so a failed refetch left the previous market's
    // pill beside the new market's price, permanently — a measured claim about a series
    // this screen is no longer showing and never loaded.
    vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue({
      items: [tomato({ markets: [KANDY_BLOCK, DAMBULLA_BLOCK] })],
    });
    vi.spyOn(api, 'getPriceHistory').mockImplementation(async (_c, marketId) => {
      if (marketId === 'm1') throw new Error('offline');
      return KANDY_SERIES;
    });
    renderWithNav('/portfolio/crop/c1?market=m1');

    await screen.findByText(/Price movement/);

    fireEvent.click(screen.getByRole('button', { name: 'go' }));

    await screen.findByText('No recent price data for this crop at this market yet.');
    expect(screen.queryByText(/Price movement/)).toBeNull();
    // Still fail-soft: the price and the prediction are untouched, and nothing shouts.
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
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
