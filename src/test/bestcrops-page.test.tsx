import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import BestCropsPage from '../pages/BestCropsPage';
import { api } from '../api/client';
import { fxBestCrops } from '../api/fixtures';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/best-crops']}>
      <BestCropsPage />
    </MemoryRouter>,
  );
}

const names = () =>
  Array.from(document.querySelectorAll('.bc-crop__name')).map((n) => n.textContent);

describe('BestCropsPage (FE-7)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one row per ranked crop as a real table with headers', async () => {
    renderPage();
    await screen.findByText('Capsicum');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(document.querySelectorAll('.bc-row').length).toBe(fxBestCrops.length);
    // provenance + lookback caption present
    expect(screen.getByText(/Source: HARTI/)).toBeInTheDocument();
    expect(screen.getByText(/Ranked using the last 3 months/)).toBeInTheDocument();
  });

  it('uses RED (critical) badge ONLY for the Not-recommended row', async () => {
    renderPage();
    await screen.findByText('Cabbage');
    const critical = document.querySelectorAll('.bc-badge--critical');
    expect(critical.length).toBe(1);
    expect(critical[0].textContent).toContain('Not recommended');
    // strong/recommended rows carry the good badge, never critical
    expect(document.querySelectorAll('.bc-badge--good').length).toBeGreaterThan(0);
  });

  it('keeps the Not-recommended row VISIBLE with its plain caveat', async () => {
    renderPage();
    await screen.findByText('Cabbage');
    expect(screen.getByText(/We don't suggest planting this now/)).toBeInTheDocument();
  });

  it('shows the price trend as an arrow glyph plus a readable text label (never colour-only)', async () => {
    renderPage();
    await screen.findByText('Capsicum');
    expect(screen.getAllByText('Rising').length).toBe(3); // Capsicum, Green Chilli, Tomato
    expect(screen.getAllByText('Falling').length).toBe(2); // Passion Fruit, Cabbage
    expect(screen.getAllByText('Steady').length).toBe(2); // Beans, Carrot
  });

  it('gives low-confidence "Little data" rows amber styling + a caveat', async () => {
    renderPage();
    await screen.findByText('Passion Fruit');
    const row = screen.getByText('Passion Fruit').closest('tr') as HTMLElement;
    expect(row.classList.contains('is-lowconf')).toBe(true);
    expect(row.querySelector('.bc-scale.is-low')).toBeInTheDocument();
    expect(row.textContent).toContain('Little price data for this crop yet');
  });

  it('renders a shared-scale bar for every row (comparison at a glance)', async () => {
    renderPage();
    await screen.findByText('Capsicum');
    expect(document.querySelectorAll('.bc-scale').length).toBe(fxBestCrops.length);
    expect(screen.getByText(/Bars compare the expected price on one scale/)).toBeInTheDocument();
  });

  it('renders the Yala/Maha season badge only where the API exposes it, silently otherwise', async () => {
    renderPage();
    await screen.findByText('Capsicum');
    // fixtures put seasonFit on Capsicum + Beans only
    expect(document.querySelectorAll('.bc-season').length).toBe(2);
    expect(screen.getByText('Capsicum').closest('tr')!.textContent).toContain('In season');
    // a crop without seasonFit shows no badge
    expect(screen.getByText('Green Chilli').closest('tr')!.querySelector('.bc-season')).toBeNull();
  });

  it('sorts by expected price and reflects it in aria-sort', async () => {
    renderPage();
    await screen.findByText('Capsicum');
    const priceSort = screen.getByRole('button', { name: 'Sort by Expected price' });
    const priceTh = document.querySelector('.bc-th--num') as HTMLElement;

    fireEvent.click(priceSort); // desc — dearest first
    expect(priceTh.getAttribute('aria-sort')).toBe('descending');
    expect(names()[0]).toBe('Capsicum');

    fireEvent.click(priceSort); // asc — cheapest first
    expect(priceTh.getAttribute('aria-sort')).toBe('ascending');
    expect(names()[0]).toBe('Cabbage');
  });

  it('refetches with the chosen lookback window', async () => {
    const spy = vi.spyOn(api, 'getBestCrops');
    renderPage();
    await screen.findByText('Capsicum');
    expect(spy).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: '6 months' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(6));
    expect(screen.getByText(/Ranked using the last 6 months/)).toBeInTheDocument();
  });

  it('links each row into the My-Harvest flow with the crop preselected', async () => {
    renderPage();
    await screen.findByText('Capsicum');
    const link = screen.getByRole('link', { name: /Plan Capsicum in My harvest/ });
    expect(link).toHaveAttribute('href', '/my-harvest?crop=c0000001-0000-0000-0000-000000000001');
  });

  it('shows an error state with a working retry', async () => {
    vi.spyOn(api, 'getBestCrops').mockRejectedValueOnce(new Error('boom'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Capsicum'); // retry falls through to fixtures
  });
});
