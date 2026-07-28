import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n, { hasOwnTranslation } from '../i18n';
import PortfolioPage from '../pages/PortfolioPage';
import { api, ApiError } from '../api/client';
import { MAX_MARKETS_PER_CROP, MAX_WATCHED_CROPS } from '../lib/portfolio';
import type {
  Crop,
  CropReadiness,
  Market,
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PriceHistoryPoint,
  WatchlistItem,
} from '../api/types';

// ---- Wire fixtures: these mirror the LIVE payloads verbatim (verified 2026-07-28 against
// the dev API). markets[] is per crop, oldest-chosen first; the price lives INSIDE a market
// block; there is no homeMarket anywhere. ---------------------------------------------
const DAMBULLA_BLOCK: PortfolioDashboardMarket = {
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

const KANDY_BLOCK: PortfolioDashboardMarket = {
  marketId: 'm3',
  name: 'Kandy',
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

const CROPS: Crop[] = [
  {
    id: 'c1',
    name: 'Tomato',
    externalProductId: 3,
    source: 'DEC',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    cropCode: 'VEG000003',
  },
  {
    id: 'c2',
    name: 'Beans',
    externalProductId: 7,
    source: 'DEC',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    cropCode: 'VEG000007',
  },
];

const MARKETS: Market[] = [
  {
    id: 'm3',
    name: 'Kandy',
    district: 'Kandy',
    marketType: 1,
    isEconomicCenter: false,
    hasStoredData: true,
    lastStoredDate: null,
    isTrainingSource: true,
  },
  {
    id: 'm1',
    name: 'Dambulla Dedicated Economic Centre',
    district: 'Matale',
    marketType: 1,
    isEconomicCenter: true,
    hasStoredData: true,
    lastStoredDate: null,
    isTrainingSource: true,
  },
];

function watched(cropId: string, cropName: string, marketIds: string[]): WatchlistItem {
  return {
    cropId,
    cropName,
    cropCode: null,
    plantedDate: null,
    markets: marketIds.map((id) => ({
      marketId: id,
      name: MARKETS.find((m) => m.id === id)?.name ?? id,
      shortCode: id === 'm1' ? 'DEC' : 'KAN',
    })),
    createdAtUtc: '2026-07-20T00:00:00Z',
  };
}

// modelActive:false => a NULL readiness map => no badges anywhere. Readiness is
// decoration on this screen, so the tests deliberately make no readiness claim.
const NO_READINESS: CropReadiness = {
  modelActive: false,
  modelVersion: null,
  minHistoryObs: 0,
  crops: [],
};

function mockPage(
  dashboard: PortfolioDashboard,
  watchlist: WatchlistItem[] = [],
  history: PriceHistoryPoint[] = [],
) {
  vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue(dashboard);
  vi.spyOn(api, 'getCrops').mockResolvedValue(CROPS);
  vi.spyOn(api, 'getMarkets').mockResolvedValue(MARKETS);
  vi.spyOn(api, 'getWatchlist').mockResolvedValue(watchlist);
  vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
  vi.spyOn(api, 'getPriceHistory').mockResolvedValue(history);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/portfolio']}>
      <PortfolioPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PortfolioPage — the four async states', () => {
  it('shows a skeleton (and no numbers) while the page loads', async () => {
    let release: (d: PortfolioDashboard) => void = () => {};
    vi.spyOn(api, 'getPortfolioDashboard').mockReturnValue(
      new Promise<PortfolioDashboard>((res) => {
        release = res;
      }),
    );
    vi.spyOn(api, 'getCrops').mockResolvedValue(CROPS);
    vi.spyOn(api, 'getMarkets').mockResolvedValue(MARKETS);
    vi.spyOn(api, 'getWatchlist').mockResolvedValue([]);
    vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
    vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
    renderPage();

    expect(document.querySelector('.pf-skeleton')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/Rs\./)).toBeNull();

    release({ items: [] });
    await waitFor(() => expect(document.querySelector('.pf-skeleton')).toBeNull());
  });

  it('renders a watched crop: price, observed date, trend and prediction band', async () => {
    mockPage({ items: [tomato()] }, [watched('c1', 'Tomato', ['m1'])]);
    renderPage();

    await screen.findByRole('heading', { name: 'Tomato', level: 3 });
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
    expect(screen.getByText(/Price from Jul 25, 2026/)).toBeInTheDocument();
    // Trend is a WORD plus a percentage, not a colour.
    expect(screen.getByText(/Up 4\.2% from Rs\. 201 on Jul 21, 2026/)).toBeInTheDocument();
    // The prediction is a point AND its band — the band is never dropped.
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
    expect(screen.getByText(/Likely price range: Rs\. 190 – 300/)).toBeInTheDocument();
    expect(screen.getByText(/\(Confidence: Good\)/)).toBeInTheDocument();
  });

  it('shows an error with a retry, and recovers on retry', async () => {
    const spy = vi
      .spyOn(api, 'getPortfolioDashboard')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ items: [tomato()] });
    vi.spyOn(api, 'getCrops').mockResolvedValue(CROPS);
    vi.spyOn(api, 'getMarkets').mockResolvedValue(MARKETS);
    vi.spyOn(api, 'getWatchlist').mockResolvedValue([watched('c1', 'Tomato', ['m1'])]);
    vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
    vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load');
    screen.getByRole('button', { name: 'Retry' }).click();
    await screen.findByRole('heading', { name: 'Tomato', level: 3 });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('PortfolioPage — markets[0] drives the card', () => {
  it('shows the FIRST market on the wire, its name and its own price', async () => {
    mockPage({ items: [tomato({ markets: [KANDY_BLOCK, DAMBULLA_BLOCK] })] }, [
      watched('c1', 'Tomato', ['m3', 'm1']),
    ]);
    renderPage();

    await screen.findByRole('heading', { name: 'Tomato', level: 3 });
    // Kandy's own number, not Dambulla's — and Dambulla's is nowhere on the card.
    expect(screen.getByText('Rs. 260')).toBeInTheDocument();
    expect(screen.queryByText('Rs. 210')).toBeNull();
    expect(screen.getAllByText('Kandy').length).toBeGreaterThan(0);
  });

  it('measures the swing against markets[0], not some other market of the crop', async () => {
    mockPage({ items: [tomato({ markets: [KANDY_BLOCK, DAMBULLA_BLOCK] })] }, [
      watched('c1', 'Tomato', ['m3', 'm1']),
    ]);
    renderPage();

    await screen.findByRole('heading', { name: 'Tomato', level: 3 });
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm3'));
    expect(api.getPriceHistory).not.toHaveBeenCalledWith('c1', 'm1');
  });

  it('says a market has NO price without ever implying the data went stale', async () => {
    const empty: PortfolioDashboardMarket = {
      ...KANDY_BLOCK,
      price: null,
      priceUnavailableReason: 'no_recent_price',
    };
    mockPage({ items: [tomato({ markets: [empty] })] }, [watched('c1', 'Tomato', ['m3'])]);
    renderPage();

    // "no_recent_price" means this market published nothing for this crop — nothing aged
    // out and nothing is late, so the words "recent"/"old"/"stale" must not appear.
    const note = await screen.findByText('No price data for this market yet.');
    expect(note).toBeInTheDocument();
    expect(screen.queryByText(/recent|stale|out of date/i)).toBeNull();
  });

  it('names the economic-centre default as a default, not as a failed substitution', async () => {
    mockPage(
      { items: [tomato({ markets: [{ ...DAMBULLA_BLOCK, isDefaultMarket: true }] })] },
      [watched('c1', 'Tomato', [])],
    );
    renderPage();
    await screen.findByText(
      'You have not chosen a market for this crop, so we show the main economic centre.',
    );
  });
});

describe('PortfolioPage — the "Watching X of 10" counter', () => {
  it('counts the crops actually watched, against the backend cap', async () => {
    mockPage({ items: [tomato(), tomato({ cropId: 'c2', cropName: 'Beans' })] }, [
      watched('c1', 'Tomato', ['m1']),
      watched('c2', 'Beans', ['m1']),
    ]);
    renderPage();
    await screen.findByText('Watching 2 of 10 crops');
  });

  it('states the cap even with an empty watchlist (a fact, not an error)', async () => {
    mockPage({ items: [] }, []);
    renderPage();
    await screen.findByText('Watching 0 of 10 crops');
  });
});

describe('PortfolioPage — the two distinct empty states (PRD §5.2)', () => {
  it('an empty watchlist invites the farmer to the table below, not to another page', async () => {
    mockPage({ items: [] }, []);
    renderPage();

    await screen.findByText('You have not added any crops yet');
    // The dissolved settings screen is gone: there is no link off this page any more.
    expect(screen.queryByRole('link', { name: 'Add crops' })).toBeNull();
    // The table is right there, on the same page.
    expect(screen.getByRole('heading', { name: 'All crops', level: 2 })).toBeInTheDocument();
  });

  it('a watchlist with no data admits it, still lists the crops, and invents no number', async () => {
    mockPage(
      {
        items: [
          tomato({
            markets: [{ ...DAMBULLA_BLOCK, price: null, priceUnavailableReason: 'no_recent_price' }],
            prediction: null,
            predictionUnavailableReason: 'no_snapshot',
          }),
        ],
      },
      [watched('c1', 'Tomato', ['m1'])],
    );
    renderPage();

    await screen.findByText(/No prices for your crops yet/);
    expect(screen.getByText('No price data for this market yet.')).toBeInTheDocument();
    expect(screen.getByText('No forecast for this crop yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Rs\./)).toBeNull();
    // It is NOT the "add crops" invitation — the farmer did add crops.
    expect(screen.queryByText('You have not added any crops yet')).toBeNull();
  });
});

describe('PortfolioPage — honest labelling', () => {
  it('a null direction reads "no earlier price to compare", NOT "steady", and keeps the price', async () => {
    mockPage(
      {
        items: [
          tomato({
            markets: [
              {
                ...DAMBULLA_BLOCK,
                price: {
                  ...DAMBULLA_BLOCK.price!,
                  direction: null,
                  changePct: null,
                  previousPrice: null,
                  previousObservedDate: null,
                },
              },
            ],
          }),
        ],
      },
      [watched('c1', 'Tomato', ['m1'])],
    );
    renderPage();

    await screen.findByText('No earlier price to compare with.');
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
    expect(screen.queryByText(/Same/)).toBeNull();
  });

  it('labels the prediction "National forecast" beside a market that is not the anchor', async () => {
    mockPage({ items: [tomato({ markets: [KANDY_BLOCK] })] }, [watched('c1', 'Tomato', ['m3'])]);
    renderPage();
    await screen.findByText('National forecast');
  });

  it('omits the national label at the economic centre (the anchor itself)', async () => {
    mockPage({ items: [tomato()] }, [watched('c1', 'Tomato', ['m1'])]);
    renderPage();
    await screen.findByRole('heading', { name: 'Tomato', level: 3 });
    expect(screen.queryByText('National forecast')).toBeNull();
  });

  it('de-rates a fallback-served prediction visibly instead of hiding it', async () => {
    mockPage(
      {
        items: [
          tomato({
            prediction: {
              ...tomato().prediction!,
              confidence: 'Low',
              activePredictor: 'crop_mean_fallback',
            },
          }),
        ],
      },
      [watched('c1', 'Tomato', ['m1'])],
    );
    renderPage();

    await screen.findByText(/Rough estimate only/);
    // The number is still there — de-rated, not withheld.
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
    expect(screen.getByText(/\(Confidence: Low\)/)).toBeInTheDocument();
  });

  it('de-rates a predictor name this build does not know, rather than trusting it', async () => {
    mockPage(
      {
        items: [
          tomato({
            prediction: {
              // Carries no "fallback" substring: a denylist would render this at full model
              // trust. The farmer must see the caution, not inherit confidence by accident.
              ...tomato().prediction!,
              activePredictor: 'category_mean',
            },
          }),
        ],
      },
      [watched('c1', 'Tomato', ['m1'])],
    );
    renderPage();

    await screen.findByText(/Rough estimate only/);
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
  });

  it('says how old a stale price is, and still shows the price', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27)); // 27 Jul 2026, local
    try {
      mockPage(
        {
          items: [
            tomato({
              markets: [
                { ...DAMBULLA_BLOCK, price: { ...DAMBULLA_BLOCK.price!, observedDate: '2026-05-27' } },
              ],
            }),
          ],
        },
        [watched('c1', 'Tomato', ['m1'])],
      );
      renderPage();
      await vi.waitFor(() => expect(screen.getByText('Rs. 210')).toBeInTheDocument());
      expect(screen.getByText('61 days old')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PortfolioPage — remove by ticking', () => {
  const twoCrops = () => ({
    items: [tomato(), tomato({ cropId: 'c2', cropName: 'Beans' })],
  });
  const twoWatched = () => [watched('c1', 'Tomato', ['m1']), watched('c2', 'Beans', ['m1'])];

  it('gives every card a tick with a crop-specific name (never ten controls called "Select")', async () => {
    mockPage(twoCrops(), twoWatched());
    renderPage();

    expect(
      await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Tick Beans to remove it' })).toBeInTheDocument();
  });

  it('hides the remove action until something is ticked', async () => {
    mockPage(twoCrops(), twoWatched());
    renderPage();
    await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' });
    expect(screen.queryByRole('button', { name: /Remove .* from my crops/ })).toBeNull();
  });

  it('DELETEs every ticked crop, but only after a confirm step', async () => {
    mockPage(twoCrops(), twoWatched());
    const del = vi
      .spyOn(api, 'removeWatchlistCrop')
      .mockImplementation(async (id) => ({ cropId: id, removed: true }));
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Beans to remove it' }));

    // Pressing the action ASKS; it does not delete.
    fireEvent.click(screen.getByRole('button', { name: 'Remove 2 crops from my crops' }));
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByText('Remove 2 crops from my crops?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(2));
    expect(del.mock.calls.map((c) => c[0])).toEqual(['c1', 'c2']);
  });

  it('the confirm is keyboard-operable: focus lands on the destructive button', async () => {
    mockPage(twoCrops(), twoWatched());
    vi.spyOn(api, 'removeWatchlistCrop').mockResolvedValue({ cropId: 'c1', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));

    const yes = await screen.findByRole('button', { name: 'Yes, remove' });
    await waitFor(() => expect(document.activeElement).toBe(yes));
  });

  it('backing out of the confirm deletes nothing and keeps the tick', async () => {
    mockPage(twoCrops(), twoWatched());
    const del = vi.spyOn(api, 'removeWatchlistCrop').mockResolvedValue({ cropId: 'c1', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'No, keep them' }));

    expect(del).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove 1 crop from my crops' })).toBeInTheDocument();
  });

  it('re-reads the list after removing, so the screen shows what really landed', async () => {
    mockPage(twoCrops(), twoWatched());
    vi.spyOn(api, 'removeWatchlistCrop').mockResolvedValue({ cropId: 'c1', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));

    vi.mocked(api.getPortfolioDashboard).mockResolvedValue({
      items: [tomato({ cropId: 'c2', cropName: 'Beans' })],
    });
    vi.mocked(api.getWatchlist).mockResolvedValue([watched('c2', 'Beans', ['m1'])]);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await screen.findByText('Watching 1 of 10 crops');
    expect(api.getPortfolioDashboard).toHaveBeenCalledTimes(2);
  });
});

describe('PortfolioPage — a batch removal survives a crop that is already gone (S4)', () => {
  const three = () => ({
    items: [
      tomato(),
      tomato({ cropId: 'c2', cropName: 'Beans' }),
      tomato({ cropId: 'c3', cropName: 'Carrot' }),
    ],
  });
  const threeWatched = () => [
    watched('c1', 'Tomato', ['m1']),
    watched('c2', 'Beans', ['m1']),
    watched('c3', 'Carrot', ['m1']),
  ];

  it('treats a 404 watchlist_entry_not_found as done and REMOVES THE REST', async () => {
    mockPage(three(), threeWatched());
    const del = vi.spyOn(api, 'removeWatchlistCrop').mockImplementation(async (id) => {
      // Crop 2 is already gone — the farmer's goal for it is met, not refused.
      if (id === 'c2') throw new ApiError('HTTP 404', 404, 'watchlist_entry_not_found');
      return { cropId: id, removed: true };
    });
    mockPage(three(), threeWatched());
    renderPage();

    for (const name of ['Tomato', 'Beans', 'Carrot']) {
      fireEvent.click(await screen.findByRole('checkbox', { name: `Tick ${name} to remove it` }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Remove 3 crops from my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    // The regression: stopping at c2 stranded c3 AND reported a failure for a state the
    // farmer already had.
    await waitFor(() => expect(del).toHaveBeenCalledTimes(3));
    expect(del.mock.calls.map((c) => c[0])).toEqual(['c1', 'c2', 'c3']);
    await screen.findByText('Removed.');
  });

  it('still stops an ADD batch at the first real refusal', async () => {
    // watchlist_full refuses everything after it too, so firing the rest is pure waste.
    mockPage({ items: [] }, []);
    const add = vi
      .spyOn(api, 'addWatchlistCrop')
      .mockRejectedValue(new ApiError('HTTP 422', 422, 'watchlist_full'));
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Tomato to my crops' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add Beans to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText(/You can watch up to 10 crops/);
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe('PortfolioPage — a failed RE-READ is not a failed write (S3)', () => {
  it('says "saved, could not refresh" rather than sending the farmer to re-do it', async () => {
    mockPage({ items: [] }, []);
    vi.spyOn(api, 'addWatchlistCrop').mockResolvedValue({
      item: watched('c2', 'Beans', []),
      alreadyPresent: false,
    });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Beans to my crops' }));
    // The write lands; only the re-read falls over.
    vi.mocked(api.getPortfolioDashboard).mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText(
      'Saved. We could not refresh this page — please check again in a moment.',
    );
    // The regression: this used to read as a write failure next to a stale card.
    expect(screen.queryByText('Something went wrong. Please try again.')).toBeNull();
    expect(screen.queryByText('Added to my crops.')).toBeNull();
  });

  it('a real write failure still wins over the refresh warning', async () => {
    mockPage({ items: [] }, []);
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(new ApiError('network', 0));
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Beans to my crops' }));
    vi.mocked(api.getPortfolioDashboard).mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText('Something went wrong. Please try again.');
  });
});

describe('PortfolioPage — the confirm is a dialog, and keyboard-escapable (S6, S7)', () => {
  const twoWatched = () => [watched('c1', 'Tomato', ['m1']), watched('c2', 'Beans', ['m1'])];
  const twoCrops = () => ({ items: [tomato(), tomato({ cropId: 'c2', cropName: 'Beans' })] });

  it('exposes an alertdialog named by its own question, not a bare alert', async () => {
    mockPage(twoCrops(), twoWatched());
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Remove 1 crop from my crops?',
    });
    expect(dialog).toBeInTheDocument();
  });

  it('Escape backs out by the same path as "No, keep them"', async () => {
    mockPage(twoCrops(), twoWatched());
    const del = vi.spyOn(api, 'removeWatchlistCrop').mockResolvedValue({ cropId: 'c1', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

    expect(del).not.toHaveBeenCalled();
    const back = await screen.findByRole('button', { name: 'Remove 1 crop from my crops' });
    // Focus comes back to the control that opened the confirm, not to <body>.
    await waitFor(() => expect(document.activeElement).toBe(back));
  });

  it('returns focus to the remove button when the farmer backs out by button', async () => {
    mockPage(twoCrops(), twoWatched());
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'No, keep them' }));

    const back = await screen.findByRole('button', { name: 'Remove 1 crop from my crops' });
    await waitFor(() => expect(document.activeElement).toBe(back));
  });

  it('a change of selection cancels a pending confirm, never re-aims it at another crop', async () => {
    // The regression: unticking hid the bar but left `confirming` true, so ticking a
    // DIFFERENT crop re-rendered the red destructive confirm immediately — a question the
    // farmer never asked, now pointed at a crop they had only just selected.
    mockPage(twoCrops(), twoWatched());
    const del = vi.spyOn(api, 'removeWatchlistCrop').mockResolvedValue({ cropId: 'c1', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Tomato to remove it' })); // untick
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Beans to remove it' })); // tick another

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes, remove' })).toBeNull();
    // The plain, non-destructive bar is what the farmer gets — now naming Beans.
    expect(screen.getByRole('button', { name: 'Remove 1 crop from my crops' })).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
  });

  it('cancels the confirm when the selection GROWS as well', async () => {
    mockPage(twoCrops(), twoWatched());
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));
    // "Remove 1 crop?" is no longer the question once a second crop joins the selection.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Beans to remove it' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove 2 crops from my crops' })).toBeInTheDocument();
  });

  it('sends focus to the result message once the removal completes', async () => {
    // The regression: the whole bar unmounts on success, so focus fell to <body> and a
    // keyboard user had to tab from the top of the page to find out what happened.
    mockPage(twoCrops(), twoWatched());
    vi.spyOn(api, 'removeWatchlistCrop').mockResolvedValue({ cropId: 'c1', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Tomato to remove it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 crop from my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    const status = await screen.findByText('Removed.');
    await waitFor(() => expect(document.activeElement).toBe(status));
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('PortfolioPage — the caps in the copy come from the constants (S8)', () => {
  it('interpolates the crop cap rather than shipping a hardcoded 10', async () => {
    mockPage({ items: [] }, []);
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(
      new ApiError('HTTP 422', 422, 'watchlist_full'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Beans to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText(
      `You can watch up to ${MAX_WATCHED_CROPS} crops. Remove one before adding another.`,
    );
  });

  it('interpolates the market cap the same way', async () => {
    mockPage({ items: [] }, []);
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(
      new ApiError('HTTP 422', 422, 'too_many_markets'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Beans to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText(
      `You can choose up to ${MAX_MARKETS_PER_CROP} markets for one crop.`,
    );
  });

  it('ships BOTH plural forms of the counter, so si/ta translators get the slots (NIT 1)', () => {
    // A single form carrying {{count}} silently becomes the only form a translator sees.
    expect(hasOwnTranslation('pages.portfolio.watchingCount_one', 'en')).toBe(true);
    expect(hasOwnTranslation('pages.portfolio.watchingCount_other', 'en')).toBe(true);
  });
});

describe('PortfolioPage — the server’s refusal keeps its own words', () => {
  it('maps a watchlist_full 422 to the cap sentence, not "something went wrong"', async () => {
    mockPage({ items: [] }, []);
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(
      new ApiError('HTTP 422', 422, 'watchlist_full'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Beans to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText('You can watch up to 10 crops. Remove one before adding another.');
    expect(screen.queryByText('Something went wrong. Please try again.')).toBeNull();
  });

  it('maps a too_many_markets 422 to the market-cap sentence', async () => {
    mockPage({ items: [] }, []);
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(
      new ApiError('HTTP 422', 422, 'too_many_markets'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Beans to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText('You can choose up to 3 markets for one crop.');
  });

  it('falls back to the generic sentence for a failure with no code (offline)', async () => {
    mockPage({ items: [] }, []);
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(new ApiError('network', 0));
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Beans to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText('Something went wrong. Please try again.');
  });
});

describe('PortfolioPage — accessible names', () => {
  it('the per-crop details link names its crop, so it is unambiguous in a list', async () => {
    mockPage({ items: [tomato(), tomato({ cropId: 'c2', cropName: 'Beans' })] }, twoWatchedIds());
    renderPage();
    expect(await screen.findByRole('link', { name: 'See details for Tomato' })).toHaveAttribute(
      'href',
      '/portfolio/crop/c1',
    );
    expect(screen.getByRole('link', { name: 'See details for Beans' })).toHaveAttribute(
      'href',
      '/portfolio/crop/c2',
    );
  });
});

function twoWatchedIds(): WatchlistItem[] {
  return [watched('c1', 'Tomato', ['m1']), watched('c2', 'Beans', ['m1'])];
}

describe('PortfolioPage — price swing is decoration, and honest about thin data', () => {
  it('shows a swing badge once the history is long enough', async () => {
    const flat: PriceHistoryPoint[] = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      minPrice: 200,
      maxPrice: 220,
    }));
    mockPage({ items: [tomato()] }, [watched('c1', 'Tomato', ['m1'])], flat);
    renderPage();
    await screen.findByText('Price movement: steady');
  });

  it('shows NO swing badge for a thin history (never a comforting "steady")', async () => {
    mockPage({ items: [tomato()] }, [watched('c1', 'Tomato', ['m1'])], [
      { date: '2026-07-25', minPrice: 200, maxPrice: 220 },
    ]);
    renderPage();
    await screen.findByRole('heading', { name: 'Tomato', level: 3 });
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalled());
    expect(screen.queryByText(/Price movement/)).toBeNull();
  });

  it('survives a failed history fetch with no error surface (fail-soft decoration)', async () => {
    mockPage({ items: [tomato()] }, [watched('c1', 'Tomato', ['m1'])]);
    vi.spyOn(api, 'getPriceHistory').mockRejectedValue(new Error('offline'));
    renderPage();

    await screen.findByRole('heading', { name: 'Tomato', level: 3 });
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
  });
});
