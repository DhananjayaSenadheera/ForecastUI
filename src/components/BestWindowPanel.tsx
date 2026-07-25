// =============================================================================
// BestWindowPanel (2026-07-25) — "when should I plant to sell into a good price?"
//
// Sits on /my-harvest between the crop picker and the planting-date input, so the
// answer arrives BEFORE the decision it informs. Each bar is one candidate
// planting date; activating it fills the date field below (tap-to-apply is what
// makes this a control rather than a poster).
//
// HONESTY RULES (load-bearing — the API is built to support exactly these):
//   - rankable=false means the forecast genuinely cannot tell these dates apart.
//     We render the reason and NOTHING else. No greyed-out "best guess", no
//     bars — a farmer cannot un-plant a crop.
//   - The bar heights use a MIN-MAX scale, not a zero baseline, because a real
//     seasonal spread is a few percent and a zero-based axis would flatten it to
//     nothing. That makes the heights a ranking cue, NOT a magnitude claim — so
//     the magnitude is always ALSO stated in words (the uplift line) and the axis
//     ends are labelled with real prices. Never let the bars carry it alone.
//   - The caveat that this ranks TIMING (today's prices/weather held constant, so
//     it is not a weather forecast) is translated copy shown every time, not
//     buried in a tooltip.
//   - MANDATORY <details> table alternative: the numbers are the product, and the
//     table is also the keyboard/AT path to applying a date.
// =============================================================================
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarvestWindow, HarvestWindowPoint } from '../api/types';
import { formatPrice, formatDate } from '../lib/format';
import TablePagination, { usePagination } from './TablePagination';

export interface BestWindowPanelProps {
  window: HarvestWindow | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Applies a planting date ("YYYY-MM-DD") to the step-3 date field. */
  onPickDate: (plantDate: string) => void;
  /** The date currently in the step-3 field, so the strip can mark it. */
  selectedDate?: string | null;
  /** Localized crop name from the picker; falls back to the payload cropName. */
  cropLabel?: string | null;
}

// Below this the difference between the best and an average date is too small to
// present as a recommendation worth acting on — we still show the strip, but the
// copy stops short of urging a change.
const SMALL_UPLIFT_PCT = 1;

export default function BestWindowPanel({
  window: win,
  loading,
  error,
  onRetry,
  onPickDate,
  selectedDate,
  cropLabel,
}: BestWindowPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const rs = t('common.rs');
  const tableId = useId();

  const points = win?.points ?? [];
  const pager = usePagination(points);

  // Roving tabindex: the strip is ONE tab stop and arrow keys move between bars,
  // which is the correct pattern for a dense set of related controls (91 separate
  // tab stops would make the rest of the page unreachable by keyboard).
  const bestIndex = useMemo(() => points.findIndex((p) => p.inBestWindow), [points]);
  const [activeIdx, setActiveIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  // Park the roving focus on the recommendation by default — the most useful
  // starting point for someone arrowing through.
  useEffect(() => {
    setActiveIdx(bestIndex >= 0 ? bestIndex : 0);
  }, [bestIndex]);

  const onStripKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const last = points.length - 1;
      let next = activeIdx;
      if (e.key === 'ArrowRight') next = Math.min(activeIdx + 1, last);
      else if (e.key === 'ArrowLeft') next = Math.max(activeIdx - 1, 0);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      else return;
      e.preventDefault();
      setActiveIdx(next);
      const btn = stripRef.current?.querySelectorAll<HTMLButtonElement>('.bw-bar')[next];
      btn?.focus();
    },
    [activeIdx, points.length],
  );

  // ---- compact error note (fail-soft: the picker above still works) ----------
  if (error) {
    return (
      <div className="bw-note bw-note--error" role="alert">
        <p className="bw-note__body">
          <span aria-hidden="true">📅 </span>
          {t('bestWindow.errorNote')}
        </p>
        <button type="button" className="btn-ghost bw-note__retry" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // ---- loading skeleton (same height as the real strip — no layout shift) ----
  if (loading || !win) {
    return (
      <div className="bw bw--skeleton" aria-busy="true">
        <p className="sr-only">{t('common.loading')}</p>
        <div className="bw-skel bw-skel__title" />
        <div className="bw-skel bw-skel__strip" />
        <div className="bw-skel bw-skel__line" />
      </div>
    );
  }

  const name = cropLabel ?? win.cropName ?? '';

  // ---- honest not-rankable state --------------------------------------------
  // The reason CODE is what gets translated; the server's English `explanation`
  // is only a defaultValue so an unknown/new code still says something true
  // rather than rendering a raw snake_case token at a farmer.
  if (!win.rankable || points.length === 0 || !win.best) {
    return (
      <div className="bw bw--unranked">
        <p className="bw__title">{t('bestWindow.title')}</p>
        <p className="bw-unranked__body" role="note">
          <span aria-hidden="true">🌱 </span>
          {t(`bestWindow.reason.${win.reasonCode}`, { defaultValue: win.explanation })}
        </p>
      </div>
    );
  }

  const best = win.best;
  const prices = points.map((p) => p.predictedPrice);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const range = hi - lo || 1;
  // 22%..100% so even the cheapest date reads as a bar, not a gap.
  const heightPct = (v: number) => 22 + ((v - lo) / range) * 78;

  const plantRange = t('bestWindow.dateRange', {
    from: formatDate(best.plantStart, lang),
    to: formatDate(best.plantEnd, lang),
  });
  const harvestRange = t('bestWindow.dateRange', {
    from: formatDate(best.harvestStart, lang),
    to: formatDate(best.harvestEnd, lang),
  });
  const bestPriceStr = formatPrice(best.predictedPrice, lang, rs);
  const smallDiff = best.upliftPct < SMALL_UPLIFT_PCT;

  const summary = t('bestWindow.summaryAria', {
    crop: name,
    plant: plantRange,
    harvest: harvestRange,
    price: bestPriceStr,
  });

  return (
    <div className="bw">
      <p className="bw__title">{t('bestWindow.title')}</p>
      <p className="bw__lead">{t('bestWindow.lead', { crop: name })}</p>

      {/* ---- the verdict, in words. Never only in bar heights. ---- */}
      <div className="bw-verdict">
        <div className="bw-verdict__leg">
          <span className="bw-verdict__cap">{t('bestWindow.plantCap')}</span>
          <span className="bw-verdict__val">{plantRange}</span>
        </div>
        <span className="bw-verdict__arrow" aria-hidden="true">→</span>
        <div className="bw-verdict__leg">
          <span className="bw-verdict__cap">{t('bestWindow.harvestCap')}</span>
          <span className="bw-verdict__val">{harvestRange}</span>
        </div>
        <div className="bw-verdict__leg bw-verdict__leg--price">
          <span className="bw-verdict__cap">{t('bestWindow.expectedCap')}</span>
          <span className="bw-verdict__val">
            {bestPriceStr}
            <span className="bw-verdict__band">
              {' '}
              {t('bestWindow.bandRange', {
                min: formatPrice(best.lowerBound, lang, rs),
                max: formatPrice(best.upperBound, lang, rs),
              })}
            </span>
          </span>
        </div>
      </div>

      <p className={`bw-uplift${smallDiff ? ' is-small' : ''}`}>
        {smallDiff
          ? t('bestWindow.upliftSmall')
          : t('bestWindow.uplift', { pct: best.upliftPct.toFixed(1) })}
      </p>

      {/* ---- the strip. Heights rank; they do not measure (see header). ---- */}
      <div
        className="bw-strip"
        ref={stripRef}
        role="group"
        aria-label={summary}
        onKeyDown={onStripKeyDown}
      >
        {points.map((p, i) => (
          <button
            key={p.plantDate}
            type="button"
            className={
              'bw-bar' +
              (p.inBestWindow ? ' is-best' : '') +
              (selectedDate === p.plantDate ? ' is-selected' : '')
            }
            style={{ height: `${heightPct(p.predictedPrice)}%` }}
            tabIndex={i === activeIdx ? 0 : -1}
            aria-pressed={selectedDate === p.plantDate}
            aria-label={t('bestWindow.barAria', {
              plant: formatDate(p.plantDate, lang),
              harvest: formatDate(p.harvestDate, lang),
              price: formatPrice(p.predictedPrice, lang, rs),
            })}
            onFocus={() => setActiveIdx(i)}
            onClick={() => onPickDate(p.plantDate)}
          />
        ))}
      </div>

      <div className="bw-axis" aria-hidden="true">
        <span>{formatDate(points[0].plantDate, lang)}</span>
        <span className="bw-axis__scale">
          {formatPrice(lo, lang, rs)} – {formatPrice(hi, lang, rs)}
        </span>
        <span>{formatDate(points[points.length - 1].plantDate, lang)}</span>
      </div>

      <p className="bw-hint">{t('bestWindow.tapHint')}</p>

      {/* The caveat is permanent copy, not a tooltip: this ranks timing only. */}
      <p className="bw-caveat" role="note">
        <span aria-hidden="true">ℹ️ </span>
        {t('bestWindow.timingOnly')}
      </p>

      {/* MANDATORY table alternative — also the keyboard path to applying a date. */}
      <details className="bw-table">
        <summary className="bw-table__summary">
          <span aria-hidden="true">📋 </span>
          {t('bestWindow.tableToggle')}
        </summary>
        <table className="bw-table__grid" aria-describedby={tableId}>
          <caption id={tableId} className="sr-only">
            {t('bestWindow.title')}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('bestWindow.tablePlant')}</th>
              <th scope="col">{t('bestWindow.tableHarvest')}</th>
              <th scope="col" className="bw-table__num">{t('bestWindow.tableLikely')}</th>
              <th scope="col">{t('bestWindow.tableAction')}</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((p: HarvestWindowPoint) => (
              <tr key={p.plantDate} className={p.inBestWindow ? 'is-best' : undefined}>
                <th scope="row">
                  {p.inBestWindow && <span aria-hidden="true">★ </span>}
                  {formatDate(p.plantDate, lang)}
                </th>
                <td>{formatDate(p.harvestDate, lang)}</td>
                <td className="bw-table__num">
                  <b>{formatPrice(p.predictedPrice, lang, rs)}</b>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost bw-table__use"
                    onClick={() => onPickDate(p.plantDate)}
                  >
                    {t('bestWindow.useDate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination {...pager} />
      </details>
    </div>
  );
}
