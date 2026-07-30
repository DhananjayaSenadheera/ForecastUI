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
import type { PlantedDateClearRequest } from '../api/types';

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

type SaveFn = (cropId: string, plantedDate: string) => Promise<WriteMessage | null>;
type ClearFn = (cropId: string, clear: PlantedDateClearRequest) => Promise<WriteMessage | null>;
const noopSave: SaveFn = async () => null;
const noopClear: ClearFn = async () => null;

function renderCard(
  item: PortfolioDashboardItem,
  onSavePlantedDate: SaveFn = noopSave,
  busy = false,
  onClearPlantedDate: ClearFn = noopClear,
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
          onClearPlantedDate={onClearPlantedDate}
          busy={busy}
        />
      </ul>
    </MemoryRouter>,
  );
  return { ...utils, onSavePlantedDate, onClearPlantedDate };
}

/** Open the "More details" popup — the ONE place a planting date can be removed. */
async function openPopup() {
  fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
  return screen.getByRole('dialog');
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
    // On the card the sentence is what assistive tech hears — the visible "About / Rs. 240 /
    // at harvest" is that same sentence laid out for the eye — so it is asserted whole.
    expect(screen.getByText('About Rs. 240 at harvest')).toBeInTheDocument();
    expect(screen.queryByText(/Rs\. 999/)).toBeNull();
    // A band is a band (label over value in the card's split block), and it says when the
    // crop is ready.
    expect(screen.getByText('Likely price range')).toBeInTheDocument();
    expect(screen.getByText('Rs. 190 – 300')).toBeInTheDocument();
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
            onClearPlantedDate={noopClear}
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
            onClearPlantedDate={noopClear}
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

describe('The planting date — a harvest that has already been and gone', () => {
  // The route answers for ANY planting date, so an old one comes back with a confident
  // future-tense number about a harvest that is over. That is not a stale number, it is a
  // claim about the wrong thing.
  it('makes NO price claim once the harvest day has passed', async () => {
    vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(
      forecast({ plantDate: '2026-01-02', harvestDate: '2026-04-01' }),
    );
    renderCard(tomato({ plantedDate: '2026-01-02' }));

    // The CARD's sentence, which names only the ways out the card really has: there is no
    // Remove control on it any more, so pointing at one would send the farmer looking for a
    // button that is not there.
    await screen.findByText(
      `This planting was due for harvest around ${formatDate('2026-04-01', 'en')}. Change the date to plan your next planting, or open More details to remove it.`,
    );
    expect(screen.queryByText(/at harvest/)).toBeNull();
    expect(screen.queryByText(/Confidence:/)).toBeNull();
    expect(screen.queryByText(/Likely price range/)).toBeNull();
    // And no link onward to a screen that would make the same claim.
    expect(screen.queryByRole('link', { name: /See the full forecast/ })).toBeNull();
    // The ways out the card DOES have stay on screen.
    expect(
      screen.getByRole('button', { name: 'Change the planting date for Tomato' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More details for Tomato' })).toBeInTheDocument();
  });

  it('names Change AND Remove in the popup, where both controls really are', async () => {
    vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(
      forecast({ plantDate: '2026-01-02', harvestDate: '2026-04-01' }),
    );
    renderCard(tomato({ plantedDate: '2026-01-02' }));
    const dialog = await openPopup();

    expect(
      within(dialog).getByText(
        `This planting was due for harvest around ${formatDate('2026-04-01', 'en')}. Change or remove the date to plan your next planting.`,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Remove the planting date for Tomato' }),
    ).toBeInTheDocument();
  });

  it('still forecasts a harvest due TODAY — it is ahead of the farmer, not behind', async () => {
    vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(
      forecast({ plantDate: '2026-05-20', harvestDate: TODAY }),
    );
    renderCard(tomato({ plantedDate: '2026-05-20' }));

    await screen.findByText('About Rs. 240 at harvest');
    expect(screen.queryByText(/was due for harvest/)).toBeNull();
  });

  it('forecasts as normal when the harvest is still ahead', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));
    await screen.findByText('About Rs. 240 at harvest');
    expect(screen.queryByText(/was due for harvest/)).toBeNull();
  });

  it('says nothing about a past harvest when the route resolved no harvest date', async () => {
    // No growth period => no harvest day to be past. The forecast still stands.
    vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(
      forecast({ harvestDate: null, growthPeriodDays: null }),
    );
    renderCard(tomato({ plantedDate: PLANTED }));

    await screen.findByText('About Rs. 240 at harvest');
    expect(screen.queryByText(/was due for harvest/)).toBeNull();
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

  it('offers NO way to remove the date on the card itself', async () => {
    // 2026-07-30: removing a date is destructive AND needs a reason, so it lives in the
    // popup. Pinned by accessible NAME, not by class: what matters is that no control a
    // farmer (or a screen reader) can find on the card destroys their date.
    renderCard(tomato({ plantedDate: PLANTED }));
    const card = (await screen.findByRole('button', {
      name: 'Change the planting date for Tomato',
    })).closest('.pf-card__inner') as HTMLElement;

    expect(
      within(card).queryByRole('button', { name: 'Remove the planting date for Tomato' }),
    ).toBeNull();
    expect(within(card).queryByText('Remove date')).toBeNull();
    // ...and the card still shows the date and the way to change it.
    expect(within(card).getByText('Planted on ' + formatDate(PLANTED, 'en'))).toBeInTheDocument();
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

  it('keeps the popup on the STACKED forecast the crop page shows, not the card’s split', async () => {
    // PlantedDateSection takes the layout as a prop and defaults to 'lines'. Nothing else
    // pins that default, so flipping it would silently convert the popup — and the crop
    // page's own reading of the same block — to a card layout nobody asked for. The two
    // shapes are told apart by the band: label-and-value on one line here, stacked on the
    // card.
    renderCard(tomato({ plantedDate: PLANTED }));
    await screen.findByText('About Rs. 240 at harvest');
    fireEvent.click(screen.getByRole('button', { name: 'More details for Tomato' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Likely price range: Rs\. 190 – 300/)).toBeInTheDocument();
    expect(dialog.querySelector('.pf-pred--split')).toBeNull();
    // ...and the card behind it is still the split one.
    expect(document.querySelector('.pf-card__inner .pf-pred--split')).not.toBeNull();
  });

  it('says the forecast number ONCE to a screen reader, whatever the card shows', async () => {
    // The split block prints "About", the number and "at harvest" as three visible
    // fragments and carries the whole sentence in an sr-only span. Dropping aria-hidden
    // from the fragments would make a screen reader read the forecast twice, in two
    // different word orders.
    renderCard(tomato({ plantedDate: PLANTED }));
    const sentence = await screen.findByText('About Rs. 240 at harvest');
    expect(sentence).toHaveClass('sr-only');

    const card = document.querySelector('.pf-card__inner') as HTMLElement;
    expect(card.querySelector('.pf-pred__big')).toHaveAttribute('aria-hidden', 'true');
    expect(card.querySelectorAll('.pf-pred__cap')).toHaveLength(2);
    card.querySelectorAll('.pf-pred__cap').forEach((cap) => {
      expect(cap).toHaveAttribute('aria-hidden', 'true');
    });
    // The number appears once as a fragment and once inside the hidden sentence, and only
    // the sentence is announced.
    expect(card.querySelector('.pf-pred__big')).toHaveTextContent('Rs. 240');
  });

  it('names the confidence ⓘ for its crop — ten cards, ten distinguishable buttons', async () => {
    renderCard(tomato({ plantedDate: PLANTED }));
    await screen.findByText('About Rs. 240 at harvest');

    const hint = screen.getByRole('button', { name: 'What does confidence mean for Tomato?' });
    expect(screen.queryByRole('button', { name: 'What is this?' })).toBeNull();
    // The word it explains is on screen with the hint closed; the ⓘ only adds to it.
    expect(screen.getByText(/Confidence: Good/)).toBeInTheDocument();

    fireEvent.click(hint);
    // The copy covers every confidence word the wire can send (Good / Fair / Low), not just
    // the one this crop happens to have.
    const note = screen.getAllByText(/How far this forecast can be trusted/)[0];
    for (const word of ['Good', 'Fair', 'Low']) {
      expect(note.textContent).toContain(word);
    }
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

describe('Removing the planting date — the confirm inside the popup', () => {
  const REASONS = ['Harvested', 'Crop failed or removed', 'Entered by mistake', 'Other'];

  /** Open the popup and press "Remove date" — the state every test below starts from. */
  async function openConfirm(onClear: ClearFn = noopClear) {
    renderCard(tomato({ plantedDate: PLANTED }), noopSave, false, onClear);
    const dialog = await openPopup();
    const remove = within(dialog).getByRole('button', {
      name: 'Remove the planting date for Tomato',
    });
    fireEvent.click(remove);
    return { dialog, remove };
  }

  it('asks before it removes: a question, the four reasons, and a disabled Yes', async () => {
    const { dialog } = await openConfirm();
    const confirm = within(dialog).getByRole('alertdialog');

    // Named BY the question, so a screen reader hears what is being asked as focus arrives.
    expect(confirm).toHaveAccessibleName('Remove the planting date for Tomato?');
    expect(confirm).toHaveAccessibleDescription(
      'This removes the date and the forecast that goes with it. You can add a new planting date at any time.',
    );
    // Real radios in a named group — arrow keys and one-tap rows, not a custom widget.
    const radios = within(confirm).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
      'harvested',
      'cropFailed',
      'enteredByMistake',
      'other',
    ]);
    REASONS.forEach((label) => {
      expect(within(confirm).getByRole('radio', { name: label })).toBeInTheDocument();
    });
    // NOTHING is preselected: a preselected reason would be recorded as a fact the farmer
    // never stated.
    radios.forEach((r) => expect(r).not.toBeChecked());
    // ...so the destructive answer cannot be given yet, and the legend says why in words.
    expect(within(confirm).getByRole('button', { name: 'Yes, remove the date' })).toBeDisabled();
    expect(within(confirm).getByText('Why are you removing it? Please choose one.')).toBeInTheDocument();
    // The note is optional in its own label, not in fine print somewhere else.
    expect(within(confirm).getByLabelText('Anything to add? (optional)')).toBeInTheDocument();
    // Focus went to the first radio — the next thing to do — not to a button that cannot
    // be pressed.
    expect(document.activeElement).toBe(radios[0]);
    // The removal has NOT happened by opening the question.
    expect(within(dialog).getByText('Planted on ' + formatDate(PLANTED, 'en'))).toBeInTheDocument();
  });

  it('the radio group carries a surface-scoped name, so the card behind cannot share it', async () => {
    const { dialog } = await openConfirm();
    const names = new Set(
      within(dialog)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).name),
    );
    expect(names).toEqual(new Set(['dlg-clear-reason-c1']));
  });

  it('sends the reason the farmer picked, and no note when they wrote none', async () => {
    const onClear = vi.fn<ClearFn>(async () => ({
      tone: 'ok',
      key: 'pages.portfolio.plantedClearedOk',
    }));
    const { dialog } = await openConfirm(onClear);

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Harvested' }));
    const yes = within(dialog).getByRole('button', { name: 'Yes, remove the date' });
    expect(yes).toBeEnabled();
    fireEvent.click(yes);

    await waitFor(() => expect(onClear).toHaveBeenCalledWith('c1', { reason: 'harvested' }));
    // The reason travels as the frozen wire string, never as the label the farmer read.
    expect(onClear.mock.calls[0][1]).not.toHaveProperty('note');
    // Reported INSIDE the popup, where the farmer is looking.
    await within(dialog).findByText('Planting date removed.');
    // The question is answered and gone; nothing is left half-asked.
    expect(within(dialog).queryByRole('alertdialog')).toBeNull();
    // Focus is somewhere deliberate — never dropped on <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('carries the farmer’s note when there is one, trimmed', async () => {
    const onClear = vi.fn<ClearFn>(async () => null);
    const { dialog } = await openConfirm(onClear);

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Crop failed or removed' }));
    fireEvent.change(within(dialog).getByLabelText('Anything to add? (optional)'), {
      target: { value: '  wild boar  ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove the date' }));

    await waitFor(() =>
      expect(onClear).toHaveBeenCalledWith('c1', { reason: 'cropFailed', note: 'wild boar' }),
    );
  });

  it('treats a whitespace-only note as no note at all', async () => {
    const onClear = vi.fn<ClearFn>(async () => null);
    const { dialog } = await openConfirm(onClear);

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Other' }));
    fireEvent.change(within(dialog).getByLabelText('Anything to add? (optional)'), {
      target: { value: '    ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove the date' }));

    await waitFor(() => expect(onClear).toHaveBeenCalledWith('c1', { reason: 'other' }));
    expect(onClear.mock.calls[0][1]).not.toHaveProperty('note');
  });

  it('refuses a note over 300 characters HERE, counted the way the server counts it', async () => {
    // The server rejects and never truncates, so the UI must not post something it knows
    // will bounce — and must say so in the farmer's own count. jsdom enforces neither
    // maxLength nor paste limits, which is exactly the case this guards.
    const onClear = vi.fn<ClearFn>(async () => null);
    const { dialog } = await openConfirm(onClear);
    const note = within(dialog).getByLabelText('Anything to add? (optional)');

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Other' }));
    fireEvent.change(note, { target: { value: `  ${'x'.repeat(301)}  ` } });

    // Counted on the TRIMMED value: 301, not 305.
    expect(
      within(dialog).getByText('That note is too long: 301 characters. Please shorten it to 300 or fewer.'),
    ).toBeInTheDocument();
    expect(note).toHaveAttribute('aria-invalid', 'true');
    expect(note).toHaveAttribute('maxlength', '300');
    const yes = within(dialog).getByRole('button', { name: 'Yes, remove the date' });
    expect(yes).toBeDisabled();
    fireEvent.click(yes);
    expect(onClear).not.toHaveBeenCalled();

    // Exactly 300 is allowed — the limit is inclusive, and shortening clears the refusal.
    fireEvent.change(note, { target: { value: 'x'.repeat(300) } });
    expect(within(dialog).queryByText(/That note is too long/)).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Yes, remove the date' })).toBeEnabled();
  });

  it('Cancel restores the section, forgets the answer, and gives focus back', async () => {
    const onClear = vi.fn<ClearFn>(async () => null);
    const { dialog } = await openConfirm(onClear);

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Harvested' }));
    fireEvent.change(within(dialog).getByLabelText('Anything to add? (optional)'), {
      target: { value: 'typed then thought better of it' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'No, keep the date' }));

    expect(within(dialog).queryByRole('alertdialog')).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
    // The date is untouched and the control that opened the question has focus again.
    expect(within(dialog).getByText('Planted on ' + formatDate(PLANTED, 'en'))).toBeInTheDocument();
    const remove = within(dialog).getByRole('button', {
      name: 'Remove the planting date for Tomato',
    });
    expect(document.activeElement).toBe(remove);

    // Re-opening asks again from scratch: no remembered reason, no remembered note.
    fireEvent.click(remove);
    within(dialog)
      .getAllByRole('radio')
      .forEach((r) => expect(r).not.toBeChecked());
    expect(within(dialog).getByLabelText('Anything to add? (optional)')).toHaveValue('');
  });

  it('Escape cancels the confirm WITHOUT closing the popup around it', async () => {
    const onClear = vi.fn<ClearFn>(async () => null);
    const { dialog } = await openConfirm(onClear);
    const confirm = within(dialog).getByRole('alertdialog');

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Entered by mistake' }));
    fireEvent.keyDown(confirm, { key: 'Escape' });

    // Same path as Cancel...
    expect(within(dialog).queryByRole('alertdialog')).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Remove the planting date for Tomato' }),
    );
    // ...and the popup the farmer is working in is STILL open: one Escape, one thing
    // dismissed.
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // A second Escape, with no confirm open, closes the popup as it always did.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the question and the answer on screen when the write is refused', async () => {
    const onClear = vi.fn<ClearFn>(async () => ({
      tone: 'error',
      key: 'pages.portfolio.errClearReasonRequired',
    }));
    const { dialog } = await openConfirm(onClear);

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Harvested' }));
    fireEvent.change(within(dialog).getByLabelText('Anything to add? (optional)'), {
      target: { value: 'sold at the fair' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove the date' }));

    await within(dialog).findByText(
      'Removing a planting date needs a reason. Please choose one and try again.',
    );
    // Trying again is one tap, not a re-typed note, and focus is on the button that failed.
    expect(within(dialog).getByRole('alertdialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Harvested' })).toBeChecked();
    expect(within(dialog).getByLabelText('Anything to add? (optional)')).toHaveValue(
      'sold at the fair',
    );
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Yes, remove the date' }),
    );
  });

  it('disables the whole question while the removal is in flight', async () => {
    // A HELD-OPEN write, so this asserts the window a waitFor after the fact cannot see:
    // nothing in the confirm may be pressed twice, and Cancel must not race the request.
    let release: (m: WriteMessage | null) => void = () => {};
    const held: ClearFn = () =>
      new Promise((res) => {
        release = res;
      });
    const { dialog } = await openConfirm(held);

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Harvested' }));
    const yes = within(dialog).getByRole('button', { name: 'Yes, remove the date' });
    fireEvent.click(yes);

    await waitFor(() => expect(yes).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'No, keep the date' })).toBeDisabled();
    within(dialog)
      .getAllByRole('radio')
      .forEach((r) => expect(r).toBeDisabled());
    expect(within(dialog).getByLabelText('Anything to add? (optional)')).toBeDisabled();

    release({ tone: 'ok', key: 'pages.portfolio.plantedClearedOk' });
    await within(dialog).findByText('Planting date removed.');
  });

  it('offers no Remove control at all while a write is in flight elsewhere', async () => {
    renderCard(tomato({ plantedDate: PLANTED }), noopSave, true, noopClear);
    const dialog = await openPopup();
    expect(
      within(dialog).getByRole('button', { name: 'Remove the planting date for Tomato' }),
    ).toBeDisabled();
  });

  it('adds no tooltip: a confirm explains itself in the question, not behind an ⓘ', async () => {
    const { dialog } = await openConfirm();
    const confirm = within(dialog).getByRole('alertdialog');
    expect(confirm.querySelector('[data-tip]')).toBeNull();
    expect(within(confirm).queryByRole('button', { name: /What/ })).toBeNull();
  });
});
