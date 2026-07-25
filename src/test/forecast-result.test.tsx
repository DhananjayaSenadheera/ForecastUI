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

// The slot exists so the best-planting-window strip can sit UNDER the price range
// (2026-07-25, ClickUp 86cawt9tr). It carries a control that re-runs this very
// forecast, which is why it must survive every state: dropping it in the error or
// loading branch would leave the farmer with no way to change the date that failed.
describe('ForecastResult — the window slot', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  const slot = <p>WINDOW SLOT</p>;

  it('renders below the range block and its table alternative, in the left column', () => {
    renderResult({ windowSlot: slot });
    const mounted = screen.getByText('WINDOW SLOT');
    const table = screen.getByText(/View as table/);
    expect(table.compareDocumentPosition(mounted)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Nothing may come between the band and the table that is its text equivalent.
    expect(document.querySelector('.fc-main')).toContainElement(mounted);
    expect(document.querySelector('.fc-side')).not.toContainElement(mounted);
  });

  it('survives the loading and error states', () => {
    const { unmount } = renderResult({ windowSlot: slot, loading: true, forecast: null });
    expect(screen.getByText('WINDOW SLOT')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // Every state keeps it inside .fc-main, whose min-width:0 is what stops 60+
    // bars from stretching the page at 360px.
    expect(document.querySelector('.fc-main')).toContainElement(screen.getByText('WINDOW SLOT'));
    unmount();

    renderResult({ windowSlot: slot, error: true, forecast: null });
    expect(screen.getByText('WINDOW SLOT')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(document.querySelector('.fc-main')).toContainElement(screen.getByText('WINDOW SLOT'));
  });

  it('is the SAME DOM node across all three states — the strip must never remount', () => {
    // Not cosmetic: the slot holds the window strip, a live control. Returning a
    // structurally different tree per state made React tear it down on a failed
    // re-fetch — focus fell off the tapped bar onto <body>, the roving tabindex
    // reset, and the strip's horizontal scroll position was lost on a phone.
    // Node identity across re-renders is the only way to pin that.
    const { rerender } = renderResult({ windowSlot: slot });
    const node = screen.getByText('WINDOW SLOT');
    const props = {
      forecast: fxHarvestForecast,
      onRetry: () => {},
      cropLabel: 'Capsicum',
      windowSlot: slot,
    };

    rerender(<ForecastResult {...props} loading error={false} />); // refreshing
    expect(screen.getByText('WINDOW SLOT')).toBe(node);
    rerender(<ForecastResult {...props} loading={false} error />); // failed re-fetch
    expect(screen.getByText('WINDOW SLOT')).toBe(node);
    rerender(<ForecastResult {...props} forecast={null} loading error={false} />); // fresh load
    expect(screen.getByText('WINDOW SLOT')).toBe(node);
    rerender(<ForecastResult {...props} loading={false} error={false} />); // back to success
    expect(screen.getByText('WINDOW SLOT')).toBe(node);
  });

  it('never shows stale numbers under a failed refresh', () => {
    // The error branch wins even when the previous payload is still held: a retry
    // card is honest, a price with a retry button beside it is not.
    renderResult({ windowSlot: slot, error: true, forecast: fxHarvestForecast });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(document.querySelector('.fc-hero__num')).toBeNull();
  });

  it('pauses Share while a newer forecast is in flight', () => {
    // The share text quotes a price against a planting date and carries no
    // staleness marker once it is in WhatsApp, so it must not be composable from
    // numbers that are already being replaced.
    renderResult({ windowSlot: slot, loading: true });
    expect(screen.getByRole('button', { name: /Share/ })).toBeDisabled();
    expect(screen.getByText(/Wait for the new planting date/)).toBeInTheDocument();

    renderResult({ windowSlot: slot });
    expect(screen.getAllByRole('button', { name: /Share/ })[1]).toBeEnabled();
  });

  it('keeps the previous forecast visible — and says so — while a new one loads', () => {
    // A skeleton here would unmount the strip the farmer just tapped. The numbers
    // still on screen belong to the PREVIOUS planting date, so they are announced
    // as being updated rather than silently presented as the new ones.
    renderResult({ windowSlot: slot, loading: true });
    expect(document.querySelector('.fc-hero__num')?.textContent).toBe('Rs. 552');
    expect(screen.getByText('WINDOW SLOT')).toBeInTheDocument();
    expect(screen.getByText(/Updating for the new planting date/).closest('[role="status"]')).not.toBeNull();
    expect(document.querySelector('.fc[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('shows no "Updating" chip when nothing is in flight', () => {
    renderResult({ windowSlot: slot });
    expect(screen.queryByText(/Updating for the new planting date/)).toBeNull();
    expect(document.querySelector('.fc[aria-busy="true"]')).toBeNull();
    // ...but the live region itself is already mounted and empty. A role="status"
    // element inserted at the same moment as its text is announced unreliably
    // (VoiceOver/Safari), so it must ship with the hero and only toggle content.
    const live = document.querySelector('.fc-hero__live');
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute('role', 'status');
    expect(live!.textContent).toBe('');
  });
});
