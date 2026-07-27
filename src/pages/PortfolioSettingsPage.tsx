// PortfolioSettingsPage — choose which crops you grow and which market your prices come
// from. Two settings, one screen, and nothing else: this is the only place the watchlist
// and the home market are written.
//
// Crops use the existing CropPicker in its multi-select mode (trilingual search, category
// grouping and readiness tint come for free — a second picker would be a second set of
// bugs). Selection is a DRAFT: nothing is written until Save, and Save sends exactly the
// difference (POST the added, DELETE the removed) rather than replaying the whole list.
// Each add is idempotent server-side, so a retry after a half-finished save is harmless.
//
// The market is a per-FARMER setting, not a per-crop one: the PUT names one crop the caller
// owns and the server applies it to every row, so the screen says how many crops it landed
// on instead of implying a per-crop change. The first option clears it back to national
// prices (PUT null) — that is a real choice, not an empty state.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Crop, Market, WatchlistItem } from '../api/types';
import CropPicker from '../components/CropPicker';
import { diffWatchlist, orderMarketsForPicker, watchlistMarketId } from '../lib/portfolio';
import { buildReadinessMap, type ReadinessMap } from '../lib/readiness';
import '../styles/portfolio.css';

type SaveState = { status: 'idle' | 'saving' | 'error' } | { status: 'saved'; added: number; removed: number };

export default function PortfolioSettingsPage() {
  const { t } = useTranslation();

  const [crops, setCrops] = useState<Crop[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Draft selection — the watchlist as the farmer is editing it, not as stored.
  const [draft, setDraft] = useState<string[]>([]);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [c, m, w] = await Promise.all([api.getCrops(), api.getMarkets(), api.getWatchlist()]);
      setCrops(c);
      setMarkets(m);
      setWatchlist(w);
      setDraft(w.map((i) => i.cropId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Readiness tint on the picker cards — fail-soft decoration, exactly as elsewhere.
  const [readiness, setReadiness] = useState<ReadinessMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getCropReadiness()
      .then((r) => {
        if (!cancelled) setReadiness(buildReadinessMap(r));
      })
      .catch(() => {
        /* readiness unknown -> untinted cards */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const storedIds = useMemo(() => watchlist.map((i) => i.cropId), [watchlist]);
  const diff = useMemo(() => diffWatchlist(storedIds, draft), [storedIds, draft]);
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0;

  const toggleCrop = useCallback((crop: Crop) => {
    setSave({ status: 'idle' });
    setDraft((prev) =>
      prev.includes(crop.id) ? prev.filter((id) => id !== crop.id) : [...prev, crop.id],
    );
  }, []);

  const onSave = useCallback(async () => {
    setSave({ status: 'saving' });
    try {
      // Sequential, not parallel: a rural connection copes better with one request at a
      // time, and a mid-way failure leaves a state the farmer can simply save again.
      for (const id of diff.added) await api.addWatchlistCrop(id);
      for (const id of diff.removed) await api.removeWatchlistCrop(id);
      const fresh = await api.getWatchlist();
      setWatchlist(fresh);
      setDraft(fresh.map((i) => i.cropId));
      setSave({ status: 'saved', added: diff.added.length, removed: diff.removed.length });
    } catch {
      // The list is refetched so the screen shows what REALLY got through, never an
      // optimistic guess about a half-applied save.
      try {
        const fresh = await api.getWatchlist();
        setWatchlist(fresh);
      } catch {
        /* keep the last known list */
      }
      setSave({ status: 'error' });
    }
  }, [diff]);

  // ---- Home market -----------------------------------------------------------------
  const currentMarketId = watchlistMarketId(watchlist);
  const marketOptions = useMemo(() => orderMarketsForPicker(markets), [markets]);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketMsg, setMarketMsg] = useState<
    { kind: 'ok'; market: string | null; count: number } | { kind: 'error' } | null
  >(null);

  const onMarketChange = useCallback(
    async (value: string) => {
      // The PUT needs a row the caller owns; any watched crop will do, because the server
      // applies the market to all of them.
      const anchor = watchlist[0]?.cropId;
      if (!anchor) return;
      setMarketBusy(true);
      setMarketMsg(null);
      try {
        // '' is the explicit "no market / national prices" choice -> null clears it.
        const result = await api.updateWatchlistMarket(anchor, value === '' ? null : value);
        setMarketMsg({
          kind: 'ok',
          market: result.preferredMarketName,
          count: result.appliedToCropCount,
        });
        setWatchlist(await api.getWatchlist());
      } catch {
        setMarketMsg({ kind: 'error' });
      } finally {
        setMarketBusy(false);
      }
    },
    [watchlist],
  );

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.portfolioSettings.title')}</h1>
        <Link className="topbar__updated pf-back" to="/portfolio">
          {t('pages.portfolioSettings.backToPortfolio')}
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
      ) : (
        <>
          <section className="panel pf-set" aria-label={t('pages.portfolioSettings.marketHeading')}>
            <h2 className="pf-set__title">{t('pages.portfolioSettings.marketHeading')}</h2>
            <p className="pf-set__hint">{t('pages.portfolioSettings.marketHint')}</p>
            <label className="pf-field">
              <span className="wrap-label">{t('pages.portfolioSettings.marketLabel')}</span>
              <select
                className="pf-select"
                value={currentMarketId ?? ''}
                disabled={loading || marketBusy || watchlist.length === 0}
                onChange={(e) => void onMarketChange(e.target.value)}
              >
                {/* The clear affordance: a real option, not a hidden reset. */}
                <option value="">{t('pages.portfolioSettings.marketNone')}</option>
                {marketOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.isEconomicCenter ? ` · ${t('pages.prices.economicCentre')}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {watchlist.length === 0 && !loading && (
              <p className="pf-set__note" role="note">
                {t('pages.portfolioSettings.marketNeedsCrop')}
              </p>
            )}
            <p className="pf-set__status" role="status" aria-live="polite">
              {marketMsg?.kind === 'ok' &&
                (marketMsg.market
                  ? t('pages.portfolioSettings.marketSaved', {
                      market: marketMsg.market,
                      count: marketMsg.count,
                    })
                  : t('pages.portfolioSettings.marketCleared', { count: marketMsg.count }))}
            </p>
            {marketMsg?.kind === 'error' && (
              <p className="pf-set__error" role="alert">
                {t('common.errorBody')}
              </p>
            )}
          </section>

          <section className="panel pf-set" aria-label={t('pages.portfolioSettings.cropsHeading')}>
            <h2 className="pf-set__title">{t('pages.portfolioSettings.cropsHeading')}</h2>
            <p className="pf-set__hint">{t('pages.portfolioSettings.cropsHint')}</p>

            <CropPicker
              crops={crops}
              loading={loading}
              error={false}
              onRetry={() => void load()}
              selectedId={null}
              selectedIds={draft}
              onSelect={toggleCrop}
              readiness={readiness}
            />

            <div className="pf-save">
              <p className="pf-save__count" role="status" aria-live="polite">
                {hasChanges
                  ? t('pages.portfolioSettings.pending', {
                      add: diff.added.length,
                      remove: diff.removed.length,
                    })
                  : t('pages.portfolioSettings.selected', { count: draft.length })}
              </p>
              <button
                type="button"
                className="btn-primary pf-save__btn"
                disabled={!hasChanges || save.status === 'saving'}
                onClick={() => void onSave()}
              >
                {save.status === 'saving'
                  ? t('pages.portfolioSettings.saving')
                  : t('pages.portfolioSettings.save')}
              </button>
            </div>

            {save.status === 'saved' && (
              <p className="pf-set__status" role="status" aria-live="polite">
                {t('pages.portfolioSettings.saved', {
                  add: save.added,
                  remove: save.removed,
                })}
              </p>
            )}
            {save.status === 'error' && (
              <p className="pf-set__error" role="alert">
                {t('pages.portfolioSettings.saveFailed')}
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
