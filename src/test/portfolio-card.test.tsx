// WatchlistCard — the step-6 crop card: market short-code tabs on top, everything below
// them scoped to the SELECTED market, and no forecast section at all.
//
// These render the card directly rather than through PortfolioPage, because what is under
// test is the card's own state machine (which market is showing, what has been fetched) and
// the page around it only adds noise to the fetch counts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import WatchlistCard from '../components/WatchlistCard';
import { api } from '../api/client';
import type {
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PriceHistoryPoint,
} from '../api/types';

// Real seeded short codes (Markets.ShortCode): DEC = Dambulla, KAN = Kandy. A fixture that
// invents "DAM" would bless a chip the registry never serves.
const DAMBULLA: PortfolioDashboardMarket = {
  marketId: 'm1',
  name: 'Dambulla Dedicated Economic Centre',
  shortCode: 'DEC',
  isDefaultMarket: false,
  price: {
    price: 210,
    observedDate: '2026-07-25',
    direction: 'up',
    changePct: 4.2,
    previousPrice: 201,
    previousObservedDate: '2026-07-21',
  },
  priceUnavailableReason: null,
};

const KANDY: PortfolioDashboardMarket = {
  marketId: 'm7',
  name: 'Kandy (HARTI wholesale)',
  shortCode: 'KAN',
  isDefaultMarket: false,
  price: {
    price: 260,
    observedDate: '2026-07-26',
    direction: 'down',
    changePct: -3.1,
    previousPrice: 268,
    previousObservedDate: '2026-07-22',
  },
  priceUnavailableReason: null,
};

const KEPPETIPOLA: PortfolioDashboardMarket = {
  marketId: 'm2',
  name: 'Keppetipola Dedicated Economic Centre',
  shortCode: 'KEP',
  isDefaultMarket: false,
  price: {
    price: 240,
    observedDate: '2026-07-27',
    direction: 'steady',
    changePct: 0,
    previousPrice: 240,
    previousObservedDate: '2026-07-24',
  },
  priceUnavailableReason: null,
};

function history(base: number): PriceHistoryPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    minPrice: base + i,
    maxPrice: base + 30 + i,
  }));
}

// Two series with deliberately DIFFERENT swing levels, so a test can prove the pill follows
// the tab rather than merely happening to be there: Kandy's midpoint never moves (CV 0 ->
// "steady"), Dambulla's zig-zags between 150 and 300 (CV ~0.35 -> "moves a lot").
function flatHistory(): PriceHistoryPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    minPrice: 250,
    maxPrice: 280,
  }));
}
function swingyHistory(): PriceHistoryPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    minPrice: i % 2 === 0 ? 140 : 290,
    maxPrice: i % 2 === 0 ? 160 : 310,
  }));
}

function tomato(over: Partial<PortfolioDashboardItem> = {}): PortfolioDashboardItem {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000065',
    plantedDate: null,
    // Oldest-chosen first, exactly as the wire orders it — Kandy leads here on purpose, so
    // "the first tab" and "the economic centre" cannot be confused for one another.
    markets: [KANDY, DAMBULLA],
    prediction: {
      predictedPrice: 240,
      lowerBound: 190,
      upperBound: 300,
      confidence: 'High',
      activePredictor: 'residual',
      modelVersion: 'v17',
      snapshotDate: '2026-07-27',
      harvestDate: '2026-10-30',
    },
    predictionUnavailableReason: null,
    ...over,
  };
}

function renderCard(item: PortfolioDashboardItem, onToggleSelect = vi.fn()) {
  return render(
    <MemoryRouter>
      <ul>
        <WatchlistCard
          item={item}
          readiness={null}
          lang="en"
          todayYmd="2026-07-28"
          selected={false}
          onToggleSelect={onToggleSelect}
          onSavePlantedDate={vi.fn(async () => null)}
          busy={false}
        />
      </ul>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(api, 'getPriceHistory').mockImplementation(async (_cropId, marketId) =>
    marketId === 'm1' ? swingyHistory() : flatHistory(),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('WatchlistCard — market short-code tabs', () => {
  it('renders one tab per market in WIRE ORDER, with markets[0] preselected', async () => {
    renderCard(tomato());

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((el) => el.textContent)).toEqual(['KAN', 'DEC']);
    // markets[0] is the farmer's oldest-chosen market; the card opens on it and never
    // re-sorts to put the economic centre first.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('gives ONE market a chip and no tablist (a tab strip of one selects nothing)', async () => {
    renderCard(tomato({ markets: [DAMBULLA] }));

    await screen.findByText('Rs. 210');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Dambulla Dedicated Economic Centre (DEC)' }),
    ).toHaveTextContent('DEC');
  });

  it('names every code control by its FULL market name, not by three letters', async () => {
    renderCard(tomato());

    // WCAG 2.5.3: the accessible name contains the visible label ("KAN") and spells out
    // what it stands for, so a screen-reader user is never read an unexplained code.
    expect(
      await screen.findByRole('tab', { name: 'Kandy (HARTI wholesale) (KAN)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }),
    ).toBeInTheDocument();
  });

  it('prints the selected market’s full name in plain text (the touch answer)', async () => {
    // A tap on a tab SELECTS it, so a tap cannot also mean "explain this code". The name
    // under the strip is what makes the codes readable without a hover.
    renderCard(tomato());
    const named = () => document.querySelector('.pf-card__market-name')?.textContent;
    await waitFor(() => expect(named()).toBe('Kandy (HARTI wholesale)'));

    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));
    await waitFor(() => expect(named()).toBe('Dambulla Dedicated Economic Centre'));
  });

  it('labels the market-scoped panel with the tab that owns it', async () => {
    renderCard(tomato());

    const panel = await screen.findByRole('tabpanel');
    const selected = screen.getByRole('tab', { name: 'Kandy (HARTI wholesale) (KAN)' });
    expect(panel).toHaveAttribute('aria-labelledby', selected.id);
    expect(selected).toHaveAttribute('aria-controls', panel.id);
  });

  it('moves focus along the strip with the arrow keys (roving tabindex)', async () => {
    renderCard(tomato());

    const tabs = await screen.findAllByRole('tab');
    // Only the selected tab is in the Tab order; the rest are reached with arrows.
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    tabs[0].focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
    // Manual activation (the WAI-ARIA default, shared with the admin strips): moving focus
    // does NOT change what the card shows — Enter/Space does.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('arrows go in the RIGHT DIRECTION on a full three-market strip', async () => {
    // Three markets is the backend cap and the smallest strip where direction is
    // observable: on two tabs, +1 and -1 wrap to the same tab, so an inverted ArrowRight
    // would pass unnoticed.
    renderCard(tomato({ markets: [KANDY, DAMBULLA, KEPPETIPOLA] }));

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((el) => el.textContent)).toEqual(['KAN', 'DEC', 'KEP']);

    const strip = screen.getByRole('tablist');
    tabs[0].focus();
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[1]);
    // Both ends wrap, so holding one arrow never strands a farmer at the edge.
    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(strip, { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(strip, { key: 'End' });
    expect(document.activeElement).toBe(tabs[2]);
  });
});

describe('WatchlistCard — a tab switch moves the WHOLE market-scoped block', () => {
  it('swaps the price, the observed date and the trend line together', async () => {
    renderCard(tomato());

    await screen.findByText('Rs. 260');
    expect(screen.getByText(/Price from Jul 26, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Down 3\.1% from Rs\. 268/)).toBeInTheDocument();
    // The swing pill describes the SELECTED market's own series. Pinned independently of
    // the chart: the two share a fetch today, but "Kandy moves a lot" printed under a
    // Kandy price it does not describe is exactly the lie this card must not tell.
    await screen.findByText('Price movement: steady');

    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));

    await screen.findByText('Rs. 210');
    await screen.findByText('Price movement: moves a lot');
    expect(screen.queryByText('Price movement: steady')).toBeNull();
    // Kandy's number is GONE, not merely joined by Dambulla's: two prices on one card is
    // two answers to "what does this crop fetch".
    expect(screen.queryByText('Rs. 260')).toBeNull();
    expect(screen.getByText(/Price from Jul 25, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Up 4\.2% from Rs\. 201/)).toBeInTheDocument();
  });

  it('re-draws the chart for the newly selected market, never the old one', async () => {
    renderCard(tomato());

    // The chart names the market it belongs to, so it cannot silently contradict the price.
    // findAllByText: the title is also the table alternative's <caption>, by design.
    await screen.findAllByText('Daily price — Tomato at Kandy (HARTI wholesale)');
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm7'));
    expect(api.getPriceHistory).not.toHaveBeenCalledWith('c1', 'm1');

    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));

    await screen.findAllByText('Daily price — Tomato at Dambulla Dedicated Economic Centre');
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm1'));
    expect(screen.queryAllByText('Daily price — Tomato at Kandy (HARTI wholesale)')).toHaveLength(
      0,
    );
  });

  it('fetches each market ONCE — switching back repaints from the cache', async () => {
    renderCard(tomato());

    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledTimes(2));

    // Back to the first tab: no third request. A farmer comparing two markets on a rural
    // connection must not pay for the same series twice.
    fireEvent.click(screen.getByRole('tab', { name: 'Kandy (HARTI wholesale) (KAN)' }));
    await screen.findByText('Rs. 260');
    expect(api.getPriceHistory).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));
    await screen.findByText('Rs. 210');
    expect(api.getPriceHistory).toHaveBeenCalledTimes(2);
  });

  it('keeps the chart’s table alternative — the numbers are the product', async () => {
    renderCard(tomato());
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText('View as table')).toBeInTheDocument();
    expect(panel.querySelector('.pr-svg')).toHaveAttribute('aria-label');
  });
});

describe('WatchlistCard — the chart’s four states', () => {
  it('shows a skeleton while the series is in flight, then resolves it', async () => {
    let release: (h: PriceHistoryPoint[]) => void = () => {};
    vi.spyOn(api, 'getPriceHistory').mockReturnValue(
      new Promise<PriceHistoryPoint[]>((res) => {
        release = res;
      }),
    );
    renderCard(tomato({ markets: [DAMBULLA] }));

    await screen.findByText('Rs. 210');
    expect(document.querySelector('.pf-skel--chart')).toHaveAttribute('aria-busy', 'true');

    release(history(200));
    // No stuck aria-busy: every path out of the fetch resolves the region.
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  });

  it('falls back to the honest empty chart when the history fetch fails', async () => {
    vi.spyOn(api, 'getPriceHistory').mockRejectedValue(new Error('offline'));
    renderCard(tomato({ markets: [DAMBULLA] }));

    await screen.findByText('No recent price data for this crop at this market yet.');
    // Fail-soft decoration: the price above it is untouched and nothing shouts an error.
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('draws no chart at all for a market with no price, and does not fetch one', async () => {
    const noPrice: PortfolioDashboardMarket = {
      ...DAMBULLA,
      price: null,
      priceUnavailableReason: 'no_recent_price',
    };
    renderCard(tomato({ markets: [noPrice] }));

    await screen.findByText('No price data for this market yet.');
    expect(document.querySelector('.pf-card__chart')).toBeNull();
    expect(api.getPriceHistory).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('WatchlistCard — the default-market card', () => {
  it('shows the economic centre’s own code AND says it was not chosen', async () => {
    renderCard(tomato({ markets: [{ ...DAMBULLA, isDefaultMarket: true }] }));

    expect(
      await screen.findByRole('button', { name: 'Dambulla Dedicated Economic Centre (DEC)' }),
    ).toHaveTextContent('DEC');
    await screen.findByText(
      'You have not chosen a market for this crop, so we show the main economic centre.',
    );
  });

  it('reveals the full name inline when the chip is tapped (touch has no hover)', async () => {
    renderCard(tomato({ markets: [DAMBULLA] }));

    const chip = await screen.findByRole('button', {
      name: 'Dambulla Dedicated Economic Centre (DEC)',
    });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(chip.getAttribute('aria-controls')).toBeTruthy();
  });
});

describe('WatchlistCard — the nightly SNAPSHOT forecast is still not on the card', () => {
  it('never renders the wire prediction: the card forecasts the FARMER’s planting or nothing', async () => {
    // `prediction` is the nightly snapshot for an assumed planting day the farmer never
    // named. Step 7 replaced it with a forecast for the date they actually recorded — and
    // this crop has no date, so the card claims no harvest price at all.
    renderCard(tomato());

    await screen.findByText('Rs. 260');
    expect(screen.queryByText(/at harvest/)).toBeNull();
    expect(screen.queryByText(/Likely price range/)).toBeNull();
    expect(screen.queryByText(/Confidence:/)).toBeNull();
    expect(screen.queryByText('National forecast')).toBeNull();
    expect(screen.queryByText(/Rough estimate only/)).toBeNull();
    // The invitation to record a planting is what stands in its place.
    expect(screen.getByText('When did you plant this crop?')).toBeInTheDocument();
  });

  it('says nothing about a MISSING snapshot either — the card is not about snapshots', async () => {
    renderCard(tomato({ prediction: null, predictionUnavailableReason: 'no_snapshot' }));

    await screen.findByText('Rs. 260');
    expect(screen.queryByText('No forecast for this crop yet.')).toBeNull();
  });
});

describe('WatchlistCard — "More details" opens the crop, it does not navigate away', () => {
  it('is a BUTTON that announces its popup, named for its crop', async () => {
    renderCard(tomato());
    const btn = await screen.findByRole('button', { name: 'More details for Tomato' });
    expect(btn).toHaveTextContent('More details');
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    // The old link is gone: nothing on the card leaves the list any more.
    expect(screen.queryByRole('link', { name: /See details/ })).toBeNull();
  });

  it('hands the SELECTED market through to the crop page inside the popup', async () => {
    // The bug this closes: read Rs. 260 on the Kandy tab, tap through, land on Dambulla's
    // Rs. 210 under the same crop name — two answers to one question, neither screen
    // admitting they are about different markets.
    renderCard(tomato());
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');
    // markets[0] is the card's default context, so the ordinary tap keeps the ONE canonical
    // URL for a crop rather than pinning a redundant parameter into every bookmark.
    expect(
      within(dialog).getByRole('link', { name: 'Open the full crop page for Tomato' }),
    ).toHaveAttribute('href', '/portfolio/crop/c1');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));
    await screen.findByText('Rs. 210');
    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('link', {
        name: 'Open the full crop page for Tomato',
      }),
    ).toHaveAttribute('href', '/portfolio/crop/c1?market=m1');
  });
});
