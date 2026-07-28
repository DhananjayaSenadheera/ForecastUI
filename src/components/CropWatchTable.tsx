// CropWatchTable — the lower half of "My crops": every crop the app knows, with a tick to
// start watching it and a market picker (up to three) for each row. It replaces the old
// /portfolio/settings screen, so the farmer never leaves the page their crops are on.
//
// Two different writes come out of one table, and they are deliberately different verbs:
//   • a crop NOT yet watched -> tick it, pick its markets, press "Add to my crops" (POST).
//   • a crop ALREADY watched -> its row shows what it is watched at, and changing the
//     markets is a PUT that FULLY REPLACES that crop's set. A POST would not do: server-side
//     it is insert-only, so it could add a market but never take one away.
// Neither write ever carries plantedDate. An omitted field means "unchanged"; a null one
// would CLEAR the farmer's planting day, so a markets edit must not mention it at all.
//
// The 10-crop and 3-market caps are enforced here BEFORE the round trip — a farmer on a
// rural connection should not wait 4 seconds to be told no — but the server's own 422 is
// still mapped and shown, because the client's count can be stale and the server is right.
//
// A real <table> with a real <thead>: under 600px CSS alone turns each row into the app's
// key/value card (the bestcrops pattern), so there is no horizontal scroll and no
// matchMedia deciding layout in JavaScript.
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Crop, Market, WatchlistItem } from '../api/types';
import { cropDisplayName, filterCrops } from '../lib/crops';
import {
  MAX_MARKETS_PER_CROP,
  MAX_WATCHED_CROPS,
  orderMarketsForPicker,
  toggleMarketSelection,
} from '../lib/portfolio';
import TablePagination, { usePagination } from './TablePagination';

export interface CropWatchTableProps {
  crops: Crop[];
  markets: Market[];
  watchlist: WatchlistItem[];
  lang: string;
  loading: boolean;
  /** Adds the ticked crops with the markets picked for each. */
  onAdd: (picks: { cropId: string; marketIds: string[] }[]) => Promise<void>;
  /** Full-replace of one watched crop's markets. */
  onUpdateMarkets: (cropId: string, marketIds: string[]) => Promise<void>;
  /** True while a write is in flight — every write control is disabled together. */
  busy: boolean;
}

export default function CropWatchTable({
  crops,
  markets,
  watchlist,
  lang,
  loading,
  onAdd,
  onUpdateMarkets,
  busy,
}: CropWatchTableProps) {
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  // Ticked-to-add crop ids, and the markets picked per crop (for watched crops this is the
  // edit draft, seeded from what the server stored).
  const [ticked, setTicked] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [capNote, setCapNote] = useState<string | null>(null);

  const watchedById = useMemo(() => {
    const m = new Map<string, WatchlistItem>();
    for (const w of watchlist) m.set(w.cropId.toLowerCase(), w);
    return m;
  }, [watchlist]);

  const marketOptions = useMemo(() => orderMarketsForPicker(markets), [markets]);
  const rows = useMemo(() => {
    const filtered = filterCrops(crops, query);
    return [...filtered].sort((a, b) =>
      cropDisplayName(a, lang).localeCompare(cropDisplayName(b, lang)),
    );
  }, [crops, query, lang]);
  const pager = usePagination(rows, 10);

  /** Markets currently chosen for a crop: the local draft if the farmer has touched it,
   *  otherwise what the server stored (empty for an unwatched crop). */
  const marketsFor = useCallback(
    (cropId: string): string[] => {
      const draft = drafts[cropId];
      if (draft) return draft;
      const watched = watchedById.get(cropId.toLowerCase());
      return watched ? watched.markets.map((m) => m.marketId) : [];
    },
    [drafts, watchedById],
  );

  const remaining = MAX_WATCHED_CROPS - watchlist.length - ticked.length;

  const toggleTick = useCallback(
    (cropId: string) => {
      setCapNote(null);
      setTicked((prev) => {
        if (prev.includes(cropId)) return prev.filter((id) => id !== cropId);
        if (watchlist.length + prev.length >= MAX_WATCHED_CROPS) {
          setCapNote('full');
          return prev;
        }
        return [...prev, cropId];
      });
    },
    [watchlist.length],
  );

  const toggleMarket = useCallback(
    (cropId: string, marketId: string) => {
      setCapNote(null);
      const current = marketsFor(cropId);
      const { next, blocked } = toggleMarketSelection(current, marketId);
      if (blocked) {
        setCapNote('markets');
        return;
      }
      setDrafts((prev) => ({ ...prev, [cropId]: next }));
    },
    [marketsFor],
  );

  const onAddClick = useCallback(async () => {
    const picks = ticked.map((cropId) => ({ cropId, marketIds: marketsFor(cropId) }));
    await onAdd(picks);
    setTicked([]);
    setDrafts({});
  }, [ticked, marketsFor, onAdd]);

  const nameOf = useCallback(
    (marketId: string) => markets.find((m) => m.id === marketId)?.name ?? marketId,
    [markets],
  );

  return (
    <section className="panel pf-table-panel" aria-labelledby="pf-table-heading">
      <h2 className="pf-set__title" id="pf-table-heading">
        {t('pages.portfolio.tableHeading')}
      </h2>
      <p className="pf-set__hint">{t('pages.portfolio.tableHint')}</p>

      <label className="pf-search">
        <span className="wrap-label">{t('pages.portfolio.searchLabel')}</span>
        <input
          type="search"
          className="pf-search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('pages.portfolio.searchPlaceholder')}
        />
      </label>

      {loading ? (
        <div className="pf-skel pf-skel--card" aria-busy="true">
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="pf-nodata" role="note">
          {t('pages.portfolio.tableNoMatch')}
        </p>
      ) : (
        <>
          <div className="pf-tablewrap">
            <table className="pf-table">
              <caption className="sr-only">{t('pages.portfolio.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('pages.portfolio.colWatch')}</th>
                  <th scope="col">{t('pages.portfolio.colCrop')}</th>
                  <th scope="col">{t('pages.portfolio.colMarkets')}</th>
                  <th scope="col">{t('pages.portfolio.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((crop) => {
                  const watched = watchedById.get(crop.id.toLowerCase()) ?? null;
                  const chosen = marketsFor(crop.id);
                  const stored = watched ? watched.markets.map((m) => m.marketId) : [];
                  const dirty =
                    watched !== null &&
                    (chosen.length !== stored.length ||
                      chosen.some((id, i) => id !== stored[i]));
                  const isTicked = ticked.includes(crop.id);
                  const name = cropDisplayName(crop, lang);

                  return (
                    <tr key={crop.id} className={watched ? 'pf-row is-watched' : 'pf-row'}>
                      <td className="pf-c-watch" data-label={t('pages.portfolio.colWatch')}>
                        {watched ? (
                          <span className="pf-watching">
                            <span aria-hidden="true">✓ </span>
                            {t('pages.portfolio.watching')}
                          </span>
                        ) : (
                          <label className="pf-pick">
                            <input
                              type="checkbox"
                              className="pf-pick__box"
                              checked={isTicked}
                              disabled={busy || (!isTicked && remaining <= 0)}
                              onChange={() => toggleTick(crop.id)}
                              aria-label={t('pages.portfolio.tickCropAria', { crop: name })}
                            />
                          </label>
                        )}
                      </td>

                      <th scope="row" className="pf-c-crop" data-label={t('pages.portfolio.colCrop')}>
                        <span className="pf-c-crop__name">{name}</span>
                      </th>

                      <td className="pf-c-markets" data-label={t('pages.portfolio.colMarkets')}>
                        <span className="pf-c-markets__list">
                          {chosen.length === 0
                            ? t('pages.portfolio.noMarketChosen')
                            : chosen.map(nameOf).join(', ')}
                        </span>
                        <button
                          type="button"
                          className="btn-ghost pf-mkt__toggle"
                          aria-expanded={openPicker === crop.id}
                          aria-controls={`pf-mkt-${crop.id}`}
                          disabled={busy}
                          onClick={() =>
                            setOpenPicker((prev) => (prev === crop.id ? null : crop.id))
                          }
                        >
                          {t('pages.portfolio.chooseMarketsFor', { crop: name })}
                        </button>
                        {openPicker === crop.id && (
                          <fieldset className="pf-mkt" id={`pf-mkt-${crop.id}`}>
                            <legend className="pf-mkt__legend">
                              {t('pages.portfolio.marketsLegend', {
                                crop: name,
                                max: MAX_MARKETS_PER_CROP,
                              })}
                            </legend>
                            <ul className="pf-mkt__list">
                              {marketOptions.map((m) => {
                                const on = chosen.includes(m.id);
                                return (
                                  <li key={m.id}>
                                    <label className="pf-mkt__opt">
                                      <input
                                        type="checkbox"
                                        className="pf-pick__box"
                                        checked={on}
                                        disabled={busy}
                                        onChange={() => toggleMarket(crop.id, m.id)}
                                        aria-label={t('pages.portfolio.marketOptionAria', {
                                          market: m.name,
                                          crop: name,
                                        })}
                                      />
                                      <span className="wrap-label">{m.name}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </fieldset>
                        )}
                      </td>

                      <td className="pf-c-rowaction" data-label={t('pages.portfolio.colAction')}>
                        {watched && dirty && (
                          <button
                            type="button"
                            className="btn-primary pf-rowbtn"
                            disabled={busy}
                            onClick={() => void onUpdateMarkets(crop.id, chosen)}
                          >
                            {t('pages.portfolio.saveMarketsFor', { crop: name })}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={pager.page}
            totalPages={pager.totalPages}
            perPage={pager.perPage}
            total={pager.total}
            setPage={pager.setPage}
            setPerPage={pager.setPerPage}
          />
        </>
      )}

      {/* Both caps speak in the farmer's own terms, and only after they are actually hit. */}
      <p className="pf-set__note" role="status" aria-live="polite">
        {capNote === 'full' && t('pages.portfolio.errWatchlistFull')}
        {capNote === 'markets' && t('pages.portfolio.errTooManyMarkets')}
      </p>

      <div className="pf-save">
        <p className="pf-save__count">
          {t('pages.portfolio.tickedCount', { count: ticked.length })}
        </p>
        <button
          type="button"
          className="btn-primary pf-save__btn"
          disabled={busy || ticked.length === 0}
          onClick={() => void onAddClick()}
        >
          {t('pages.portfolio.addToWatchlist')}
        </button>
      </div>
    </section>
  );
}
