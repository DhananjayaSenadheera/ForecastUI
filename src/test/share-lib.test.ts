import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../i18n';
import { composeShareText } from '../lib/share';
import { fxHarvestForecast, fxHarvestForecastLow, fxHarvestForecastMedium } from '../api/fixtures';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;

describe('composeShareText (FE-11)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('composes crop, harvest date, marked range, confidence, source and app name from the payload', () => {
    const text = composeShareText({ forecast: fxHarvestForecast, cropLabel: 'Capsicum', lang: 'en', t });
    // crop + harvest date line
    expect(text).toContain('Capsicum');
    expect(text).toMatch(/harvest around/i);
    // centre marked + range (never a bare number)
    expect(text).toContain('Rs. 552'); // predicted centre
    expect(text).toContain('Rs. 233'); // lower bound
    expect(text).toContain('Rs. 694'); // upper bound
    // confidence display word (High -> "Good")
    expect(text).toContain('Good');
    // provenance reuses the app's source wording + app name
    expect(text).toContain('Source: HARTI');
    expect(text.trimEnd().endsWith('AgriForecast')).toBe(true);
  });

  it('OMITS the low-trust caveat on a High-confidence forecast', () => {
    const text = composeShareText({ forecast: fxHarvestForecast, cropLabel: 'Capsicum', lang: 'en', t });
    expect(text).not.toContain('rough estimate only');
  });

  it('INCLUDES the low-trust caveat on a Low/lowTrust forecast', () => {
    const text = composeShareText({ forecast: fxHarvestForecastLow, cropLabel: 'Passion Fruit', lang: 'en', t });
    expect(text).toContain('rough estimate only');
    expect(text).toContain('Low'); // confidence word
    expect(text).toContain('Passion Fruit');
  });

  it('keeps the text in the user’s current language', async () => {
    await i18n.changeLanguage('si');
    const text = composeShareText({ forecast: fxHarvestForecastMedium, cropLabel: 'බෝංචි', lang: 'si', t });
    expect(text).toContain('බෝංචි');
    expect(text).toContain('රු.'); // Sinhala rupee label
    expect(text).toContain('සාධාරණයි'); // Medium -> "Fair" in Sinhala
    await i18n.changeLanguage('en');
  });

  it('never fabricates a harvest date when the payload lacks one', () => {
    const noDate = { ...fxHarvestForecast, harvestDate: null };
    const text = composeShareText({ forecast: noDate, cropLabel: 'Capsicum', lang: 'en', t });
    expect(text).toContain('harvest forecast'); // no-date variant line
    expect(text).not.toMatch(/harvest around/i);
  });
});
