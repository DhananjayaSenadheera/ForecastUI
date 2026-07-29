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
import { cropIcon } from '../lib/cropIcons';
import {
  MAX_MARKETS_PER_CROP,
  MAX_WATCHED_CROPS,
  orderMarketsForPicker,
  sameMarketSet,
  toggleMarketSelection,
} from '../lib/portfolio';
import TablePagination, { usePagination } from './TablePagination';

export interface CropWatchTableProps {
  crops: Crop[];
  markets: Market[];
  watchlist: WatchlistItem[];
  lang: string;
  loading: boolean;
  /** Adds the ticked crops with the markets picked for each, and answers WHICH of them
   *  really landed — the table forgets exactly those and keeps the rest ticked. */
  onAdd: (
    picks: { cropId: string; marketIds: string[] }[],
  ) => Promise<{ landedCropIds: string[] }>;
  /** Full-replace of one watched crop's markets; true when the server accepted it. */
  onUpdateMarkets: (cropId: string, marketIds: string[]) => Promise<boolean>;
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
    const { landedCropIds } = await onAdd(picks);
    // ONLY what landed is forgotten. Clearing everything unconditionally meant a refused
    // batch (offline, or a cap the server enforced) silently threw away the ticks AND the
    // market picks the farmer had just made, with nothing to show for the tap.
    if (landedCropIds.length === 0) return;
    const landed = new Set(landedCropIds.map((id) => id.toLowerCase()));
    setTicked((prev) => prev.filter((id) => !landed.has(id.toLowerCase())));
    setDrafts((prev) => {
      const next: Record<string, string[]> = {};
      for (const [cropId, ids] of Object.entries(prev)) {
        if (!landed.has(cropId.toLowerCase())) next[cropId] = ids;
      }
      return next;
    });
  }, [ticked, marketsFor, onAdd]);

  const saveMarkets = useCallback(
    async (cropId: string, marketIds: string[]) => {
      const ok = await onUpdateMarkets(cropId, marketIds);
      // Drop the draft once it IS the stored state, so the row goes back to reading from the
      // server. Leaving it behind left a permanently "dirty" row whose Save button never
      // went away, firing the same no-op PUT every time it was pressed.
      if (!ok) return;
      setDrafts((prev) => {
        if (!(cropId in prev)) return prev;
        const next = { ...prev };
        delete next[cropId];
        return next;
      });
    },
    [onUpdateMarkets],
  );

  /**
   * Every market NAME we can resolve, watchlist first.
   *
   * The registry here is getMarkets(), which asks for the price-carrying subset (10 of the
   * 12) — a crop watched at a market outside it would otherwise print a raw GUID at the
   * farmer and count silently against their 3-market cap. The watchlist names the markets
   * the farmer actually watches, so it is the better source and wins.
   */
  const nameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const m of markets) byId.set(m.id.toLowerCase(), m.name);
    for (const w of watchlist) {
      for (const wm of w.markets) byId.set(wm.marketId.toLowerCase(), wm.name);
    }
    return byId;
  }, [markets, watchlist]);

  const nameOf = useCallback(
    (marketId: string) => nameById.get(marketId.toLowerCase()) ?? marketId,
    [nameById],
  );

  /** The picker options for one row: the registry, plus any market this crop is already
   *  watched at that the registry does not list — otherwise the farmer can see that market
   *  on their row but has no control with which to remove it. */
  const optionsFor = useCallback(
    (chosen: string[]): { id: string; name: string }[] => {
      const known = new Set(marketOptions.map((m) => m.id.toLowerCase()));
      const extras = chosen
        .filter((id) => !known.has(id.toLowerCase()))
        .map((id) => ({ id, name: nameOf(id) }));
      return [...marketOptions.map((m) => ({ id: m.id, name: m.name })), ...extras];
    },
    [marketOptions, nameOf],
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
                  // Compared as a SET: the server keeps its own ChosenAt order and the
                  // request order means nothing to it, so re-ticking the same markets in a
                  // different order is not a change to offer to save.
                  const dirty = watched !== null && !sameMarketSet(chosen, stored);
                  const isTicked = ticked.includes(crop.id);
                  const isOpen = openPicker === crop.id;
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
                        {/* Bare glyph in a dense table row, aria-hidden: this is the row's
                            <th>, so a readable emoji would join every row's accessible
                            name and every "Tick X to remove it" beside it. Resolved from
                            the crop's code and its ENGLISH name, not `name` — that is the
                            localized label, which matches no keyword rule. */}
                        <span className="crop-emoji pf-c-crop__icon" aria-hidden="true">
                          {cropIcon({ cropCode: crop.cropCode, cropName: crop.name })}
                        </span>
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
                          aria-expanded={isOpen}
                          // Only while the panel exists: aria-controls pointing at an id
                          // that is not in the document is a dangling reference AT is
                          // entitled to follow.
                          aria-controls={isOpen ? `pf-mkt-${crop.id}` : undefined}
                          disabled={busy}
                          onClick={() =>
                            setOpenPicker((prev) => (prev === crop.id ? null : crop.id))
                          }
                        >
                          {t('pages.portfolio.chooseMarketsFor', { crop: name })}
                        </button>
                        {isOpen && (
                          <fieldset className="pf-mkt" id={`pf-mkt-${crop.id}`}>
                            <legend className="pf-mkt__legend">
                              {t('pages.portfolio.marketsLegend', {
                                crop: name,
                                max: MAX_MARKETS_PER_CROP,
                              })}
                            </legend>
                            <ul className="pf-mkt__list">
                              {optionsFor(chosen).map((m) => {
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
                            onClick={() => void saveMarkets(crop.id, chosen)}
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
        {capNote === 'full' &&
          t('pages.portfolio.errWatchlistFull', { max: MAX_WATCHED_CROPS })}
        {capNote === 'markets' &&
          t('pages.portfolio.errTooManyMarkets', { max: MAX_MARKETS_PER_CROP })}
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
