// =============================================================================
// OverviewPage (FE-1, ClickUp Overview / dashboard sample A). The landing "market
// overview" dashboard: KPI tiles answer "what changed?" in a glance, then a movers
// panel (risers/fallers), a latest-prices strip with per-row sparklines, and a
// best-crops teaser. Honest subset of sample A — we render ONLY what the API returns.
//
// DATA SOURCES (two parallel, independently-failing fetches):
//   1. getMarketOverview(30) -> KPIs + movers + latest prices. Shares ONE loading/
//      error/retry (it is one endpoint). asOf === null => honest "no data yet".
//   2. getBestCrops(3)       -> best-crops teaser. FAIL-SOFT: its error shows a small
//      inline note and must NOT sink the page (MyHarvestPage timeline pattern).
//
// HONEST-DISPLAY RULES: movers show direction as glyph + word in NEUTRAL colour (RED
// stays reserved for the "Not recommended" verdict); every sparkline carries an aria
// sentence + the panel ships a <details> numeric table alternative (the number is the
// product, never chart-only); no fabricated values, no internal task IDs in copy.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { BestCrop, MarketLatestPrice, MarketMover, MarketOverview } from '../api/types';
import { formatDate, formatPrice, mapVerdict } from '../lib/format';
import { biggestMover, moverGlyph, moverDirectionKey, overviewHasData, partitionMovers } from '../lib/overview';
import { buildSparkline } from '../lib/prices';

const WINDOW_OPTS = [7, 30, 90] as const;
const DEFAULT_WINDOW = 30;
const TEASER_COUNT = 3;
const SPARK_W = 100;
const SPARK_H = 24;

/** Verdict glyph — paired with the text label so colour is never the sole signal (FE-7 idiom). */
const VERDICT_GLYPH: Record<string, string> = {
  good: '✓',
  neutral: '•',
  warn: '⚠',
  critical: '✕',
};

export default function OverviewPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  // ---- source 1: market overview (KPIs + movers + latest prices) ----
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW);
  const [ov, setOv] = useState<MarketOverview | null>(null);
  const [ovLoading, setOvLoading] = useState(true); // initial-only full skeleton
  const [ovBusy, setOvBusy] = useState(false); // window-switch refetch (keep last data)
  const [ovError, setOvError] = useState(false);
  const hasLoadedRef = useRef(false);

  // A window switch keeps the last snapshot visible under a subtle busy state
  // (aria-busy) rather than blanking the page; only the very first load skeletons.
  const loadOverview = useCallback(async (days: number) => {
    setOvError(false);
    if (hasLoadedRef.current) setOvBusy(true);
    else setOvLoading(true);
    try {
      setOv(await api.getMarketOverview(days));
      hasLoadedRef.current = true;
    } catch {
      setOvError(true);
    } finally {
      setOvLoading(false);
      setOvBusy(false);
    }
  }, []);

  const onWindow = useCallback((days: number) => {
    setWindowDays((cur) => (cur === days ? cur : days));
  }, []);

  // ---- source 2: best-crops teaser (independent, fail-soft) ----
  const [teaser, setTeaser] = useState<BestCrop[]>([]);
  const [bcLoading, setBcLoading] = useState(true);
  const [bcError, setBcError] = useState(false);

  const loadTeaser = useCallback(async () => {
    setBcLoading(true);
    setBcError(false);
    try {
      setTeaser(await api.getBestCrops(TEASER_COUNT));
    } catch {
      setBcError(true);
    } finally {
      setBcLoading(false);
    }
  }, []);

  // Refetch when the window changes; the teaser is independent (mount only).
  useEffect(() => {
    void loadOverview(windowDays);
  }, [loadOverview, windowDays]);

  useEffect(() => {
    void loadTeaser();
  }, [loadTeaser]);

  const hasData = ov !== null && overviewHasData(ov);

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.overview.title')}</h1>
        <span className="topbar__updated">
          <span className="prov">{t('common.source')}</span>
        </span>
      </div>
      <p className="ov-sub">{t('pages.overview.subtitle')}</p>

      {/* Window selector — 7 / 30 / 90 days. Drives the market-overview refetch;
          the caption + KPIs follow the SERVED windowDays, never this local pick. */}
      <div className="ov-winsel" role="group" aria-label={t('pages.overview.windowLabel')}>
        <span className="ov-winsel__label">{t('pages.overview.windowLabel')}</span>
        <div className="bc-seg">
          {WINDOW_OPTS.map((d) => (
            <button
              key={d}
              type="button"
              className={`bc-seg__btn${windowDays === d ? ' is-active' : ''}`}
              aria-pressed={windowDays === d}
              onClick={() => onWindow(d)}
            >
              {t(`pages.overview.window${d}`)}
            </button>
          ))}
        </div>
      </div>

      {ovError ? (
        <section className="panel ov-state" role="alert" aria-label={t('pages.overview.title')}>
          <p className="ov-state__title">{t('common.errorTitle')}</p>
          <p className="ov-state__body">{t('common.errorBody')}</p>
          <button type="button" className="btn-ghost ov-state__retry" onClick={() => void loadOverview(windowDays)}>
            {t('common.retry')}
          </button>
        </section>
      ) : ovLoading ? (
        <OverviewSkeleton t={t} />
      ) : !hasData ? (
        <section className="panel ov-empty" aria-label={t('pages.overview.title')}>
          <p className="ov-empty__icon" aria-hidden="true">🌱</p>
          <p className="ov-empty__title">{t('pages.overview.emptyTitle')}</p>
          <p className="ov-empty__body">{t('pages.overview.emptyBody')}</p>
        </section>
      ) : (
        <div className={`ov-live${ovBusy ? ' is-busy' : ''}`} aria-busy={ovBusy || undefined}>
          <KpiRow ov={ov!} lang={lang} t={t} />
          <p className="ov-window">{t('pages.overview.windowCaption', { count: ov!.windowDays })}</p>
          <div className="panelgrid panelgrid--main ov-grid">
            <LatestPricesPanel prices={ov!.latestPrices} lang={lang} t={t} />
            <MoversPanel movers={ov!.movers} lang={lang} t={t} />
          </div>
        </div>
      )}

      {/* Best-crops teaser — independent fetch, fail-soft (never sinks the page). */}
      <BestCropsTeaser
        crops={teaser}
        loading={bcLoading}
        error={bcError}
        lang={lang}
        t={t}
      />
    </>
  );
}

type TFn = (k: string, o?: Record<string, unknown>) => string;

// ---------------------------------------------------------------------------
// KPI row — as-of date, markets covered, crops covered, biggest mover.
// ---------------------------------------------------------------------------
function KpiRow({ ov, lang, t }: { ov: MarketOverview; lang: string; t: TFn }) {
  const top = useMemo(() => biggestMover(ov.movers), [ov.movers]);
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="kpi__lbl">{t('pages.overview.kpiAsOf')}</div>
        <div className="kpi__val">{ov.asOf ? formatDate(ov.asOf, lang) : '—'}</div>
        <div className="kpi__sub">{t('pages.overview.kpiAsOfSub')}</div>
      </div>
      <div className="kpi">
        <div className="kpi__lbl">{t('pages.overview.kpiMarkets')}</div>
        <div className="kpi__val">{ov.marketsWithData}</div>
        <div className="kpi__sub">{t('pages.overview.kpiMarketsSub')}</div>
      </div>
      <div className="kpi">
        <div className="kpi__lbl">{t('pages.overview.kpiCrops')}</div>
        <div className="kpi__val">{ov.cropsWithData}</div>
        <div className="kpi__sub">{t('pages.overview.kpiCropsSub')}</div>
      </div>
      <div className="kpi">
        <div className="kpi__lbl">{t('pages.overview.kpiMover')}</div>
        {top ? (
          <>
            <div className="kpi__val">{top.cropName}</div>
            <div className="kpi__sub ov-mover__meta">
              <span className="ov-mover__glyph" aria-hidden="true">{moverGlyph[top.direction]}</span>
              {t('pages.overview.moverPct', {
                pct: Math.abs(top.changePct),
                dir: t(moverDirectionKey(top.direction)),
              })}
            </div>
          </>
        ) : (
          <div className="kpi__val kpi__val--pending">{t('pages.overview.kpiMoverNone')}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Movers — risers then fallers. Direction = glyph + word, NEUTRAL colour (RED is
// reserved for the "Not recommended" verdict). Each row deep-links to My harvest.
// ---------------------------------------------------------------------------
function MoversPanel({ movers, lang, t }: { movers: MarketMover[]; lang: string; t: TFn }) {
  const { risers, fallers } = useMemo(() => partitionMovers(movers), [movers]);
  return (
    <section className="panel ov-movers" aria-label={t('pages.overview.moversTitle')}>
      <h2 className="ov-panel__title">{t('pages.overview.moversTitle')}</h2>
      <MoverList
        title={t('pages.overview.moversRising')}
        glyph={moverGlyph.up}
        rows={risers}
        emptyKey="pages.overview.moversNoRisers"
        lang={lang}
        t={t}
      />
      <MoverList
        title={t('pages.overview.moversFalling')}
        glyph={moverGlyph.down}
        rows={fallers}
        emptyKey="pages.overview.moversNoFallers"
        lang={lang}
        t={t}
      />
    </section>
  );
}

function MoverList({
  title,
  glyph,
  rows,
  emptyKey,
  lang,
  t,
}: {
  title: string;
  glyph: string;
  rows: MarketMover[];
  emptyKey: string;
  lang: string;
  t: TFn;
}) {
  const rs = t('common.rs');
  return (
    <div className="ov-mvgroup">
      <h3 className="ov-mvgroup__head">
        <span className="ov-mover__glyph" aria-hidden="true">{glyph}</span>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="ov-mvgroup__empty">{t(emptyKey)}</p>
      ) : (
        <ul className="ov-mvlist">
          {rows.map((m) => {
            const priceStr = formatPrice(m.latestPrice, lang, rs);
            const pct = Math.abs(m.changePct);
            const dirWord = t(moverDirectionKey(m.direction));
            return (
              <li key={`${m.cropId}-${m.marketName}`}>
                <Link
                  className="ov-mvrow"
                  to={`/my-harvest?crop=${encodeURIComponent(m.cropId)}`}
                  aria-label={t('pages.overview.moverRowAria', {
                    crop: m.cropName,
                    market: m.marketName,
                    price: priceStr,
                    dir: dirWord,
                    pct,
                  })}
                >
                  <span className="ov-mvrow__main">
                    <span className="ov-mvrow__crop">{m.cropName}</span>
                    <span className="ov-mvrow__market">{m.marketName}</span>
                  </span>
                  <span className="ov-mvrow__nums">
                    <span className="ov-mvrow__price">{priceStr}</span>
                    <span className="ov-mvrow__chg">
                      <span className="ov-mover__glyph" aria-hidden="true">{moverGlyph[m.direction]}</span>
                      {t('pages.overview.moverPct', { pct, dir: dirWord })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Latest prices — responsive table (cards <600px) with an inline sparkline per row.
// Sparkline stroke is NEUTRAL teal (not direction-coloured); each carries an aria
// sentence; the whole panel ships one <details> numeric table alternative (WCAG).
// ---------------------------------------------------------------------------
function LatestPricesPanel({ prices, lang, t }: { prices: MarketLatestPrice[]; lang: string; t: TFn }) {
  const rs = t('common.rs');
  return (
    <section className="panel ov-latest" aria-label={t('pages.overview.latestTitle')}>
      <h2 className="ov-panel__title">
        {t('pages.overview.latestTitle')}
        <Link className="ov-panel__more" to="/prices">{t('pages.overview.latestSeeAll')} <span aria-hidden="true">→</span></Link>
      </h2>
      <p className="ov-latest__sub">{t('pages.overview.latestSub')}</p>

      {prices.length === 0 ? (
        <p className="ov-mvgroup__empty">{t('common.empty')}</p>
      ) : (
        <>
          <div className="ov-tablewrap">
            <table className="ov-table">
              <caption className="sr-only">{t('pages.overview.latestTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('pages.overview.colCrop')}</th>
                  <th scope="col">{t('pages.overview.colMarket')}</th>
                  <th scope="col" className="ov-table__num">{t('pages.overview.colPrice')}</th>
                  <th scope="col">{t('pages.overview.colDate')}</th>
                  <th scope="col">{t('pages.overview.colTrend')}</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={`${p.cropId}-${p.marketName}`}>
                    <th scope="row" className="ov-c-crop" data-label={t('pages.overview.colCrop')}>
                      {p.cropName}
                    </th>
                    <td className="ov-c-market" data-label={t('pages.overview.colMarket')}>{p.marketName}</td>
                    <td className="ov-c-price ov-table__num" data-label={t('pages.overview.colPrice')}>
                      {formatPrice(p.price, lang, rs)}
                    </td>
                    <td className="ov-c-date" data-label={t('pages.overview.colDate')}>{formatDate(p.date, lang)}</td>
                    <td className="ov-c-trend" data-label={t('pages.overview.colTrend')}>
                      <Sparkline row={p} lang={lang} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MANDATORY numeric alternative for the sparklines (WCAG). */}
          <details className="ov-details">
            <summary className="ov-details__summary">
              <span aria-hidden="true">📋 </span>
              {t('pages.overview.tableToggle')}
            </summary>
            <table className="ov-table ov-table--alt">
              <caption className="sr-only">{t('pages.overview.tableTrendCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('pages.overview.colCrop')}</th>
                  <th scope="col" className="ov-table__num">{t('pages.overview.tableDays')}</th>
                  <th scope="col" className="ov-table__num">{t('pages.overview.tableEarliest')}</th>
                  <th scope="col" className="ov-table__num">{t('pages.overview.tableLatest')}</th>
                  <th scope="col" className="ov-table__num">{t('pages.overview.tableLow')}</th>
                  <th scope="col" className="ov-table__num">{t('pages.overview.tableHigh')}</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => {
                  const sparkPrices = p.spark.map((s) => s.price);
                  const earliest = sparkPrices[0] ?? p.price;
                  const lo = sparkPrices.length ? Math.min(...sparkPrices) : p.minPrice;
                  const hi = sparkPrices.length ? Math.max(...sparkPrices) : p.maxPrice;
                  return (
                    <tr key={`${p.cropId}-${p.marketName}-alt`}>
                      <th scope="row">{p.cropName}</th>
                      <td className="ov-table__num">{p.spark.length}</td>
                      <td className="ov-table__num">{formatPrice(earliest, lang, rs)}</td>
                      <td className="ov-table__num">{formatPrice(p.price, lang, rs)}</td>
                      <td className="ov-table__num">{formatPrice(lo, lang, rs)}</td>
                      <td className="ov-table__num">{formatPrice(hi, lang, rs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

function Sparkline({ row, lang, t }: { row: MarketLatestPrice; lang: string; t: TFn }) {
  const rs = t('common.rs');
  const geo = useMemo(() => buildSparkline(row.spark, { width: SPARK_W, height: SPARK_H }), [row.spark]);

  if (!geo) {
    return <span className="ov-spark ov-spark--empty">{t('pages.overview.sparkEmpty')}</span>;
  }

  const latestStr = formatPrice(row.price, lang, rs);
  const aria = geo.singlePoint
    ? t('pages.overview.sparkAriaOne', { crop: row.cropName, market: row.marketName, latest: latestStr })
    : t('pages.overview.sparkAria', {
        crop: row.cropName,
        market: row.marketName,
        count: row.spark.length,
        min: formatPrice(geo.min, lang, rs),
        max: formatPrice(geo.max, lang, rs),
        latest: latestStr,
      });

  return (
    <svg className="ov-spark" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} role="img" aria-label={aria}>
      {!geo.singlePoint && (
        <polyline className="ov-spark__line" points={geo.polyline} fill="none" />
      )}
      <circle className="ov-spark__dot" cx={geo.last.x} cy={geo.last.y} r={2.5} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Best-crops teaser — top 3 from getBestCrops(3), reusing the FE-7 verdict idiom.
// Fully independent + fail-soft: an error here shows a small note, page survives.
// ---------------------------------------------------------------------------
function BestCropsTeaser({
  crops,
  loading,
  error,
  lang,
  t,
}: {
  crops: BestCrop[];
  loading: boolean;
  error: boolean;
  lang: string;
  t: TFn;
}) {
  const rs = t('common.rs');
  const top = crops.slice(0, TEASER_COUNT);
  return (
    <section className="panel ov-teaser" aria-label={t('pages.overview.teaserTitle')}>
      <h2 className="ov-panel__title">
        {t('pages.overview.teaserTitle')}
        <Link className="ov-panel__more" to="/best-crops">{t('pages.overview.teaserSeeAll')} <span aria-hidden="true">→</span></Link>
      </h2>

      {error ? (
        <p className="ov-teaser__note" role="note">{t('pages.overview.teaserError')}</p>
      ) : loading ? (
        <ul className="ov-teaser__list" aria-busy="true">
          <li className="sr-only">{t('common.loading')}</li>
          {Array.from({ length: TEASER_COUNT }).map((_, i) => (
            <li key={i} className="ov-teaser__card ov-teaser__card--skel" aria-hidden="true" />
          ))}
        </ul>
      ) : top.length === 0 ? (
        <p className="ov-mvgroup__empty">{t('pages.overview.teaserEmpty')}</p>
      ) : (
        <ul className="ov-teaser__list">
          {top.map((c) => {
            const verdict = mapVerdict(c.recommendationLevel);
            return (
              <li key={c.cropId} className="ov-teaser__card">
                <Link className="ov-teaser__link" to={`/my-harvest?crop=${encodeURIComponent(c.cropId)}`}>
                  <span className="ov-teaser__crop">{c.cropName}</span>
                  <span className="ov-teaser__price">{formatPrice(c.averagePrice, lang, rs)}</span>
                  <span className={`ov-badge ov-badge--${verdict.tone}`}>
                    <span className="ov-badge__glyph" aria-hidden="true">{VERDICT_GLYPH[verdict.tone]}</span>
                    <span className="ov-badge__label">{t(verdict.labelKey)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton for the market-overview group (KPI row + main panels).
// ---------------------------------------------------------------------------
function OverviewSkeleton({ t }: { t: TFn }) {
  return (
    <div aria-busy="true">
      <p className="sr-only">{t('common.loading')}</p>
      <div className="kpis">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi ov-skel-kpi" aria-hidden="true">
            <span className="ov-skel ov-skel--lbl" />
            <span className="ov-skel ov-skel--val" />
          </div>
        ))}
      </div>
      <div className="panelgrid panelgrid--main ov-grid">
        <div className="panel" aria-hidden="true">
          <span className="ov-skel ov-skel--title" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ov-skel-row" />
          ))}
        </div>
        <div className="panel" aria-hidden="true">
          <span className="ov-skel ov-skel--title" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ov-skel-row" />
          ))}
        </div>
      </div>
    </div>
  );
}
