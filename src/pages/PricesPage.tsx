// PricesPage — browse market prices for a crop in two modes, chosen by a view toggle (the
// 4-tab IA is locked, so both live inside the Prices tab):
//   • One market — a single market's daily low–high envelope (observed range).
//   • Compare    — up to 4 markets overlaid as daily mid-price lines on one shared scale,
//                  plus a sortable market × day table.
// Both chart surfaces share the hover/tap/keyboard tooltip in lib/chartTooltip.
// Markets come from GET /api/markets/get/all?hasPrices=true and each series from
// GET /api/prices/crop/{cropId}/history, so the page always fetches and ships the standard
// loading / success / empty / error states.
// An observed history is a daily low–high RANGE, never a forecast and never a fake single
// number. Market colours are the Okabe–Ito quartet assigned by SELECTION ORDER over the
// <=4 compared markets (never by price rank), because a full-list mapping would collide
// once there are 10 live markets and only 4 colours. Every chart ships a table
// alternative; geometry lives in lib/prices.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Crop, Market, PriceHistoryPoint } from '../api/types';
import { cropDisplayName } from '../lib/crops';
import { buildReadinessMap, readinessFor, type ReadinessMap } from '../lib/readiness';
import ReadinessBadge from '../components/ReadinessBadge';
import { formatDate, formatPrice } from '../lib/format';
import {
  buildMarketOverlayGeometry,
  marketColorVar,
  type MarketOverlayInput,
} from '../lib/prices';
import { ChartTooltip, useChartTooltip, type TooltipPoint } from '../lib/chartTooltip';
import TablePagination, { usePagination } from '../components/TablePagination';
// The single-market chart is a SHARED component (the portfolio's crop page renders the
// same one); `useDayLabel` travels with it so both charts here keep one date format.
import PriceLineChart, { useDayLabel } from '../components/PriceLineChart';

const VIEW_W = 640;
const VIEW_H = 220;
const OVERLAY_MAX = 4;

type ViewMode = 'one' | 'compare';

export default function PricesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [crops, setCrops] = useState<Crop[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [cropId, setCropId] = useState<string | null>(null);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [byMarket, setByMarket] = useState<Record<string, PriceHistoryPoint[]>>({});

  const [view, setView] = useState<ViewMode>('one');
  const [overlayIds, setOverlayIds] = useState<string[]>([]);
  const [capNote, setCapNote] = useState(false);

  // Crops + markets, loaded once.
  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [cs, ms] = await Promise.all([api.getCrops(), api.getMarkets()]);
      setCrops(cs);
      setMarkets(ms);
      setCropId((prev) => prev ?? cs[0]?.id ?? null);
      setMarketId((prev) => prev ?? ms.find((m) => m.isEconomicCenter)?.id ?? ms[0]?.id ?? null);
      // Default the overlay to up to 4 markets (economic centre first).
      setOverlayIds((prev) => {
        if (prev.length) return prev;
        const ordered = [...ms].sort((a, b) => Number(b.isEconomicCenter) - Number(a.isEconomicCenter));
        return ordered.slice(0, OVERLAY_MAX).map((m) => m.id);
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  // Crop-status colouring (2026-07-22). A native <select> cannot tint options,
  // so the SELECTED crop's status renders as a badge under the picker. Fail-soft.
  const [readiness, setReadiness] = useState<ReadinessMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getCropReadiness()
      .then((r) => {
        if (!cancelled) setReadiness(buildReadinessMap(r));
      })
      .catch(() => {
        /* readiness unknown -> no badge */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Price history for the selected crop across all markets.
  const loadHistories = useCallback(async (cid: string, ms: Market[]) => {
    setError(false);
    try {
      const series = await Promise.all(ms.map((m) => api.getPriceHistory(cid, m.id)));
      const next: Record<string, PriceHistoryPoint[]> = {};
      ms.forEach((m, i) => {
        next[m.id] = series[i];
      });
      setByMarket(next);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!cropId || markets.length === 0) return;
    void loadHistories(cropId, markets);
  }, [cropId, markets, loadHistories]);

  const selectedCrop = useMemo(() => crops.find((c) => c.id === cropId) ?? null, [crops, cropId]);
  const cropLabel = selectedCrop ? cropDisplayName(selectedCrop, lang) : '';
  const selectedMarket = useMemo(() => markets.find((m) => m.id === marketId) ?? null, [markets, marketId]);
  const detailHistory = (marketId && byMarket[marketId]) || [];

  // Okabe–Ito colour per SELECTED overlay market, by selection order. With 10 live markets
  // and only 4 colours a full-list mapping would collide (ids 4 apart share a colour) and
  // render two compared lines identically; keying off the <=4 selected ids guarantees 4
  // distinct colours. Swatches and overlay lines stay in sync because both read this map.
  const marketColors = useMemo(() => {
    const m = new Map<string, string>();
    overlayIds.forEach((id, i) => m.set(id, marketColorVar(i)));
    return m;
  }, [overlayIds]);

  const toggleOverlayMarket = useCallback(
    (id: string) => {
      setOverlayIds((prev) => {
        if (prev.includes(id)) {
          setCapNote(false);
          return prev.filter((x) => x !== id);
        }
        if (prev.length >= OVERLAY_MAX) {
          setCapNote(true);
          return prev;
        }
        setCapNote(false);
        return [...prev, id];
      });
    },
    [],
  );

  const overlayInputs: MarketOverlayInput[] = overlayIds
    .map((id): MarketOverlayInput | null => {
      const mk = markets.find((m) => m.id === id);
      if (!mk) return null;
      return { marketId: id, name: mk.name, history: byMarket[id] ?? [], colorVar: marketColors.get(id) };
    })
    .filter((x): x is MarketOverlayInput => x !== null);

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.prices.title')}</h1>
        <span className="topbar__updated">
          <span className="prov">{t('common.source')}</span>
        </span>
      </div>

      <section className="panel pr" aria-label={t('pages.prices.title')}>
        <p className="pr-sub">{t('pages.prices.subtitle')}</p>

        {error ? (
          <div className="pr-state" role="alert">
            <p className="pr-state__title">{t('common.errorTitle')}</p>
            <p className="pr-state__body">{t('common.errorBody')}</p>
            <button type="button" className="btn-ghost pr-state__retry" onClick={() => (cropId ? void loadHistories(cropId, markets) : void loadBase())}>
              {t('common.retry')}
            </button>
          </div>
        ) : loading ? (
          <div className="pr-skeleton" aria-busy="true">
            <p className="sr-only">{t('common.loading')}</p>
            <div className="pr-skel pr-skel--controls" />
            <div className="pr-skel pr-skel--chart" />
          </div>
        ) : (
          <>
            {/* crop select, shared by both views */}
            <div className="pr-controls">
              <label className="pr-field">
                <span className="wrap-label">{t('pages.prices.cropLabel')}</span>
                <select className="pr-select" value={cropId ?? ''} onChange={(e) => setCropId(e.target.value)}>
                  {crops.map((c) => (
                    <option key={c.id} value={c.id}>
                      {cropDisplayName(c, lang)}
                    </option>
                  ))}
                </select>
                {/* Selected crop's forecast-readiness (a <select> can't tint
                    options). aria-hidden: inside this label it would join the
                    select's accessible NAME; visually it still carries
                    glyph + word. SR users get the full status on My harvest. */}
                {cropId && <ReadinessBadge status={readinessFor(readiness, cropId)} ariaHidden />}
              </label>

              {view === 'one' && (
                <label className="pr-field">
                  <span className="wrap-label">{t('pages.prices.marketLabel')}</span>
                  <select className="pr-select" value={marketId ?? ''} onChange={(e) => setMarketId(e.target.value)}>
                    {markets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.isEconomicCenter ? ` · ${t('pages.prices.economicCentre')}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {/* view toggle: one market / compare markets */}
            <div className="pr-seg" role="group" aria-label={t('pages.prices.viewLabel')}>
              <button
                type="button"
                className={`pr-seg__btn${view === 'one' ? ' is-on' : ''}`}
                aria-pressed={view === 'one'}
                onClick={() => setView('one')}
              >
                {t('pages.prices.viewOne')}
              </button>
              <button
                type="button"
                className={`pr-seg__btn${view === 'compare' ? ' is-on' : ''}`}
                aria-pressed={view === 'compare'}
                onClick={() => setView('compare')}
              >
                {t('pages.prices.viewCompare')}
              </button>
            </div>

            {view === 'one' ? (
              <PriceLineChart history={detailHistory} cropLabel={cropLabel} marketName={selectedMarket?.name ?? ''} lang={lang} />
            ) : (
              <MarketOverlayChart
                inputs={overlayInputs}
                markets={markets}
                overlayIds={overlayIds}
                marketColors={marketColors}
                onToggle={toggleOverlayMarket}
                capNote={capNote}
                cropLabel={cropLabel}
                lang={lang}
              />
            )}

            <p className="pr-prov">
              <span className="prov">{t('common.source')}</span>
            </p>
          </>
        )}
      </section>
    </>
  );
}

// Multi-market overlay: up to 4 markets' daily mid-price on one shared scale, with direct
// line-end labels instead of a legend. A sortable market × day table is the mandatory
// alternative.
interface MarketOverlayChartProps {
  inputs: MarketOverlayInput[];
  markets: Market[];
  overlayIds: string[];
  marketColors: Map<string, string>;
  onToggle: (id: string) => void;
  capNote: boolean;
  cropLabel: string;
  lang: string;
}
function MarketOverlayChart({ inputs, markets, overlayIds, marketColors, onToggle, capNote, cropLabel, lang }: MarketOverlayChartProps) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const dayLabel = useDayLabel(lang);

  const geo = useMemo(
    () => buildMarketOverlayGeometry(inputs, { width: VIEW_W, height: VIEW_H, dayLabel }),
    [inputs, dayLabel],
  );

  const tipPoints: TooltipPoint[] = useMemo(() => {
    if (!geo) return [];
    const out: TooltipPoint[] = [];
    for (const s of geo.series) {
      s.points.forEach((p, i) => {
        const label = formatDate(p.date, lang);
        const valueText = formatPrice(p.mid, lang, rs);
        const bandText = t('tooltip.range', { min: formatPrice(p.min, lang, rs), max: formatPrice(p.max, lang, rs) });
        out.push({
          key: `${s.marketId}-${i}`,
          x: p.x,
          y: p.y,
          seriesName: s.name,
          label,
          valueText,
          bandText,
          announce: [s.name, label, valueText, bandText].join(' · '),
        });
      });
    }
    return out;
  }, [geo, lang, rs, t]);

  const tt = useChartTooltip(tipPoints, VIEW_W, VIEW_H);
  // Measured-box placement: .pr-svg is capped at 680px, the wrapper is not.
  const svgRef = useRef<SVGSVGElement>(null);

  const withData = inputs.filter((s) => s.history.length > 0);
  const summary = t('pages.prices.overlayAria', {
    crop: cropLabel,
    count: withData.length,
    markets: withData.map((s) => s.name).join(', '),
  });

  return (
    <div className="pr-chart">
      {/* market multi-select (max 4) */}
      <p className="pr-chart__title">{t('pages.prices.overlayTitle', { crop: cropLabel })}</p>
      <p className="pr-mkts__hint">{t('pages.prices.marketsHint', { max: OVERLAY_MAX })}</p>
      <div className="pr-mkts" role="group" aria-label={t('pages.prices.marketsLabel')}>
        {markets.map((m) => {
          const on = overlayIds.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className={`pr-mchip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(m.id)}
            >
              {on && <span className="pr-mchip__swatch" aria-hidden="true" style={{ background: marketColors.get(m.id) }} />}
              {m.name}
            </button>
          );
        })}
      </div>
      {capNote && (
        <p className="pr-cap" role="status">
          {t('pages.prices.marketsCap', { max: OVERLAY_MAX })}
        </p>
      )}

      {!geo ? (
        <p className="pr-empty" role="note">
          <span aria-hidden="true">🌱 </span>
          {t('pages.prices.overlayEmpty', { crop: cropLabel })}
        </p>
      ) : (
        <>
          <div className="ct-wrap">
            <svg ref={svgRef} className="pr-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={summary} {...tt.svgProps}>
              {geo.yTicks.map((tk) => (
                <g key={`y${tk.value}`}>
                  <line className="pr-grid" x1={geo.dims.plot.left} y1={tk.y} x2={geo.dims.plot.right} y2={tk.y} />
                  <text className="pr-axis" x={geo.dims.plot.left - 6} y={tk.y + 4} textAnchor="end">
                    {tk.label}
                  </text>
                </g>
              ))}
              <line className="pr-axisline" x1={geo.dims.plot.left} y1={geo.dims.plot.bottom} x2={geo.dims.plot.right} y2={geo.dims.plot.bottom} />

              {geo.series.map((s) => (
                <g key={`s${s.marketId}`}>
                  <polyline className="pr-oline" points={s.midPolyline} fill="none" style={{ stroke: s.colorVar }} />
                  {s.end && (
                    <text className="pr-oendlabel" x={s.end.x + 5} y={s.end.y + 4} style={{ fill: s.colorVar }}>
                      {s.name}
                    </text>
                  )}
                </g>
              ))}

              {tt.active && <circle className="ct-dot" cx={tt.active.x} cy={tt.active.y} r={4.5} />}

              {geo.xTicks.map((tk, i) => (
                <text key={`x${i}`} className="pr-axis pr-xtick" x={tk.x} y={geo.dims.plot.bottom + 18} textAnchor="middle">
                  {tk.label}
                </text>
              ))}
            </svg>
            <ChartTooltip point={tt.active} mode={tt.mode} viewW={VIEW_W} viewH={VIEW_H} svgRef={svgRef} />
          </div>

          <MarketDayTable inputs={withData} cropLabel={cropLabel} lang={lang} />
        </>
      )}
    </div>
  );
}

// Sortable market × day table (the overlay's alternative). aria-sort on each header
// (button in th), the same idiom as BestCropsPage.
type DayColKey = 'date' | 'market' | 'min' | 'max' | 'mid';
type SortDir = 'asc' | 'desc';
interface DayRow {
  date: string;
  market: string;
  min: number;
  max: number;
  mid: number;
}

function MarketDayTable({ inputs, cropLabel, lang }: { inputs: MarketOverlayInput[]; cropLabel: string; lang: string }) {
  const { t } = useTranslation();
  const rs = t('common.rs');
  const [sortKey, setSortKey] = useState<DayColKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const rows: DayRow[] = useMemo(() => {
    const out: DayRow[] = [];
    for (const s of inputs) {
      for (const h of s.history) {
        out.push({ date: h.date, market: s.name, min: h.minPrice, max: h.maxPrice, mid: (h.minPrice + h.maxPrice) / 2 });
      }
    }
    return out;
  }, [inputs]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let d: number;
      if (sortKey === 'date') d = a.date.localeCompare(b.date) || a.market.localeCompare(b.market);
      else if (sortKey === 'market') d = a.market.localeCompare(b.market) || a.date.localeCompare(b.date);
      else d = a[sortKey] - b[sortKey];
      return d * dir;
    });
  }, [rows, sortKey, sortDir]);

  const pager = usePagination(sorted);

  const onSort = (key: DayColKey) => {
    if (key === sortKey) setSortDir((p) => (p === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'market' ? 'asc' : 'desc');
    }
  };
  const ariaSort = (key: DayColKey): 'ascending' | 'descending' | 'none' =>
    key === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  const th = (key: DayColKey, label: string, numeric?: boolean) => (
    <th scope="col" aria-sort={ariaSort(key)} className={numeric ? 'pr-table__num' : undefined}>
      <button type="button" className={`pr-sort${key === sortKey ? ' is-active' : ''}`} onClick={() => onSort(key)} aria-label={t('pages.prices.sortBy', { col: label })}>
        <span>{label}</span>
        <span className="pr-sort__caret" aria-hidden="true">
          {key === sortKey ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );

  return (
    <details className="pr-table">
      <summary className="pr-table__summary">
        <span aria-hidden="true">📋 </span>
        {t('pages.prices.tableToggle')}
      </summary>
      <table className="pr-table__grid">
        <caption className="sr-only">{t('pages.prices.overlayTitle', { crop: cropLabel })}</caption>
        <thead>
          <tr>
            {th('date', t('pages.prices.tableDate'))}
            {th('market', t('pages.prices.tableMarket'))}
            {th('min', t('pages.prices.tableLow'), true)}
            {th('max', t('pages.prices.tableHigh'), true)}
            {th('mid', t('pages.prices.tableMid'), true)}
          </tr>
        </thead>
        <tbody>
          {pager.pageRows.map((r, i) => (
            <tr key={`${r.market}-${r.date}-${i}`}>
              <th scope="row">{formatDate(r.date, lang)}</th>
              <td>{r.market}</td>
              <td className="pr-table__num">{formatPrice(r.min, lang, rs)}</td>
              <td className="pr-table__num">{formatPrice(r.max, lang, rs)}</td>
              <td className="pr-table__num">{formatPrice(r.mid, lang, rs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination {...pager} />
    </details>
  );
}
