// ReadinessBadge — the crop-status chip. Colour is never the sole signal: the tint always
// ships with a glyph AND a word. `compact` keeps only the glyph (tight surfaces like the
// Compare chips), and status=null renders NOTHING, because readiness unknown means no
// claim. Green = model-served, amber = collecting data; red stays reserved for "Not
// recommended".
// `ariaHidden` is REQUIRED inside any named control: the badge text would otherwise join
// the control's accessible name ("Beans Collecting data"). Callers hide it from the a11y
// tree and attach the status as the control's DESCRIPTION via aria-describedby instead.
import { useTranslation } from 'react-i18next';
import { readinessLabelKey, type CropReadinessStatus } from '../lib/readiness';

export default function ReadinessBadge({
  status,
  compact = false,
  ariaHidden = false,
}: {
  status: CropReadinessStatus | null;
  compact?: boolean;
  ariaHidden?: boolean;
}) {
  const { t } = useTranslation();
  if (status === null) return null;
  const label = t(readinessLabelKey(status));
  return (
    <span
      className={`rdy-badge rdy-badge--${status}${compact ? ' rdy-badge--compact' : ''}`}
      {...(ariaHidden ? { 'aria-hidden': true } : {})}
    >
      <span className="rdy-badge__glyph" aria-hidden="true">
        {status === 'ready' ? '✓' : '⏳'}
      </span>
      <span className={compact ? 'sr-only' : 'rdy-badge__label'}>{label}</span>
    </span>
  );
}
