// PortfolioPage — "My crops": the farmer's own watchlist as cards on top, and the full crop
// table underneath. ONE page: /portfolio/settings was dissolved into this screen, because
// "see my crops" and "change my crops" were never two journeys — the farmer looked at a card
// and wanted to act on it, and a separate settings screen made them leave and come back.
//
// What the page owns:
//   • the cards — one per watched crop, reading markets[0] (market tabs are step 6);
//   • the "Watching X/10" counter, so the cap is visible BEFORE it is hit;
//   • remove-by-ticking — tick any number of cards, one action removes them all, with a
//     confirm step because a removal is not undoable from here;
//   • the crop table — tick a crop + pick up to three markets to add it, or edit a watched
//     crop's markets in place.
//
// Fetches, and what each failure MEANS:
//   • dashboard + crops + markets + watchlist — the page. Failure is the page's error state.
//   • readiness — decoration. Failure means "readiness unknown": no badge, no claim, no
//     error surface (the existing fail-soft idiom).
//   • price history per crop — feeds ONLY the FE-derived price-swing badge, one call per
//     crop against the market that card leads with. Failure or thin data means the badge
//     simply does not appear. Fetched AFTER the dashboard paints, so a farmer on a rural
//     connection reads their prices without waiting on decoration.
//
// The two empty states are deliberately different (PRD §5.2): "you have not added any
// crops" is an invitation, "we have nothing for your crops yet" is an admission. Neither
// one ever shows a placeholder number. The table stays on screen for both — with an empty
// watchlist it IS the next step.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Crop, Market, PortfolioDashboard, WatchlistItem } from '../api/types';
import CropWatchTable from '../components/CropWatchTable';
import WatchlistCard from '../components/WatchlistCard';
import {
  MAX_WATCHED_CROPS,
  dashboardEmptyState,
  economicCenterIdSet,
  primaryMarket,
  watchlistErrorKey,
} from '../lib/portfolio';
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
  // Recomputed per render, not memoised on []: it is one cheap string, and a memo would
  // pin "today" to mount time on a phone left open across midnight. Same convention on
  // PortfolioCropPage.
  const todayYmd = ymdLocal(new Date());

  const [dashboard, setDashboard] = useState<PortfolioDashboard | null>(null);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [d, c, m, w] = await Promise.all([
        api.getPortfolioDashboard(),
        api.getCrops(),
        api.getMarkets(),
        api.getWatchlist(),
      ]);
      setDashboard(d);
      setCrops(c);
      setMarkets(m);
      setWatchlist(w);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** Re-read everything the writes can have changed. Never an optimistic local patch: after
   *  a partly-applied batch the screen must show what REALLY landed. */
  const refresh = useCallback(async () => {
    const [d, w] = await Promise.all([api.getPortfolioDashboard(), api.getWatchlist()]);
    setDashboard(d);
    setWatchlist(w);
  }, []);

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

  // Decoration 2 — price swing, one history call per crop against the market the card leads
  // with (measuring a different market from the one displayed would describe another series).
  // requestedRef survives StrictMode's dev double-mount, so no `cancelled` flag here: a
  // first-pass cancel would leave the badge permanently absent.
  const [swings, setSwings] = useState<Record<string, PriceSwing | null>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!dashboard) return;
    for (const item of dashboard.items) {
      const marketId = primaryMarket(item)?.marketId;
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

  // ---- Writes ----------------------------------------------------------------------
  const [busy, setBusy] = useState(false);
  // One message region for every write. The key is an i18n key, so a 422 the product
  // deliberately refuses (watchlist_full / too_many_markets) says WHICH limit was hit
  // instead of collapsing into "could not save".
  const [writeMsg, setWriteMsg] = useState<{ tone: 'ok' | 'error'; key: string } | null>(null);

  /** Run a batch of writes, then re-read. Sequential, not parallel: a rural connection copes
   *  better with one request at a time, and the first refusal stops the batch with its own
   *  code rather than firing nine more calls that will be refused too. */
  const runWrites = useCallback(
    async (writes: (() => Promise<unknown>)[], okKey: string) => {
      setBusy(true);
      setWriteMsg(null);
      try {
        for (const w of writes) await w();
        await refresh();
        setWriteMsg({ tone: 'ok', key: okKey });
      } catch (e) {
        // The server's own code wins over any client-side guess about why.
        const code = e instanceof ApiError ? e.code : null;
        setWriteMsg({ tone: 'error', key: watchlistErrorKey(code) });
        try {
          await refresh();
        } catch {
          /* keep the last known screen rather than blanking it */
        }
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onAdd = useCallback(
    async (picks: { cropId: string; marketIds: string[] }[]) => {
      await runWrites(
        picks.map((p) => () => api.addWatchlistCrop(p.cropId, p.marketIds)),
        'pages.portfolio.addedOk',
      );
    },
    [runWrites],
  );

  const onUpdateMarkets = useCallback(
    async (cropId: string, marketIds: string[]) => {
      // FULL REPLACE, and plantedDate is not part of the body — step 7 owns that field.
      await runWrites(
        [() => api.updateWatchlistMarkets(cropId, marketIds)],
        'pages.portfolio.marketsSavedOk',
      );
    },
    [runWrites],
  );

  // ---- Remove by ticking ------------------------------------------------------------
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const toggleSelect = useCallback((cropId: string) => {
    setWriteMsg(null);
    setSelected((prev) =>
      prev.includes(cropId) ? prev.filter((id) => id !== cropId) : [...prev, cropId],
    );
  }, []);

  // The confirm is where the destructive button lives, so keyboard focus must land on it
  // rather than staying behind on a button that has just disappeared.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  // Ticks that no longer name a watched crop (it was just removed) are dropped, so the
  // action bar cannot linger over an empty selection.
  useEffect(() => {
    const live = new Set(dashboard?.items.map((i) => i.cropId) ?? []);
    setSelected((prev) => {
      const next = prev.filter((id) => live.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [dashboard]);

  const onRemove = useCallback(async () => {
    const ids = [...selected];
    setConfirming(false);
    setSelected([]);
    await runWrites(
      ids.map((id) => () => api.removeWatchlistCrop(id)),
      'pages.portfolio.removedOk',
    );
  }, [selected, runWrites]);

  const economicCenterIds = useMemo(() => economicCenterIdSet(markets), [markets]);
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
            {/* The cap is stated as a fact, always, not as an error once it is reached. */}
            <p className="pf-count">
              {t('pages.portfolio.watchingCount', {
                count: watchlist.length,
                max: MAX_WATCHED_CROPS,
              })}
            </p>

            {emptyState === 'no-watchlist' ? (
              <div className="pf-state pf-state--empty">
                <p className="pf-state__icon" aria-hidden="true">
                  🌱
                </p>
                <p className="pf-state__title">{t('pages.portfolio.emptyTitle')}</p>
                <p className="pf-state__body">{t('pages.portfolio.emptyBodyTable')}</p>
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
                      readiness={readinessFor(readiness, item.cropId)}
                      swing={swings[item.cropId] ?? null}
                      lang={lang}
                      todayYmd={todayYmd}
                      economicCenterIds={economicCenterIds}
                      selected={selected.includes(item.cropId)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </ul>

                {/* The remove action appears only once something is ticked — an always-on
                    destructive button beside ten cards is an accident waiting to happen. */}
                {selected.length > 0 && (
                  <div className="pf-removebar">
                    {confirming ? (
                      <div className="pf-confirm" role="alert">
                        <p className="pf-confirm__q">
                          {t('pages.portfolio.removeConfirmQuestion', {
                            count: selected.length,
                          })}
                        </p>
                        <div className="pf-confirm__actions">
                          <button
                            type="button"
                            ref={confirmRef}
                            className="btn-primary pf-confirm__yes"
                            disabled={busy}
                            onClick={() => void onRemove()}
                          >
                            {t('pages.portfolio.removeConfirmYes')}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost pf-confirm__no"
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                          >
                            {t('pages.portfolio.removeConfirmNo')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost pf-removebar__btn"
                        disabled={busy}
                        onClick={() => setConfirming(true)}
                      >
                        {t('pages.portfolio.removeSelected', { count: selected.length })}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            <p
              className={`pf-writemsg${writeMsg?.tone === 'error' ? ' pf-writemsg--error' : ''}`}
              role="status"
              aria-live="polite"
            >
              {writeMsg && t(writeMsg.key)}
            </p>
          </>
        )}
      </section>

      {!error && (
        <CropWatchTable
          crops={crops}
          markets={markets}
          watchlist={watchlist}
          lang={lang}
          loading={loading}
          onAdd={onAdd}
          onUpdateMarkets={onUpdateMarkets}
          busy={busy}
        />
      )}
    </>
  );
}
