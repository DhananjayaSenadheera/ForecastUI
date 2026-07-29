// PortfolioCropPage — one watched crop in detail: the same price and prediction facts the
// dashboard card shows (reused verbatim, so the two screens can never word it differently),
// plus the observed price history for the market that actually served that price.
//
// It LINKS to the full national forecast rather than rebuilding it (PRD §5.1): My harvest
// already owns plant-date selection, the band chart, the factor breakdown and the timing
// panel, and a second copy of that screen would be a second thing to keep honest.
// The chart is drawn for the market whose number is printed above it, and that market is
// the one the card handed over in ?market= — a series from another market sitting under a
// price would quietly contradict the number, and so would landing here on Dambulla after
// tapping through from the Kandy tab.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { PortfolioDashboard, PortfolioDashboardItem, PriceHistoryPoint } from '../api/types';
import PriceLineChart from '../components/PriceLineChart';
import PredictionBlock from '../components/PredictionBlock';
import PriceSwingBadge from '../components/PriceSwingBadge';
import PriceBlock from '../components/PriceBlock';
import { cropIcon } from '../lib/cropIcons';
import { chartMarketIdFor, harvestLinkFor, selectedMarketFor } from '../lib/portfolio';
import { classifyPriceSwing, type PriceSwing } from '../lib/priceSwing';
import { formatDate, ymdLocal } from '../lib/format';
import '../styles/portfolio.css';

export default function PortfolioCropPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { cropId = '' } = useParams();
  // ?market= carries the market the card was showing when the farmer tapped "See details".
  // It is a VIEW parameter, never a claim: an id this crop is not watched at (a stale
  // bookmark, a hand-edited URL, a market since removed) falls back silently to markets[0]
  // rather than erroring — selectedMarketFor owns that fallback for every caller.
  const [searchParams] = useSearchParams();
  const requestedMarketId = searchParams.get('market');
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
  // The market the card was on, or markets[0] when it said nothing. This page has no
  // switcher of its own — it inherits the card's context so the price the farmer just read
  // is the price they land on. The forecast beside it is national either way.
  const market = selectedMarketFor(item, requestedMarketId);
  const chartMarketId = chartMarketIdFor(item, requestedMarketId);

  // History for the chart — fail-soft decoration: its failure shows an empty chart state,
  // never an error over the price and prediction that already loaded.
  const [history, setHistory] = useState<PriceHistoryPoint[] | null>(null);
  const [swing, setSwing] = useState<PriceSwing | null>(null);
  useEffect(() => {
    // EVERY run starts from unresolved, unconditionally and before anything else. Both of
    // these are DERIVED from the market this effect is about, so the moment that market
    // changes — a ?market= flip while mounted, or a walk from one crop to another — the old
    // values describe a series this screen is no longer showing. Leaving them up meant the
    // heading and the price flipped instantly while the chart and its <details> table went
    // on drawing the previous market for the length of the request, and a FAILED refetch
    // (which only ever set history) left the old market's swing pill beside the new
    // market's price permanently. Clearing restores the skeleton this file already
    // documents; saying "loading" is honest, saying the wrong market's numbers is not.
    setHistory(null);
    setSwing(null);
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
        {/* The chip, not the bare glyph: this whole screen is about ONE crop, which is the
            same statement the My-crops card makes, so it gets the same disc. It renders
            only once the crop is known — a chip beside the generic loading title would be
            a claim about a crop we cannot name yet. aria-hidden; the <h1> is the name. */}
        {item && (
          <span className="crop-chip pf-crop__icon" aria-hidden="true">
            {cropIcon({ cropCode: item.cropCode, cropName: item.cropName })}
          </span>
        )}
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
            {/* showsNationalLabel fails TOWARDS the label everywhere except the
                stood-in-for default market — a national forecast said to be national is
                never wrong, whereas omitting it makes it look local. */}
            {/* The nightly SNAPSHOT forecast, and it has to SAY so. The card one hop back
                shows a different number — the forecast for the day the farmer told us they
                planted — and two prices under two headings that both read "forecast at
                harvest" is exactly the "two answers to one question" this app keeps having
                to close. Each surface therefore names the planting it is about: the card
                names theirs, this line names the snapshot's own assumed planting day
                (`snapshotDate`, which the wire defines as "the plant date the forecast
                assumed"). Same component, same trust rules, different anchor. */}
            {item.prediction && (
              <p className="pf-detail__assume">
                {t('pages.portfolioCrop.forecastAssumption', {
                  date: formatDate(item.prediction.snapshotDate, lang),
                })}
              </p>
            )}
            <PredictionBlock prediction={item.prediction} market={market} lang={lang} />
            {/* Costs no fetch: plantedDate rides on the dashboard item this page already
                loaded. Only a pointer — the forecast for their planting is the card's to
                show, and duplicating it here would be a third number to keep in step. */}
            {item.plantedDate && (
              <p className="pf-detail__assume">
                {t('pages.portfolioCrop.yourPlantingElsewhere', {
                  date: formatDate(item.plantedDate, lang),
                })}
              </p>
            )}
            <p className="pf-detail__cta">
              <Link
                className="btn-primary"
                to={harvestLinkFor(item.cropId, item.plantedDate)}
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
