// Recording a sale — the section inside the "More details" popup.
//
// Most tests render SalesSection directly: what is under test is its own state machine (which
// editor is open, what has been written, where focus went), and the card around it would only
// add noise to the call counts. ONE test goes the whole way through WatchlistCard, because
// "the section is really mounted in the popup" and "Escape does not escape past the confirm"
// are facts about the two of them together.
//
// Dates are asserted through formatDate, never as hardcoded locale strings: under Node's ICU
// en-LK renders "Jul 20, 2026" where a phone renders "20 Jul 2026", and a test that pins one
// of them is testing the test runner.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import SalesSection from '../components/SalesSection';
import WatchlistCard from '../components/WatchlistCard';
import { api, ApiError } from '../api/client';
import { RecommendationLevel } from '../api/types';
import type {
  HarvestForecast,
  Market,
  PortfolioDashboardItem,
  PortfolioDashboardMarket,
  SaleItem,
  SalesPage,
} from '../api/types';
import { formatDate } from '../lib/format';

const TODAY = '2026-07-28';

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

const MARKETS: Market[] = [
  {
    id: 'm1',
    name: 'Dambulla Dedicated Economic Centre',
    shortCode: 'DEC',
    district: 'Matale',
    marketType: 1,
    isEconomicCenter: true,
    hasStoredData: true,
    lastStoredDate: '2026-07-25',
    isTrainingSource: true,
  },
  {
    id: 'm2',
    name: 'Kandy',
    shortCode: 'KAN',
    district: 'Kandy',
    marketType: 1,
    isEconomicCenter: false,
    hasStoredData: true,
    lastStoredDate: '2026-07-25',
    isTrainingSource: true,
  },
];

function tomato(over: Partial<PortfolioDashboardItem> = {}): PortfolioDashboardItem {
  return {
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000065',
    plantedDate: null,
    markets: [DAMBULLA],
    prediction: null,
    predictionUnavailableReason: 'no_snapshot',
    ...over,
  };
}

function sale(over: Partial<SaleItem> = {}): SaleItem {
  return {
    id: 's1',
    cropId: 'c1',
    cropName: 'Tomato',
    cropCode: 'VEG000065',
    marketId: 'm1',
    marketName: 'Dambulla Dedicated Economic Centre',
    marketShortCode: 'DEC',
    saleDate: '2026-07-20',
    pricePerKg: 215,
    quantityKg: 60,
    note: null,
    createdAtUtc: '2026-07-20T11:05:00Z',
    updatedAtUtc: '2026-07-20T11:05:00Z',
    ...over,
  };
}

function page(items: SaleItem[], total = items.length): SalesPage {
  return { items, page: 1, pageSize: 3, total };
}

function renderSection(item = tomato(), busy = false) {
  return render(
    <MemoryRouter>
      <SalesSection
        item={item}
        allMarkets={MARKETS}
        lang="en"
        todayYmd={TODAY}
        busy={busy}
        idPrefix="dlg"
      />
    </MemoryRouter>,
  );
}

/** Open the record form and fill it in. */
async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Record a sale of Tomato' }));
  return screen.getByRole('button', { name: 'Save this sale of Tomato' });
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(api, 'getSales').mockResolvedValue(page([]));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the sales section — what it shows', () => {
  it('asks for THIS crop’s sales only, and says what the book is for', async () => {
    renderSection();
    await waitFor(() => expect(api.getSales).toHaveBeenCalledWith(1, 3, 'c1'));
    expect(
      await screen.findByText('These are your own records. They do not change market prices or the forecast.'),
    ).toBeInTheDocument();
  });

  it('says plainly that nothing is recorded yet, and never invents a number', async () => {
    renderSection();
    expect(
      await screen.findByText('You have not recorded a sale for this crop yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Rs\./)).toBeNull();
  });

  it('prints a recorded sale exactly as it was written down', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(
      page([sale({ pricePerKg: 215.5, quantityKg: 60, note: 'same buyer as last time' })]),
    );
    renderSection();

    expect(
      await screen.findByText('Sold on ' + formatDate('2026-07-20', 'en')),
    ).toBeInTheDocument();
    // 215.50, NOT "Rs. 216": rounding the farmer's own figure misstates what they told us.
    expect(screen.getByText(/Rs\. 215\.50/)).toBeInTheDocument();
    expect(screen.getByText(/60 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Dambulla Dedicated Economic Centre/)).toBeInTheDocument();
    expect(screen.getByText('same buyer as last time')).toBeInTheDocument();
  });

  it('calls "no market" what it is — an answer, not missing data', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(
      page([sale({ marketId: null, marketName: null, marketShortCode: null, quantityKg: null })]),
    );
    renderSection();
    expect(await screen.findByText(/No market recorded/)).toBeInTheDocument();
    expect(screen.getByText(/Not recorded/)).toBeInTheDocument();
  });

  it('admits a failed load in words and offers the way to ask again', async () => {
    vi.spyOn(api, 'getSales').mockRejectedValue(new ApiError('network', 0));
    renderSection();
    expect(await screen.findByText('We could not load your sales.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('links to the whole book, with a name that says so', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()], 9));
    renderSection();
    const link = await screen.findByRole('link', { name: 'See all the sales you have recorded' });
    expect(link).toHaveAttribute('href', '/portfolio/sales');
    // The count claim is about THIS crop and is only made once the list has really loaded.
    expect(link).toHaveTextContent('See all sales (9 for this crop)');
  });
});

describe('recording a sale', () => {
  it('sends what the farmer typed, refreshes the list and says so', async () => {
    const getSales = vi
      .spyOn(api, 'getSales')
      .mockResolvedValueOnce(page([]))
      .mockResolvedValue(page([sale()]));
    const record = vi.spyOn(api, 'recordSale').mockResolvedValue(sale());
    renderSection();

    const save = await openForm();
    fireEvent.change(screen.getByLabelText('Day you sold'), { target: { value: '2026-07-20' } });
    fireEvent.change(screen.getByLabelText('Price you got (Rs. per kg)'), {
      target: { value: '215.50' },
    });
    fireEvent.change(screen.getByLabelText('How much you sold in kg (optional)'), {
      target: { value: '60' },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(record).toHaveBeenCalledWith({
        cropId: 'c1',
        marketId: 'm1', // the crop's own market, offered as the default
        saleDate: '2026-07-20',
        pricePerKg: 215.5,
        quantityKg: 60,
        note: null,
      }),
    );
    await screen.findByText('Sale saved.');
    expect(getSales).toHaveBeenCalledTimes(2); // the list is re-read, never patched locally
  });

  it('sends NO market when the farmer says they did not sell at one', async () => {
    const record = vi.spyOn(api, 'recordSale').mockResolvedValue(sale());
    renderSection();

    const save = await openForm();
    fireEvent.change(screen.getByLabelText('Where you sold (optional)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Price you got (Rs. per kg)'), {
      target: { value: '200' },
    });
    fireEvent.click(save);

    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ marketId: null })));
  });

  it('offers the crop’s own markets first and the rest under their own heading', async () => {
    renderSection();
    await openForm();
    const select = screen.getByLabelText('Where you sold (optional)') as HTMLSelectElement;
    const groups = within(select).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('label'))).toEqual([
      'Markets you watch',
      'Other markets',
    ]);
    // No market appears twice: Dambulla is watched, so it is not repeated below.
    expect(within(groups[1]).getByRole('option', { name: 'Kandy' })).toBeInTheDocument();
    expect(within(groups[1]).queryByRole('option', { name: /Dambulla/ })).toBeNull();
    // "No market" is a real, selectable answer, first in the list.
    expect(select.options[0].textContent).toBe('No market');
  });

  it('will not save until the answers are ones the server accepts', async () => {
    renderSection();
    const save = await openForm();
    const price = screen.getByLabelText('Price you got (Rs. per kg)');
    const date = screen.getByLabelText('Day you sold');

    // No price yet: nothing to save.
    expect(save).toBeDisabled();

    fireEvent.change(price, { target: { value: '0' } });
    expect(save).toBeDisabled();
    fireEvent.change(price, { target: { value: '100000.01' } });
    expect(save).toBeDisabled();
    fireEvent.change(price, { target: { value: '100000' } });
    expect(save).toBeEnabled();

    // A day that has not come yet is not a sale, and the field says why.
    fireEvent.change(date, { target: { value: '2026-07-29' } });
    expect(save).toBeDisabled();
    expect(
      screen.getByText('That day has not come yet. A sale is something that has already happened.'),
    ).toBeInTheDocument();
    fireEvent.change(date, { target: { value: TODAY } });
    expect(save).toBeEnabled();

    // A typed-but-unreadable quantity blocks the save rather than being dropped.
    fireEvent.change(screen.getByLabelText('How much you sold in kg (optional)'), {
      target: { value: 'a lot' },
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('How much you sold in kg (optional)'), {
      target: { value: '' },
    });
    expect(save).toBeEnabled();
  });

  it('refuses an over-long note by COUNT, never by truncating the paste', async () => {
    renderSection();
    const save = await openForm();
    const note = screen.getByLabelText('Anything to add? (optional)') as HTMLTextAreaElement;
    // A browser enforces maxLength by cutting a paste; the contract rejects instead.
    expect(note).not.toHaveAttribute('maxlength');

    fireEvent.change(screen.getByLabelText('Price you got (Rs. per kg)'), {
      target: { value: '200' },
    });
    // 506 raw / 500 trimmed is INSIDE the limit — the two must really disagree here.
    fireEvent.change(note, { target: { value: `   ${'x'.repeat(500)}   ` } });
    expect(note.value).toHaveLength(506);
    expect(save).toBeEnabled();

    fireEvent.change(note, { target: { value: 'x'.repeat(501) } });
    expect(save).toBeDisabled();
    expect(
      screen.getByText('That note is too long: 501 characters. Please shorten it to 500 or fewer.'),
    ).toBeInTheDocument();
  });

  it('keeps the farmer’s numbers on the screen when the server refuses them', async () => {
    vi.spyOn(api, 'recordSale').mockRejectedValue(new ApiError('HTTP 400', 400, 'sale_date_future'));
    renderSection();

    const save = await openForm();
    fireEvent.change(screen.getByLabelText('Price you got (Rs. per kg)'), {
      target: { value: '215' },
    });
    fireEvent.click(save);

    // The server's own refusal, in the farmer's words — not "something went wrong".
    await screen.findByText(
      'That day has not come yet. A sale is something that has already happened.',
    );
    expect((screen.getByLabelText('Price you got (Rs. per kg)') as HTMLInputElement).value).toBe(
      '215',
    );
  });

  it('sends focus back to the control that opened the form once the sale is saved', async () => {
    vi.spyOn(api, 'recordSale').mockResolvedValue(sale());
    renderSection();

    const save = await openForm();
    fireEvent.change(screen.getByLabelText('Price you got (Rs. per kg)'), {
      target: { value: '215' },
    });
    fireEvent.click(save);

    await screen.findByText('Sale saved.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record a sale of Tomato' })).toHaveFocus(),
    );
  });

  it('disables the invitation while another write is in flight on the page', async () => {
    renderSection(tomato(), true);
    expect(await screen.findByRole('button', { name: 'Record a sale of Tomato' })).toBeDisabled();
  });
});

describe('changing and removing a recorded sale', () => {
  it('opens the SAME form, filled in with what was stored, and PUTs the whole record', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale({ note: 'first buyer' })]));
    const update = vi.spyOn(api, 'updateSale').mockResolvedValue(sale());
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Change the sale of Tomato on ${formatDate('2026-07-20', 'en')}`,
      }),
    );

    expect((screen.getByLabelText('Day you sold') as HTMLInputElement).value).toBe('2026-07-20');
    expect((screen.getByLabelText('Price you got (Rs. per kg)') as HTMLInputElement).value).toBe(
      '215',
    );
    expect((screen.getByLabelText('Anything to add? (optional)') as HTMLTextAreaElement).value).toBe(
      'first buyer',
    );

    // Empty the quantity: on a full-replace route that CLEARS it, and the client says so by
    // leaving the key out.
    fireEvent.change(screen.getByLabelText('How much you sold in kg (optional)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes to this sale of Tomato' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('s1', {
        marketId: 'm1',
        saleDate: '2026-07-20',
        pricePerKg: 215,
        quantityKg: null,
        note: 'first buyer',
      }),
    );
    await screen.findByText('Sale updated.');
  });

  it('asks before removing, and removes nothing until the farmer answers', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    const del = vi.spyOn(api, 'deleteSale').mockResolvedValue(undefined);
    renderSection();

    const when = formatDate('2026-07-20', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    );

    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(`Remove the sale of Tomato on ${when}?`);
    // The confirm's two answers are worded for THIS question — they are never the
    // remove-crop or remove-date pair, which can be on screen at the same time.
    fireEvent.click(within(confirm).getByRole('button', { name: 'No, keep this sale' }));
    expect(del).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: `Remove the sale of Tomato on ${when}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove this sale' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('s1'));
    await screen.findByText('Sale removed.');
  });

  it('says what happened when the sale was already gone, in its own words', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    vi.spyOn(api, 'deleteSale').mockRejectedValue(new ApiError('HTTP 404', 404, 'sale_not_found'));
    renderSection();

    const when = formatDate('2026-07-20', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove this sale' }));
    await screen.findByText('That sale is no longer saved.');
  });

  it('closes a pending remove-question when the farmer starts editing instead', async () => {
    // A confirm merely HIDDEN by an editor comes back stale and asks to destroy something the
    // farmer has since moved on from.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderSection();

    const when = formatDate('2026-07-20', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // The Change button is inside the row; the confirm replaced the actions, so cancel first.
    fireEvent.click(screen.getByRole('button', { name: 'No, keep this sale' }));
    fireEvent.click(screen.getByRole('button', { name: `Change the sale of Tomato on ${when}` }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // ...and cancelling the editor does not resurrect it.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('the sales section — accessible names', () => {
  it('names every new control, and never leaves one called after a glyph', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderSection();
    const when = formatDate('2026-07-20', 'en');

    // The section is a named region; its heading names it.
    const region = screen.getByRole('region', { name: 'Sales you have recorded' });
    expect(region).toBeInTheDocument();

    // Row controls name the sale they act on — a book of twenty rows must not offer twenty
    // identical "Change" buttons.
    expect(
      await screen.findByRole('button', { name: `Change the sale of Tomato on ${when}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    ).toBeInTheDocument();

    // Every field in the form is reachable by its own label, and the save button names its
    // crop (two of these forms can be on screen at once).
    fireEvent.click(screen.getByRole('button', { name: 'Record a sale of Tomato' }));
    for (const label of [
      'Day you sold',
      'Price you got (Rs. per kg)',
      'How much you sold in kg (optional)',
      'Where you sold (optional)',
      'Anything to add? (optional)',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Save this sale of Tomato' })).toHaveAccessibleName(
      'Save this sale of Tomato',
    );

    // And nothing anywhere in the section is a nameless control.
    for (const button of within(region).getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('moves focus into the form when it opens, instead of dropping it on the body', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Record a sale of Tomato' }));
    await waitFor(() => expect(screen.getByLabelText('Day you sold')).toHaveFocus());
  });
});

describe('inside the "More details" popup', () => {
  function forecast(): HarvestForecast {
    return {
      cropId: 'c1',
      cropName: 'Tomato',
      plantDate: '2026-05-04',
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
    };
  }

  function renderCard() {
    return render(
      <MemoryRouter>
        <ul>
          <WatchlistCard
            item={tomato()}
            readiness={null}
            lang="en"
            todayYmd={TODAY}
            selected={false}
            onToggleSelect={vi.fn()}
            onSavePlantedDate={async () => null}
            onClearPlantedDate={async () => null}
            allMarkets={MARKETS}
            busy={false}
          />
        </ul>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
    vi.spyOn(api, 'getHarvestForecast').mockResolvedValue(forecast());
  });

  it('is where a sale is recorded — the card itself offers no such control', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([]));
    renderCard();

    // Nothing about sales on the card surface, and no request for them either.
    expect(screen.queryByRole('button', { name: 'Record a sale of Tomato' })).toBeNull();
    expect(api.getSales).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));
    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByRole('button', { name: 'Record a sale of Tomato' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.getSales).toHaveBeenCalledWith(1, 3, 'c1'));
  });

  it('does not let Escape inside the remove-question close the popup around it', async () => {
    // The write reports SILENTLY inside this section: if Escape bubbled to the dialog it would
    // take away the only surface that can tell the farmer what happened.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));

    const when = formatDate('2026-07-20', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    );
    const confirm = screen.getByRole('alertdialog');
    fireEvent.keyDown(confirm, { key: 'Escape' });

    // The question is dismissed; the popup is still open.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
