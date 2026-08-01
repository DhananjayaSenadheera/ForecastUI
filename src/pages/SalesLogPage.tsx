// SalesLogPage (/portfolio/sales) — the farmer's whole sales book, newest first.
//
// A NON-TAB route, like the rest of My crops: the four-tab IA is locked, and this is reached
// from the popup's "See all sales" and the link beside the crop counter. It is lazy-loaded,
// so none of it weighs on the first paint of the four tabs every farmer does use.
//
// WHAT IT DOES NOT DO: record a sale. There is no /portfolio/sales/new and no form here
// waiting for a crop to be picked. A sale is recorded where its crop is already the subject —
// inside that crop's "More details" — so the one mistake that is hard to notice afterwards,
// filing a sale against the wrong crop, cannot be made. This page reads, changes and removes.
// The empty state says exactly where to go instead, because "no sales yet" with no way
// forward is a dead end.
//
// It also states no totals or averages. The farmer's own arithmetic is not ours to narrate,
// and an average sale price printed beside a national forecast invites a comparison the two
// numbers do not support.
//
// Paging is the SERVER's (the same {items,page,pageSize,total} envelope as every other paged
// surface) and the page never client-slices: it refetches on page/size change and renders
// exactly the rows that came back.
//
// It does NOT read the server's echoed page/pageSize back into its own cursor, and does not
// need to: every size this page can ask for is one of TablePagination's three (10/25/50), all
// of which are at or under the server's 50 ceiling, so the echo can only ever repeat what was
// asked. `total` is the one field of the envelope the pager really consumes — it derives the
// page count from it and self-clamps a stale cursor when the book shrinks. If a fourth page
// size is ever added above 50, THIS is the line that has to change first.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Market, SalesPage } from '../api/types';
import SalesTable, { type SaleWriteInput } from '../components/SalesTable';
import TablePagination, { useServerPagination } from '../components/TablePagination';
import { ymdLocal } from '../lib/format';
import { saleErrorKey, saleErrorParams } from '../lib/salesLog';
import '../styles/portfolio.css';

const SALES_PAGE_SIZE = 10;

export default function SalesLogPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // Recomputed per render, never memoised on []: one cheap string, and a memo would pin
  // "today" to mount time on a phone left open across midnight. ymdLocal, never
  // toISOString().slice() — at UTC+5:30 the ISO form is yesterday until 05:30 local.
  const todayYmd = ymdLocal(new Date());

  const [data, setData] = useState<SalesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);

  const pager = useServerPagination(data?.total ?? 0, SALES_PAGE_SIZE);
  const { page, perPage, totalPages, setPage, setPerPage } = pager;
  const req = useRef(0); // stale-response guard for overlapping page loads

  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; key: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Where focus goes when the control that had it has gone (a removed row) and this surface
  // has no "+" of its own to fall back on. The table owns every other destination.
  const statusRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    setError(false);
    try {
      const res = await api.getSales(page, perPage);
      if (id !== req.current) return; // a newer load superseded this one
      setData(res);
    } catch {
      if (id !== req.current) return;
      setError(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    void load();
  }, [load]);

  // The market registry is only needed by the edit form, and its failure is not this page's
  // failure: an empty list loses the "somewhere else" group in one picker, while the sales
  // themselves — which name their own market in words — are unaffected.
  useEffect(() => {
    let cancelled = false;
    api
      .getMarkets()
      .then((m) => {
        if (!cancelled) setMarkets(m);
      })
      .catch(() => {
        /* no registry -> the picker offers what the sale already has */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * One write, one answer, the server's own code mapped to its own sentence. The re-read is
   * outside the failure path: a list that could not refresh is not a write that failed.
   *
   * `alreadyDoneCode` is the done-and-continue case (the shape PortfolioPage.runWrites uses
   * for `watchlist_entry_not_found`): a delete answered "that sale is no longer saved" has
   * already achieved what the farmer asked for, so the question closes and the page re-reads
   * — the sentence still explains why the book just changed under them.
   */
  const run = useCallback(
    async (
      write: () => Promise<unknown>,
      okKey: string,
      opts: { alreadyDoneCode?: string } = {},
    ): Promise<boolean> => {
      setSaving(true);
      setMsg(null);
      let outcome: { tone: 'ok' | 'error'; key: string } = { tone: 'ok', key: okKey };
      try {
        await write();
      } catch (e) {
        const code = e instanceof ApiError ? e.code : null;
        if (!(opts.alreadyDoneCode && code === opts.alreadyDoneCode)) {
          setMsg({ tone: 'error', key: saleErrorKey(code) });
          return false;
        }
        outcome = { tone: 'error', key: saleErrorKey(code) };
      } finally {
        setSaving(false);
      }
      await load();
      setMsg(outcome);
      return true;
    },
    [load],
  );

  const onUpdate = useCallback(
    (saleId: string, input: SaleWriteInput) =>
      run(() => api.updateSale(saleId, input), 'pages.sales.updatedOk'),
    [run],
  );
  const onDelete = useCallback(
    (saleId: string) =>
      run(() => api.deleteSale(saleId), 'pages.sales.deletedOk', {
        alreadyDoneCode: 'sale_not_found',
      }),
    [run],
  );

  const items = data?.items ?? [];
  const busy = saving;
  // A refetch keeps the rows on screen (no layout jump) but they answer the PREVIOUS query.
  const refreshing = loading && data !== null;

  return (
    <>
      <div className="topbar">
        <h1 className="topbar__title">{t('pages.sales.title')}</h1>
        <Link className="topbar__updated pf-back" to="/portfolio">
          {t('pages.sales.back')}
        </Link>
      </div>

      <section className="panel pf" aria-label={t('pages.sales.title')}>
        <p className="pf-sub">{t('pages.sales.subtitle')}</p>
        {/* The same sentence the recording surface makes, for the farmer who arrives here
            first: this book is theirs, and nothing in it moves a market or a forecast. */}
        <p className="pf-sales__note">{t('pages.sales.recordsNote')}</p>

        {error && !data ? (
          <div className="pf-state" role="alert">
            <p className="pf-state__title">{t('common.errorTitle')}</p>
            <p className="pf-state__body">{t('common.errorBody')}</p>
            <button type="button" className="btn-ghost pf-state__retry" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        ) : loading && !data ? (
          <div className="pf-skeleton" aria-busy="true">
            <p className="sr-only">{t('common.loading')}</p>
            <div className="pf-skel pf-skel--banner" />
            <div className="pf-skel pf-skel--card" />
          </div>
        ) : data && items.length === 0 ? (
          // Nothing recorded yet — an invitation with the way to act on it, never a dead end.
          <div className="pf-state pf-state--empty">
            <p className="pf-state__icon" aria-hidden="true">
              🧺
            </p>
            <p className="pf-state__title">{t('pages.sales.emptyTitle')}</p>
            <p className="pf-state__body">{t('pages.sales.emptyBody')}</p>
            <Link className="btn-primary pf-state__cta" to="/portfolio">
              {t('pages.sales.emptyCta')}
            </Link>
          </div>
        ) : data ? (
          <div className={refreshing ? 'pf-stale' : undefined} aria-busy={loading || undefined}>
            {/* A page that failed to REFRESH still has rows worth reading; say so above them
                rather than replacing what is already there with an error. */}
            {error && (
              <p className="pf-note pf-note--nodata" role="alert">
                {t('common.errorBody')}
              </p>
            )}
            <p className="pf-count">{t('pages.sales.total', { count: data.total })}</p>

            {/* The SAME table the popup shows, with one column more (the crop, because this
                book holds every crop) and no "+" (a sale is recorded on its crop). Two
                presentations of one book would drift the day either gained a field. */}
            <SalesTable
              sales={items}
              lang={lang}
              todayYmd={todayYmd}
              showCrop
              // On this page the sale's OWN market is the one context we have: the page does
              // not know which markets the farmer watches this crop at, and guessing would put
              // a market in front of them that means nothing here.
              watchedMarketsFor={(sale) =>
                sale?.marketId
                  ? [{ marketId: sale.marketId, name: sale.marketName ?? sale.marketId }]
                  : []
              }
              allMarkets={markets}
              busy={busy}
              idPrefix="log"
              caption={t('pages.sales.tableCaption')}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onEditorOpen={() => setMsg(null)}
              fallbackFocusRef={statusRef}
            />

            <TablePagination
              page={page}
              totalPages={totalPages}
              perPage={perPage}
              total={data.total}
              setPage={setPage}
              setPerPage={setPerPage}
            />
          </div>
        ) : null}

        {/* tabIndex=-1 so focus can be SENT here when the control that had it has just
            unmounted (a removed sale). It is still a live region, so a farmer who never left
            the keyboard also hears the result. */}
        <p
          ref={statusRef}
          tabIndex={-1}
          className={`pf-plant__msg${msg ? ` pf-plant__msg--${msg.tone}` : ''}`}
          role="status"
          aria-live="polite"
        >
          {msg && (
            <span className="pf-plant__msg-glyph" aria-hidden="true">
              {msg.tone === 'ok' ? '✓' : '!'}
            </span>
          )}
          {msg && t(msg.key, saleErrorParams(msg.key))}
        </p>
      </section>
    </>
  );
}
