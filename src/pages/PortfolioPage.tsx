// PortfolioPage — "My crops": the farmer's own watchlist with today's price, its trend, how
// much it swings, and the frozen forecast for each crop, all pointed at ONE home market.
// Reached from an Overview card and the session menu, never from a 5th nav tab (the 4-tab
// IA is locked — same precedent as /best-crops/compare).
//
// Three independent fetches with three different failure meanings:
//   • dashboard — the page. Its failure is the page's error state, with a retry.
//   • readiness — decoration. Failure means "readiness unknown": no badge, no claim, no
//     error surface (the existing fail-soft idiom).
//   • price history per crop — feeds ONLY the FE-derived price-swing badge, one call per
//     crop against the market that actually served that crop's price. Failure or thin data
//     means the badge simply does not appear. It is fetched AFTER the dashboard paints, so
//     a farmer on a rural connection reads their prices without waiting on decoration.
//
// The two empty states are deliberately different (PRD §5.2): "you have not added any
// crops" is an invitation, "we have nothing for your crops yet" is an admission. Neither
// one ever shows a placeholder number.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { PortfolioDashboard } from '../api/types';
import HomeMarketBanner from '../components/HomeMarketBanner';
import WatchlistCard from '../components/WatchlistCard';
import { dashboardEmptyState } from '../lib/portfolio';
import { classifyPriceSwing, type PriceSwing } from '../lib/priceSwing';
import { buildReadinessMap, readinessFor, type ReadinessMap } from '../lib/readiness';
import { ymdLocal } from '../lib/format';
import '../styles/portfolio.css';

const SKELETON_COUNT = 3;

export default function PortfolioPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // ymdLocal, never toISOString().slice(): at UTC+5:30 the ISO form is yesterday until
  // 05:30 local, which would silently age every price by a day.
  const todayYmd = useMemo(() => ymdLocal(new Date()), []);

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

  // Decoration 1 — forecast readiness. Unknown readiness paints nothing.
  const [readiness, setReadiness] = useState<ReadinessMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getCropReadiness()
      .then((r) => {
        if (!cancelled) setReadiness(buildReadinessMap(r));
      })
      .catch(() => {
        /* readiness unknown -> no badges */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Decoration 2 — price swing, one history call per crop against the market that actually
  // served that crop's price (charting/measuring the home market under a fallback-served
  // number would describe a different series from the one displayed).
  // requestedRef survives StrictMode's dev double-mount, so no `cancelled` flag here: a
  // first-pass cancel would leave the badge permanently absent.
  const [swings, setSwings] = useState<Record<string, PriceSwing | null>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!dashboard) return;
    for (const item of dashboard.items) {
      const marketId = item.price?.marketId;
      if (!marketId) continue;
      const key = `${item.cropId}:${marketId}`;
      if (requestedRef.current.has(key)) continue;
      requestedRef.current.add(key);
      api
        .getPriceHistory(item.cropId, marketId)
        .then((history) => {
          setSwings((prev) => ({ ...prev, [item.cropId]: classifyPriceSwing(history) }));
        })
        .catch(() => {
          requestedRef.current.delete(key); // allow a later attempt; badge stays absent
        });
    }
  }, [dashboard]);

  const emptyState = dashboard ? dashboardEmptyState(dashboard) : null;

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.portfolio.title')}</h1>
        <span className="topbar__updated">
          <span className="prov">{t('common.source')}</span>
        </span>
      </div>

      <section className="panel pf" aria-label={t('pages.portfolio.title')}>
        <p className="pf-sub">{t('pages.portfolio.subtitle')}</p>

        {error ? (
          <div className="pf-state" role="alert">
            <p className="pf-state__title">{t('common.errorTitle')}</p>
            <p className="pf-state__body">{t('common.errorBody')}</p>
            <button type="button" className="btn-ghost pf-state__retry" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        ) : loading ? (
          <div className="pf-skeleton" aria-busy="true">
            <p className="sr-only">{t('common.loading')}</p>
            <div className="pf-skel pf-skel--banner" />
            <ul className="pf-grid">
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <li key={i} className="pf-skel pf-skel--card" />
              ))}
            </ul>
          </div>
        ) : (
          <>
            <HomeMarketBanner homeMarket={dashboard?.homeMarket ?? null} />

            {emptyState === 'no-watchlist' ? (
              <div className="pf-state pf-state--empty">
                <p className="pf-state__icon" aria-hidden="true">
                  🌱
                </p>
                <p className="pf-state__title">{t('pages.portfolio.emptyTitle')}</p>
                <p className="pf-state__body">{t('pages.portfolio.emptyBody')}</p>
                <Link className="btn-primary pf-state__cta" to="/portfolio/settings">
                  {t('pages.portfolio.addCrops')}
                </Link>
              </div>
            ) : (
              <>
                {/* Watchlist with nothing known about ANY crop: say so once, at the top,
                    and still list the crops. Never a placeholder number. */}
                {emptyState === 'no-data' && (
                  <p className="pf-note pf-note--nodata" role="note">
                    <span aria-hidden="true">ℹ️ </span>
                    {t('pages.portfolio.noDataYet')}
                  </p>
                )}
                <ul className="pf-grid">
                  {dashboard!.items.map((item) => (
                    <WatchlistCard
                      key={item.cropId}
                      item={item}
                      homeMarket={dashboard!.homeMarket}
                      readiness={readinessFor(readiness, item.cropId)}
                      swing={swings[item.cropId] ?? null}
                      lang={lang}
                      todayYmd={todayYmd}
                    />
                  ))}
                </ul>
                <p className="pf-manage">
                  <Link className="btn-ghost" to="/portfolio/settings">
                    {t('pages.portfolio.manage')}
                  </Link>
                </p>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
