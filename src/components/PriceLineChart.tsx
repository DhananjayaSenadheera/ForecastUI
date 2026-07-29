// PriceLineChart — one market's daily low–high price envelope for one crop.
// Extracted from PricesPage (2026-07-27) so the portfolio's per-crop page renders the SAME
// chart from the SAME geometry instead of a second implementation that could drift; it is
// a shared component, not a portfolio one, and PricesPage still owns the multi-market
// overlay next to it.
// What it renders is OBSERVED history — never a forecast, and never a fake single number:
// the shaded band is the published daily low–high and the line is its midpoint. The
// <details> table alternative is mandatory (the numbers ARE the product), the chart carries
// an aria summary sentence, and a short series says so in words rather than pretending the
// trend is meaningful.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PriceHistoryPoint } from '../api/types';
import { formatDate, formatPrice } from '../lib/format';
import { buildPriceLineGeometry, isShortHistory } from '../lib/prices';
import { ChartTooltip, useChartTooltip, type TooltipPoint } from '../lib/chartTooltip';
import TablePagination, { usePagination } from './TablePagination';

const VIEW_W = 640;
const VIEW_H = 220;

/** Localized "MMM D" day formatter. Exported because the market-overlay chart on
 *  PricesPage shares it — one date format across both price charts. */
export function useDayLabel(lang: string): (d: Date) => string {
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-LK', {
      month: 'short',
      day: 'numeric',
    });
    return (d: Date) => fmt.format(d);
  }, [lang]);
}

// Single-market daily low–high envelope (observed history — never a forecast).
export interface PriceLineChartProps {
  history: PriceHistoryPoint[];
  cropLabel: string;
  marketName: string;
  lang: string;
  hideTable?: boolean;
}
export default function PriceLineChart({ history, cropLabel, marketName, lang ,hideTable }: PriceLineChartProps) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const dayLabel = useDayLabel(lang);
  // Table alternative pages like every other table; the chart always shows the
  // full series — pagination applies to the tabular view only.
  const pager = usePagination(history);

  const geo = useMemo(
    () => buildPriceLineGeometry(history, { width: VIEW_W, height: VIEW_H, dayLabel }),
    [history, dayLabel],
  );

  // Tooltip hit-points: one per day, value = mid, band = observed low–high.
  const tipPoints: TooltipPoint[] = useMemo(() => {
    if (!geo) return [];
    return geo.points.map((p, i) => {
      const label = formatDate(p.date, lang);
      const valueText = formatPrice(p.mid, lang, rs);
      const bandText = t('tooltip.range', { min: formatPrice(p.min, lang, rs), max: formatPrice(p.max, lang, rs) });
      return {
        key: `d${i}`,
        x: p.x,
        y: p.yMid,
        label,
        valueText,
        bandText,
        announce: [label, valueText, bandText].join(' · '),
      };
    });
  }, [geo, lang, rs, t]);

  const tt = useChartTooltip(tipPoints, VIEW_W, VIEW_H);

  if (!geo || history.length === 0) {
    return (
      <div className="pr-chart pr-chart--empty">
        <p className="pr-chart__title">{t('pages.prices.chartTitle', { crop: cropLabel, market: marketName })}</p>
        <p className="pr-empty" role="note">
          <span aria-hidden="true">🌱 </span>
          {t('pages.prices.emptyChart')}
        </p>
      </div>
    );
  }

  const short = isShortHistory(history);
  const lo = Math.min(...history.map((h) => h.minPrice));
  const hi = Math.max(...history.map((h) => h.maxPrice));
  const summary = t('pages.prices.chartAria', {
    crop: cropLabel,
    market: marketName,
    days: history.length,
    min: formatPrice(lo, lang, rs),
    max: formatPrice(hi, lang, rs),
  });

  return (
    <div className="pr-chart">
      <p className="pr-chart__title">{t('pages.prices.chartTitle', { crop: cropLabel, market: marketName })}</p>

      {short && (
        <p className="pr-thin" role="note">
          <span aria-hidden="true">ℹ️ </span>
          {t('pages.prices.shortHistory', { count: history.length })}
        </p>
      )}

      <p className="pr-keys" aria-hidden="true">
        <span className="pr-key pr-key--range">{t('pages.prices.keyRange')}</span>
        <span className="pr-key pr-key--mid">{t('pages.prices.keyMid')}</span>
      </p>

      <div className="ct-wrap">
        <svg className="pr-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={summary} {...tt.svgProps}>
          {geo.yTicks.map((tk) => (
            <g key={`y${tk.value}`}>
              <line className="pr-grid" x1={geo.dims.plot.left} y1={tk.y} x2={geo.dims.plot.right} y2={tk.y} />
              <text className="pr-axis" x={geo.dims.plot.left - 6} y={tk.y + 4} textAnchor="end">
                {tk.label}
              </text>
            </g>
          ))}
          <line className="pr-axisline" x1={geo.dims.plot.left} y1={geo.dims.plot.bottom} x2={geo.dims.plot.right} y2={geo.dims.plot.bottom} />

          {geo.bandPolygon && <polygon className="pr-band" points={geo.bandPolygon} />}
          <polyline className="pr-mid" points={geo.midPolyline} fill="none" />

          {tt.active && <circle className="ct-dot" cx={tt.active.x} cy={tt.active.y} r={4.5} />}

          {geo.xTicks.map((tk, i) => (
            <text key={`x${i}`} className="pr-axis pr-xtick" x={tk.x} y={geo.dims.plot.bottom + 18} textAnchor="middle">
              {tk.label}
            </text>
          ))}
        </svg>
        <ChartTooltip point={tt.active} mode={tt.mode} viewW={VIEW_W} viewH={VIEW_H} />
      </div>
      {!hideTable && (
      <details className="pr-table">
        <summary className="pr-table__summary">
          <span aria-hidden="true">📋 </span>
          {t('pages.prices.tableToggle')}
        </summary>
        <table className="pr-table__grid">
          <caption className="sr-only">{t('pages.prices.chartTitle', { crop: cropLabel, market: marketName })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('pages.prices.tableDate')}</th>
              <th scope="col" className="pr-table__num">{t('pages.prices.tableLow')}</th>
              <th scope="col" className="pr-table__num">{t('pages.prices.tableHigh')}</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((h) => (
              <tr key={h.date}>
                <th scope="row">{formatDate(h.date, lang)}</th>
                <td className="pr-table__num">{formatPrice(h.minPrice, lang, rs)}</td>
                <td className="pr-table__num">{formatPrice(h.maxPrice, lang, rs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination {...pager} />
      </details>
      )}
      
    </div>
  );
}
