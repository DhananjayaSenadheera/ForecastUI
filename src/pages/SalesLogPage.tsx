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
import type { Market, SaleItem, SalesPage } from '../api/types';
import SaleForm from '../components/SaleForm';
import SaleRow from '../components/SaleRow';
import TablePagination, { useServerPagination } from '../components/TablePagination';
import { ymdLocal } from '../lib/format';
import { saleDraftFrom, saleErrorKey, saleErrorParams } from '../lib/salesLog';
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; key: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const statusRef = useRef<HTMLParagraphElement>(null);
  const yesBtn = useRef<HTMLButtonElement>(null);
  const [pendingFocus, setPendingFocus] = useState<'status' | 'yes' | null>(null);

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

  /** Every destination is a CHAIN: a delete empties a row, an edit closes a form, and the
   *  control the farmer pressed can be gone by the time focus moves. */
  useEffect(() => {
    if (pendingFocus === null) return;
    const chain: Record<'status' | 'yes', (HTMLElement | null)[]> = {
      status: [statusRef.current],
      yes: [yesBtn.current, statusRef.current],
    };
    chain[pendingFocus].find((el) => el !== null)?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  /** One write, one answer, the server's own code mapped to its own sentence. The re-read is
   *  outside the failure path: a list that could not refresh is not a write that failed. */
  const run = useCallback(
    async (write: () => Promise<unknown>, okKey: string): Promise<boolean> => {
      setSaving(true);
      setMsg(null);
      try {
        await write();
      } catch (e) {
        const code = e instanceof ApiError ? e.code : null;
        setMsg({ tone: 'error', key: saleErrorKey(code) });
        return false;
      } finally {
        setSaving(false);
      }
      await load();
      setMsg({ tone: 'ok', key: okKey });
      return true;
    },
    [load],
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

            <ul className="pf-sales__list pf-sales__list--page">
              {items.map((sale: SaleItem) =>
                editingId === sale.id ? (
                  <li className="pf-sale pf-sale--editing" key={sale.id}>
                    <h2 className="pf-sale__edithead">{t('pages.sales.editHeading')}</h2>
                    <SaleForm
                      key={`edit-${sale.id}`}
                      idPrefix={`log-${sale.id}`}
                      cropName={sale.cropName}
                      // On this page the sale's OWN market is the one context we have: the
                      // page does not know which markets the farmer watches this crop at, and
                      // guessing would put a market in front of them that means nothing here.
                      watchedMarkets={
                        sale.marketId
                          ? [{ marketId: sale.marketId, name: sale.marketName ?? sale.marketId }]
                          : []
                      }
                      allMarkets={markets}
                      todayYmd={todayYmd}
                      initialDraft={saleDraftFrom(sale)}
                      initialMarketId={sale.marketId ?? ''}
                      mode="edit"
                      busy={busy}
                      autoFocus
                      onSubmit={(input) => {
                        void (async () => {
                          const ok = await run(
                            () => api.updateSale(sale.id, input),
                            'pages.sales.updatedOk',
                          );
                          if (!ok) return; // the form keeps the farmer's numbers
                          setEditingId(null);
                          setPendingFocus('status');
                        })();
                      }}
                      onCancel={() => {
                        setMsg(null);
                        setEditingId(null);
                        setPendingFocus('status');
                      }}
                    />
                  </li>
                ) : (
                  <SaleRow
                    key={sale.id}
                    sale={sale}
                    lang={lang}
                    showCrop
                    busy={busy}
                    confirming={confirmId === sale.id}
                    yesRef={confirmId === sale.id ? yesBtn : undefined}
                    onEdit={() => {
                      setMsg(null);
                      // Opening an editor RESETS any pending confirm inline: a question about
                      // removing a sale the farmer has since started editing is a question
                      // about something they did not ask.
                      setConfirmId(null);
                      setEditingId(sale.id);
                    }}
                    onAskDelete={() => {
                      setMsg(null);
                      setEditingId(null);
                      setConfirmId(sale.id);
                      // The Remove button is being UNMOUNTED by this state change (the confirm
                      // replaces the actions row), so focus travels with it — otherwise the
                      // keyboard user lands on <body>.
                      setPendingFocus('yes');
                    }}
                    onCancelDelete={() => setConfirmId(null)}
                    onConfirmDelete={() => {
                      void (async () => {
                        const ok = await run(
                          () => api.deleteSale(sale.id),
                          'pages.sales.deletedOk',
                        );
                        if (!ok) {
                          // The sale is still there, so its question stays answerable; focus
                          // returns to the answer the farmer pressed.
                          setPendingFocus('yes');
                          return;
                        }
                        setConfirmId(null);
                        // The row the farmer pressed in is gone; the result message is not.
                        setPendingFocus('status');
                      })();
                    }}
                  />
                ),
              )}
            </ul>

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
