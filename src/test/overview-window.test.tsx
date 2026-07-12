import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import OverviewPage from '../pages/OverviewPage';
import { api } from '../api/client';
import { fxMarketOverviewFor } from '../api/fixtures';

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <OverviewPage />
    </MemoryRouter>,
  );
}

describe('OverviewPage — window selector (FE-15)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => vi.restoreAllMocks());

  it('defaults to 30 days and refetches with the chosen window; caption follows the served value', async () => {
    const spy = vi
      .spyOn(api, 'getMarketOverview')
      .mockImplementation((d = 30) => Promise.resolve(fxMarketOverviewFor(d)));

    renderOverview();

    // initial load = 30 days
    await screen.findByText('Data as of');
    expect(spy).toHaveBeenCalledWith(30);
    expect(screen.getByText(/last 30 days/)).toBeInTheDocument();

    // switch to 7 days
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(7));
    // caption follows the SERVED windowDays (fixture echoes 7)
    await screen.findByText(/last 7 days/);
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('fixture varies by window — a 7-day window surfaces fewer movers', async () => {
    vi.spyOn(api, 'getMarketOverview').mockImplementation((d = 30) => Promise.resolve(fxMarketOverviewFor(d)));
    renderOverview();

    const movers30 = await screen.findByLabelText('Price movers');
    const count30 = within(movers30).getAllByRole('link').length;

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await screen.findByText(/last 7 days/);
    const movers7 = screen.getByLabelText('Price movers');
    const count7 = within(movers7).getAllByRole('link').length;

    expect(count7).toBeLessThan(count30);
  });

  it('keeps the last snapshot visible under a busy state during a window switch (no blank)', async () => {
    let resolveSecond: (v: ReturnType<typeof fxMarketOverviewFor>) => void = () => {};
    const spy = vi.spyOn(api, 'getMarketOverview').mockImplementation((d = 30) => {
      if (d === 30) return Promise.resolve(fxMarketOverviewFor(30));
      return new Promise<ReturnType<typeof fxMarketOverviewFor>>((res) => {
        resolveSecond = res;
      });
    });

    renderOverview();
    await screen.findByText('Data as of'); // 30-day data on screen

    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    // while the 90-day fetch is in flight the previous KPIs stay mounted (not blanked)
    await waitFor(() => expect(document.querySelector('.ov-live.is-busy')).toBeInTheDocument());
    expect(screen.getByText('Data as of')).toBeInTheDocument();

    resolveSecond(fxMarketOverviewFor(90));
    await waitFor(() => expect(document.querySelector('.ov-live.is-busy')).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith(90);
  });
});
