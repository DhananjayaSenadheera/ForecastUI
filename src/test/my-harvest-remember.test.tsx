import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import MyHarvestPage from '../pages/MyHarvestPage';
import { ymdLocal } from '../lib/format';
import { writeLastHarvest, readLastHarvest, readRecentCrops } from '../lib/storage';

const BEANS = 'c0000002-0000-0000-0000-000000000002';
const TOMATO = 'c0000003-0000-0000-0000-000000000003';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MyHarvestPage />
    </MemoryRouter>,
  );
}

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

describe('MyHarvestPage — remember my crop (FE-16)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('persists crop + date and pushes onto Recent after a successful forecast', async () => {
    renderAt('/my-harvest');
    fireEvent.click(await screen.findByRole('button', { name: 'Tomato' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get forecast' }));

    await waitFor(() => expect(readLastHarvest()).not.toBeNull());
    expect(readLastHarvest()).toEqual({ cropId: TOMATO, plantDate: ymdLocal(new Date()) });
    expect(readRecentCrops()).toEqual([TOMATO]);
  });

  it('restores the remembered crop + date on next visit (in-range date kept)', async () => {
    const remembered = shift(-30);
    writeLastHarvest(BEANS, remembered);
    renderAt('/my-harvest');

    const card = await screen.findByRole('button', { name: 'Beans', pressed: true });
    expect(card).toBeInTheDocument();
    expect((screen.getByLabelText('Planting date') as HTMLInputElement).value).toBe(remembered);
  });

  it('lets a URL ?crop= win over the remembered crop', async () => {
    writeLastHarvest(BEANS, shift(-10));
    renderAt(`/my-harvest?crop=${TOMATO}`);

    await screen.findByRole('button', { name: 'Tomato', pressed: true });
    expect(screen.getByRole('button', { name: 'Beans' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('falls back to today when the remembered date is out of range', async () => {
    writeLastHarvest(BEANS, '2000-01-01'); // far outside [today-365, today+60]
    renderAt('/my-harvest');

    await screen.findByRole('button', { name: 'Beans', pressed: true });
    expect((screen.getByLabelText('Planting date') as HTMLInputElement).value).toBe(ymdLocal(new Date()));
  });
});
