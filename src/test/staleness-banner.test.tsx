import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import '../i18n';
import i18n from '../i18n';
import StalenessBanner from '../components/StalenessBanner';
import { reportFromHeaders, __resetCacheSignal } from '../api/cacheSignal';

function cacheHit(cachedAt: string) {
  act(() => {
    reportFromHeaders(new Headers({ 'X-SW-Cache': 'hit', 'X-SW-Cached-At': cachedAt }));
  });
}

describe('StalenessBanner', () => {
  beforeEach(async () => {
    __resetCacheSignal();
    await i18n.changeLanguage('en');
  });

  it('renders nothing while data is fresh', () => {
    const { container } = render(<StalenessBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a localized dated notice when the SW served cached data', () => {
    render(<StalenessBanner />);
    cacheHit('2026-07-09T06:30:00.000Z');
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(/saved prices/i);
    expect(banner.textContent).toMatch(/2026/); // locale-formatted date present
  });

  it('is dismissible, and re-appears for a newer cached snapshot', () => {
    render(<StalenessBanner />);
    cacheHit('2026-07-09T06:30:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // A newer offline snapshot must surface again (staleness is honest, not hidden).
    cacheHit('2026-07-10T06:30:00.000Z');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
