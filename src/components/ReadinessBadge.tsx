// =============================================================================
// ReadinessBadge — the crop-status colouring's glyph+label chip (2026-07-22).
// Colour is NEVER the sole signal (tokens.css law): the tint always ships with
// a glyph AND a word. `compact` keeps only the glyph visible (tight surfaces
// like Compare chips). status=null renders NOTHING (readiness unknown -> no
// claim). Green = model-served "good forecast"; amber = fallback-served
// "collecting data" — red stays reserved for "Not recommended".
//
// `ariaHidden` (REQUIRED inside any named control): when the badge sits inside
// a button/label, its text would otherwise JOIN the control's accessible name
// ("Beans Collecting data") — the exact name-pollution the Logs tab tooltips
// avoid. Callers hide the badge from the a11y tree and attach the status as the
// control's DESCRIPTION via aria-describedby -> a sibling sr-only span instead.
// =============================================================================
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
