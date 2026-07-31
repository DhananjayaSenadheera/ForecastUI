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
    expect(screen.queryByRole('button', { name: /Record a sale/ })).toBeNull();
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
});

describe('the sales book — changing and removing', () => {
  it('edits a row in place and sends the whole record back', async () => {
    const update = vi.spyOn(api, 'updateSale').mockResolvedValue(sale({ pricePerKg: 230 }));
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Change the sale of Tomato on ${WHEN}` }),
    );
    fireEvent.change(screen.getByLabelText('Price you got (Rs. per kg)'), {
      target: { value: '230' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the changes to this sale of Tomato' }));

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
    vi.spyOn(api, 'deleteSale').mockRejectedValue(new ApiError('HTTP 404', 404, 'sale_not_found'));
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Remove the sale of Tomato on ${WHEN}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove this sale' }));
    await screen.findByText('That sale is no longer saved.');
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
