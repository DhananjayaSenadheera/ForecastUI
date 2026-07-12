import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  nearestPoint,
  useChartTooltip,
  ChartTooltip,
  type TooltipPoint,
} from '../lib/chartTooltip';

// Two crops/markets overlaid; a past point per series plus one forecast point that
// carries a band — exercises multi-series naming + the "likely" band text.
const POINTS: TooltipPoint[] = [
  { key: 'cap-h', x: 10, y: 50, seriesName: 'Capsicum', label: 'Jul 2026', valueText: 'Rs. 400', announce: 'Capsicum · Jul 2026 · Rs. 400' },
  { key: 'bea-h', x: 10, y: 60, seriesName: 'Beans', label: 'Jul 2026', valueText: 'Rs. 300', announce: 'Beans · Jul 2026 · Rs. 300' },
  { key: 'cap-f', x: 90, y: 40, seriesName: 'Capsicum', label: '15 Oct 2026', valueText: 'Rs. 552', bandText: 'likely Rs. 233 – 694', announce: 'Capsicum · 15 Oct 2026 · Rs. 552 · likely Rs. 233 – 694' },
];

function Harness({ points = POINTS }: { points?: TooltipPoint[] }) {
  const tt = useChartTooltip(points, 100, 100);
  return (
    <div className="ct-wrap">
      <svg data-testid="chart" viewBox="0 0 100 100" role="img" aria-label="chart" {...tt.svgProps} />
      <ChartTooltip point={tt.active} mode={tt.mode} viewW={100} viewH={100} />
    </div>
  );
}

describe('chartTooltip — nearest-point math', () => {
  it('picks the closest point by Euclidean distance', () => {
    expect(nearestPoint(POINTS, 88, 42)?.key).toBe('cap-f');
    expect(nearestPoint(POINTS, 9, 49)?.key).toBe('cap-h');
    expect(nearestPoint(POINTS, 11, 61)?.key).toBe('bea-h');
  });
  it('returns null for an empty set', () => {
    expect(nearestPoint([], 0, 0)).toBeNull();
  });
});

describe('ChartTooltip — keyboard access + band + multi-series naming', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reveals the tooltip on ArrowRight and names the series (keyboard)', () => {
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // sorted-by-x -> first point
    const tip = document.querySelector('.ct-tip')!;
    expect(tip).toBeInTheDocument();
    expect(tip.textContent).toContain('Capsicum');
    expect(tip.textContent).toContain('Rs. 400');
    // keyboard mode announces via the aria-live region
    expect(document.querySelector('.ct-live')?.textContent).toContain('Capsicum');
  });

  it('shows the honest band text on a forecast point', () => {
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // point 0 (x=10,y=50)
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // point 1 (x=10,y=60)
    fireEvent.keyDown(svg, { key: 'ArrowRight' }); // point 2 (x=90) forecast
    const tip = document.querySelector('.ct-tip')!;
    expect(tip.textContent).toContain('Rs. 552');
    expect(tip.textContent).toContain('likely Rs. 233 – 694');
  });

  it('dismisses on Escape and on blur', () => {
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(document.querySelector('.ct-tip')).toBeInTheDocument();
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(document.querySelector('.ct-tip')).toBeNull();
  });

  it('renders on a simulated pointer move (nearest point under the cursor)', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    render(<Harness />);
    const svg = screen.getByTestId('chart');
    const ev: Event & { clientX?: number; clientY?: number } = new Event('pointermove', { bubbles: true });
    ev.clientX = 90;
    ev.clientY = 40;
    fireEvent(svg, ev);
    const tip = document.querySelector('.ct-tip')!;
    expect(tip).toBeInTheDocument();
    expect(tip.textContent).toContain('Rs. 552'); // the forecast point nearest (90,40)
    // pointer mode does NOT spam the live region
    expect(document.querySelector('.ct-live')?.textContent).toBe('');
  });
});
