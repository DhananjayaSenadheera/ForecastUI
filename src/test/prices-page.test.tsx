import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import PricesPage from '../pages/PricesPage';
import { api, ApiError } from '../api/client';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/prices']}>
      <PricesPage />
    </MemoryRouter>,
  );
}

describe('PricesPage (FE-12)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the full browse page in fixture mode: controls, chart, table alt, comparison', async () => {
    renderPage();
    // crop + market selects
    await screen.findByText('Crop');
    expect(screen.getByText('Market')).toBeInTheDocument();
    expect(document.querySelectorAll('.pr-select').length).toBe(2);

    // single-market chart with a table alternative
    await waitFor(() => expect(document.querySelector('.pr-svg')).toBeInTheDocument());
    const chartTables = screen.getAllByText('View as table');
    expect(chartTables.length).toBeGreaterThanOrEqual(1);

    // cross-market comparison (multiple markets have fixture data)
    await waitFor(() => expect(document.querySelector('.pr-cmp')).toBeInTheDocument());
    expect(document.querySelector('.pr-cmp__title')?.textContent).toMatch(/Compare markets/);
    expect(document.querySelectorAll('.pr-cmp__row').length).toBeGreaterThanOrEqual(2);

    // provenance
    expect(screen.getAllByText(/Source: HARTI/).length).toBeGreaterThan(0);
  });

  it('shows the honest "coming soon" state (not an error) on a 501 gap', async () => {
    vi.spyOn(api, 'getMarkets').mockRejectedValueOnce(new ApiError('gap', 501));
    renderPage();
    await screen.findByText(/Prices are coming soon/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders an honest empty-chart note when a market has no price data', async () => {
    vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(document.querySelector('.pr-chart--empty')).toBeInTheDocument());
    expect(screen.getByText(/No recent price data/)).toBeInTheDocument();
    // no comparison when nothing has data
    expect(document.querySelector('.pr-cmp')).toBeNull();
  });

  it('labels the price table as observed low–high, not a forecast', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.pr-svg')).toBeInTheDocument());
    const details = document.querySelector('.pr-chart .pr-table') as HTMLElement;
    const table = within(details).getByRole('table');
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Date', 'Low', 'High']);
  });

  it('shows an error state with a working retry when history loading fails (non-501)', async () => {
    vi.spyOn(api, 'getPriceHistory').mockRejectedValueOnce(new ApiError('boom', 500));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
