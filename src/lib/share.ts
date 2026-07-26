// Share-a-forecast text composer. Pure so the composed plain-text summary is unit-testable
// and the component stays a thin shell around navigator.share / clipboard.
// Composed ONLY from the actual payload — never invented fields — and the source line
// reuses the same wording as the UI. The range is always lower–upper with the predicted
// centre marked. The low-trust caveat is included when confidence is "Low" or the lowTrust
// flag is set, and omitted otherwise. Every line comes from i18n, so the text stays in the
// user's current language.
import type { HarvestForecast } from '../api/types';
import { confidenceLabelKey, isLowTrust } from './forecast';
import { formatDate, formatPrice } from './format';

/** Minimal translator shape (matches react-i18next's TFunction for our use). */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface ShareTextInput {
  forecast: HarvestForecast;
  /** Localized crop name (already resolved via cropDisplayName). */
  cropLabel: string;
  /** Active language code ("en" | "si" | "ta") — drives number/date locale. */
  lang: string;
  t: Translate;
}

/**
 * Compose the plain-text share summary, one fact per line: crop + harvest date, expected
 * price with its likely range, confidence, an optional low-trust caveat, the provenance
 * line, then the app name.
 */
export function composeShareText({ forecast: f, cropLabel, lang, t }: ShareTextInput): string {
  const rs = t('common.rs');
  const unit = t('common.perKg');
  const mid = formatPrice(f.predictedPrice, lang, rs);
  const min = formatPrice(f.lowerBound, lang, rs);
  const max = formatPrice(f.upperBound, lang, rs);

  const lines: string[] = [];

  // 1 — crop + harvest date (date omitted honestly when the payload lacks it).
  lines.push(
    f.harvestDate
      ? t('share.lineCrop', { crop: cropLabel, date: formatDate(f.harvestDate, lang) })
      : t('share.lineCropNoDate', { crop: cropLabel }),
  );

  // 2 — expected centre + marked P10–P90 range (never a bare number).
  lines.push(t('share.lineExpected', { mid, unit, min, max }));

  // 3 — confidence, using the already-mapped display word (Good/Fair/Low).
  lines.push(t('share.lineConfidence', { label: t(confidenceLabelKey(f.confidence)) }));

  // 4 — low-trust caveat ONLY when the forecast is low-trust.
  if (isLowTrust(f)) lines.push(t('share.lineCaveat'));

  // 5 — provenance (same wording as the UI) + app name.
  lines.push(t('common.source'));
  lines.push(t('share.appLine', { app: t('app.name') }));

  return lines.join('\n');
}
