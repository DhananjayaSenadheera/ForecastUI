// PortfolioCropPage — one watched crop in detail: the same price and prediction facts the
// dashboard card shows (reused verbatim, so the two screens can never word it differently),
// plus the observed price history for the market that actually served that price.
//
// It LINKS to the full national forecast rather than rebuilding it (PRD §5.1): My harvest
// already owns plant-date selection, the band chart, the factor breakdown and the timing
// panel, and a second copy of that screen would be a second thing to keep honest.
// The chart is drawn for the market whose number is printed above it — if the price came
// from the economic-centre fallback, the chart follows it there, because a home-market
// series sitting under a Dambulla price would quietly contradict the number.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { PortfolioDashboard, PortfolioDashboardItem, PriceHistoryPoint } from '../api/types';
import PriceLineChart from '../components/PriceLineChart';
import PredictionBlock from '../components/PredictionBlock';
import PriceSwingBadge from '../components/PriceSwingBadge';
import { PriceBlock } from '../components/WatchlistCard';
import { chartMarketIdFor, harvestLinkFor, primaryMarket } from '../lib/portfolio';
import { classifyPriceSwing, type PriceSwing } from '../lib/priceSwing';
import { ymdLocal } from '../lib/format';
import '../styles/portfolio.css';

export default function PortfolioCropPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { cropId = '' } = useParams();
  // Recomputed per render (same convention as PortfolioPage): one cheap string, and never
  // pinned to mount time on a phone left open across midnight. ymdLocal, never
  // toISOString().slice() — at UTC+5:30 the ISO form is yesterday until 05:30 local.
  const todayYmd = ymdLocal(new Date());

  const [dashboard, setDashboard] = useState<PortfolioDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setDashboard(await api.getPortfolioDashboard());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Case-insensitive id match: GUIDs travel in mixed case between the route and the wire.
  const item: PortfolioDashboardItem | null =
    dashboard?.items.find((i) => i.cropId.toLowerCase() === cropId.toLowerCase()) ?? null;
  // markets[0] — the market the card's first tab leads with, so the two screens open on the
  // same numbers for the same crop. This page has no market switcher of its own: it is the
  // "one crop in detail" view and the forecast beside it is national either way.
  const market = item ? primaryMarket(item) : null;
  const chartMarketId = chartMarketIdFor(item);

  // History for the chart — fail-soft decoration: its failure shows an empty chart state,
  // never an error over the price and prediction that already loaded.
  const [history, setHistory] = useState<PriceHistoryPoint[] | null>(null);
  const [swing, setSwing] = useState<PriceSwing | null>(null);
  useEffect(() => {
    if (!item) return;
    // No market to chart (no price served AND no home market — both reachable). There is
    // nothing to wait for, so resolve to an EMPTY history: leaving `history` null would
    // park the region on a skeleton with aria-busy="true" and an sr-only "Loading…"
    // forever, announcing work that will never happen. An empty history renders the
    // chart's honest "no recent price data" state instead.
    if (!chartMarketId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    api
      .getPriceHistory(item.cropId, chartMarketId)
      .then((h) => {
        if (cancelled) return;
        setHistory(h);
        setSwing(classifyPriceSwing(h));
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item, chartMarketId]);

  const marketName = market?.name ?? '';

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{item ? item.cropName : t('pages.portfolioCrop.title')}</h1>
        <Link className="topbar__updated pf-back" to="/portfolio">
          {t('pages.portfolioCrop.backToPortfolio')}
        </Link>
      </div>

      {error ? (
        <section className="panel pf-state" role="alert" aria-label={t('common.errorTitle')}>
          <p className="pf-state__title">{t('common.errorTitle')}</p>
          <p className="pf-state__body">{t('common.errorBody')}</p>
          <button type="button" className="btn-ghost pf-state__retry" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        </section>
      ) : loading ? (
        <section className="panel pf-skeleton" aria-busy="true" aria-label={t('common.loading')}>
          <p className="sr-only">{t('common.loading')}</p>
          <div className="pf-skel pf-skel--banner" />
          <div className="pf-skel pf-skel--card" />
        </section>
      ) : !item ? (
        // Not on the watchlist: an honest dead end with the way out, never an invented crop.
        <section className="panel pf-state" aria-label={t('pages.portfolioCrop.notWatchedTitle')}>
          <p className="pf-state__icon" aria-hidden="true">
            🌱
          </p>
          <p className="pf-state__title">{t('pages.portfolioCrop.notWatchedTitle')}</p>
          <p className="pf-state__body">{t('pages.portfolioCrop.notWatchedBody')}</p>
          <Link className="btn-primary pf-state__cta" to="/portfolio">
            {t('pages.portfolio.addCrops')}
          </Link>
        </section>
      ) : (
        <>
          <section className="panel pf-detail" aria-label={t('pages.portfolioCrop.todayHeading')}>
            <h2 className="pf-set__title">{t('pages.portfolioCrop.todayHeading')}</h2>
            <p className="pf-card__market">
              <span className="pf-card__market-label">{t('pages.portfolio.marketLabel')}</span>{' '}
              <span className="pf-card__market-name">
                {market ? market.name : t('pages.portfolio.noMarketChosen')}
              </span>
            </p>
            <PriceBlock market={market} lang={lang} todayYmd={todayYmd} />
            <PriceSwingBadge swing={swing} />
          </section>

          <section className="panel pf-detail" aria-label={t('pages.portfolioCrop.forecastHeading')}>
            <h2 className="pf-set__title">{t('pages.portfolioCrop.forecastHeading')}</h2>
            {/* No economicCenterIds here: this page does not load the markets registry, and
                showsNationalLabel fails TOWARDS the label — a national forecast said to be
                national is never wrong, whereas omitting it makes it look local. */}
            <PredictionBlock item={item} market={market} lang={lang} />
            <p className="pf-detail__cta">
              <Link
                className="btn-primary"
                to={harvestLinkFor(item.cropId)}
                aria-label={t('pages.portfolioCrop.openHarvestAria', { crop: item.cropName })}
              >
                {t('pages.portfolioCrop.openHarvest')}
              </Link>
            </p>
          </section>

          <section className="panel pf-detail" aria-label={t('pages.portfolioCrop.historyHeading')}>
            <h2 className="pf-set__title">{t('pages.portfolioCrop.historyHeading')}</h2>
            {history === null ? (
              <div className="pf-skel pf-skel--card" aria-busy="true">
                <span className="sr-only">{t('common.loading')}</span>
              </div>
            ) : (
              <PriceLineChart
                history={history}
                cropLabel={item.cropName}
                marketName={marketName}
                lang={lang}
              />
            )}
            <p className="pf-prov">
              <span className="prov">{t('common.source')}</span>
            </p>
          </section>
        </>
      )}
    </>
  );
}
