import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import PortfolioSettingsPage from '../pages/PortfolioSettingsPage';
import { api } from '../api/client';
import type { Crop, CropReadiness, Market, WatchlistItem } from '../api/types';

const CROPS: Crop[] = [
  {
    id: 'c1',
    name: 'Tomato',
    externalProductId: 3,
    source: 'DEC',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    cropCode: 'VEG000003',
  },
  {
    id: 'c2',
    name: 'Beans',
    externalProductId: 7,
    source: 'DEC',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    cropCode: 'VEG000007',
  },
];

const MARKETS: Market[] = [
  {
    id: 'm3',
    name: 'Kandy',
    district: 'Kandy',
    marketType: 1,
    isEconomicCenter: false,
    hasStoredData: true,
    lastStoredDate: null,
    isTrainingSource: true,
  },
  {
    id: 'm1',
    name: 'Dambulla Dedicated Economic Centre',
    district: 'Matale',
    marketType: 1,
    isEconomicCenter: true,
    hasStoredData: true,
    lastStoredDate: null,
    isTrainingSource: true,
  },
];

function watched(cropId: string, cropName: string, marketId: string | null): WatchlistItem {
  return {
    cropId,
    cropName,
    cropCode: null,
    preferredMarketId: marketId,
    preferredMarketName: marketId === 'm1' ? 'Dambulla Dedicated Economic Centre' : marketId ? 'Kandy' : null,
    createdAtUtc: '2026-07-20T00:00:00Z',
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

function mockBase(watchlist: WatchlistItem[]) {
  vi.spyOn(api, 'getCrops').mockResolvedValue(CROPS);
  vi.spyOn(api, 'getMarkets').mockResolvedValue(MARKETS);
  vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
  return vi.spyOn(api, 'getWatchlist').mockResolvedValue(watchlist);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/portfolio/settings']}>
      <PortfolioSettingsPage />
    </MemoryRouter>,
  );
}

describe('PortfolioSettingsPage — crop selection writes only the difference', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with the stored watchlist selected and nothing to save', async () => {
    mockBase([watched('c1', 'Tomato', 'm1')]);
    renderPage();

    const tomato = await screen.findByRole('button', { name: 'Tomato' });
    expect(tomato).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Beans' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('1 crop chosen.')).toBeInTheDocument();
  });

  it('POSTs only the added crop and DELETEs only the removed one', async () => {
    const listSpy = mockBase([watched('c1', 'Tomato', 'm1')]);
    const add = vi
      .spyOn(api, 'addWatchlistCrop')
      .mockResolvedValue({ item: watched('c2', 'Beans', 'm1'), alreadyPresent: false });
    const remove = vi
      .spyOn(api, 'removeWatchlistCrop')
      .mockResolvedValue({ cropId: 'c1', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Beans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomato' }));
    expect(screen.getByText('To save: 1 to add, 1 to remove.')).toBeInTheDocument();

    listSpy.mockResolvedValue([watched('c2', 'Beans', 'm1')]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Saved. 1 added, 1 removed.');
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('c2');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('c1');
    // The list is re-read, so the screen shows what really landed.
    expect(listSpy).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Beans' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('never sends a market on an add, so the server inherits the farmer’s home market', async () => {
    mockBase([watched('c1', 'Tomato', 'm1')]);
    const add = vi
      .spyOn(api, 'addWatchlistCrop')
      .mockResolvedValue({ item: watched('c2', 'Beans', 'm1'), alreadyPresent: false });
    vi.spyOn(api, 'removeWatchlistCrop').mockResolvedValue({ cropId: 'x', removed: true });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Beans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(add).toHaveBeenCalled());
    // One argument only: passing null would CLEAR the market instead of inheriting it.
    expect(add.mock.calls[0]).toEqual(['c2']);
  });

  it('re-reads the list after a failed save and says so honestly', async () => {
    const listSpy = mockBase([watched('c1', 'Tomato', 'm1')]);
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(new Error('offline'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Beans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not save all your changes/i);
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('shows an error state with a retry when the screen cannot load at all', async () => {
    vi.spyOn(api, 'getCrops').mockRejectedValue(new Error('down'));
    vi.spyOn(api, 'getMarkets').mockResolvedValue(MARKETS);
    vi.spyOn(api, 'getWatchlist').mockResolvedValue([]);
    vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('PortfolioSettingsPage — one home market for the whole watchlist', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers the economic centre first and a real "no market" choice', async () => {
    mockBase([watched('c1', 'Tomato', 'm1')]);
    renderPage();

    const select = (await screen.findByLabelText('Show prices from')) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent ?? '');
    expect(options[0]).toBe('No market — show national prices');
    expect(options[1]).toContain('Dambulla Dedicated Economic Centre');
    expect(options[1]).toContain('economic centre');
    expect(options[2]).toBe('Kandy');
    expect(select.value).toBe('m1');
  });

  it('PUTs the chosen market and reports how many crops it landed on', async () => {
    const listSpy = mockBase([watched('c1', 'Tomato', 'm1'), watched('c2', 'Beans', 'm1')]);
    const put = vi.spyOn(api, 'updateWatchlistMarket').mockResolvedValue({
      cropId: 'c1',
      preferredMarketId: 'm3',
      preferredMarketName: 'Kandy',
      appliedToCropCount: 2,
    });
    renderPage();

    const select = await screen.findByLabelText('Show prices from');
    listSpy.mockResolvedValue([watched('c1', 'Tomato', 'm3'), watched('c2', 'Beans', 'm3')]);
    fireEvent.change(select, { target: { value: 'm3' } });

    await screen.findByText('Saved. All 2 of your crops now show prices from Kandy.');
    expect(put).toHaveBeenCalledWith('c1', 'm3');
  });

  it('clears the market with an explicit null (the "no market" option is the affordance)', async () => {
    mockBase([watched('c1', 'Tomato', 'm1')]);
    const put = vi.spyOn(api, 'updateWatchlistMarket').mockResolvedValue({
      cropId: 'c1',
      preferredMarketId: null,
      preferredMarketName: null,
      appliedToCropCount: 1,
    });
    renderPage();

    fireEvent.change(await screen.findByLabelText('Show prices from'), { target: { value: '' } });

    await screen.findByText('Saved. Your 1 crop now shows national prices.');
    expect(put).toHaveBeenCalledWith('c1', null);
  });

  it('disables the market choice until there is a crop to hang it on, and says why', async () => {
    mockBase([]);
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Show prices from')).toBeDisabled());
    expect(screen.getByText('Add a crop first, then choose your market.')).toBeInTheDocument();
  });

  it('surfaces a failed market change without losing the screen', async () => {
    mockBase([watched('c1', 'Tomato', 'm1')]);
    vi.spyOn(api, 'updateWatchlistMarket').mockRejectedValue(new Error('offline'));
    renderPage();

    fireEvent.change(await screen.findByLabelText('Show prices from'), { target: { value: 'm3' } });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('button', { name: 'Tomato' })).toBeInTheDocument();
  });
});
