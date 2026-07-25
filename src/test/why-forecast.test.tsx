import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../i18n';
import WhyForecast from '../components/WhyForecast';
import { fxHarvestForecast, fxHarvestForecastLow } from '../api/fixtures';
import type { ForecastFactor } from '../api/types';

// Snapshot of the untouched si bundle — one test below adds Sinhala resources at
// runtime to prove the per-locale light-up, and must restore them afterwards.
const siOriginal = JSON.parse(JSON.stringify(i18n.getResourceBundle('si', 'translation')));

const CODES = ['recent_price_trend', 'festival_demand', 'seasonal_supply', 'weather_monsoon'];
const SENTENCE_CODES = [...CODES, 'market_conditions', 'economic_conditions'];
const LOCALES = ['en', 'si', 'ta'] as const;

function expand(name: RegExp = /Why this price/i) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('WhyForecast (FE-6)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders one row per factor, each a full causal sentence (cause + consequence)', () => {
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="ignored" cropLabel="Capsicum" />);
    expand();
    expect(document.querySelectorAll('.wf-factor').length).toBe(4);
    // cause -> consequence -> direction, in one sentence. Never a bare topic.
    expect(
      screen.getByText(/Capsicum prices have been climbing in recent weeks\. That lifts the forecast\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your harvest lands close to festival time, when demand is usually higher\./),
    ).toBeInTheDocument();
    // the DOWN factor states the supply STATE, not just "pushes price down"
    expect(
      screen.getByText(
        /Your harvest lands when many farms are also harvesting\. Plenty in the market usually lowers prices\./,
      ),
    ).toBeInTheDocument();
    // the old attribution-list format is gone in English
    expect(screen.queryByText('Pushes price up')).not.toBeInTheDocument();
    expect(screen.queryByText('Pushes price down')).not.toBeInTheDocument();
  });

  it('picks the sentence by DIRECTION: up and down are different states, not one topic', async () => {
    const up: ForecastFactor[] = [{ code: 'seasonal_supply', direction: 'up', weight: 1 }];
    const { unmount } = render(<WhyForecast factors={up} explanation="x" />);
    expand();
    expect(screen.getByText(/when fewer farms are harvesting/)).toBeInTheDocument();
    expect(screen.getByText(/prices are usually better/)).toBeInTheDocument();
    unmount();

    const down: ForecastFactor[] = [{ code: 'seasonal_supply', direction: 'down', weight: 1 }];
    render(<WhyForecast factors={down} explanation="x" />);
    expand();
    expect(screen.getByText(/when many farms are also harvesting/)).toBeInTheDocument();
    expect(screen.getByText(/usually lowers prices/)).toBeInTheDocument();
  });

  it('states a neutral factor plainly ("made little difference") instead of an arrow', () => {
    const factors: ForecastFactor[] = [{ code: 'weather_monsoon', direction: 'neutral', weight: 0.01 }];
    render(<WhyForecast factors={factors} explanation="x" />);
    expand();
    expect(
      screen.getByText('Weather and monsoon made little difference this time.'),
    ).toBeInTheDocument();
    expect(document.querySelector('.wf-factor--neutral')).not.toBeNull();
    // no strength caption: the sentence already names the factor AND its size,
    // so "Weather and monsoon · small effect" underneath is pure repetition
    expect(document.querySelector('.wf-factor__caption')).toBeNull();
  });

  it('names the crop in the price-trend sentence, and stays grammatical without one', () => {
    const factors: ForecastFactor[] = [{ code: 'recent_price_trend', direction: 'down', weight: 1 }];
    const { unmount } = render(<WhyForecast factors={factors} explanation="x" cropLabel="Beans" />);
    expand();
    expect(screen.getByText(/^Beans prices have been falling/)).toBeInTheDocument();
    unmount();

    render(<WhyForecast factors={factors} explanation="x" />);
    expand();
    expect(screen.getByText(/^This crop's prices have been falling/)).toBeInTheDocument();
  });

  it('carries direction in the arrow AND the words — never colour alone', () => {
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="x" cropLabel="Capsicum" />);
    expand();
    const rows = document.querySelectorAll('.wf-factor--sentence');
    expect(rows.length).toBe(4);
    // arrow glyph present but decorative; the sentence is the accessible text
    const glyphs = document.querySelectorAll('.wf-factor__sentence .wf-factor__glyph');
    expect(glyphs.length).toBe(4);
    glyphs.forEach((g) => expect(g.getAttribute('aria-hidden')).toBe('true'));
    expect(Array.from(glyphs).map((g) => g.textContent)).toEqual(['↑', '↑', '↓', '→']);
    // leading icon is decorative too
    document
      .querySelectorAll('.wf-factor__icon')
      .forEach((i) => expect(i.getAttribute('aria-hidden')).toBe('true'));
  });

  it('states magnitude in WORDS under each sentence (bar is only supplementary)', () => {
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="x" cropLabel="Capsicum" />);
    expand();
    // shares of the DISPLAYED total (0.44/0.24/0.14/0.01 -> 0.83)
    expect(screen.getByText('Recent price trend · strong effect')).toBeInTheDocument();
    expect(screen.getByText('Festival demand · medium effect')).toBeInTheDocument();
    expect(screen.getByText('Seasonal supply · small effect')).toBeInTheDocument();
    // the neutral row is the exception — its sentence already says "little difference"
    expect(screen.queryByText('Weather and monsoon · small effect')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.wf-factor__caption').length).toBe(3);
    // the bar no longer carries meaning on its own -> decorative
    const bars = document.querySelectorAll('.wf-factor--sentence .wf-factor__bar');
    expect(bars.length).toBe(4);
    bars.forEach((b) => expect(b.getAttribute('aria-hidden')).toBe('true'));
  });

  it('crosses the strength thresholds at the right shares (40% / 20% of the displayed total)', () => {
    // total 1.0 -> 0.40 strong (at the boundary), 0.39 medium, 0.20 medium
    // (boundary), 0.01 small
    const factors: ForecastFactor[] = [
      { code: 'recent_price_trend', direction: 'up', weight: 0.4 },
      { code: 'festival_demand', direction: 'up', weight: 0.39 },
      { code: 'seasonal_supply', direction: 'down', weight: 0.2 },
      { code: 'market_conditions', direction: 'up', weight: 0.01 },
    ];
    render(<WhyForecast factors={factors} explanation="x" cropLabel="Beans" />);
    expand();
    expect(screen.getByText('Recent price trend · strong effect')).toBeInTheDocument();
    expect(screen.getByText('Festival demand · medium effect')).toBeInTheDocument();
    expect(screen.getByText('Seasonal supply · medium effect')).toBeInTheDocument();
    expect(screen.getByText('Market conditions · small effect')).toBeInTheDocument();
  });

  it('claims no magnitude when the API sends no weight — the factor name stands alone', () => {
    const factors: ForecastFactor[] = [{ code: 'market_conditions', direction: 'up' }];
    render(<WhyForecast factors={factors} explanation="x" />);
    expand();
    expect(screen.getByText(/Prices in nearby markets are running higher than usual/)).toBeInTheDocument();
    expect(screen.getByText('Market conditions')).toBeInTheDocument();
    expect(screen.queryByText(/effect$/)).not.toBeInTheDocument();
    expect(document.querySelector('.wf-factor__bar')).toBeNull();
  });

  it('scales weight bars on a shared panel scale (max weight = full bar)', () => {
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="ignored" cropLabel="Capsicum" />);
    expand();
    // Capsicum weights 0.44 / 0.24 / 0.14 / 0.01 -> max 0.44 -> 100% and ~2.3%
    const fills = document.querySelectorAll<HTMLElement>('.wf-factor__barfill');
    expect(fills.length).toBe(4);
    expect(fills[0].style.width).toBe('100%');
    expect(parseFloat(fills[1].style.width)).toBeCloseTo(54.5, 0);
    expect(parseFloat(fills[3].style.width)).toBeCloseTo(2.27, 1);
  });

  it('falls back to the raw code (muted, compact row) for an unknown reason code, unbroken', () => {
    const factors: ForecastFactor[] = [{ code: 'totally_unknown_xyz', direction: 'up', weight: 1 }];
    render(<WhyForecast factors={factors} explanation="ignored" />);
    expand();
    const raw = screen.getByText('totally_unknown_xyz');
    expect(raw).toBeInTheDocument();
    expect(raw.className).toContain('wf-factor__label--raw');
    // no sentence exists for an unknown code -> compact row, never an empty one
    expect(document.querySelectorAll('.wf-factor').length).toBe(1);
    expect(document.querySelectorAll('.wf-factor--sentence').length).toBe(0);
    expect(screen.getByText('Pushes price up')).toBeInTheDocument();
    // and the compact bar keeps its own accessible label (nothing else carries it)
    expect(screen.getByLabelText('Relative strength 100 percent')).toBeInTheDocument();
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
    render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="ignored" cropLabel="Capsicum" />);
    const btn = screen.getByRole('button', { name: /Why this price/i });
    // jsdom has no matchMedia -> collapsed by default
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    const region = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(region.hasAttribute('hidden')).toBe(true);

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(region.hasAttribute('hidden')).toBe(false);
    expect(within(region).getByText(/Capsicum prices have been climbing/)).toBeInTheDocument();

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

  it('ships an English sentence for every code in BOTH directions (no silent gap)', () => {
    for (const code of SENTENCE_CODES) {
      for (const dir of ['up', 'down']) {
        const v = i18n.getResource('en', 'translation', `factor.sentence.${code}.${dir}`);
        expect(typeof v === 'string' && v.length > 0).toBe(true);
        // hedged, never a promise
        expect(/\bwill\b/i.test(v as string)).toBe(false);
      }
    }
  });
});

// The critical i18n design: long-form causal prose ships English-first. A locale
// without it must NOT get English — it keeps the compact rendering it already has
// fully translated, and lights up per-locale when the owner adds the sentences.
describe('WhyForecast — si/ta fall back to the compact row, never to English prose', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  for (const lng of ['si', 'ta'] as const) {
    it(`${lng}: renders the translated compact format and NO English sentence`, async () => {
      await i18n.changeLanguage(lng);
      render(<WhyForecast factors={fxHarvestForecast.topFactors} explanation="x" cropLabel="Capsicum" />);
      fireEvent.click(screen.getByRole('button'));

      // compact rows only
      expect(document.querySelectorAll('.wf-factor').length).toBe(4);
      expect(document.querySelectorAll('.wf-factor--sentence').length).toBe(0);

      // the translated direction word is back, in this locale's script
      const dirUp = i18n.getResource(lng, 'translation', 'factor.dir.up') as string;
      const dirDown = i18n.getResource(lng, 'translation', 'factor.dir.down') as string;
      expect(screen.getAllByText(dirUp).length).toBe(2);
      expect(screen.getByText(dirDown)).toBeInTheDocument();
      // and the translated factor label
      expect(
        screen.getByText(i18n.getResource(lng, 'translation', 'factor.codes.seasonal_supply') as string),
      ).toBeInTheDocument();

      // NOT ONE WORD of the English sentence copy leaks through
      const panel = document.querySelector('.wf-body')!;
      expect(panel.textContent).not.toMatch(/prices have been climbing/i);
      expect(panel.textContent).not.toMatch(/farms are also harvesting/i);
      expect(panel.textContent).not.toMatch(/festival time/i);
      expect(panel.textContent).not.toMatch(/made little difference/i);
      expect(panel.textContent).not.toMatch(/effect/i); // no "strong effect" caption
      expect(panel.textContent).not.toMatch(/This crop's/i);
    });
  }

  it('gates on the ACTIVE locale, not the English fallback (i18n.exists would leak)', () => {
    // i18next resolves through fallbackLng, so this is TRUE for si even though
    // si has no such key — which is exactly the bug hasOwnTranslation prevents.
    expect(i18n.exists('factor.sentence.seasonal_supply.down', { lng: 'si' })).toBe(true);
    expect(i18n.getResource('si', 'translation', 'factor.sentence.seasonal_supply.down')).toBeUndefined();
    expect(i18n.getResource('ta', 'translation', 'factor.strength.strong')).toBeUndefined();
  });

  it('lights up per-locale the moment a locale gets its own sentence + strength word', async () => {
    // simulate the owner landing Sinhala copy for ONE factor
    i18n.addResource('si', 'translation', 'factor.sentence.market_conditions.up', 'ළඟපාත වෙළඳපොළවල මිල ඉහළයි.');
    i18n.addResource('si', 'translation', 'factor.strength.strong', 'ප්‍රබල බලපෑම');
    i18n.addResource('si', 'translation', 'factor.caption', '{{label}} · {{strength}}');
    try {
      await i18n.changeLanguage('si');
      const factors: ForecastFactor[] = [
        { code: 'market_conditions', direction: 'up', weight: 1 }, // translated -> sentence
        { code: 'seasonal_supply', direction: 'down', weight: 1 }, // not yet -> compact
      ];
      render(<WhyForecast factors={factors} explanation="x" />);
      fireEvent.click(screen.getByRole('button'));
      expect(document.querySelectorAll('.wf-factor--sentence').length).toBe(1);
      expect(screen.getByText(/ළඟපාත වෙළඳපොළවල මිල ඉහළයි\./)).toBeInTheDocument();
      expect(screen.getByText(/ප්‍රබල බලපෑම/)).toBeInTheDocument();
      expect(document.querySelector('.wf-body')!.textContent).not.toMatch(/harvesting/i);
    } finally {
      i18n.removeResourceBundle('si', 'translation');
      i18n.addResourceBundle('si', 'translation', siOriginal);
      await i18n.changeLanguage('en');
    }
  });
});
