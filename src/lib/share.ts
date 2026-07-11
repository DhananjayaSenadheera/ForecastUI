// =============================================================================
// Share-a-forecast text composer (FE-11). Pure, framework-free so the composed
// plain-text summary is unit-testable and the ShareForecast component stays a
// thin shell around navigator.share / clipboard.
//
// HONEST-UNCERTAINTY RULES (mirrors lib/forecast + ForecastResult):
//   - Compose ONLY from the actual HarvestForecast payload — never invent fields.
//     No natural-frequency phrasing (the payload has no frequency), no fabricated
//     provenance: the source line reuses the SAME wording as the UI (common.source).
//   - The range is always lower–upper with the predicted CENTRE marked — never a
//     bare single number dressed up as precise.
//   - When the forecast is low-trust (confidence "Low" OR the lowTrust flag), the
//     caveat sentence is INCLUDED; on a High/trusted forecast it is OMITTED.
//   - The text stays in the user's CURRENT language: every line comes from i18n,
//     so the caller passes its live `t` + `lang`.
// =============================================================================
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
 * Compose the plain-text share summary. One fact per line, in reading order:
 * crop + harvest date, expected price with its likely range, confidence, an
 * optional low-trust caveat, the provenance line, then the app name. Every string
 * is translated so the text matches the user's current language.
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
