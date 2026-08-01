// Recording a sale — the section inside the "More details" popup, now a table with row editing.
//
// Most tests render SalesSection directly: what is under test is its own state machine (which
// row is being edited, what has been written, where focus went), and the card around it would
// only add noise to the call counts. ONE group goes the whole way through WatchlistCard,
// because "the section is really mounted in the popup" and "Escape does not escape past the
// row or the confirm" are facts about the two of them together.
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

/** Press "+" — which inserts an empty editable row at the top of the table — and hand back
 *  that row's Save. */
async function openInsertRow() {
  fireEvent.click(await screen.findByRole('button', { name: 'Record a sale of Tomato' }));
  return screen.getByRole('button', { name: 'Save this sale of Tomato' });
}

/** The <tr>s of the sales table, header row first. */
function rows() {
  return within(screen.getByRole('table')).getAllByRole('row');
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
    // No empty table under the sentence: a header row with nothing beneath it is a promise of
    // rows that do not exist.
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('prints a recorded sale exactly as it was written down, one fact per column', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(
      page([sale({ pricePerKg: 215.5, quantityKg: 60, note: 'same buyer as last time' })]),
    );
    renderSection();

    const table = await screen.findByRole('table');
    // The table names itself; the popup can hold more than one region of numbers.
    expect(within(table).getByText('Your recorded sales, newest first')).toBeInTheDocument();

    const cells = within(rows()[1]).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent(formatDate('2026-07-20', 'en'));
    // 215.50, NOT "Rs. 216": rounding the farmer's own figure misstates what they told us.
    expect(cells[1]).toHaveTextContent('Rs. 215.50');
    expect(cells[2]).toHaveTextContent('60 kg');
    expect(cells[3]).toHaveTextContent('Dambulla Dedicated Economic Centre');
    expect(cells[4]).toHaveTextContent('same buyer as last time');
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
    const link = await screen.findByRole('link', { name: /See all sales/ });
    expect(link).toHaveAttribute('href', '/portfolio/sales');
    // The count claim is about THIS crop and is only made once the list has really loaded.
    expect(link).toHaveTextContent('See all sales (9 for this crop)');
  });

  it('is set apart from the rest of the popup: a separator, then its own surface', async () => {
    // The owner's two asks, and they are structural rather than decorative — this is the only
    // part of the sheet the farmer WRITES in, and it says so before a word is read.
    const { container } = renderSection();
    await screen.findByText('You have not recorded a sale for this crop yet.');

    const section = screen.getByRole('region', { name: 'Sales you have recorded' });
    expect(section).toHaveClass('pf-sales'); // the class that carries the tinted surface
    const sep = container.querySelector('hr.pf-sales__sep');
    expect(sep).not.toBeNull();
    // The divider comes BEFORE the heading it separates, not after it.
    expect(sep?.compareDocumentPosition(screen.getByRole('heading', { name: 'Sales you have recorded' })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe('the sales table — the shape a phone can read', () => {
  it('is a real table: column headers with scope, and every cell labelled for stacking', async () => {
    // Under 600px the CSS turns each row into a labelled card using data-label. That is the
    // ONLY thing standing between a 360px phone and a six-column horizontal scroll, and it is
    // markup, so it is testable here even though the media query is not.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale({ note: 'a note' })]));
    renderSection();

    const table = await screen.findByRole('table');
    expect(table).toHaveClass('pf-table'); // the class the <600px stacking rules hang off
    const heads = within(table).getAllByRole('columnheader');
    expect(heads.map((h) => h.textContent)).toEqual([
      'Day sold',
      'Price (Rs./kg)',
      'Amount (kg)',
      'Market',
      'Note',
      'Actions',
    ]);
    for (const h of heads) expect(h).toHaveAttribute('scope', 'col');

    // Each data cell carries its own column's heading, so a stacked cell still says what it is.
    const cells = within(rows()[1]).getAllByRole('cell');
    expect(cells.map((c) => c.getAttribute('data-label'))).toEqual(
      heads.map((h) => h.textContent),
    );
  });

  it('gives the editing row the same labels — the cells are still their columns', async () => {
    renderSection();
    await openInsertRow();
    const editRow = rows()[1];
    expect(within(editRow).getAllByRole('cell').map((c) => c.getAttribute('data-label'))).toEqual([
      'Day sold',
      'Price (Rs./kg)',
      'Amount (kg)',
      'Market',
      'Note',
      'Actions',
    ]);
    // Every input is named by its own column heading — the visible heading IS its label.
    for (const label of ['Day sold', 'Price (Rs./kg)', 'Amount (kg)', 'Market', 'Note']) {
      expect(within(editRow).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('spans the whole table for anything a cell cannot hold, and prints no empty label', async () => {
    renderSection();
    await openInsertRow();
    const msgRow = rows()[2];
    const wide = within(msgRow).getAllByRole('cell');
    expect(wide).toHaveLength(1);
    expect(wide[0]).toHaveAttribute('colspan', '6');
    // An empty data-label would print a blank heading above the sentence once stacked.
    expect(wide[0]).toHaveAttribute('data-label', '');
  });
});

describe('recording a sale — the "+" row', () => {
  it('inserts an EMPTY row at the TOP of the table and puts the cursor in it', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Record a sale of Tomato' }));

    // Row 0 is the header; the new row is the FIRST body row, above the sale already recorded.
    const first = rows()[1];
    const date = within(first).getByLabelText('Day sold') as HTMLInputElement;
    expect((within(first).getByLabelText('Price (Rs./kg)') as HTMLInputElement).value).toBe('');
    expect((within(first).getByLabelText('Amount (kg)') as HTMLInputElement).value).toBe('');
    // The one thing assumed: a farmer recording a sale has usually just made it.
    expect(date.value).toBe(TODAY);
    // The "+" they pressed is still on screen but no longer the place to be.
    await waitFor(() => expect(date).toHaveFocus());
    // ...and the recorded row is still there, below.
    expect(within(rows()[3]).getByText(formatDate('2026-07-20', 'en'))).toBeInTheDocument();
  });

  it('sends what the farmer typed, refreshes the list and says so', async () => {
    const getSales = vi
      .spyOn(api, 'getSales')
      .mockResolvedValueOnce(page([]))
      .mockResolvedValue(page([sale()]));
    const record = vi.spyOn(api, 'recordSale').mockResolvedValue(sale());
    renderSection();

    const save = await openInsertRow();
    fireEvent.change(screen.getByLabelText('Day sold'), { target: { value: '2026-07-20' } });
    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), { target: { value: '215.50' } });
    fireEvent.change(screen.getByLabelText('Amount (kg)'), { target: { value: '60' } });
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
    // The row closes once it has really landed.
    expect(screen.queryByLabelText('Price (Rs./kg)')).toBeNull();
  });

  it('sends NO market when the farmer says they did not sell at one', async () => {
    const record = vi.spyOn(api, 'recordSale').mockResolvedValue(sale());
    renderSection();

    const save = await openInsertRow();
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), { target: { value: '200' } });
    fireEvent.click(save);

    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ marketId: null })));
  });

  it('offers the crop’s own markets first and the rest under their own heading', async () => {
    renderSection();
    await openInsertRow();
    const select = screen.getByLabelText('Market') as HTMLSelectElement;
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

  it('cancels the insert without a request, and gives the "+" its focus back', async () => {
    const record = vi.spyOn(api, 'recordSale');
    renderSection();
    await openInsertRow();
    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), { target: { value: '215' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(record).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Price (Rs./kg)')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record a sale of Tomato' })).toHaveFocus(),
    );
  });

  it('will not save until the answers are ones the server accepts', async () => {
    // The gate is the named rule canSubmitSale, read by BOTH this button's `disabled` and its
    // handler — the attribute is a courtesy, the rule is the guarantee.
    renderSection();
    const save = await openInsertRow();
    const price = screen.getByLabelText('Price (Rs./kg)');
    const date = screen.getByLabelText('Day sold');

    // No price yet: nothing to save.
    expect(save).toBeDisabled();

    fireEvent.change(price, { target: { value: '0' } });
    expect(save).toBeDisabled();
    fireEvent.change(price, { target: { value: '100000.01' } });
    expect(save).toBeDisabled();
    fireEvent.change(price, { target: { value: '100000' } });
    expect(save).toBeEnabled();

    // A day that has not come yet is not a sale, and the row says why.
    fireEvent.change(date, { target: { value: '2026-07-29' } });
    expect(save).toBeDisabled();
    expect(
      screen.getByText('That day has not come yet. A sale is something that has already happened.'),
    ).toBeInTheDocument();
    fireEvent.change(date, { target: { value: TODAY } });
    expect(save).toBeEnabled();

    // A typed-but-unreadable quantity blocks the save rather than being dropped.
    fireEvent.change(screen.getByLabelText('Amount (kg)'), { target: { value: 'a lot' } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Amount (kg)'), { target: { value: '' } });
    expect(save).toBeEnabled();
  });

  it('says WHY a number cannot be used in the row BELOW, wired to the field it is about', async () => {
    // A disabled Save with no explanation is a dead end for a farmer who is not sure what went
    // wrong. A cell is far too narrow for the sentence, so it moves to a full-width row
    // directly under the one being typed in — and stays the FIELD'S sentence via
    // aria-describedby, which is what makes it reachable at all for a screen reader.
    // "1,5" is the interesting case: refused precisely because it could mean 15 or 1.5.
    renderSection();
    const save = await openInsertRow();
    const price = screen.getByLabelText('Price (Rs./kg)');

    fireEvent.change(price, { target: { value: '1,5' } });
    expect(save).toBeDisabled();
    const err = screen.getByText(
      'Please write this in numbers, like 250 or 250.50, up to 100,000.',
    );
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(price).toHaveAttribute('aria-describedby', err.id);
    // The sentence really is in the spanning row under the editing one, not squeezed into a
    // cell beside the input.
    expect(err.closest('tr')).toBe(rows()[2]);
    expect(err.closest('tr')).not.toBe(price.closest('tr'));

    // A good number clears both the sentence and the flag.
    fireEvent.change(price, { target: { value: '1,250' } });
    expect(price).not.toHaveAttribute('aria-invalid');
    expect(price).not.toHaveAttribute('aria-describedby');
    expect(save).toBeEnabled();

    // The quantity says the same thing for the same reason, in its own sentence.
    const qty = screen.getByLabelText('Amount (kg)');
    fireEvent.change(qty, { target: { value: 'a lot' } });
    expect(qty).toHaveAttribute('aria-invalid', 'true');
    expect(qty).toHaveAttribute('aria-describedby', screen.getAllByText(/like 250 or 250\.50/)[0].id);
  });

  it('will not offer a day that has not happened — the field says so itself', async () => {
    renderSection();
    await openInsertRow();
    const date = screen.getByLabelText('Day sold') as HTMLInputElement;
    // The browser's own picker refuses the future before the gate ever has to.
    expect(date).toHaveAttribute('max', TODAY);
    // ...and no floor is invented: the wire states none, so the field refuses nothing the
    // server would have accepted.
    expect(date).not.toHaveAttribute('min');
  });

  it('refuses an over-long note by COUNT, never by truncating the paste', async () => {
    renderSection();
    const save = await openInsertRow();
    const note = screen.getByLabelText('Note') as HTMLTextAreaElement;
    // A browser enforces maxLength by cutting a paste; the contract rejects instead.
    expect(note).not.toHaveAttribute('maxlength');

    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), { target: { value: '200' } });
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

  it('says which answers are optional, since a column heading cannot', async () => {
    renderSection();
    await openInsertRow();
    expect(
      screen.getByText('Only the day and the price are needed. You can leave the rest empty.'),
    ).toBeInTheDocument();
  });

  it('keeps the farmer’s numbers in the row when the server refuses them', async () => {
    vi.spyOn(api, 'recordSale').mockRejectedValue(new ApiError('HTTP 400', 400, 'sale_date_future'));
    renderSection();

    const save = await openInsertRow();
    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), { target: { value: '215' } });
    fireEvent.click(save);

    // The server's own refusal, in the farmer's words — not "something went wrong".
    await screen.findByText(
      'That day has not come yet. A sale is something that has already happened.',
    );
    expect((screen.getByLabelText('Price (Rs./kg)') as HTMLInputElement).value).toBe('215');
  });

  it('sends focus back to the "+" once the sale is saved', async () => {
    vi.spyOn(api, 'recordSale').mockResolvedValue(sale());
    renderSection();

    const save = await openInsertRow();
    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), { target: { value: '215' } });
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
  it('turns the row itself into the same cells, filled in, and PUTs the whole record', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale({ note: 'first buyer' })]));
    const update = vi.spyOn(api, 'updateSale').mockResolvedValue(sale());
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Change the sale of Tomato on ${formatDate('2026-07-20', 'en')}`,
      }),
    );

    // Edited IN PLACE: the record's own row became the fields, in the same columns.
    const editRow = rows()[1];
    expect((within(editRow).getByLabelText('Day sold') as HTMLInputElement).value).toBe('2026-07-20');
    expect((within(editRow).getByLabelText('Price (Rs./kg)') as HTMLInputElement).value).toBe('215');
    expect((within(editRow).getByLabelText('Note') as HTMLTextAreaElement).value).toBe('first buyer');

    // Empty the quantity: on a full-replace route that CLEARS it, and the client says so by
    // sending null.
    fireEvent.change(within(editRow).getByLabelText('Amount (kg)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this sale of Tomato' }));

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

  it('gives the row’s own Change button the focus back after it is saved', async () => {
    // The cells the farmer was typing in have just become a row again: focus belongs on the
    // control that opened them, not on <body> and not at the top of the popup.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    vi.spyOn(api, 'updateSale').mockResolvedValue(sale());
    renderSection();

    const change = `Change the sale of Tomato on ${formatDate('2026-07-20', 'en')}`;
    fireEvent.click(await screen.findByRole('button', { name: change }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this sale of Tomato' }));

    await screen.findByText('Sale updated.');
    await waitFor(() => expect(screen.getByRole('button', { name: change })).toHaveFocus());
  });

  it('cancels an edit in place, leaving the record alone', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    const update = vi.spyOn(api, 'updateSale');
    renderSection();

    const change = `Change the sale of Tomato on ${formatDate('2026-07-20', 'en')}`;
    fireEvent.click(await screen.findByRole('button', { name: change }));
    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText('Rs. 215')).toBeInTheDocument(); // the row is back, as it was
    await waitFor(() => expect(screen.getByRole('button', { name: change })).toHaveFocus());
  });

  it('cancels an editing row on Escape, without letting the key travel', async () => {
    // Same manners as the remove-question: Escape leaves the row alone, and stopPropagation is
    // UNCONDITIONAL because on this surface the row sits inside a dialog.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Change the sale of Tomato on ${formatDate('2026-07-20', 'en')}`,
      }),
    );
    const editRow = rows()[1];
    let escaped = false;
    document.addEventListener('keydown', () => (escaped = true));

    fireEvent.keyDown(within(editRow).getByLabelText('Price (Rs./kg)'), { key: 'Escape' });
    expect(screen.queryByLabelText('Price (Rs./kg)')).toBeNull();
    expect(escaped).toBe(false);
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
    // It spans the whole table, under the row it is about — a cell cannot hold a question.
    expect(confirm.closest('td')).toHaveAttribute('colspan', '6');
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

  it('treats a sale that was ALREADY gone as done: says so, closes, and re-reads', async () => {
    // Done-and-continue, the shape PortfolioPage.runWrites uses for watchlist_entry_not_found.
    // What the farmer asked for has happened, so leaving the question open — pressable again,
    // against a row that no longer exists — would be the app arguing with itself.
    const getSales = vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    vi.spyOn(api, 'deleteSale').mockRejectedValue(new ApiError('HTTP 404', 404, 'sale_not_found'));
    renderSection();

    const when = formatDate('2026-07-20', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove this sale' }));

    await screen.findByText('That sale is no longer saved.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(getSales).toHaveBeenCalledTimes(2));
  });

  it('closes a pending remove-question when the farmer starts editing ANOTHER row', async () => {
    // A confirm merely HIDDEN by an editor comes back stale and asks to destroy something the
    // farmer has since moved on from. It takes TWO rows to catch: with one row the confirm
    // has replaced the very Change button that would reset it, so a one-row test can never
    // exercise the cross-row path.
    const other = sale({ id: 's2', saleDate: '2026-07-18', pricePerKg: 198 });
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale(), other]));
    renderSection();

    const whenA = formatDate('2026-07-20', 'en');
    const whenB = formatDate('2026-07-18', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${whenA}` }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      `Remove the sale of Tomato on ${whenA}?`,
    );

    // Row B's Change is still on screen — pressing it must take row A's question away.
    fireEvent.click(screen.getByRole('button', { name: `Change the sale of Tomato on ${whenB}` }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // ...and cancelling that editor does not resurrect it.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('sends focus to the question the moment it replaces the buttons that opened it', async () => {
    // The Remove button is UNMOUNTED by the state change that opens the confirm (the actions
    // cell empties). Without a deliberate move, focus lands on <body> and a keyboard user is
    // back at the top of the document, with a destructive question on screen they were never
    // taken to.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Remove the sale of Tomato on ${formatDate('2026-07-20', 'en')}`,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Yes, remove this sale' })).toHaveFocus(),
    );
    expect(document.activeElement).not.toBe(document.body);
    // The row's own controls really are gone while the question stands.
    expect(screen.queryByRole('button', { name: /^Change the sale/ })).toBeNull();
  });

  it('keeps the question standing when the removal is refused, focus back on the answer', async () => {
    // The sale is still there, so the choice is still available: re-trying is one tap, not a
    // re-opened confirm. This is also what makes the 'yes' focus chain reachable at all.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    let reject: (e: unknown) => void = () => {};
    vi.spyOn(api, 'deleteSale').mockImplementation(
      () =>
        new Promise<void>((_res, rej) => {
          reject = rej;
        }),
    );
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Remove the sale of Tomato on ${formatDate('2026-07-20', 'en')}`,
      }),
    );
    const yes = screen.getByRole('button', {
      name: 'Yes, remove this sale',
    }) as HTMLButtonElement;
    fireEvent.click(yes);
    await waitFor(() => expect(yes).toBeDisabled());

    // A REAL BROWSER drops focus to <body> the moment the focused control is disabled, which
    // is exactly what happens to this button while the delete is in flight. jsdom does
    // NEITHER — it does not blur on disable, and it refuses blur() on a disabled element
    // (probed) — so the browser's own sequence is staged here. Without this the assertion
    // below passes for the wrong reason (focus simply never moved) and the restore it exists
    // to pin could be deleted with the suite still green.
    yes.disabled = false;
    yes.blur();
    yes.disabled = true;
    expect(document.activeElement).toBe(document.body);

    reject(new ApiError('HTTP 400', 400, 'bad_thing'));
    await screen.findByText('Something went wrong. Please try again.');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Yes, remove this sale' })).toHaveFocus(),
    );
  });
});

describe('the sales section — accessible names', () => {
  it('names every control, and never leaves one called after a glyph', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderSection();
    const when = formatDate('2026-07-20', 'en');

    // The section is a named region; its heading names it.
    const region = screen.getByRole('region', { name: 'Sales you have recorded' });
    expect(region).toBeInTheDocument();

    // The "+" is a glyph, so its NAME has to be the whole sentence: nobody can say "plus" to a
    // voice assistant and nobody can hear it from a screen reader.
    const add = await screen.findByRole('button', { name: 'Record a sale of Tomato' });
    expect(add).toHaveTextContent(''); // no visible text at all — the name is doing the work

    // Row controls name the sale they act on — a book of twenty rows must not offer twenty
    // identical "Change" buttons.
    expect(
      screen.getByRole('button', { name: `Change the sale of Tomato on ${when}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    ).toBeInTheDocument();

    // Every cell in the editing row is reachable by its own column heading, and Save names its
    // sale while still SHOWING the word a voice user would say (WCAG 2.5.3).
    fireEvent.click(add);
    for (const label of ['Day sold', 'Price (Rs./kg)', 'Amount (kg)', 'Market', 'Note']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const save = screen.getByRole('button', { name: 'Save this sale of Tomato' });
    expect(save).toHaveTextContent('Save');

    // And nothing anywhere in the section is a nameless control.
    for (const button of within(region).getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
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

  it('does not let Escape inside an editing ROW close the popup around it', async () => {
    // The row's own Escape cancels the row and stops there. If the key bubbled it would take
    // the whole popup — and the sale being typed into it — away with it.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Change the sale of Tomato on ${formatDate('2026-07-20', 'en')}`,
      }),
    );
    fireEvent.keyDown(screen.getByLabelText('Price (Rs./kg)'), { key: 'Escape' });

    expect(screen.queryByLabelText('Price (Rs./kg)')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('swallows Escape WHILE the removal is in flight, so the outcome still has a home', async () => {
    // The request cannot be recalled, so Escape has nothing to cancel — but if the key were
    // allowed to bubble it would close the popup, and this write reports only INSIDE this
    // section. The farmer would be left with no answer anywhere about a removal that is
    // really happening. stopPropagation is therefore UNCONDITIONAL and only the cancel is
    // conditional; this is the test that says so.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    let release: () => void = () => {};
    vi.spyOn(api, 'deleteSale').mockImplementation(
      () =>
        new Promise<void>((res) => {
          release = res;
        }),
    );
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));

    const when = formatDate('2026-07-20', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${when}` }),
    );
    const confirm = screen.getByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes, remove this sale' }));
    await waitFor(() =>
      expect(within(confirm).getByRole('button', { name: 'Yes, remove this sale' })).toBeDisabled(),
    );

    fireEvent.keyDown(confirm, { key: 'Escape' });
    // Mid-flight: the key is swallowed, the popup stays, and the question stays with it —
    // there is nothing to cancel and everything to report.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    release();
    await screen.findByText('Sale removed.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('swallows Escape WHILE a row is being saved, for the same reason', async () => {
    // The pattern the remove-question already had, carried over to row editing: a mid-flight
    // Escape must not close the only surface that can report what happened to the write.
    vi.spyOn(api, 'getSales').mockResolvedValue(page([sale()]));
    let release: (s: SaleItem) => void = () => {};
    vi.spyOn(api, 'updateSale').mockImplementation(
      () =>
        new Promise<SaleItem>((res) => {
          release = res;
        }),
    );
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: 'More details for Tomato' }));

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Change the sale of Tomato on ${formatDate('2026-07-20', 'en')}`,
      }),
    );
    const price = screen.getByLabelText('Price (Rs./kg)');
    fireEvent.change(price, { target: { value: '230' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this sale of Tomato' }));
    await waitFor(() => expect(price).toBeDisabled());

    fireEvent.keyDown(price, { key: 'Escape' });
    // Nothing to cancel, nothing lost: the row is still there with the numbers in it, and so
    // is the popup that will report the answer.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Price (Rs./kg)')).toBeInTheDocument();

    release(sale({ pricePerKg: 230 }));
    await screen.findByText('Sale updated.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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
