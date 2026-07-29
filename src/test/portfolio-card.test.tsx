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
import type { CropReadinessStatus } from '../lib/readiness';

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

function renderCard(
  item: PortfolioDashboardItem,
  onToggleSelect = vi.fn(),
  readiness: CropReadinessStatus | null = null,
) {
  return render(
    <MemoryRouter>
      <ul>
        <WatchlistCard
          item={item}
          readiness={readiness}
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

  it('reads "Tomato → KAN DEC": the name, an arrow, then the codes, in one header row', async () => {
    renderCard(tomato());

    const ident = document.querySelector('.pf-card__ident') as HTMLElement;
    expect(within(ident).getByRole('heading', { level: 3, name: 'Tomato' })).toBeInTheDocument();
    expect(within(ident).getByRole('tablist')).toBeInTheDocument();
    // The arrow is decoration: it says "read at" to the eye and nothing to a screen reader,
    // which gets the relationship from the tablist's own name instead.
    const arrow = ident.querySelector('.pf-card__arrow') as HTMLElement;
    expect(arrow).toHaveTextContent('→');
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('tablist')).toHaveAccessibleName('Markets you watch Tomato at');
  });

  it('spells the selected market out in the POPUP — the card header carries codes only', async () => {
    // A tap on a tab SELECTS it, so a tap cannot also mean "explain this code", and the
    // hover tooltip does not exist on a touch screen. "More details" is where a farmer who
    // has never seen "KEP" reads "Keppetipola", and it must follow the chosen tab.
    renderCard(tomato());
    await screen.findByText('Rs. 260');
    // The card's own plain-text market line is gone; the only thing left on it that carries
    // the full name is the pointer/keyboard tooltip, which is aria-hidden and invisible on
    // touch. Nothing a farmer can read on the card says "Kandy".
    expect(document.querySelector('.pf-card__market-name')).toBeNull();
    expect(
      screen
        .getAllByText('Kandy (HARTI wholesale)')
        .every((el) => el.getAttribute('aria-hidden') === 'true'),
    ).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
    expect(
      within(screen.getByRole('dialog')).getByText('Kandy (HARTI wholesale)'),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));
    await screen.findByText('Rs. 210');
    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Dambulla Dedicated Economic Centre')).toBeInTheDocument();
    expect(within(dialog).queryByText('Kandy (HARTI wholesale)')).toBeNull();
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

    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));

    await screen.findByText('Rs. 210');
    // Kandy's number is GONE, not merely joined by Dambulla's: two prices on one card is
    // two answers to "what does this crop fetch".
    expect(screen.queryByText('Rs. 260')).toBeNull();
    expect(screen.getByText(/Price from Jul 25, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Up 4\.2% from Rs\. 201/)).toBeInTheDocument();
  });

  it('moves price, trend and chart from ONE market resolution, panel or no panel', async () => {
    // The price cell is rendered OUTSIDE the tabpanel (it shares row 1 with the tablist,
    // which cannot be nested inside the panel it controls), so nesting is not what keeps it
    // honest — the single selectedMarketFor() seam is. This pins the property that seam
    // exists for: one tab press moves all three, and no two of them can name different
    // markets.
    renderCard(tomato());

    const panel = await screen.findByRole('tabpanel');
    const priceCell = document.querySelector('.pf-card__pricecell') as HTMLElement;
    // The price is deliberately not inside the panel; the trend and the chart are.
    expect(panel.contains(priceCell)).toBe(false);
    expect(within(priceCell).getByText('Rs. 260')).toBeInTheDocument();
    expect(within(panel).getByText(/Down 3\.1% from Rs\. 268/)).toBeInTheDocument();
    await within(panel).findAllByText('Daily price — Tomato at Kandy (HARTI wholesale)');
    // ...and the crop name, which does NOT change with the tab, is in neither.
    expect(within(panel).queryByRole('heading', { name: 'Tomato' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));

    await within(priceCell).findByText('Rs. 210');
    expect(within(priceCell).queryByText('Rs. 260')).toBeNull();
    expect(within(panel).getByText(/Up 4\.2% from Rs\. 201/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Down 3\.1%/)).toBeNull();
    await within(panel).findAllByText('Daily price — Tomato at Dambulla Dedicated Economic Centre');
    expect(
      within(panel).queryAllByText('Daily price — Tomato at Kandy (HARTI wholesale)'),
    ).toHaveLength(0);
  });

  it('puts the number in the header slot and the trend in the panel — not the reverse', async () => {
    // Pinned on the TWO-market path, where the tabs actually live: swapping PriceBlock's
    // `part` branches must fail here, not only on the single-market card.
    renderCard(tomato());

    const priceCell = (await screen.findByText('Rs. 260')).closest(
      '.pf-card__pricecell',
    ) as HTMLElement;
    expect(within(priceCell).getByText('Price from Jul 26, 2026')).toBeInTheDocument();
    expect(within(priceCell).queryByText(/Down 3\.1%/)).toBeNull();

    const trend = screen.getByText(/Down 3\.1% from Rs\. 268/);
    expect(trend.closest('.pf-card__pricecell')).toBeNull();
    expect(trend.closest('.pf-card__panel')).not.toBeNull();
  });

  it('never labels an EMPTY tabpanel: the no-price note goes inside the region', async () => {
    // A market with no price has no trend and no chart either, so lifting the price cell out
    // of the panel left `<div role="tabpanel"></div>` — a tab pointing at nothing, with the
    // one sentence that answers "what does this market pay?" sitting outside the region that
    // tab names. The note renders inside instead; it is a full-width row in both places, so
    // the move costs no pixels.
    const noPriceKandy: PortfolioDashboardMarket = {
      ...KANDY,
      price: null,
      priceUnavailableReason: 'no_recent_price',
    };
    renderCard(tomato({ markets: [noPriceKandy, DAMBULLA] }));

    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText('No price data for this market yet.')).toBeInTheDocument();
    expect(panel.children.length).toBeGreaterThan(0);
    // Nothing was duplicated into the header row on the way.
    expect(document.querySelectorAll('.pf-card__pricecell')).toHaveLength(1);

    // Switching to a market that HAS one restores the split: number outside the panel,
    // trend and chart inside it.
    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));
    await screen.findByText('Rs. 210');
    const priceCell = document.querySelector('.pf-card__pricecell') as HTMLElement;
    expect(panel.contains(priceCell)).toBe(false);
    expect(within(panel).getByText(/Up 4\.2% from Rs\. 201/)).toBeInTheDocument();
    expect(within(panel).queryByText('No price data for this market yet.')).toBeNull();
  });

  it('keeps the remove tick in the header, before the price and outside the tabpanel', async () => {
    // Two ways round, because each catches a different regression: dropping the tick into
    // the tabpanel would make it read as market-scoped ("remove this market?"), and moving
    // it after the price would put a control the eye meets first at the end of the row.
    renderCard(tomato());

    const panel = await screen.findByRole('tabpanel');
    const tick = screen.getByRole('checkbox', { name: 'Tick Tomato to remove it' });
    const priceCell = document.querySelector('.pf-card__pricecell') as HTMLElement;

    expect(panel.contains(tick)).toBe(false);
    expect(tick.closest('.pf-card__top')).not.toBeNull();
    expect(
      tick.compareDocumentPosition(priceCell) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('carries the swing pill into the popup, still following the selected tab', async () => {
    // The pill left the card in the 2026-07-29 simplification, but the rule it obeys did
    // not: "Kandy moves a lot" shown for a series that is Dambulla's is the lie this card
    // must never tell, wherever the pill is read.
    renderCard(tomato());
    await screen.findByText('Rs. 260');
    expect(screen.queryByText(/Price movement/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));
    expect(await within(screen.getByRole('dialog')).findByText('Price movement: steady'))
      .toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('tab', { name: 'Dambulla Dedicated Economic Centre (DEC)' }));
    await screen.findByText('Rs. 210');
    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Price movement: moves a lot')).toBeInTheDocument();
    expect(within(dialog).queryByText('Price movement: steady')).toBeNull();
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

describe('WatchlistCard — the simplified card: what MOVED to the popup', () => {
  it('gives a one-market crop "Beans → DEC": name, arrow, one chip, price on the right', async () => {
    renderCard(tomato({ cropName: 'Beans', markets: [DAMBULLA] }));

    const ident = document.querySelector('.pf-card__ident') as HTMLElement;
    expect(within(ident).getByRole('heading', { level: 3, name: 'Beans' })).toBeInTheDocument();
    expect(ident.querySelector('.pf-card__arrow')).toHaveTextContent('→');
    // A chip, not a tab: one market has nothing to select between.
    expect(
      within(ident).getByRole('button', { name: 'Dambulla Dedicated Economic Centre (DEC)' }),
    ).toHaveTextContent('DEC');
    expect(within(ident).queryByRole('tablist')).toBeNull();

    // The price fact keeps PriceBlock's words wherever it is placed.
    const cell = document.querySelector('.pf-card__pricecell') as HTMLElement;
    expect(within(cell).getByText('Rs. 210')).toBeInTheDocument();
    expect(within(cell).getByText('/kg')).toBeInTheDocument();
    expect(within(cell).getByText('Price from Jul 25, 2026')).toBeInTheDocument();
    // The trend is NOT in the price cell — it is its own full-width line under the header.
    expect(within(cell).queryByText(/Up 4\.2%/)).toBeNull();
    expect(await screen.findByText(/Up 4\.2% from Rs\. 201 on Jul 21, 2026/)).toBeInTheDocument();
  });

  it('drops the readiness badge and the market line from the card, and shows both in the popup', async () => {
    renderCard(tomato({ markets: [DAMBULLA] }), vi.fn(), 'collecting');

    await screen.findByText('Rs. 210');
    // Nothing is lost, only moved: the card is for scanning ten crops, the popup for
    // reading one.
    expect(document.querySelector('.rdy-badge')).toBeNull();
    expect(document.querySelector('.pf-card__market-name')).toBeNull();
    expect(screen.queryByText('Market:')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.rdy-badge')).not.toBeNull();
    expect(within(dialog).getByText('Collecting data')).toBeInTheDocument();
    expect(within(dialog).getByText('Dambulla Dedicated Economic Centre')).toBeInTheDocument();
  });

  it('keeps the "no price here" note in the price slot, as a full-width row', async () => {
    // The absence of a price is shown where the price would be — not tucked below the fold
    // — and it still does not imply staleness. It is flagged as a sentence rather than a
    // number so the CSS can give it the whole row: 235px of copy in a header column leaves
    // a long crop name (Mukunuwenna, or any Sinhala/Tamil name) nowhere to go.
    renderCard(
      tomato({
        markets: [{ ...DAMBULLA, price: null, priceUnavailableReason: 'no_recent_price' }],
      }),
    );

    const cell = (await screen.findByText('No price data for this market yet.')).closest(
      '.pf-card__pricecell',
    ) as HTMLElement;
    expect(cell).not.toBeNull();
    expect(cell.className).toContain('pf-card__pricecell--nodata');
    // No trend line either: there is no price for it to describe.
    expect(document.querySelector('.pf-trend')).toBeNull();
  });

  it('opens the popup OUTSIDE the card surface that carries the CSS container', async () => {
    // `container-type: inline-size` also applies layout containment, which makes the element
    // a containing block for position:fixed descendants. Modal does not portal, so if the
    // container sat on the <li> the dialog's fixed backdrop would be trapped inside one
    // 300px-wide card on the desktop grid — a "modal" covering one card, with later cards
    // painting over it. The container therefore lives on .pf-card__inner, and this pins the
    // DOM relationship that makes that safe. jsdom applies no CSS; only this structure can
    // be tested here.
    renderCard(tomato());
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));

    const backdrop = document.querySelector('.pf-modal__backdrop') as HTMLElement;
    const container = document.querySelector('.pf-card__inner') as HTMLElement;
    const card = document.querySelector('.pf-card') as HTMLElement;
    expect(backdrop).not.toBeNull();
    expect(container.contains(backdrop)).toBe(false);
    expect(card.contains(backdrop)).toBe(true);
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
