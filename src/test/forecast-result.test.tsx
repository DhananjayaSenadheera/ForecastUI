import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../i18n';
import ForecastResult from '../components/ForecastResult';
import { fxHarvestForecast, fxHarvestForecastMedium, fxHarvestForecastLow } from '../api/fixtures';

function renderResult(overrides: Partial<React.ComponentProps<typeof ForecastResult>> = {}) {
  const onRetry = vi.fn();
  const utils = render(
    <ForecastResult
      forecast={fxHarvestForecast}
      loading={false}
      error={false}
      onRetry={onRetry}
      cropLabel="Capsicum"
      {...overrides}
    />,
  );
  return { ...utils, onRetry };
}

describe('ForecastResult (FE-4)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a loading skeleton (aria-busy) while the forecast loads', () => {
    renderResult({ loading: true, forecast: null });
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders an error state with a working retry', () => {
    const { onRetry } = renderResult({ error: true, forecast: null });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders the hero central price and exact harvest date', () => {
    renderResult();
    expect(document.querySelector('.fc-hero__num')?.textContent).toBe('Rs. 552');
    expect(screen.getByText(/Harvest around/)).toBeInTheDocument();
  });

  it('maps High confidence to 3 filled dots (of 4) and the "Good" label', () => {
    renderResult({ forecast: fxHarvestForecast });
    expect(document.querySelectorAll('.fc-dot').length).toBe(4);
    expect(document.querySelectorAll('.fc-dot.is-on').length).toBe(3);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('maps Medium confidence to 2 filled dots and the "Fair" label', () => {
    renderResult({ forecast: fxHarvestForecastMedium, cropLabel: 'Beans' });
    expect(document.querySelectorAll('.fc-dot.is-on').length).toBe(2);
    expect(screen.getByText('Fair')).toBeInTheDocument();
  });

  it('maps Low confidence to 1 filled dot and the "Low" label', () => {
    renderResult({ forecast: fxHarvestForecastLow, cropLabel: 'Passion Fruit' });
    expect(document.querySelectorAll('.fc-dot.is-on').length).toBe(1);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders the band with min, marked centre and max prices', () => {
    renderResult(); // Capsicum: 233 / 552 / 694
    const band = document.querySelector('.fc-band') as HTMLElement;
    expect(band).toBeInTheDocument();
    expect(within(band).getByText('Rs. 233')).toBeInTheDocument();
    expect(within(band).getByText('Rs. 552')).toBeInTheDocument();
    expect(within(band).getByText('Rs. 694')).toBeInTheDocument();
    // marked centre tick present (never a bare interval)
    expect(band.querySelector('.fc-band__tick')).toBeInTheDocument();
  });

  it('applies the amber low-trust treatment and banner only when low-trust', () => {
    // Low-trust fixture -> amber band + "rough estimate" banner
    const { unmount } = renderResult({ forecast: fxHarvestForecastLow, cropLabel: 'Passion Fruit' });
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText('Rough estimate only')).toBeInTheDocument();
    expect(document.querySelector('.fc-band.is-low')).toBeInTheDocument();
    unmount();

    // High-confidence fixture -> no banner, no amber band
    renderResult({ forecast: fxHarvestForecast });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText('Rough estimate only')).not.toBeInTheDocument();
    expect(document.querySelector('.fc-band.is-low')).not.toBeInTheDocument();
  });

  it('provides a <details> table alternative with all band numbers + current price', () => {
    renderResult();
    const summary = screen.getByText(/View as table/);
    const details = summary.closest('details') as HTMLElement;
    expect(details).toBeInTheDocument();
    const table = within(details).getByRole('table');
    expect(within(table).getByText('Rs. 552')).toBeInTheDocument();
    expect(within(table).getByText('Rs. 233')).toBeInTheDocument();
    expect(within(table).getByText('Rs. 694')).toBeInTheDocument();
    expect(within(table).getByText('Rs. 460')).toBeInTheDocument(); // current price
  });

  it('surfaces a provenance line', () => {
    renderResult();
    expect(screen.getByText(/Source: HARTI/)).toBeInTheDocument();
    expect(screen.getByText(/Prices as of/)).toBeInTheDocument();
  });
});
