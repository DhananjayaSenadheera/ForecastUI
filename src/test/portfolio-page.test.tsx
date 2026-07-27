import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import PortfolioPage from '../pages/PortfolioPage';
import { api } from '../api/client';
import type {
  CropReadiness,
  PortfolioDashboard,
  PortfolioDashboardItem,
  PriceHistoryPoint,
} from '../api/types';

const DAMBULLA = {
  marketId: 'm1',
  name: 'Dambulla Dedicated Economic Centre',
  isEconomicCenter: true,
  isDefault: false,
};
const KANDY = { marketId: 'm3', name: 'Kandy', isEconomicCenter: false, isDefault: false };

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
      direction: 'up',
      changePct: 4.2,
      previousPrice: 201,
      previousObservedDate: '2026-07-21',
    },
    priceUnavailableReason: null,
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

// modelActive:false => a NULL readiness map => no badges anywhere. Readiness is
// decoration on this screen, so the tests deliberately make no readiness claim.
const NO_READINESS: CropReadiness = {
  modelActive: false,
  modelVersion: null,
  minHistoryObs: 0,
  crops: [],
};

function mockDashboard(dashboard: PortfolioDashboard, history: PriceHistoryPoint[] = []) {
  vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue(dashboard);
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

describe('PortfolioPage — the four async states', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a skeleton (and no numbers) while the dashboard loads', async () => {
    let release: (d: PortfolioDashboard) => void = () => {};
    vi.spyOn(api, 'getPortfolioDashboard').mockReturnValue(
      new Promise<PortfolioDashboard>((res) => {
        release = res;
      }),
    );
    vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
    vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
    renderPage();

    expect(document.querySelector('.pf-skeleton')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/Rs\./)).toBeNull();

    release({ homeMarket: DAMBULLA, items: [] });
    await waitFor(() => expect(document.querySelector('.pf-skeleton')).toBeNull());
  });

  it('renders a watched crop: price, observed date, trend and prediction band', async () => {
    mockDashboard({ homeMarket: DAMBULLA, items: [tomato()] });
    renderPage();

    await screen.findByText('Tomato');
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
      .mockResolvedValueOnce({ homeMarket: DAMBULLA, items: [tomato()] });
    vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
    vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load');
    screen.getByRole('button', { name: 'Retry' }).click();
    await screen.findByText('Tomato');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('PortfolioPage — the two distinct empty states (PRD §5.2)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('an empty watchlist invites the farmer to add crops', async () => {
    mockDashboard({ homeMarket: DAMBULLA, items: [] });
    renderPage();

    await screen.findByText('You have not added any crops yet');
    expect(screen.getByRole('link', { name: 'Add crops' })).toHaveAttribute(
      'href',
      '/portfolio/settings',
    );
    expect(screen.queryByText('No prices for your crops yet. We will show them as soon as the markets report.')).toBeNull();
  });

  it('a watchlist with no data admits it, still lists the crops, and invents no number', async () => {
    mockDashboard({
      homeMarket: DAMBULLA,
      items: [
        tomato({ price: null, priceUnavailableReason: 'no_recent_price', prediction: null, predictionUnavailableReason: 'no_snapshot' }),
      ],
    });
    renderPage();

    await screen.findByText(/No prices for your crops yet/);
    expect(screen.getByText('Tomato')).toBeInTheDocument();
    expect(screen.getByText('No price for this crop yet.')).toBeInTheDocument();
    expect(screen.getByText('No forecast for this crop yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Rs\./)).toBeNull();
    // It is NOT the "add crops" invitation — the farmer did add crops.
    expect(screen.queryByText('You have not added any crops yet')).toBeNull();
  });
});

describe('PortfolioPage — honest labelling', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the market a fallback-served price really came from', async () => {
    mockDashboard({
      homeMarket: KANDY,
      items: [
        tomato({
          price: {
            ...tomato().price!,
            marketId: 'm1',
            marketName: 'Dambulla Dedicated Economic Centre',
            isFallbackMarket: true,
          },
        }),
      ],
    });
    renderPage();

    await screen.findByText(
      /Your market had no price for this crop, so this is from Dambulla Dedicated Economic Centre\./,
    );
  });

  it('a null direction reads "no earlier price to compare", NOT "steady", and keeps the price', async () => {
    mockDashboard({
      homeMarket: DAMBULLA,
      items: [
        tomato({
          price: {
            ...tomato().price!,
            direction: null,
            changePct: null,
            previousPrice: null,
            previousObservedDate: null,
          },
        }),
      ],
    });
    renderPage();

    await screen.findByText('No earlier price to compare with.');
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
    expect(screen.queryByText(/Same/)).toBeNull();
  });

  it('labels the prediction "National forecast" under a non-economic-centre market', async () => {
    mockDashboard({ homeMarket: KANDY, items: [tomato()] });
    renderPage();
    await screen.findByText('National forecast');
  });

  it('omits the national label at the economic centre (the anchor itself)', async () => {
    mockDashboard({ homeMarket: DAMBULLA, items: [tomato()] });
    renderPage();
    await screen.findByText('Tomato');
    expect(screen.queryByText('National forecast')).toBeNull();
  });

  it('de-rates a fallback-served prediction visibly instead of hiding it', async () => {
    mockDashboard({
      homeMarket: DAMBULLA,
      items: [
        tomato({
          prediction: {
            ...tomato().prediction!,
            confidence: 'Low',
            activePredictor: 'crop_mean_fallback',
          },
        }),
      ],
    });
    renderPage();

    await screen.findByText(/Rough estimate only/);
    // The number is still there — de-rated, not withheld.
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
    expect(screen.getByText(/\(Confidence: Low\)/)).toBeInTheDocument();
  });

  it('says how old a stale price is, and still shows the price', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27)); // 27 Jul 2026, local
    try {
      mockDashboard({
        homeMarket: DAMBULLA,
        items: [tomato({ price: { ...tomato().price!, observedDate: '2026-05-27' } })],
      });
      renderPage();
      await vi.waitFor(() => expect(screen.getByText('Rs. 210')).toBeInTheDocument());
      expect(screen.getByText('61 days old')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says when the shown market is only the default standing in', async () => {
    mockDashboard({ homeMarket: { ...DAMBULLA, isDefault: true }, items: [tomato()] });
    renderPage();
    await screen.findByText(
      'You have not chosen a market yet, so we show the main economic centre.',
    );
  });
});

describe('PortfolioPage — accessible names', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the home-market control names the market it would change', async () => {
    mockDashboard({ homeMarket: KANDY, items: [tomato()] });
    renderPage();
    const link = await screen.findByRole('link', {
      name: 'Change your market. Now showing Kandy.',
    });
    expect(link).toHaveAttribute('href', '/portfolio/settings');
  });

  it('the per-crop details link names its crop, so it is unambiguous in a list', async () => {
    mockDashboard({
      homeMarket: DAMBULLA,
      items: [tomato(), tomato({ cropId: 'c2', cropName: 'Beans' })],
    });
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

describe('PortfolioPage — price swing is decoration, and honest about thin data', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a swing badge once the history is long enough', async () => {
    const flat: PriceHistoryPoint[] = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      minPrice: 200,
      maxPrice: 220,
    }));
    mockDashboard({ homeMarket: DAMBULLA, items: [tomato()] }, flat);
    renderPage();
    await screen.findByText('Price movement: steady');
  });

  it('shows NO swing badge for a thin history (never a comforting "steady")', async () => {
    mockDashboard({ homeMarket: DAMBULLA, items: [tomato()] }, [
      { date: '2026-07-25', minPrice: 200, maxPrice: 220 },
    ]);
    renderPage();
    await screen.findByText('Tomato');
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalled());
    expect(screen.queryByText(/Price movement/)).toBeNull();
  });

  it('survives a failed history fetch with no error surface (fail-soft decoration)', async () => {
    vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue({
      homeMarket: DAMBULLA,
      items: [tomato()],
    });
    vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
    vi.spyOn(api, 'getPriceHistory').mockRejectedValue(new Error('offline'));
    renderPage();

    await screen.findByText('Tomato');
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
  });

  it('measures the market that served the price, not the home market', async () => {
    mockDashboard({
      homeMarket: KANDY,
      items: [tomato({ price: { ...tomato().price!, marketId: 'm1', isFallbackMarket: true } })],
    });
    renderPage();
    await screen.findByText('Tomato');
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledWith('c1', 'm1'));
  });
});
