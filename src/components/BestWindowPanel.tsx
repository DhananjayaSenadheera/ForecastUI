// BestWindowPanel — "when should I plant to sell into a good price?"
// The strip lives INSIDE the forecast result, under "Likely price range": each bar is one
// candidate planting date and activating it re-runs the forecast in place. That is what
// makes it a control rather than a poster, and it puts the bars beside the hero price and
// the range they have to be read against.
// Honesty rules the API is built to support:
//   - rankable=false means the forecast genuinely cannot tell these dates apart. Render
//     the reason and NOTHING else: no bars, no greyed-out "best guess".
//   - bar heights use a MIN-MAX scale, not a zero baseline, because a real seasonal spread
//     is only a few percent. That makes them a ranking cue, not a magnitude claim, so the
//     magnitude is always ALSO stated in words and the axis ends carry real prices.
//   - the caveat that this ranks TIMING (today's prices and weather held constant) is
//     shown every time, not buried in a tooltip.
//   - never encouragement when the verdict is a loss: if NO SINGLE DATE beats today's
//     price we still show the window (least-bad timing is real information) but flip the
//     tint to warn, add a worded warning and drop the "% better" line to a neutral
//     comparison. Note "no single date", not "the window mean" — see the gate below.
// Text alternative: each bar is a real <button> whose aria-label names the planting date,
// the harvest date AND the price, and the strip is one tab stop with roving arrow-key
// focus. There is no table any more, so those labels and the roving tabindex ARE the
// non-visual path — never trim them and never give every bar tabIndex=0. The hover/focus
// tooltip is aria-hidden enhancement: it repeats what the button already announces.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarvestWindow, HarvestWindowPoint } from '../api/types';
import { formatPrice, formatDate } from '../lib/format';

export interface BestWindowPanelProps {
  window: HarvestWindow | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Applies a planting date ("YYYY-MM-DD"): fills the date field and, in the
   *  embedded position, re-runs the forecast for that date. */
  onPickDate: (plantDate: string) => void;
  /** The date currently in the date field, so the strip can mark it. */
  selectedDate?: string | null;
  /** Localized crop name from the picker; falls back to the payload cropName. */
  cropLabel?: string | null;
  /**
   * Rendered INSIDE the forecast result rather than standalone. PRESENTATION ONLY — it
   * must never decide whether a warning is safe to drop. The not-rankable branch drops its
   * own title (the embedding block supplies the heading) and the tap hint says what
   * activating a bar does here: re-forecast, not "fill the field below".
   */
  embedded?: boolean;
  /**
   * The caller PROVES that a verdict already on screen states the loss — the only
   * condition under which this panel may stay silent about it. Defaults to false.
   * It is a proof obligation, not a position flag: "it is embedded" does NOT imply "a
   * verdict is saying it". Three states break that assumption:
   *   (a) the −5% DEADBAND, and it is the common case: this panel warns when
   *       max(points) < currentPrice, while the API only says "Not recommended" below −5%,
   *       so a sweep sitting 0–5% under today renders "roughly flat versus today" while
   *       every date on the strip loses money;
   *   (b) the ERROR branch: the forecast failed but the window data is fine, so the strip
   *       paints with no verdict at all;
   *   (c) the FIRST-LOAD skeleton: the window is pre-fetched on crop select, so the strip
   *       is fully painted before any verdict exists.
   * In all three the tint would be carrying the loss alone (WCAG 1.4.1).
   */
  lossCarriedByVerdict?: boolean;
}

// Below this the difference between the best and an average date is too small to
// present as a recommendation worth acting on — we still show the strip, but the
// copy stops short of urging a change.
const SMALL_UPLIFT_PCT = 1;

/** What the hover/focus readout shows, plus where to hang it. */
interface BarTip {
  key: string;
  /** Bar centre, in px from the strip wrapper's left edge (survives scrolling). */
  left: number;
  /** Anchoring zone — keeps the card inside the wrapper at both ends. */
  zone: 'start' | 'mid' | 'end';
  /** Pointer tips die on scroll (their anchor goes stale); keyboard tips do not,
   *  because moving focus re-anchors them. */
  mode: 'pointer' | 'key';
  plant: string;
  harvest: string;
  price: string;
}

export default function BestWindowPanel({
  window: win,
  loading,
  error,
  onRetry,
  onPickDate,
  selectedDate,
  cropLabel,
  embedded = false,
  lossCarriedByVerdict = false,
}: BestWindowPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const rs = t('common.rs');

  const points = win?.points ?? [];

  // Roving tabindex: the strip is ONE tab stop and arrow keys move between bars. 91
  // separate tab stops would make the rest of the page unreachable by keyboard.
  const bestIndex = useMemo(() => points.findIndex((p) => p.inBestWindow), [points]);
  const [activeIdx, setActiveIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  // Park the roving focus on the recommendation by default — the most useful
  // starting point for someone arrowing through.
  useEffect(() => {
    setActiveIdx(bestIndex >= 0 ? bestIndex : 0);
  }, [bestIndex]);

  // At phone widths the strip scrolls, so bring the recommended window into view instead of
  // leaving the farmer to swipe for it. scrollLeft, never scrollIntoView: the latter would
  // scroll the PAGE and yank the panel around under them.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || bestIndex < 0) return;
    if (strip.scrollWidth <= strip.clientWidth) return; // not scrolling — nothing to do
    const bar = strip.querySelectorAll<HTMLButtonElement>('.bw-bar')[bestIndex];
    if (!bar) return;
    strip.scrollLeft = Math.max(0, bar.offsetLeft - strip.clientWidth / 2 + bar.offsetWidth / 2);
  }, [bestIndex, points.length]);

  // The bars are HTML, not SVG, so the shared useChartTooltip hook (which hit-tests pointer
  // position against viewBox coordinates and owns its own arrow-key stepping) buys nothing
  // here and would fight the roving tabindex. We reuse the .ct-tip card and its tokens and
  // anchor off each bar's own rect, which stays right while the strip scrolls on a phone.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<BarTip | null>(null);

  const showTip = useCallback(
    (el: HTMLElement, p: HarvestWindowPoint, mode: 'pointer' | 'key') => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wr = wrap.getBoundingClientRect();
      const br = el.getBoundingClientRect();
      // Clamped to the wrapper: a bar can be half scrolled out of the strip on a
      // phone, and an anchor outside the panel would push the card off-page.
      const raw = br.left - wr.left + br.width / 2;
      const left = wr.width > 0 ? Math.min(Math.max(raw, 0), wr.width) : raw;
      // Ratio decides the anchor so the card can never hang off the panel (and so
      // the page never gains a horizontal scrollbar at 375px).
      const ratio = wr.width > 0 ? left / wr.width : 0.5;
      setTip({
        key: p.plantDate,
        left,
        zone: ratio < 0.33 ? 'start' : ratio > 0.67 ? 'end' : 'mid',
        mode,
        plant: t('bestWindow.tipPlant', { date: formatDate(p.plantDate, lang) }),
        harvest: t('bestWindow.tipHarvest', { date: formatDate(p.harvestDate, lang) }),
        price: t('bestWindow.tipPrice', { price: formatPrice(p.predictedPrice, lang, rs) }),
      });
    },
    [lang, rs, t],
  );

  const hideTip = useCallback(() => setTip(null), []);

  const onStripKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // WCAG 1.4.13: content shown on hover/focus must be dismissible without
      // moving focus.
      if (e.key === 'Escape') {
        setTip(null);
        return;
      }
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

  // Compact error note: fail-soft, the picker above still works.
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

  // Loading skeleton, the same height as the real strip so there is no layout shift.
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

  // Honest not-rankable state.
  // The reason CODE is what gets translated; the server's English `explanation` is only a
  // defaultValue, so an unknown code still says something true instead of a raw token.
  if (!win.rankable || points.length === 0 || !win.best) {
    return (
      <div className="bw bw--unranked">
        {/* Embedded, the heading right above this line already says it. */}
        {!embedded && <p className="bw__title">{t('bestWindow.title')}</p>}
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

  // currentPrice <= 0 (or an API build without the field) means UNKNOWN, not free:
  // no "Rs. 0" caption and no below-today claim we cannot stand behind.
  const currentPrice = win.currentPrice ?? 0;
  const hasCurrent = currentPrice > 0;
  const currentStr = hasCurrent ? formatPrice(currentPrice, lang, rs) : '';
  // The honest case: even our best window is a loss against selling today. The forecast
  // screen calls this "Not recommended", and the two must not disagree.
  // GATED ON `hi`, THE TOP OF THE STRIP — never on best.predictedPrice, which is the
  // rolling MEAN of the window's p50s: a window straddling today would fire this warning
  // while the strip still holds a date worth taking. The sentence says "even at the best
  // time", so it may only appear when no SINGLE date beats today.
  const belowToday = hasCurrent && hi < currentPrice;

  const summary = t('bestWindow.summaryAria', {
    crop: name,
    plant: plantRange,
    harvest: harvestRange,
    price: bestPriceStr,
  });

  return (
    <div className="bw">
      {/* Caption, not a second title: the section <h2> on the page already says
          "Best time to harvest" and keeping its accessible name fixed matters
          more than repeating it here. This line carries what changes — which crop
          and what today costs, the number every figure below is judged against.
          Deliberately NOT rendered in the not-rankable state above: a price shown
          beside "we cannot rank these dates" invites being read as a forecast. */}
      <p className="bw__caption">
        <span className="bw__caption-crop">{name}</span>
        {hasCurrent && (
          <>
            <span className="bw__caption-sep" aria-hidden="true">|</span>
            <span className="sr-only">{t('bestWindow.captionNow')} </span>
            <span className="bw__caption-price">{currentStr}</span>
          </>
        )}
      </p>
      <p className="bw__lead">{t('bestWindow.lead', { crop: name })}</p>

      {/* The verdict, in words. Never only in bar heights. */}
      <div className={`bw-verdict${belowToday ? ' is-below' : ''}`}>
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

      {/* Colour is never the message: warn tint + ⚠ + the sentence itself.
          The sentence is dropped ONLY when the caller has proved that a verdict on
          screen is already stating the loss (see `lossCarriedByVerdict`) — never
          merely because the panel is embedded. The tint and the softened uplift
          line always stay, so nothing here can read as good news; but a tint plus
          a hedge is not a statement of loss, so on its own it is not enough. */}
      {belowToday && !lossCarriedByVerdict && (
        <p className="bw-below" role="note">
          <span aria-hidden="true">⚠️ </span>
          {t('bestWindow.belowToday', { price: currentStr })}
        </p>
      )}

      <p className={`bw-uplift${smallDiff ? ' is-small' : ''}${belowToday ? ' is-below' : ''}`}>
        {smallDiff
          ? t('bestWindow.upliftSmall')
          : belowToday
            ? // "9% better than average" reads like good news; when every date loses money
              // it has to say what it is — a comparison inside this strip, not a gain.
              t('bestWindow.upliftBelow', { pct: best.upliftPct.toFixed(1) })
            : t('bestWindow.uplift', { pct: best.upliftPct.toFixed(1) })}
      </p>

      {/* The strip. Heights rank the dates, they do not measure (see the header). */}
      <div className="bw-stripwrap" ref={wrapRef}>
        <div
          className="bw-strip"
          ref={stripRef}
          role="group"
          aria-label={summary}
          onKeyDown={onStripKeyDown}
          // A pointer tip's anchor goes stale the moment the strip scrolls under
          // it; a keyboard tip re-anchors on the next focus, so it survives.
          onScroll={() => setTip((cur) => (cur && cur.mode === 'pointer' ? null : cur))}
        >
          {points.map((p, i) => (
            <button
              key={p.plantDate}
              type="button"
              className={
                'bw-bar' +
                (p.inBestWindow ? ' is-best' : '') +
                (selectedDate === p.plantDate ? ' is-selected' : '') +
                (tip?.key === p.plantDate ? ' is-hovered' : '')
              }
              style={{ height: `${heightPct(p.predictedPrice)}%` }}
              tabIndex={i === activeIdx ? 0 : -1}
              aria-pressed={selectedDate === p.plantDate}
              aria-label={t('bestWindow.barAria', {
                plant: formatDate(p.plantDate, lang),
                harvest: formatDate(p.harvestDate, lang),
                price: formatPrice(p.predictedPrice, lang, rs),
              })}
              onFocus={(e) => {
                setActiveIdx(i);
                showTip(e.currentTarget, p, 'key');
              }}
              onBlur={hideTip}
              onMouseEnter={(e) => showTip(e.currentTarget, p, 'pointer')}
              onMouseLeave={hideTip}
              onClick={() => onPickDate(p.plantDate)}
            />
          ))}
        </div>

        {/* Enhancement only: aria-hidden because the button's own label already
            announces these three values. pointer-events:none (from .ct-tip) keeps
            it from ever swallowing the tap that applies the date. */}
        {tip && (
          <div className={`ct-tip bw-tip bw-tip--${tip.zone}`} style={{ left: `${tip.left}px` }} aria-hidden="true">
            <span className="ct-tip__name">{tip.plant}</span>
            <span className="ct-tip__label">{tip.harvest}</span>
            <span className="ct-tip__price">{tip.price}</span>
          </div>
        )}
      </div>

      <div className="bw-axis" aria-hidden="true">
        <span>{formatDate(points[0].plantDate, lang)}</span>
        <span className="bw-axis__scale">
          {formatPrice(lo, lang, rs)} – {formatPrice(hi, lang, rs)}
        </span>
        <span>{formatDate(points[points.length - 1].plantDate, lang)}</span>
      </div>

      {/* Say what the control DOES. Embedded, a bar does not fill a field further
          down the page — it re-runs the forecast above, in place. */}
      <p className="bw-hint">{t(embedded ? 'bestWindow.tapHintForecast' : 'bestWindow.tapHint')}</p>

      {/* The caveat is permanent copy, not a tooltip: this ranks timing only. */}
      <p className="bw-caveat" role="note">
        <span aria-hidden="true">ℹ️ </span>
        {t('bestWindow.timingOnly')}
      </p>
    </div>
  );
}
