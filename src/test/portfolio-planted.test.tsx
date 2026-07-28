// Step 7 — the planting date the farmer records, the forecast that follows from it, and the
// "More details" popup the card opens into.
//
// These render WatchlistCard directly: what is under test is the card's own state machine
// (which date is recorded, what has been fetched, what is open) and PortfolioPage around it
// would only add noise to the call counts. The page's own wiring — that the save really
// goes through its write machinery — is covered in portfolio-page.test.tsx.
//
// Dates are asserted through formatDate/ymdLocal, never as hardcoded locale strings: under
// Node's ICU, en-LK renders "Jul 25, 2026" where a phone renders "25 Jul 2026", and a test
// that pins one of them is testing the test runner.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import WatchlistCard from '../components/WatchlistCard';
import { api } from '../api/client';
import { RecommendationLevel } from '../api/types';
import type {
  HarvestForecast,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  PriceHistoryPoint,
} from '../api/types';
import { formatDate, ymdLocal } from '../lib/format';
import type { WriteMessage } from '../components/PlantedDateSection';

const TODAY = '2026-07-28';
const PLANTED = '2026-05-04';

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

const BANDARAWELA: PortfolioDashboardMarket = {
  marketId: 'm2',
  name: 'Bandarawela',
  shortCode: 'BAN',
  isDefaultMarket: false,
  price: {
    price: 265,
    observedDate: '2026-07-26',
    direction: 'down',
    changePct: -2.2,
    previousPrice: 271,
    previousObservedDate: '2026-07-23',
  },
  priceUnavailableReason: null,
};

function history(): PriceHistoryPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    minPrice: 200 + i,
    maxPrice: 230 + i,
  }));
}

function tomato(over: Partial<PortfolioDashboardItem> = {}): PortfolioDashboardItem {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000065',
    plantedDate: null,
    markets: [DAMBULLA],
    // The nightly snapshot, deliberately DIFFERENT from the harvest-route numbers below, so
    // a test can tell which of the two a surface is showing.
    prediction: {
      predictedPrice: 999,
      lowerBound: 900,
      upperBound: 1100,
      confidence: 'High',
      activePredictor: 'residual',
      modelVersion: 'v17',
      snapshotDate: TODAY,
      harvestDate: '2026-10-30',
    },
    predictionUnavailableReason: null,
    ...over,
  };
}

function forecast(over: Partial<HarvestForecast> = {}): HarvestForecast {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    plantDate: PLANTED,
    harvestDate: '2026-08-12',
    growthPeriodDays: 100,
    currentPrice: 210,
    predictedPrice: 240,
    lowerBound: 190,
    upperBound: 300,
    confidence: 'High',
    activePredictor: 'residual',
    modelVersion: 'v17',
    explanation: 'Seasonal supply is tightening.',
    recommendationLevel: RecommendationLevel.Recommended,
    reason: 'above today',
    upsidePct: 14.3,
    intervalWidthPct: 45.8,
    lowTrust: false,
    ...over,
  };
}

type SaveFn = (cropId: string, plantedDate: string | null) => Promise<WriteMessage | null>;
const noopSave: SaveFn = async () => null;

function renderCard(
  item: PortfolioDashboardItem,
  onSavePlantedDate: SaveFn = noopSave,
  busy = false,
) {
  const utils = render(
    <MemoryRouter>
      <ul>
        <WatchlistCard
          item={item}
          readiness={null}
          lang="en"
          todayYmd={TODAY}
          selected={false}
          onToggleSelect={vi.fn()}
          onSavePlantedDate={onSavePlantedDate}
          busy={busy}
        />
      </ul>
    </MemoryRouter>,
  );
  return { ...utils, onSavePlantedDate };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(api, 'getPriceHistory').mockResolvedValue(history());
  vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(forecast());
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('The planting date — recording one', () => {
  it('invites the date, and asks for NO forecast until there is one', async () => {
    renderCard(tomato());

    expect(await screen.findByText('When did you plant this crop?')).toBeInTheDocument();
    const input = screen.getByLabelText('Planting date') as HTMLInputElement;
    expect(input.type).toBe('date');
    // A planting is something that HAS happened: the field will not offer tomorrow, and the
    // server's own floor is mirrored so the field refuses what the API would refuse.
    expect(input).toHaveAttribute('max', TODAY);
    expect(input).toHaveAttribute('min', '2000-01-01');
    // No date, no forecast — and no claim about one.
    expect(api.getHarvestForecast).not.toHaveBeenCalled();
    expect(screen.queryByText(/at harvest/)).toBeNull();
  });

  it('saves the date the farmer typed, and nothing else', async () => {
    const onSave = vi.fn<SaveFn>(async () => ({ tone: 'ok', key: 'pages.portfolio.plantedSavedOk' }));
    renderCard(tomato(), onSave);

    fireEvent.change(await screen.findByLabelText('Planting date'), {
      target: { value: PLANTED },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the planting date for Tomato' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('c1', PLANTED));
    await screen.findByText('Planting date saved.');
  });

  it('refuses a future date without a round trip, in the SAME words the server uses', async () => {
    const onSave = vi.fn<SaveFn>(async () => null);
    renderCard(tomato(), onSave);

    // jsdom does not enforce the input's own max, which is exactly why the guard exists.
    fireEvent.change(await screen.findByLabelText('Planting date'), {
      target: { value: '2027-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the planting date for Tomato' }));

    await screen.findByText('That planting date cannot be used. Please choose another.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the farmer’s date in the field when the server refuses it', async () => {
    const onSave = vi.fn<SaveFn>(async () => ({
      tone: 'error',
      key: 'pages.portfolio.errInvalidPlantedDate',
    }));
    renderCard(tomato(), onSave);

    const input = await screen.findByLabelText('Planting date');
    fireEvent.change(input, { target: { value: PLANTED } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the planting date for Tomato' }));

    await screen.findByText('That planting date cannot be used. Please choose another.');
    // Never discard the farmer's work on a refusal.
    expect((screen.getByLabelText('Planting date') as HTMLInputElement).value).toBe(PLANTED);
  });

  it('disables its controls while another write is in flight', async () => {
    renderCard(tomato(), noopSave, true);
    expect(await screen.findByLabelText('Planting date')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save the planting date for Tomato' })).toBeDisabled();
  });
});

describe('The planting date — the forecast it anchors', () => {
  it('asks the harvest route for THIS crop and THIS date, and shows the range honestly', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));

    await waitFor(() => expect(api.getHarvestForecast).toHaveBeenCalledWith('c1', PLANTED));
    expect(await screen.findByText('Planted on ' + formatDate(PLANTED, 'en'))).toBeInTheDocument();
    // The number is the harvest route's, NOT the nightly snapshot's (Rs. 999 in the fixture).
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
    expect(screen.queryByText(/Rs\. 999/)).toBeNull();
    // A band is a band, and it says when the crop is ready.
    expect(screen.getByText(/Likely price range: Rs\. 190 – 300/)).toBeInTheDocument();
    expect(
      screen.getByText('Harvest around ' + formatDate('2026-08-12', 'en')),
    ).toBeInTheDocument();
    expect(screen.getByText(/Confidence: Good/)).toBeInTheDocument();
  });

  it('links to the full forecast carrying the crop AND the planting date', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));
    expect(
      await screen.findByRole('link', { name: 'See the full forecast for Tomato' }),
    ).toHaveAttribute('href', `/my-harvest?crop=c1&date=${PLANTED}`);
  });

  it('de-rates a fallback-served forecast exactly as the rest of the app does', async () => {
    vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(
      forecast({ activePredictor: 'crop_mean_fallback', confidence: 'Low' }),
    );
    renderCard(tomato({ plantedDate: PLANTED }));

    expect(await screen.findByText('Rough estimate only')).toBeInTheDocument();
    expect(
      screen.getByText('This is a rough guide, not a promise — check other sources before you decide.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Confidence: Low/)).toBeInTheDocument();
  });

  it('de-rates on the route’s own lowTrust flag too, even at full model trust', async () => {
    // lowTrust is about the DATA behind an otherwise model-served number. A second caution
    // signal may always add the warning; nothing may take it away.
    vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(
      forecast({ activePredictor: 'residual', confidence: 'High', lowTrust: true }),
    );
    renderCard(tomato({ plantedDate: PLANTED }));

    expect(await screen.findByText('Rough estimate only')).toBeInTheDocument();
  });

  it('shows a skeleton WHILE the forecast is in flight, and resolves it on every path', async () => {
    let release: (f: HarvestForecast) => void = () => {};
    vi.spyOn(api, 'getHarvestForecast').mockReturnValue(
      new Promise<HarvestForecast>((res) => {
        release = res;
      }),
    );
    renderCard(tomato({ plantedDate: PLANTED }));

    // Asserted INSIDE the request window with a held-open promise: waitFor after the
    // resolution cannot see this state at all.
    await screen.findByText('Planted on ' + formatDate(PLANTED, 'en'));
    expect(document.querySelector('.pf-skel--pred')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/at harvest/)).toBeNull();

    release(forecast());
    await screen.findByText('About Rs. 240 at harvest');
    expect(document.querySelector('.pf-skel--pred')).toBeNull();
  });

  it('admits a failed forecast in words and offers the way back', async () => {
    const failing = vi
      .spyOn(api, 'getHarvestForecast')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(forecast());
    renderCard(tomato({ plantedDate: PLANTED }));

    await screen.findByText('We could not get the forecast for your planting date.');
    // Fail-soft: the market price above it is untouched and nothing shouts an error.
    expect(screen.getByText('Rs. 210')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('About Rs. 240 at harvest');
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('asks ONCE per (crop, date) — a re-render does not re-fetch', async () => {
    const { rerender } = renderCard(tomato({ plantedDate: PLANTED }));
    await screen.findByText('About Rs. 240 at harvest');
    rerender(
      <MemoryRouter>
        <ul>
          <WatchlistCard
            item={tomato({ plantedDate: PLANTED })}
            readiness={null}
            lang="en"
            todayYmd={TODAY}
            selected
            onToggleSelect={vi.fn()}
            onSavePlantedDate={noopSave}
            busy={false}
          />
        </ul>
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.getHarvestForecast).toHaveBeenCalledTimes(1));
  });

  it('never shows the OLD date’s number under a new date, not even for one frame', async () => {
    // The step-6 lesson: state derived from the key, not written on success. The second
    // request is held open, so this asserts the window a waitFor cannot see inside.
    let release: (f: HarvestForecast) => void = () => {};
    vi.spyOn(api, 'getHarvestForecast')
      .mockResolvedValueOnce(forecast())
      .mockReturnValueOnce(
        new Promise<HarvestForecast>((res) => {
          release = res;
        }),
      );
    const { rerender } = renderCard(tomato({ plantedDate: PLANTED }));
    await screen.findByText('About Rs. 240 at harvest');

    const newer = '2026-06-01';
    rerender(
      <MemoryRouter>
        <ul>
          <WatchlistCard
            item={tomato({ plantedDate: newer })}
            readiness={null}
            lang="en"
            todayYmd={TODAY}
            selected={false}
            onToggleSelect={vi.fn()}
            onSavePlantedDate={noopSave}
            busy={false}
          />
        </ul>
      </MemoryRouter>,
    );

    // The new date is on screen; the OLD date's price is not, and the region says it is busy.
    expect(screen.getByText('Planted on ' + formatDate(newer, 'en'))).toBeInTheDocument();
    expect(screen.queryByText('About Rs. 240 at harvest')).toBeNull();
    expect(document.querySelector('.pf-skel--pred')).toHaveAttribute('aria-busy', 'true');

    release(forecast({ plantDate: newer, predictedPrice: 275, harvestDate: '2026-09-09' }));
    await screen.findByText('About Rs. 275 at harvest');
  });
});

describe('The planting date — changing and removing it', () => {
  it('re-opens the field PREFILLED with the recorded date', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change the planting date for Tomato' }));
    expect((screen.getByLabelText('Planting date') as HTMLInputElement).value).toBe(PLANTED);
    // Cancel puts the recorded date back on screen, unchanged.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Planted on ' + formatDate(PLANTED, 'en'))).toBeInTheDocument();
  });

  it('removes the date with an explicit null and returns to the invitation', async () => {
    const onSave = vi.fn<SaveFn>(async () => ({
      tone: 'ok',
      key: 'pages.portfolio.plantedClearedOk',
    }));
    const item = tomato({ plantedDate: PLANTED });
    const { rerender } = renderCard(item, onSave);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove the planting date for Tomato' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('c1', null));

    // The page re-reads the dashboard after the write; the card then has no date again.
    rerender(
      <MemoryRouter>
        <ul>
          <WatchlistCard
            item={tomato({ plantedDate: null })}
            readiness={null}
            lang="en"
            todayYmd={TODAY}
            selected={false}
            onToggleSelect={vi.fn()}
            onSavePlantedDate={onSave}
            busy={false}
          />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByText('When did you plant this crop?')).toBeInTheDocument();
    expect(screen.queryByText(/at harvest/)).toBeNull();
  });

  it('defaults the empty field to today, so the common case is one tap', async () => {
    renderCard(tomato());
    expect((await screen.findByLabelText('Planting date')) as HTMLInputElement).toHaveValue(
      ymdLocal(new Date(`${TODAY}T00:00:00`)),
    );
  });
});

describe('"More details" — the popup', () => {
  it('is a real modal: named, focused, escapable, and it gives focus back', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));
    const opener = await screen.findByRole('button', { name: 'More details for Tomato' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Named by the crop's own heading, by reference — never a duplicated string.
    expect(dialog).toHaveAccessibleName('Tomato');
    // Focus is INSIDE the dialog, and the page behind it cannot be scrolled away.
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on the ✕ and on the backdrop, the two other ways out', async () => {
    renderCard(tomato());
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));
    fireEvent.click(document.querySelector('.pf-modal__backdrop') as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Tab inside itself — aria-modal is a promise the keyboard has to keep', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');
    const stops = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])'),
    );
    expect(stops.length).toBeGreaterThan(1);

    stops[stops.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(stops[0]);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });

  it('opens on the market the card was reading, not on markets[0]', async () => {
    renderCard(tomato({ markets: [DAMBULLA, BANDARAWELA] }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Bandarawela (BAN)' }));
    await screen.findByText('Rs. 265');
    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('BAN')).toBeInTheDocument();
    expect(within(dialog).getByText('Bandarawela')).toBeInTheDocument();
    expect(within(dialog).getByText('Rs. 265')).toBeInTheDocument();
    // Dambulla's number is not in the popup at all: one price, one market, one answer.
    expect(within(dialog).queryByText('Rs. 210')).toBeNull();
    expect(
      within(dialog).getByRole('link', { name: 'Open the full crop page for Tomato' }),
    ).toHaveAttribute('href', '/portfolio/crop/c1?market=m2');
  });

  it('shows the same forecast the card does, from the same single request', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));
    await screen.findByText('About Rs. 240 at harvest');
    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));

    expect(
      within(screen.getByRole('dialog')).getByText('About Rs. 240 at harvest'),
    ).toBeInTheDocument();
    // Opening the popup costs no round trip — neither the forecast nor the chart series.
    expect(api.getHarvestForecast).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.getPriceHistory).toHaveBeenCalledTimes(1));
  });

  it('carries the planting affordance when there is no date yet', async () => {
    renderCard(tomato());
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('When did you plant this crop?')).toBeInTheDocument();
    // Two copies of the section are on screen (the card is still behind the sheet), so each
    // input must have its OWN id — a shared one would leave both labels pointing at one
    // field and neither working.
    const inputs = screen.getAllByLabelText('Planting date') as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(new Set(inputs.map((i) => i.id)).size).toBe(2);
  });

  it('saves from inside the popup, where the farmer can actually see the answer', async () => {
    const onSave = vi.fn<SaveFn>(async () => ({ tone: 'ok', key: 'pages.portfolio.plantedSavedOk' }));
    renderCard(tomato(), onSave);
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Planting date'), {
      target: { value: PLANTED },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save the planting date for Tomato' }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('c1', PLANTED));
    // Reported INSIDE the dialog: the page's own status region is behind the backdrop.
    await within(dialog).findByText('Planting date saved.');
  });

  it('draws no chart for a market with no price, and says so once', async () => {
    renderCard(
      tomato({
        markets: [{ ...DAMBULLA, price: null, priceUnavailableReason: 'no_recent_price' }],
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('No price data for this market yet.')).toBeInTheDocument();
    expect(dialog.querySelector('.pf-card__chart')).toBeNull();
    expect(api.getPriceHistory).not.toHaveBeenCalled();
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
