// PriceSwingBadge — "how much does this crop's price move?" as a 1/2/3-block meter plus a
// word (glyph never carries the meaning alone, and no level is red: a swinging price is a
// fact, not a bad crop).
// A NULL swing renders NOTHING. That is the honest state for a thin series — see
// lib/priceSwing: inventing "steady" from three days would be a fabricated reassurance.
// `ariaHidden` follows the ReadinessBadge contract: inside a named control the caller hides
// the badge and re-attaches the text as a DESCRIPTION, so it never joins the control's name.
import { useTranslation } from 'react-i18next';
import { swingGlyph, swingLabelKey, type PriceSwing } from '../lib/priceSwing';

export default function PriceSwingBadge({
  swing,
  ariaHidden = false,
}: {
  swing: PriceSwing | null;
  ariaHidden?: boolean;
}) {
  const { t } = useTranslation();
  if (!swing) return null;
  const word = t(swingLabelKey(swing.level));
  return (
    <span
      className={`pf-swing pf-swing--${swing.level}`}
      {...(ariaHidden ? { 'aria-hidden': true } : {})}
    >
      <span className="pf-swing__glyph" aria-hidden="true">
        {swingGlyph[swing.level]}
      </span>
      <span className="pf-swing__label">{t('portfolio.swing.summary', { level: word })}</span>
      {/* The basis of the claim, for anyone who cannot see how short the chart is. */}
      <span className="sr-only">
        {' '}
        {t('portfolio.swing.basis', { count: swing.observations })}
      </span>
    </span>
  );
}
