// =============================================================================
// TimelineChart (FE-5, ClickUp 86cacw5x5). The 12-month price story below the
// FE-4 harvest hero: solid history line → dashed central forecast line inside a
// shaded P10–P90 band that cones out from "today", with a prominent Harvest
// marker (the decision point) and a "Today" guide.
//
// Honest-uncertainty, farmer-first (per PRD §4 + v1.1 data-viz amendments):
//   - Band is AMBER when the forecast is low-trust, teal otherwise (never dress a
//     fallback up as precise). Markers use SHAPE (▲ / dashed) not hue alone.
//   - Direct labels on the history line, band and markers — no legend-hunting.
//   - MANDATORY <details> table alternative (the number IS the product) + a
//     sentence-long aria-label summarising the trend.
//   - Honest thin-data note ("Only N months of data") — never fabricate a series.
//   - Fail-soft: if the timeline call errors the panel shows a COMPACT retry note,
//     not a full-panel failure (the FE-4 hero already succeeded).
// Geometry (band cone, marker snap, nice scale) lives in lib/timeline — tested.
// =============================================================================
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CropTimeline } from '../api/types';
import { formatPrice, formatDate } from '../lib/format';
import { buildTimelineGeometry, isShortHistory, SHORT_HISTORY_MONTHS } from '../lib/timeline';
import { ChartTooltip, useChartTooltip, type TooltipPoint } from '../lib/chartTooltip';

export interface TimelineChartProps {
  timeline: CropTimeline | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Harvest date ("YYYY-MM-DD") from the FE-4 payload; drives the harvest marker. */
  harvestDate?: string | null;
  /** Localized crop name from the picker; falls back to the payload cropName. */
  cropLabel?: string | null;
  /** Whether the forecast is low-trust (amber band). Comes from FE-4's isLowTrust. */
  lowTrust?: boolean;
}

const VIEW_W = 640;
const VIEW_H = 240;

export default function TimelineChart({ timeline, loading, error, onRetry, harvestDate, cropLabel, lowTrust }: TimelineChartProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const rs = t('common.rs');
  const tableId = useId();

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-LK', { month: 'short' });
    return (d: Date) => fmt.format(d);
  }, [lang]);

  const geo = useMemo(() => {
    if (!timeline || timeline.history.length < 1) return null;
    return buildTimelineGeometry(timeline, { width: VIEW_W, height: VIEW_H, harvestDate, monthLabel });
  }, [timeline, harvestDate, monthLabel]);

  // ---- FE-20 tooltip: past points show the month + price; forecast points also
  // show the honest "likely" band range. Values also live in the table below. ----
  const tipPoints: TooltipPoint[] = useMemo(() => {
    if (!geo || !timeline) return [];
    const out: TooltipPoint[] = [];
    geo.history.forEach((p, i) => {
      const hm = timeline.history[i];
      const [y, m] = hm.month.split('-').map(Number);
      const label = `${monthLabel(new Date(y, (m || 1) - 1, 1))} ${y}`;
      const valueText = formatPrice(p.value, lang, rs);
      out.push({ key: `h${i}`, x: p.x, y: p.y, label, valueText, announce: [label, valueText].join(' · ') });
    });
    geo.forecast.forEach((p, i) => {
      const f = timeline.forecast[i];
      const label = formatDate(f.date, lang);
      const valueText = formatPrice(p.value, lang, rs);
      const bandText = t('tooltip.likely', { min: formatPrice(p.lower, lang, rs), max: formatPrice(p.upper, lang, rs) });
      out.push({ key: `f${i}`, x: p.x, y: p.y, label, valueText, bandText, announce: [label, valueText, bandText].join(' · ') });
    });
    return out;
  }, [geo, timeline, monthLabel, lang, rs, t]);

  const tt = useChartTooltip(tipPoints, VIEW_W, VIEW_H);

  // ---- compact chart-error note (fail-soft: FE-4 hero already rendered) -------
  if (error) {
    return (
      <div className="tl-note tl-note--error" role="alert">
        <p className="tl-note__body">
          <span aria-hidden="true">📉 </span>
          {t('timeline.errorNote')}
        </p>
        <button type="button" className="btn-ghost tl-note__retry" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // ---- loading skeleton ------------------------------------------------------
  if (loading || !timeline) {
    return (
      <div className="tl tl--skeleton" aria-busy="true">
        <p className="sr-only">{t('common.loading')}</p>
        <div className="tl-skel tl-skel__title" />
        <div className="tl-skel tl-skel__chart" />
        <div className="tl-skel tl-skel__line tl-skel--short" />
      </div>
    );
  }

  const name = cropLabel ?? timeline.cropName ?? '';

  // ---- honest empty state: no usable history --------------------------------
  if (!geo) {
    return (
      <div className="tl tl--empty">
        <p className="tl__title">{t('timeline.title')}</p>
        <p className="tl-empty__body">
          <span aria-hidden="true">🌱 </span>
          {t('timeline.emptyBody')}
        </p>
      </div>
    );
  }

  const short = isShortHistory(timeline.history);
  const harvest = geo.harvest;
  const harvestPoint = harvest ? geo.forecast.find((f) => f.index === harvest.index) ?? null : null;

  const midStr = harvestPoint ? formatPrice(harvestPoint.value, lang, rs) : '';
  const loStr = harvestPoint ? formatPrice(harvestPoint.lower, lang, rs) : '';
  const hiStr = harvestPoint ? formatPrice(harvestPoint.upper, lang, rs) : '';
  const harvestDateStr = harvest ? formatDate(harvest.date, lang) : '';

  // Sentence-long summary (WCAG text alternative for the whole SVG).
  const summary = harvestPoint
    ? t('timeline.summaryAria', { crop: name, months: timeline.history.length, mid: midStr, min: loStr, max: hiStr, date: harvestDateStr })
    : t('timeline.summaryAriaNoHarvest', { crop: name, months: timeline.history.length });

  return (
    <div className={`tl${lowTrust ? ' tl--lowtrust' : ''}`}>
      <p className="tl__title">{t('timeline.title')}</p>

      {short && (
        <p className="tl-thin" role="note">
          <span aria-hidden="true">ℹ️ </span>
          {t('timeline.shortHistory', { count: timeline.history.length })}
        </p>
      )}

      {/* Direct labels — no legend-hunting (each series named on the chart). */}
      <p className="tl-keys" aria-hidden="true">
        <span className="tl-key tl-key--history">{t('timeline.keyHistory')}</span>
        <span className={`tl-key tl-key--band${lowTrust ? ' is-low' : ''}`}>{t('timeline.keyBand')}</span>
        <span className="tl-key tl-key--harvest">▲ {t('timeline.keyHarvest')}</span>
        <span className="tl-key tl-key--today">┊ {t('timeline.keyToday')}</span>
      </p>

      <div className="ct-wrap">
      <svg className={`tl-svg${lowTrust ? ' is-low' : ''}`} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={summary} {...tt.svgProps}>
        {/* y gridlines + Rs. labels */}
        {geo.yTicks.map((tk) => (
          <g key={`y${tk.value}`}>
            <line className="tl-grid" x1={geo.dims.plot.left} y1={tk.y} x2={geo.dims.plot.right} y2={tk.y} />
            <text className="tl-axis" x={geo.dims.plot.left - 6} y={(tk.y ?? 0) + 4} textAnchor="end">
              {tk.label}
            </text>
          </g>
        ))}
        {/* axis baseline */}
        <line className="tl-axisline" x1={geo.dims.plot.left} y1={geo.dims.plot.bottom} x2={geo.dims.plot.right} y2={geo.dims.plot.bottom} />

        {/* forecast uncertainty band (amber when low-trust) */}
        {geo.bandPolygon && <polygon className="tl-band" points={geo.bandPolygon} />}

        {/* history (solid) + forecast central (dashed) lines */}
        <polyline className="tl-hist" points={geo.historyPolyline} fill="none" />
        <polyline className="tl-fc" points={geo.forecastPolyline} fill="none" />

        {/* today marker */}
        <line className="tl-today" x1={geo.todayX} y1={geo.dims.plot.top} x2={geo.todayX} y2={geo.dims.plot.bottom} />

        {/* harvest marker — the decision point (prominent) */}
        {harvest && (
          <g className="tl-harvest">
            <line className="tl-harvest__line" x1={harvest.x} y1={geo.dims.plot.top} x2={harvest.x} y2={geo.dims.plot.bottom} />
            <circle className="tl-harvest__dot" cx={harvest.x} cy={harvest.y} r={6} />
            <text className="tl-harvest__label" x={harvest.x} y={geo.dims.plot.top - 10} textAnchor="middle">
              ▲ {midStr}
            </text>
          </g>
        )}

        {/* x month labels */}
        {geo.xTicks.map((tk, i) => (
          <text
            key={`x${i}`}
            className={`tl-axis tl-xtick${tk.isHarvest ? ' is-harvest' : ''}`}
            x={tk.x}
            y={geo.dims.plot.bottom + 18}
            textAnchor="middle"
          >
            {tk.label}
          </text>
        ))}

        {tt.active && <circle className="ct-dot" cx={tt.active.x} cy={tt.active.y} r={5} />}
      </svg>
        <ChartTooltip point={tt.active} mode={tt.mode} viewW={VIEW_W} viewH={VIEW_H} />
      </div>

      {/* MANDATORY table alternative (WCAG) — the number is the product. */}
      <details className="tl-table">
        <summary className="tl-table__summary">
          <span aria-hidden="true">📋 </span>
          {t('timeline.tableToggle')}
        </summary>
        <table className="tl-table__grid" aria-describedby={tableId}>
          <caption id={tableId} className="sr-only">
            {t('timeline.title')}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('timeline.tableMonth')}</th>
              <th scope="col">{t('timeline.tableType')}</th>
              <th scope="col" className="tl-table__num">{t('timeline.tableLow')}</th>
              <th scope="col" className="tl-table__num">{t('timeline.tableLikely')}</th>
              <th scope="col" className="tl-table__num">{t('timeline.tableHigh')}</th>
            </tr>
          </thead>
          <tbody>
            {timeline.history.map((h) => {
              const [y, m] = h.month.split('-').map(Number);
              const label = monthLabel(new Date(y, (m || 1) - 1, 1)) + ' ' + y;
              return (
                <tr key={`h${h.month}`}>
                  <th scope="row">{label}</th>
                  <td>{t('timeline.typePast')}</td>
                  <td className="tl-table__num" colSpan={3}>{formatPrice(h.avgPrice, lang, rs)}</td>
                </tr>
              );
            })}
            {timeline.forecast.map((f) => {
              const isHarvest = harvest?.date != null && f.date === harvest.date;
              const label = formatDate(f.date, lang);
              return (
                <tr key={`f${f.date}`} className={isHarvest ? 'is-harvest' : undefined}>
                  <th scope="row">
                    {isHarvest && <span aria-hidden="true">★ </span>}
                    {label}
                  </th>
                  <td>{isHarvest ? t('timeline.typeHarvest') : t('timeline.typeForecast')}</td>
                  <td className="tl-table__num">{formatPrice(f.lowerBound, lang, rs)}</td>
                  <td className="tl-table__num"><b>{formatPrice(f.predictedPrice, lang, rs)}</b></td>
                  <td className="tl-table__num">{formatPrice(f.upperBound, lang, rs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export { SHORT_HISTORY_MONTHS };
