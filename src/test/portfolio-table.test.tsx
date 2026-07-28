// The crop table on /portfolio — what used to be /portfolio/settings, now on the same page
// as the cards. Exercised THROUGH PortfolioPage, because the wiring between the table and
// the writes is exactly what the dissolved-settings step changed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import PortfolioPage from '../pages/PortfolioPage';
import { api, ApiError } from '../api/client';
import type {
  Crop,
  CropReadiness,
  Market,
  PortfolioDashboard,
  WatchlistItem,
} from '../api/types';

function crop(id: string, name: string, code: string): Crop {
  return {
    id,
    name,
    externalProductId: 1,
    source: 'DEC',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    cropCode: code,
  };
}

const CROPS: Crop[] = [
  crop('c1', 'Tomato', 'VEG000003'),
  crop('c2', 'Beans', 'VEG000007'),
  crop('c3', 'Carrot', 'VEG000009'),
];

function market(id: string, name: string, ec = false): Market {
  return {
    id,
    name,
    district: null,
    marketType: 1,
    isEconomicCenter: ec,
    hasStoredData: true,
    lastStoredDate: null,
    isTrainingSource: true,
  };
}

const MARKETS: Market[] = [
  market('m3', 'Kandy'),
  market('m1', 'Dambulla Dedicated Economic Centre', true),
  market('m2', 'Colombo'),
  market('m4', 'Keppetipola'),
];

function watched(cropId: string, cropName: string, marketIds: string[]): WatchlistItem {
  return {
    cropId,
    cropName,
    cropCode: null,
    plantedDate: null,
    markets: marketIds.map((id) => ({
      marketId: id,
      name: MARKETS.find((m) => m.id === id)?.name ?? id,
      shortCode: id.toUpperCase(),
    })),
    createdAtUtc: '2026-07-20T00:00:00Z',
  };
}

const NO_READINESS: CropReadiness = {
  modelActive: false,
  modelVersion: null,
  minHistoryObs: 0,
  crops: [],
};

const EMPTY_DASH: PortfolioDashboard = { items: [] };

function mockPage(watchlist: WatchlistItem[] = [], dashboard: PortfolioDashboard = EMPTY_DASH) {
  vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue(dashboard);
  vi.spyOn(api, 'getCrops').mockResolvedValue(CROPS);
  vi.spyOn(api, 'getMarkets').mockResolvedValue(MARKETS);
  vi.spyOn(api, 'getWatchlist').mockResolvedValue(watchlist);
  vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
  vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/portfolio']}>
      <PortfolioPage />
    </MemoryRouter>,
  );
}

/** Open one crop's market picker and return its fieldset. */
async function openPicker(cropName: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Choose markets for ${cropName}` }));
  return screen.getByRole('group', { name: new RegExp(`^Markets for ${cropName}`) });
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('crop table — it lists every crop with its own controls', () => {
  it('renders a real table with a header row, one row per crop', async () => {
    mockPage();
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Crop' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Markets' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Tomato' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Carrot' })).toBeInTheDocument();
  });

  it('gives every tick and every picker a crop-specific accessible name', async () => {
    mockPage();
    renderPage();

    expect(await screen.findByRole('checkbox', { name: 'Add Tomato to my crops' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Add Beans to my crops' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose markets for Tomato' })).toBeInTheDocument();
    // Same market, different rows -> different names, so no control is ambiguous.
    const picker = await openPicker('Tomato');
    expect(within(picker).getByRole('checkbox', { name: 'Kandy, for Tomato' })).toBeInTheDocument();
  });

  it('carries a mobile label on every value cell (the <600px card list)', async () => {
    mockPage();
    renderPage();
    await screen.findByRole('table');
    // display:none/CSS alone flips the layout — the labels must already be in the markup.
    const labels = Array.from(document.querySelectorAll('.pf-table tbody td')).map((td) =>
      td.getAttribute('data-label'),
    );
    expect(labels).toContain('Markets');
    expect(labels).toContain('Watch');
    expect(labels.every((l) => l !== null)).toBe(true);
  });

  it('filters by name in any script, and says so when nothing matches', async () => {
    mockPage();
    renderPage();

    const search = await screen.findByLabelText('Search crops');
    fireEvent.change(search, { target: { value: 'carr' } });
    expect(screen.getByRole('rowheader', { name: 'Carrot' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Tomato' })).toBeNull();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText('No crop matches what you typed.')).toBeInTheDocument();
  });
});

describe('crop table — adding crops', () => {
  it('POSTs each ticked crop with the markets picked for it', async () => {
    mockPage();
    const add = vi
      .spyOn(api, 'addWatchlistCrop')
      .mockImplementation(async (cropId) => ({
        item: watched(cropId, cropId, []),
        alreadyPresent: false,
      }));
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Tomato to my crops' }));
    const picker = await openPicker('Tomato');
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Kandy, for Tomato' }));
    fireEvent.click(
      within(picker).getByRole('checkbox', {
        name: 'Dambulla Dedicated Economic Centre, for Tomato',
      }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add Beans to my crops' }));

    expect(screen.getByText('2 crops ticked.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    // Crop id + the picked market ids, in the order the farmer tapped them.
    expect(add.mock.calls[0]).toEqual(['c1', ['m3', 'm1']]);
    // A crop with no market picked sends an empty set — never an invented market.
    expect(add.mock.calls[1]).toEqual(['c2', []]);
  });

  it('re-reads the dashboard and the list after adding, never patching locally', async () => {
    mockPage();
    vi.spyOn(api, 'addWatchlistCrop').mockResolvedValue({
      item: watched('c1', 'Tomato', []),
      alreadyPresent: false,
    });
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Tomato to my crops' }));
    vi.mocked(api.getWatchlist).mockResolvedValue([watched('c1', 'Tomato', [])]);
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));

    await screen.findByText('Watching 1 of 10 crops');
    expect(api.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('keeps the add button dead until at least one crop is ticked', async () => {
    mockPage();
    renderPage();
    expect(await screen.findByRole('button', { name: 'Add to my crops' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add Tomato to my crops' }));
    expect(screen.getByRole('button', { name: 'Add to my crops' })).toBeEnabled();
  });
});

describe('crop table — the 3-market cap, client-side AND from the server', () => {
  it('refuses the FOURTH market with a sentence instead of ignoring the tap', async () => {
    mockPage();
    renderPage();

    const picker = await openPicker('Tomato');
    for (const name of ['Kandy', 'Dambulla Dedicated Economic Centre', 'Colombo']) {
      fireEvent.click(within(picker).getByRole('checkbox', { name: `${name}, for Tomato` }));
    }
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Keppetipola, for Tomato' }));

    expect(screen.getByText('You can choose up to 3 markets for one crop.')).toBeInTheDocument();
    // The refused one is genuinely not ticked — the message is not decorative.
    expect(
      within(picker).getByRole('checkbox', { name: 'Keppetipola, for Tomato' }),
    ).not.toBeChecked();
  });

  it('lets the farmer swap a market out and a new one in, up to the cap', async () => {
    mockPage();
    renderPage();

    const picker = await openPicker('Tomato');
    for (const name of ['Kandy', 'Dambulla Dedicated Economic Centre', 'Colombo']) {
      fireEvent.click(within(picker).getByRole('checkbox', { name: `${name}, for Tomato` }));
    }
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Kandy, for Tomato' }));
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Keppetipola, for Tomato' }));
    expect(within(picker).getByRole('checkbox', { name: 'Keppetipola, for Tomato' })).toBeChecked();
  });

  it('still maps a too_many_markets 422 — the server, not the client, is the authority', async () => {
    mockPage();
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(
      new ApiError('HTTP 422', 422, 'too_many_markets'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Tomato to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));
    await screen.findByText('You can choose up to 3 markets for one crop.');
  });
});

describe('crop table — the 10-crop cap', () => {
  const ten = Array.from({ length: 10 }, (_, i) => watched(`w${i}`, `Watched ${i}`, []));

  it('disables further ticks once the cap is reached, and says which limit it is', async () => {
    mockPage(ten);
    renderPage();

    await screen.findByText('Watching 10 of 10 crops');
    expect(screen.getByRole('checkbox', { name: 'Add Tomato to my crops' })).toBeDisabled();
  });

  it('stops the tick at the cap when the farmer ticks their way to it', async () => {
    mockPage(Array.from({ length: 9 }, (_, i) => watched(`w${i}`, `Watched ${i}`, [])));
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Tomato to my crops' }));
    // The 10th slot is now spoken for, so the rest go dead rather than failing at the API.
    expect(screen.getByRole('checkbox', { name: 'Add Beans to my crops' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Add Tomato to my crops' })).toBeChecked();
  });

  it('maps the server’s watchlist_full 422 as well', async () => {
    mockPage();
    vi.spyOn(api, 'addWatchlistCrop').mockRejectedValue(
      new ApiError('HTTP 422', 422, 'watchlist_full'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Add Tomato to my crops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to my crops' }));
    await screen.findByText('You can watch up to 10 crops. Remove one before adding another.');
  });
});

describe('crop table — a crop already watched is shown as such, and edited in place', () => {
  it('marks the row "Watching" and lists the markets it is watched at', async () => {
    mockPage([watched('c1', 'Tomato', ['m3', 'm1'])]);
    renderPage();

    const row = (await screen.findByRole('rowheader', { name: 'Tomato' })).closest('tr')!;
    expect(within(row).getByText('Watching')).toBeInTheDocument();
    expect(
      within(row).getByText('Kandy, Dambulla Dedicated Economic Centre'),
    ).toBeInTheDocument();
    // A watched crop is not offered as an "add" — the row's job is now editing.
    expect(within(row).queryByRole('checkbox', { name: 'Add Tomato to my crops' })).toBeNull();
  });

  it('seeds the picker from the stored markets and PUTs the FULL replacement set', async () => {
    mockPage([watched('c1', 'Tomato', ['m3', 'm1'])]);
    const put = vi.spyOn(api, 'updateWatchlistMarkets').mockResolvedValue({
      item: watched('c1', 'Tomato', ['m3']),
      marketsChanged: true,
      plantedDateChanged: false,
    });
    renderPage();

    const picker = await openPicker('Tomato');
    expect(within(picker).getByRole('checkbox', { name: 'Kandy, for Tomato' })).toBeChecked();
    // Drop Dambulla: the PUT must carry what is LEFT, not what was removed.
    fireEvent.click(
      within(picker).getByRole('checkbox', {
        name: 'Dambulla Dedicated Economic Centre, for Tomato',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save markets for Tomato' }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith('c1', ['m3']);
    // Two arguments only — plantedDate is step 7's and must not ride along.
    expect(put.mock.calls[0]).toHaveLength(2);
  });

  it('clearing every market is a real choice: the PUT carries []', async () => {
    mockPage([watched('c1', 'Tomato', ['m3'])]);
    const put = vi.spyOn(api, 'updateWatchlistMarkets').mockResolvedValue({
      item: watched('c1', 'Tomato', []),
      marketsChanged: true,
      plantedDateChanged: false,
    });
    renderPage();

    const picker = await openPicker('Tomato');
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Kandy, for Tomato' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save markets for Tomato' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('c1', []));
  });

  it('offers no save until the set actually differs from what is stored', async () => {
    mockPage([watched('c1', 'Tomato', ['m3'])]);
    renderPage();

    await screen.findByRole('rowheader', { name: 'Tomato' });
    expect(screen.queryByRole('button', { name: 'Save markets for Tomato' })).toBeNull();

    const picker = await openPicker('Tomato');
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Colombo, for Tomato' }));
    expect(screen.getByRole('button', { name: 'Save markets for Tomato' })).toBeInTheDocument();
  });
});
