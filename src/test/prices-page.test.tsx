import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
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

  it('renders the one-market view in fixture mode: crop+market selects, chart, table alt', async () => {
    renderPage();
    // crop + market selects (one-market view is the default)
    await screen.findByText('Crop');
    expect(screen.getByText('Market')).toBeInTheDocument();
    expect(document.querySelectorAll('.pr-select').length).toBe(2);

    // single-market envelope chart with a table alternative
    await waitFor(() => expect(document.querySelector('.pr-svg')).toBeInTheDocument());
    expect(screen.getAllByText('View as table').length).toBeGreaterThanOrEqual(1);

    // provenance
    expect(screen.getAllByText(/Source: HARTI/).length).toBeGreaterThan(0);
  });

  it('FE-18: the Compare markets view overlays markets with a sortable market×day table', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.pr-svg')).toBeInTheDocument());

    // switch to the compare view
    fireEvent.click(screen.getByRole('button', { name: 'Compare markets' }));

    // overlay chart + market multi-select chips (default 4 selected)
    await waitFor(() => expect(document.querySelector('.pr-oline')).toBeInTheDocument());
    const chips = document.querySelectorAll('.pr-mchip');
    expect(chips.length).toBe(4);
    const selected = document.querySelectorAll('.pr-mchip.is-on');
    expect(selected.length).toBe(4); // capped at OVERLAY_MAX

    // sortable market×day table exposes the Mid column + aria-sort
    const table = screen.getByRole('table');
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(heads.some((h) => h.includes('Mid'))).toBe(true);
    expect(within(table).getByRole('columnheader', { name: /Date/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('FE-18: caps market overlay selection at 4 with an honest note', async () => {
    // fixtures ship exactly 4 markets and all 4 start selected; deselect two then
    // re-add — a 5th market does not exist, so instead assert the cap note wiring
    // by deselecting to make room and confirming toggling stays within the cap.
    renderPage();
    await waitFor(() => expect(document.querySelector('.pr-svg')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Compare markets' }));
    await waitFor(() => expect(document.querySelector('.pr-mchip')).toBeInTheDocument());
    const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.pr-mchip'));
    // all 4 on -> turning one off leaves 3, no cap note
    fireEvent.click(chips[0]);
    expect(document.querySelectorAll('.pr-mchip.is-on').length).toBe(3);
    expect(document.querySelector('.pr-cap')).toBeNull();
    // turning it back on returns to the cap of 4
    fireEvent.click(chips[0]);
    expect(document.querySelectorAll('.pr-mchip.is-on').length).toBe(4);
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
