// =============================================================================
// PricesPage (FE-12, ClickUp Prices / wireframe W5). Browse historical market
// prices for a crop: a single-market daily low–high line, plus a cross-market
// comparison when several markets have data.
//
// FIXTURE-ONLY TODAY (API gaps #1/#2 — markets + price-history are not on the
// live .NET route yet). In LIVE mode (apiMode === 'live') or on a 501 the page
// renders the HONEST "coming soon" state — NOT an error — so navigation stays
// stable across releases. Fixture mode gets the full page.
//
// PROVISIONAL SHAPE: the price-history rows follow the fixtures' PriceHistoryPoint
// shape (date + minPrice/maxPrice). The eventual live contract (API-2) may differ;
// this page is the source of the FE proposal and adapts when the route lands.
//
// Honest display: a history is OBSERVED daily low–high, drawn as a shaded min–max
// envelope with a central line and labelled as a RANGE (never a fake single
// number). Thin/empty series get the amber note pattern. Every chart ships a
// <details> table alternative (WCAG). Market colours are the Okabe–Ito set,
// assigned by stable market id order (never by price rank). Geometry lives in
// lib/prices — tested.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, apiMode } from '../api/client';
import type { Crop, Market, PriceHistoryPoint } from '../api/types';
import { cropDisplayName } from '../lib/crops';
import { formatDate, formatPrice } from '../lib/format';
import {
  buildMarketBars,
  buildPriceLineGeometry,
  isShortHistory,
  summarizeMarkets,
} from '../lib/prices';

const VIEW_W = 640;
const VIEW_H = 220;

export default function PricesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();

  // Live mode has no markets/price-history route yet -> honest "coming soon".
  const [comingSoon, setComingSoon] = useState(apiMode === 'live');
  const [loading, setLoading] = useState(apiMode !== 'live');
  const [error, setError] = useState(false);

  const [crops, setCrops] = useState<Crop[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [cropId, setCropId] = useState<string | null>(null);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [byMarket, setByMarket] = useState<Record<string, PriceHistoryPoint[]>>({});

  // ---- crops + markets (once) ----------------------------------------------
  const loadBase = useCallback(async () => {
    if (apiMode === 'live') {
      setComingSoon(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [cs, ms] = await Promise.all([api.getCrops(), api.getMarkets()]);
      setCrops(cs);
      setMarkets(ms);
      setCropId((prev) => prev ?? cs[0]?.id ?? null);
      setMarketId((prev) => prev ?? ms.find((m) => m.isEconomicCenter)?.id ?? ms[0]?.id ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 501) setComingSoon(true);
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  // ---- price history for the selected crop across all markets ---------------
  const loadHistories = useCallback(async (cid: string, ms: Market[]) => {
    setError(false);
    try {
      const series = await Promise.all(ms.map((m) => api.getPriceHistory(cid, m.id)));
      const next: Record<string, PriceHistoryPoint[]> = {};
      ms.forEach((m, i) => {
        next[m.id] = series[i];
      });
      setByMarket(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 501) setComingSoon(true);
      else setError(true);
    }
  }, []);

  useEffect(() => {
    if (comingSoon || !cropId || markets.length === 0) return;
    void loadHistories(cropId, markets);
  }, [comingSoon, cropId, markets, loadHistories]);

  const selectedCrop = useMemo(() => crops.find((c) => c.id === cropId) ?? null, [crops, cropId]);
  const cropLabel = selectedCrop ? cropDisplayName(selectedCrop, lang) : '';
  const selectedMarket = useMemo(() => markets.find((m) => m.id === marketId) ?? null, [markets, marketId]);
  const detailHistory = (marketId && byMarket[marketId]) || [];

  // ---- coming soon (live / 501) — honest, not an error ----------------------
  if (comingSoon) {
    return (
      <>
        <div className="topbar">
          <h1 className="topbar__title">{t('pages.prices.title')}</h1>
        </div>
        <section className="panel" style={{ maxWidth: 560 }}>
          <h2 style={{ fontSize: 'var(--fs-h2)', marginBottom: 8 }}>
            🕓 {t('pages.prices.soonTitle')}
          </h2>
          <p style={{ color: 'var(--text-2)', marginBottom: 20 }}>{t('pages.prices.soonBody')}</p>
          <button type="button" className="btn-ghost" style={{ width: 'auto' }} onClick={() => navigate('/overview')}>
            ← {t('common.backHome')}
          </button>
        </section>
      </>
    );
  }

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
            {/* ---- controls: crop + market ---- */}
            <div className="pr-controls">
              <label className="pr-field">
                <span className="wrap-label">{t('pages.prices.cropLabel')}</span>
                <select
                  className="pr-select"
                  value={cropId ?? ''}
                  onChange={(e) => setCropId(e.target.value)}
                >
                  {crops.map((c) => (
                    <option key={c.id} value={c.id}>
                      {cropDisplayName(c, lang)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="pr-field">
                <span className="wrap-label">{t('pages.prices.marketLabel')}</span>
                <select
                  className="pr-select"
                  value={marketId ?? ''}
                  onChange={(e) => setMarketId(e.target.value)}
                >
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.isEconomicCenter ? ` · ${t('pages.prices.economicCentre')}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <PriceLineChart
              history={detailHistory}
              cropLabel={cropLabel}
              marketName={selectedMarket?.name ?? ''}
              lang={lang}
            />

            <MarketComparison
              markets={markets}
              byMarket={byMarket}
              cropLabel={cropLabel}
              lang={lang}
            />

            <p className="pr-prov">
              <span className="prov">{t('common.source')}</span>
            </p>
          </>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Single-market daily low–high line (observed history — never a forecast).
// ---------------------------------------------------------------------------
interface PriceLineChartProps {
  history: PriceHistoryPoint[];
  cropLabel: string;
  marketName: string;
  lang: string;
}
function PriceLineChart({ history, cropLabel, marketName, lang }: PriceLineChartProps) {
  const { t } = useTranslation();
  const rs = t('common.rs');

  const dayLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-LK', {
      month: 'short',
      day: 'numeric',
    });
    return (d: Date) => fmt.format(d);
  }, [lang]);

  const geo = useMemo(
    () => buildPriceLineGeometry(history, { width: VIEW_W, height: VIEW_H, dayLabel }),
    [history, dayLabel],
  );

  // ---- honest empty state ----
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
  const loStr = formatPrice(lo, lang, rs);
  const hiStr = formatPrice(hi, lang, rs);
  const summary = t('pages.prices.chartAria', {
    crop: cropLabel,
    market: marketName,
    days: history.length,
    min: loStr,
    max: hiStr,
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

      <svg className="pr-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={summary}>
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

        {geo.xTicks.map((tk, i) => (
          <text key={`x${i}`} className="pr-axis pr-xtick" x={tk.x} y={geo.dims.plot.bottom + 18} textAnchor="middle">
            {tk.label}
          </text>
        ))}
      </svg>

      {/* MANDATORY table alternative (WCAG). */}
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
            {history.map((h) => (
              <tr key={h.date}>
                <th scope="row">{formatDate(h.date, lang)}</th>
                <td className="pr-table__num">{formatPrice(h.minPrice, lang, rs)}</td>
                <td className="pr-table__num">{formatPrice(h.maxPrice, lang, rs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cross-market comparison — shared-scale average bars with a min–max whisker,
// Okabe–Ito by stable market id order. Renders only when 2+ markets have data.
// ---------------------------------------------------------------------------
interface MarketComparisonProps {
  markets: Market[];
  byMarket: Record<string, PriceHistoryPoint[]>;
  cropLabel: string;
  lang: string;
}
function MarketComparison({ markets, byMarket, cropLabel, lang }: MarketComparisonProps) {
  const { t } = useTranslation();
  const rs = t('common.rs');

  const summaries = useMemo(() => summarizeMarkets(markets, byMarket), [markets, byMarket]);
  const { axisMax, bars } = useMemo(() => buildMarketBars(summaries), [summaries]);

  if (bars.length < 2) return null;

  const axisMaxStr = formatPrice(axisMax, lang, rs);

  return (
    <div className="pr-cmp">
      <p className="pr-cmp__title">{t('pages.prices.comparisonTitle', { crop: cropLabel })}</p>
      <p className="pr-cmp__legend">{t('pages.prices.comparisonLegend', { max: axisMaxStr })}</p>

      <ul className="pr-cmp__list">
        {bars.map((b) => {
          const avgStr = formatPrice(b.avg, lang, rs);
          const rangeStr = t('pages.prices.rangeShort', {
            min: formatPrice(b.min, lang, rs),
            max: formatPrice(b.max, lang, rs),
          });
          return (
            <li key={b.marketId} className="pr-cmp__row">
              <span className="pr-cmp__name">{b.name}</span>
              <span
                className="pr-cmp__bar"
                role="img"
                aria-label={t('pages.prices.barAria', { market: b.name, avg: avgStr, min: formatPrice(b.min, lang, rs), max: formatPrice(b.max, lang, rs) })}
              >
                <span className="pr-cmp__track" aria-hidden="true" />
                <span className="pr-cmp__fill" style={{ width: `${b.pct}%`, background: b.colorVar }} aria-hidden="true" />
                <span className="pr-cmp__whisker" style={{ left: `${b.minPct}%`, width: `${Math.max(0, b.maxPct - b.minPct)}%` }} aria-hidden="true" />
              </span>
              <span className="pr-cmp__val">
                <span className="pr-cmp__avg">{avgStr}</span>
                <span className="pr-cmp__range">{rangeStr}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* MANDATORY table alternative (WCAG). */}
      <details className="pr-table">
        <summary className="pr-table__summary">
          <span aria-hidden="true">📋 </span>
          {t('pages.prices.tableToggle')}
        </summary>
        <table className="pr-table__grid">
          <caption className="sr-only">{t('pages.prices.comparisonTitle', { crop: cropLabel })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('pages.prices.tableMarket')}</th>
              <th scope="col" className="pr-table__num">{t('pages.prices.tableAvg')}</th>
              <th scope="col" className="pr-table__num">{t('pages.prices.tableLow')}</th>
              <th scope="col" className="pr-table__num">{t('pages.prices.tableHigh')}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.marketId}>
                <th scope="row">{b.name}</th>
                <td className="pr-table__num">{formatPrice(b.avg, lang, rs)}</td>
                <td className="pr-table__num">{formatPrice(b.min, lang, rs)}</td>
                <td className="pr-table__num">{formatPrice(b.max, lang, rs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
