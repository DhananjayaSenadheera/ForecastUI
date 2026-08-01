// The My-sales page (/portfolio/sales) — the farmer's whole book.
//
// The page RENDERS what the server paged; it never client-slices, and it never records a new
// sale (that happens on the crop, in My crops → More details). Both of those are asserted
// here, because both are decisions someone could reasonably "fix" later.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import SalesLogPage from '../pages/SalesLogPage';
import { api, ApiError } from '../api/client';
import type { Market, SaleItem, SalesPage } from '../api/types';
import { formatDate } from '../lib/format';

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
];

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

function pageOf(items: SaleItem[], total = items.length, page = 1, pageSize = 10): SalesPage {
  return { items, page, pageSize, total };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SalesLogPage />
    </MemoryRouter>,
  );
}

const WHEN = formatDate('2026-07-20', 'en');

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(api, 'getMarkets').mockResolvedValue(MARKETS);
  vi.spyOn(api, 'getSales').mockResolvedValue(pageOf([sale()]));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the sales book — reading it', () => {
  it('lists the sales newest-first as the server paged them, naming the crop of each', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(
      pageOf([sale(), sale({ id: 's2', cropId: 'c2', cropName: 'Beans', saleDate: '2026-07-18' })]),
    );
    renderPage();

    expect(await screen.findByRole('heading', { name: 'My sales', level: 1 })).toBeInTheDocument();
    // The crop is on every row here — one book, many crops.
    expect(screen.getByText('Tomato')).toBeInTheDocument();
    expect(screen.getByText('Beans')).toBeInTheDocument();
    expect(screen.getByText('2 sales recorded')).toBeInTheDocument();
    expect(api.getSales).toHaveBeenCalledWith(1, 10);
  });

  it('offers the way back to My crops', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Back to my crops' })).toHaveAttribute(
      'href',
      '/portfolio',
    );
  });

  it('has no "new sale" control at all — a sale is recorded on its crop', async () => {
    renderPage();
    await screen.findByText('1 sale recorded');
    // Neither the old disclosure button nor the table's "+": this page cannot know which crop
    // a new sale belongs to, and asking would invite the one mistake nobody notices later.
    expect(screen.queryByRole('button', { name: /Record a sale/ })).toBeNull();
  });

  it('is the SAME table as the popup, with one column more: the crop', async () => {
    // One book, two surfaces, one presentation. The crop column is the only difference, and it
    // exists because this list holds every crop.
    renderPage();
    const table = await screen.findByRole('table');
    const heads = within(table).getAllByRole('columnheader');
    expect(heads.map((h) => h.textContent)).toEqual([
      'Day sold',
      'Crop',
      'Price (Rs./kg)',
      'Amount (kg)',
      'Market',
      'Note',
      'Actions',
    ]);
    for (const h of heads) expect(h).toHaveAttribute('scope', 'col');

    // Every cell still carries its column heading, which is what lets the CSS stack the row
    // into a labelled card under 600px instead of scrolling it sideways.
    const bodyRow = within(table).getAllByRole('row')[1];
    expect(within(bodyRow).getAllByRole('cell').map((c) => c.getAttribute('data-label'))).toEqual(
      heads.map((h) => h.textContent),
    );
  });

  it('shows an empty book as an invitation with the way to act on it', async () => {
    vi.spyOn(api, 'getSales').mockResolvedValue(pageOf([]));
    renderPage();

    expect(await screen.findByText('No sales recorded yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to my crops' })).toHaveAttribute(
      'href',
      '/portfolio',
    );
  });

  it('admits a failed load and offers a retry that really asks again', async () => {
    const getSales = vi.spyOn(api, 'getSales').mockRejectedValueOnce(new ApiError('network', 0));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
    getSales.mockResolvedValue(pageOf([sale()]));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('1 sale recorded')).toBeInTheDocument();
  });

  it('survives a market registry that will not load — the sales are unaffected', async () => {
    vi.spyOn(api, 'getMarkets').mockRejectedValue(new ApiError('network', 0));
    renderPage();
    expect(await screen.findByText('1 sale recorded')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the sales book — paging', () => {
  it('asks the SERVER for the next page instead of slicing what it already has', async () => {
    const getSales = vi
      .spyOn(api, 'getSales')
      .mockResolvedValue(pageOf([sale()], 25 /* more than one page */));
    renderPage();
    await screen.findByText('25 sales recorded');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(getSales).toHaveBeenLastCalledWith(2, 10));
  });

  it('hides the pager entirely when the whole book fits on one page', async () => {
    renderPage();
    await screen.findByText('1 sale recorded');
    expect(screen.queryByRole('navigation', { name: 'Table pages' })).toBeNull();
  });

  it('never lets a slow FIRST page overwrite the second one the farmer already asked for', async () => {
    // Two loads in flight at once: page 1 resolves LAST. Without the request-sequence guard
    // its rows would land on top of page 2's and the farmer would be reading page 1 under a
    // pager that says 2 — the classic stale-response overwrite.
    let releaseSecond: (v: SalesPage) => void = () => {};
    vi.spyOn(api, 'getSales')
      // Page 1 lands normally, so the pager is on screen to be pressed.
      .mockResolvedValueOnce(pageOf([sale({ cropName: 'Tomato' })], 25, 1))
      // Page 2 is held open — this is the response that will be overtaken.
      .mockImplementationOnce(
        () =>
          new Promise<SalesPage>((res) => {
            releaseSecond = res;
          }),
      )
      // Page 3 answers while page 2 is still in the air.
      .mockResolvedValue(
        pageOf([sale({ id: 's3', cropName: 'Beans', saleDate: '2026-07-18' })], 25, 3),
      );

    renderPage();
    await screen.findByText('Tomato');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Beans');

    // The overtaken page-2 response now arrives — and is DROPPED.
    releaseSecond(pageOf([sale({ id: 's2', cropName: 'Carrot', saleDate: '2026-07-19' })], 25, 2));
    await waitFor(() => expect(screen.getByText('Beans')).toBeInTheDocument());
    expect(screen.queryByText('Carrot')).toBeNull();
  });
});

// The date bound is computed from the LOCAL calendar day, and this is the test that says so.
// Sri Lanka is UTC+5:30, so between 18:30 and 24:00 UTC the ISO form of "now" is YESTERDAY
// there: a page that reached for toISOString().slice(0,10) would refuse a sale the farmer
// made this morning, every evening, for five and a half hours.
describe('the sales book — "today" is the farmer’s today', () => {
  const realTz = process.env.TZ;
  // 2026-07-31 20:00 UTC == 2026-08-01 01:30 in Colombo. The two calendar days really differ.
  const INSTANT = new Date('2026-07-31T20:00:00Z');

  beforeEach(() => {
    process.env.TZ = 'Asia/Colombo';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(INSTANT);
  });
  afterEach(() => {
    vi.useRealTimers();
    // `process.env.TZ = undefined` stores the STRING "undefined", which Node reads as UTC —
    // so a suite that ran with no TZ set would leave every later file in a zone it never
    // chose. Restoring "absent" means DELETING the variable.
    if (realTz === undefined) delete process.env.TZ;
    else process.env.TZ = realTz;
  });

  it('bounds the date field by the LOCAL day, not the UTC one', async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: `Change the sale of Tomato on ${WHEN}` }),
    );

    // The oracle is Intl in the same zone — never ymdLocal, which is the thing under test.
    const localDay = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(INSTANT);
    expect(localDay).toBe('2026-08-01');
    expect(INSTANT.toISOString().slice(0, 10)).toBe('2026-07-31'); // the trap, spelled out
    expect(screen.getByLabelText('Day sold')).toHaveAttribute('max', localDay);
  });
});

describe('the sales book — changing and removing', () => {
  it('edits a row in place and sends the whole record back', async () => {
    const update = vi.spyOn(api, 'updateSale').mockResolvedValue(sale({ pricePerKg: 230 }));
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Change the sale of Tomato on ${WHEN}` }),
    );
    fireEvent.change(screen.getByLabelText('Price (Rs./kg)'), {
      target: { value: '230' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this sale of Tomato' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('s1', {
        marketId: 'm1',
        saleDate: '2026-07-20',
        pricePerKg: 230,
        quantityKg: 60,
        note: null,
      }),
    );
    await screen.findByText('Sale updated.');
  });

  it('cancels an edit without touching the record', async () => {
    const update = vi.spyOn(api, 'updateSale');
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Change the sale of Tomato on ${WHEN}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(update).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: `Change the sale of Tomato on ${WHEN}` }),
    ).toBeInTheDocument();
  });

  it('asks before removing, then removes and re-reads the page', async () => {
    const getSales = vi.spyOn(api, 'getSales').mockResolvedValue(pageOf([sale()]));
    const del = vi.spyOn(api, 'deleteSale').mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(`Remove the sale of Tomato on ${WHEN}?`);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes, remove this sale' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('s1'));
    await screen.findByText('Sale removed.');
    expect(getSales).toHaveBeenCalledTimes(2);
  });

  it('reports a refusal in the server’s own words, and keeps the row', async () => {
    // Any refusal the row can still act on leaves the question standing — the sale is there,
    // so answering again is one tap.
    vi.spyOn(api, 'deleteSale').mockRejectedValue(new ApiError('HTTP 400', 400, 'bad_thing'));
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove this sale' }));
    await screen.findByText('Something went wrong. Please try again.');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('treats a sale that was ALREADY gone as done: says so, closes, and re-reads', async () => {
    // Done-and-continue, the shape PortfolioPage.runWrites uses for watchlist_entry_not_found.
    // The farmer asked for the row to go and it is gone; a question left standing over it can
    // be pressed again and again against nothing.
    const getSales = vi.spyOn(api, 'getSales').mockResolvedValue(pageOf([sale()]));
    vi.spyOn(api, 'deleteSale').mockRejectedValue(new ApiError('HTTP 404', 404, 'sale_not_found'));
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove this sale' }));

    await screen.findByText('That sale is no longer saved.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(getSales).toHaveBeenCalledTimes(2));
  });

  it('gives the row’s own Change button the focus back after an edit is saved', async () => {
    vi.spyOn(api, 'updateSale').mockResolvedValue(sale());
    renderPage();

    const change = `Change the sale of Tomato on ${WHEN}`;
    fireEvent.click(await screen.findByRole('button', { name: change }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this sale of Tomato' }));

    await screen.findByText('Sale updated.');
    await waitFor(() => expect(screen.getByRole('button', { name: change })).toHaveFocus());
  });

  it('sends focus to the question the moment it replaces the button that opened it', async () => {
    // Same defect as on the popup surface: the Remove button unmounts as the confirm appears,
    // so focus must travel with it or land on <body>.
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Yes, remove this sale' })).toHaveFocus(),
    );
    expect(document.activeElement).not.toBe(document.body);
  });

  it('keeps the question standing when the removal is refused, focus back on the answer', async () => {
    let reject: (e: unknown) => void = () => {};
    vi.spyOn(api, 'deleteSale').mockImplementation(
      () =>
        new Promise<void>((_res, rej) => {
          reject = rej;
        }),
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    const yes = screen.getByRole('button', {
      name: 'Yes, remove this sale',
    }) as HTMLButtonElement;
    fireEvent.click(yes);
    await waitFor(() => expect(yes).toBeDisabled());

    // Same jsdom blind spot as on the popup surface (see there): a real browser blurs a
    // focused control the instant it is disabled, and jsdom does not, so the sequence is
    // staged. Without it this test would pass whether or not the refusal restores focus.
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

  it('closes a pending remove-question when the farmer starts editing ANOTHER row', async () => {
    // The cross-row path, which a one-row fixture cannot reach: with one row the confirm has
    // replaced the very Change button that would reset it.
    vi.spyOn(api, 'getSales').mockResolvedValue(
      pageOf([sale(), sale({ id: 's2', cropName: 'Beans', saleDate: '2026-07-18' })]),
    );
    renderPage();

    const whenB = formatDate('2026-07-18', 'en');
    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      `Remove the sale of Tomato on ${WHEN}?`,
    );

    fireEvent.click(screen.getByRole('button', { name: `Change the sale of Beans on ${whenB}` }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('swallows Escape WHILE the removal is in flight, keeping the question and its answer', async () => {
    // There is nothing to cancel once the request has gone, and the row must not disappear
    // from under the farmer while it is still resolving.
    let release: () => void = () => {};
    vi.spyOn(api, 'deleteSale').mockImplementation(
      () =>
        new Promise<void>((res) => {
          release = res;
        }),
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    const confirm = screen.getByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes, remove this sale' }));
    await waitFor(() =>
      expect(within(confirm).getByRole('button', { name: 'Yes, remove this sale' })).toBeDisabled(),
    );

    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    release();
    await screen.findByText('Sale removed.');
  });

  it('sends focus to the result when the row the farmer pressed in has gone', async () => {
    vi.spyOn(api, 'deleteSale').mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove this sale' }));

    const status = await screen.findByText('Sale removed.');
    await waitFor(() => expect(status.closest('p')).toHaveFocus());
  });
});
