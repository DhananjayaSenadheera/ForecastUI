// /portfolio/settings was DISSOLVED into /portfolio. The route has to keep existing as a
// redirect: bookmarks, the browser's own history and any link already sent to a farmer must
// land on the page that now does the job, not on the catch-all that quietly sends them to
// Overview (which would look like the feature had been removed).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { api } from '../api/client';
import type { CropReadiness } from '../api/types';

// The guard and the shell are not what this file is about; stub them down to their outlets
// so the assertion is purely about the route table in App.
vi.mock('../auth/RequireAuth', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: () => <Outlet /> };
});
vi.mock('../components/AppShell', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: () => <Outlet /> };
});

const NO_READINESS: CropReadiness = {
  modelActive: false,
  modelVersion: null,
  minHistoryObs: 0,
  crops: [],
};

beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.setItem('agriforecast.onboarding.langSeen', '1');
  vi.spyOn(api, 'getPortfolioDashboard').mockResolvedValue({ items: [] });
  vi.spyOn(api, 'getCrops').mockResolvedValue([]);
  vi.spyOn(api, 'getMarkets').mockResolvedValue([]);
  vi.spyOn(api, 'getWatchlist').mockResolvedValue([]);
  vi.spyOn(api, 'getCropReadiness').mockResolvedValue(NO_READINESS);
  vi.spyOn(api, 'getPriceHistory').mockResolvedValue([]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function renderAt(path: string) {
  const { default: App } = await import('../App');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('the dissolved settings route', () => {
  it('sends /portfolio/settings to /portfolio instead of 404-ing to Overview', async () => {
    await renderAt('/portfolio/settings');
    // "My crops" is the page heading; the crop table below it is the dissolved settings UI.
    expect(await screen.findByRole('heading', { name: 'My crops', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'All crops', level: 2 })).toBeInTheDocument();
  });

  it('serves /portfolio itself with the same page (the redirect is not a loop)', async () => {
    await renderAt('/portfolio');
    expect(await screen.findByRole('heading', { name: 'My crops', level: 1 })).toBeInTheDocument();
  });
});
