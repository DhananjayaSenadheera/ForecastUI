// ShareForecast — the "Share" action on a successful harvest forecast (the parent mounts it
// in the success branch only).
// Primary path is navigator.share({ text }) with a plain-text summary composed from the
// actual payload (lib/share). Fallbacks in order: clipboard.writeText with an inline
// "Copied" confirmation, then a readonly <textarea> to copy by hand. jsdom has neither
// navigator.share nor a reliable clipboard, so every access is typeof-guarded.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarvestForecast } from '../api/types';
import { composeShareText } from '../lib/share';

export interface ShareForecastProps {
  forecast: HarvestForecast;
  /** Localized crop name (already resolved via cropDisplayName). */
  cropLabel: string;
  /**
   * A newer forecast is in flight (the farmer tapped another planting date), so `forecast`
   * still describes the PREVIOUS date. Sharing is blocked until it lands: the message is
   * plain text quoting a price against a planting and harvest date, and once it is in
   * WhatsApp nothing marks it as stale.
   */
  paused?: boolean;
}

const COPIED_MS = 2500;

export default function ShareForecast({ forecast, cropLabel, paused = false }: ShareForecastProps) {
  const { t, i18n } = useTranslation();
  const pausedId = useId();
  const [copied, setCopied] = useState(false);
  const [manualText, setManualText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // The manual-copy textarea holds a message composed for the OLD planting date, so clear
  // it (and the "Copied" flash) the moment a re-run starts.
  useEffect(() => {
    if (!paused) return;
    setManualText(null);
    setCopied(false);
  }, [paused]);

  const flashCopied = useCallback(() => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, []);

  const onShare = useCallback(async () => {
    const text = composeShareText({ forecast, cropLabel, lang: i18n.language, t });
    setManualText(null);

    const nav = typeof navigator !== 'undefined' ? navigator : undefined;

    // 1 — native share sheet (mobile). A user-cancelled share throws; ignore it.
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ text });
      } catch {
        /* user dismissed the share sheet — not an error */
      }
      return;
    }

    // 2 — clipboard copy (desktop).
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        await nav.clipboard.writeText(text);
        flashCopied();
        return;
      } catch {
        /* clipboard blocked — fall through to the manual textarea */
      }
    }

    // 3 — manual copy fallback.
    setManualText(text);
  }, [forecast, cropLabel, i18n.language, t, flashCopied]);

  return (
    <div className="fc-share">
      <button
        type="button"
        className="btn-ghost fc-share__btn"
        onClick={() => void onShare()}
        disabled={paused}
        aria-describedby={paused ? pausedId : undefined}
      >
        <span className="fc-share__icon" aria-hidden="true">
          {/* share glyph */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </span>
        {t('share.button')}
      </button>

      {/* Copied confirmation — announced politely, auto-dismissed. */}
      <span className="fc-share__status" role="status" aria-live="polite">
        {copied ? t('share.copied') : ''}
      </span>

      {/* A disabled control with no reason is a dead end; say why. */}
      {paused && (
        <p className="fc-share__paused" id={pausedId}>
          {t('share.paused')}
        </p>
      )}

      {/* Manual fallback when there is no share sheet AND no clipboard. */}
      {manualText != null && (
        <label className="fc-share__manual">
          <span className="wrap-label">{t('share.copyManual')}</span>
          <textarea className="fc-share__text" readOnly rows={7} value={manualText} />
        </label>
      )}
    </div>
  );
}
