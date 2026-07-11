import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../i18n';
import WhyForecast from '../components/WhyForecast';
import { fxHarvestForecast, fxHarvestForecastLow } from '../api/fixtures';
import type { ForecastFactor } from '../api/types';

const CODES = ['recent_price_trend', 'festival_demand', 'seasonal_supply', 'weather_monsoon'];
const LOCALES = ['en', 'si', 'ta'] as const;

function expand() {
  fireEvent.click(screen.getByRole('button', { name: /Why this forecast/i }));
}

describe('WhyForecast (FE-6)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders one structured row per factor with direction glyph + WORD', () => {
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="ignored" />);
    expand();
    expect(document.querySelectorAll('.wf-factor').length).toBe(4);
    // localized label (from the code), not the raw code
    expect(screen.getByText('Recent price trend')).toBeInTheDocument();
    expect(screen.getByText('Festival demand')).toBeInTheDocument();
    // direction word accompanies the glyph (never color/glyph-only)
    expect(screen.getAllByText('Pushes price up').length).toBeGreaterThan(0);
    expect(screen.getByText('Mixed effect')).toBeInTheDocument(); // the neutral factor
  });

  it('scales weight bars on a shared panel scale (max weight = full bar)', () => {
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="ignored" />);
    expand();
    // Capsicum weights 0.9 / 0.7 / 0.5 / 0.3 -> max 0.9 -> 100% and 33.33%
    expect(screen.getByLabelText('Relative strength 100 percent')).toBeInTheDocument();
    expect(screen.getByLabelText('Relative strength 33 percent')).toBeInTheDocument();
    const fills = document.querySelectorAll<HTMLElement>('.wf-factor__barfill');
    expect(fills[0].style.width).toBe('100%');
    expect(fills[3].style.width.startsWith('33.33')).toBe(true);
  });

  it('falls back to the raw code (muted) for an unknown reason code, unbroken', () => {
    const factors: ForecastFactor[] = [{ code: 'totally_unknown_xyz', direction: 'up', weight: 1 }];
    render(<WhyForecast factors={factors} explanation="ignored" />);
    expand();
    const raw = screen.getByText('totally_unknown_xyz');
    expect(raw).toBeInTheDocument();
    expect(raw.className).toContain('wf-factor__label--raw');
    // still a real row, direction word still present
    expect(document.querySelectorAll('.wf-factor').length).toBe(1);
    expect(screen.getByText('Pushes price up')).toBeInTheDocument();
  });

  it('degrades to explanation + honest note when there are no factors', () => {
    render(
      <WhyForecast factors={fxHarvestForecastLow.topFactors} explanation={fxHarvestForecastLow.explanation} />,
    );
    expand();
    expect(document.querySelectorAll('.wf-factor').length).toBe(0);
    expect(screen.getByText(fxHarvestForecastLow.explanation)).toBeInTheDocument();
    expect(screen.getByText(/don't have a detailed factor breakdown/i)).toBeInTheDocument();
  });

  it('never shows an empty panel: empty factor array still yields the honest note', () => {
    render(<WhyForecast factors={[]} explanation="Some basis." />);
    expand();
    expect(document.querySelectorAll('.wf-factor').length).toBe(0);
    expect(screen.getByText(/don't have a detailed factor breakdown/i)).toBeInTheDocument();
  });

  it('is an accessible disclosure: aria-expanded toggles and controls the region', () => {
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="ignored" />);
    const btn = screen.getByRole('button', { name: /Why this forecast/i });
    // jsdom has no matchMedia -> collapsed by default
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    const region = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(region.hasAttribute('hidden')).toBe(true);

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(within(region).getByText('Recent price trend')).toBeInTheDocument();

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(region.hasAttribute('hidden')).toBe(true);
  });

  it('has the factor code + direction label keys in every locale (translatable)', () => {
    for (const lng of LOCALES) {
      for (const code of CODES) {
        const v = i18n.getResource(lng, 'translation', `factor.codes.${code}`);
        expect(typeof v === 'string' && v.length > 0).toBe(true);
      }
      for (const dir of ['up', 'down', 'neutral']) {
        const v = i18n.getResource(lng, 'translation', `factor.dir.${dir}`);
        expect(typeof v === 'string' && v.length > 0).toBe(true);
      }
      expect(typeof i18n.getResource(lng, 'translation', 'factor.title')).toBe('string');
      expect(typeof i18n.getResource(lng, 'translation', 'factor.noBreakdown')).toBe('string');
    }
  });
});
