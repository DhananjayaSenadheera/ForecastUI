import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../i18n';
import TimelineChart from '../components/TimelineChart';
import { fxTimeline, fxTimelineLow } from '../api/fixtures';
import type { CropTimeline } from '../api/types';

function renderChart(overrides: Partial<React.ComponentProps<typeof TimelineChart>> = {}) {
  const onRetry = vi.fn();
  const utils = render(
    <TimelineChart
      timeline={fxTimeline}
      loading={false}
      error={false}
      onRetry={onRetry}
      harvestDate="2026-10-15"
      cropLabel="Capsicum"
      lowTrust={false}
      {...overrides}
    />,
  );
  return { ...utils, onRetry };
}

describe('TimelineChart (FE-5)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a loading skeleton (aria-busy) while the timeline loads', () => {
    renderChart({ loading: true, timeline: null });
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('fails soft: an error renders a COMPACT note + retry, not a full-panel failure', () => {
    const { onRetry } = renderChart({ error: true, timeline: null });
    const note = screen.getByRole('alert');
    expect(note).toHaveClass('tl-note');
    fireEvent.click(within(note).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders the SVG chart with a sentence-long aria-label summary', () => {
    renderChart();
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toMatch(/12-month price for Capsicum/);
    expect(svg.getAttribute('aria-label')).toMatch(/Rs\. 552/);
  });

  it('draws history line, forecast line and the uncertainty band', () => {
    renderChart();
    expect(document.querySelector('.tl-hist')).toBeInTheDocument();
    expect(document.querySelector('.tl-fc')).toBeInTheDocument();
    expect(document.querySelector('.tl-band')).toBeInTheDocument();
  });

  it('marks Today and a prominent Harvest marker', () => {
    renderChart();
    expect(document.querySelector('.tl-today')).toBeInTheDocument();
    expect(document.querySelector('.tl-harvest')).toBeInTheDocument();
    expect(document.querySelector('.tl-harvest__dot')).toBeInTheDocument();
    // harvest label carries the expected central price
    expect(document.querySelector('.tl-harvest__label')?.textContent).toContain('Rs. 552');
  });

  it('provides the <details> table alternative, paged at 10 rows (history then forecast)', () => {
    renderChart();
    const summary = screen.getByText(/View as table/);
    const details = summary.closest('details') as HTMLElement;
    const table = within(details).getByRole('table');
    // 12 history + 3 forecast = 15 rows total -> page 1 shows 10 (+1 header row)
    expect(within(table).getAllByRole('row').length).toBe(10 + 1);
    expect(within(details).getByText('1 of 2')).toBeInTheDocument();
    // page 2 carries the remaining history + the 3 forecast rows incl. harvest
    fireEvent.click(within(details).getByLabelText('Next page'));
    expect(within(table).getAllByRole('row').length).toBe(5 + 1);
    expect(within(table).getByText('Rs. 552')).toBeInTheDocument();
    expect(within(table).getByText('Rs. 233')).toBeInTheDocument(); // P10 at harvest
    expect(within(table).getByText('Rs. 694')).toBeInTheDocument(); // P90 at harvest
  });

  it('applies the amber low-trust treatment only when low-trust', () => {
    const { unmount } = renderChart({ timeline: fxTimelineLow, cropLabel: 'Passion Fruit', lowTrust: true });
    expect(document.querySelector('.tl-svg.is-low')).toBeInTheDocument();
    unmount();
    renderChart();
    expect(document.querySelector('.tl-svg.is-low')).not.toBeInTheDocument();
  });

  it('shows an honest short-history note ("Only N months") for a thin series', () => {
    renderChart({ timeline: fxTimelineLow, cropLabel: 'Passion Fruit', lowTrust: true });
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/Only 4 months of price data/)).toBeInTheDocument();
  });

  it('shows an honest empty state (no fabricated series) when history is absent', () => {
    const empty: CropTimeline = { ...fxTimeline, history: [] };
    renderChart({ timeline: empty });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/No price history yet/)).toBeInTheDocument();
  });
});
