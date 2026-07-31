// SalesSection — "what did you get for this crop?", inside the More-details popup.
//
// This is the ONLY place a sale is RECORDED, and that is a deliberate scope decision: here
// the crop is already the subject of the screen, so the one thing a farmer can get wrong —
// filing a sale against the wrong crop — cannot happen. The My-sales page (/portfolio/sales)
// is where the whole book is read, changed and tidied; it offers no "new sale" of its own,
// because a sale form there would have to ask "which crop?" as its first question and that is
// exactly the question this surface has already answered.
//
// It shows: the last few sales for THIS crop, a way to record another, and the way through to
// the full book. Not a total, not an average, not a "you are doing well" — the farmer's own
// arithmetic is not ours to narrate, and a summary line invites a comparison with the
// forecast that the two numbers do not support (one is a national model price, the other is
// what one buyer paid one farmer on one day).
//
// The section is COLLAPSED to a single button until the farmer asks for the form. The popup
// already carries the price, the chart, the planting date and the forecast; a five-field form
// permanently open under all of that turns a reading surface into a data-entry screen, and
// the first thing a farmer meets on opening a crop should not be an empty form.
//
// Writes go straight to the API rather than through the page's watchlist machinery: nothing
// here changes the watchlist, so re-reading the dashboard after a sale would be a request
// (and a whole-page repaint) for nothing. The results are reported beside the controls that
// caused them, in this section's own live region — the page's status strip is behind the
// popup's backdrop.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Market, PortfolioDashboardItem, SaleItem } from '../api/types';
import { saleDraftFrom, saleErrorKey, saleErrorParams, type SaleDraft } from '../lib/salesLog';
import SaleForm from './SaleForm';
import SaleRow from './SaleRow';
import type { WriteMessage } from './PlantedDateSection';

/** How many of this crop's sales the popup shows. Small on purpose: it is a reminder of what
 *  was already recorded, not the book — the book is one tap away and is paged. */
export const RECENT_SALES_COUNT = 3;

export interface SalesSectionProps {
  item: PortfolioDashboardItem;
  /** The full market registry, for the farmer who sold somewhere other than the markets they
   *  watch this crop at. Passed down rather than fetched: the page that owns this popup has
   *  already loaded it, and a rural connection should not pay twice. */
  allMarkets: Market[];
  lang: string;
  todayYmd: string;
  /** A watchlist write is in flight on the page behind: leave the farmer one thing at a time. */
  busy: boolean;
  idPrefix: string;
}

/** An empty form: today's date (a farmer recording a sale has usually just made it) and
 *  nothing else assumed. */
function emptyDraft(todayYmd: string): SaleDraft {
  return { saleDate: todayYmd, price: '', quantity: '', note: '' };
}

export default function SalesSection({
  item,
  allMarkets,
  lang,
  todayYmd,
  busy,
  idPrefix,
}: SalesSectionProps) {
  const { t } = useTranslation();
  const [sales, setSales] = useState<SaleItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);
  // Which editor is open: none, the new-sale form, or one existing sale's id. One at a time,
  // because two open forms are two drafts and only one of them can be the farmer's intent.
  const [editor, setEditor] = useState<'none' | 'create' | { saleId: string }>('none');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState<WriteMessage | null>(null);
  const [saving, setSaving] = useState(false);

  const recordBtn = useRef<HTMLButtonElement>(null);
  const yesBtn = useRef<HTMLButtonElement>(null);
  const [pendingFocus, setPendingFocus] = useState<'record' | 'yes' | null>(null);

  const headingId = `${idPrefix}-sales-head-${item.cropId}`;
  const disabled = busy || saving;

  /**
   * Focus goes somewhere deliberate, always, and every destination is a CHAIN.
   * The control the farmer pressed can unmount under them — the confirm becomes a shorter
   * list, the form becomes a button again — and a refused write that also refreshes can take
   * the destination away entirely. A single ref would be null at that moment and a keyboard
   * user would be dropped on <body>.
   */
  useEffect(() => {
    if (pendingFocus === null) return;
    const chain: Record<'record' | 'yes', (HTMLElement | null)[]> = {
      record: [recordBtn.current],
      yes: [yesBtn.current, recordBtn.current],
    };
    chain[pendingFocus].find((el) => el !== null)?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      // Filtered by the route's own cropId parameter — the phone downloads this crop's rows
      // and no others.
      const page = await api.getSales(1, RECENT_SALES_COUNT, item.cropId);
      setSales(page.items);
      setTotal(page.total);
    } catch {
      setSales(null);
      setLoadError(true);
    }
  }, [item.cropId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One write, one answer. The server's own code wins over any client-side guess about why:
   *  "that date is in the future" and "we could not save" are different sentences and the
   *  farmer can act on only one of them. */
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
      // The re-read is OUTSIDE the write's failure path: a list that could not be refreshed
      // is not a write that failed, and saying so would send the farmer to record the same
      // sale twice.
      await load();
      setMsg({ tone: 'ok', key: okKey });
      return true;
    },
    [load],
  );

  const closeEditors = useCallback(() => {
    setEditor('none');
    // A confirm that is merely hidden by an editor comes back stale — asking to remove a sale
    // the farmer has since walked away from. It is RESET here, inline, every time.
    setConfirmId(null);
  }, []);

  const editingSale =
    typeof editor === 'object' ? (sales ?? []).find((s) => s.id === editor.saleId) ?? null : null;

  return (
    <section className="pf-sales" aria-labelledby={headingId}>
      <div className="pf-plant__headrow">
        {/* Decoration: it repeats the heading beside it and is hidden from assistive tech. It
            exists so the farmer scanning a long popup finds "the money part" without reading. */}
        <span className="pf-plant__seed pf-sales__glyph" aria-hidden="true">
          🧺
        </span>
        <h3 className="pf-plant__head" id={headingId}>
          {t('pages.sales.sectionHeading')}
        </h3>
      </div>

      {/* Said once, plainly, where the recording happens: this is the farmer's own book and
          it changes nothing else. Without it a farmer can reasonably assume that telling us
          what they got will move the price or the forecast. */}
      <p className="pf-sales__note">{t('pages.sales.recordsNote')}</p>

      {sales === null ? (
        loadError ? (
          <div className="pf-plant__fcerr">
            <p className="pf-nodata" role="note">
              <span aria-hidden="true">🔎 </span>
              {t('pages.sales.loadFailed')}
            </p>
            <button type="button" className="btn-ghost pf-plant__retry" onClick={() => void load()}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className="pf-skel pf-skel--pred" aria-busy="true">
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        )
      ) : sales.length === 0 ? (
        <p className="pf-sales__empty">{t('pages.sales.sectionEmpty')}</p>
      ) : (
        <ul className="pf-sales__list">
          {sales.map((sale) =>
            editingSale && editingSale.id === sale.id ? (
              <li className="pf-sale pf-sale--editing" key={sale.id}>
                <h4 className="pf-sale__edithead">{t('pages.sales.editHeading')}</h4>
                <SaleForm
                  // A new key per sale reseeds the draft: an edit form still holding the
                  // previous sale's numbers is a way to overwrite the wrong row.
                  key={`edit-${sale.id}`}
                  idPrefix={`${idPrefix}-edit-${sale.id}`}
                  cropName={item.cropName}
                  watchedMarkets={item.markets}
                  allMarkets={allMarkets}
                  todayYmd={todayYmd}
                  initialDraft={saleDraftFrom(sale)}
                  initialMarketId={sale.marketId ?? ''}
                  mode="edit"
                  busy={disabled}
                  autoFocus
                  onSubmit={(input) => {
                    void (async () => {
                      const ok = await run(
                        () => api.updateSale(sale.id, input),
                        'pages.sales.updatedOk',
                      );
                      if (!ok) return; // the form stays open with the farmer's numbers in it
                      closeEditors();
                      setPendingFocus('record');
                    })();
                  }}
                  onCancel={() => {
                    setMsg(null);
                    closeEditors();
                    setPendingFocus('record');
                  }}
                />
              </li>
            ) : (
              <SaleRow
                key={sale.id}
                sale={sale}
                lang={lang}
                showCrop={false}
                busy={disabled}
                confirming={confirmId === sale.id}
                yesRef={confirmId === sale.id ? yesBtn : undefined}
                onEdit={() => {
                  setMsg(null);
                  setConfirmId(null);
                  setEditor({ saleId: sale.id });
                }}
                onAskDelete={() => {
                  setMsg(null);
                  setEditor('none');
                  setConfirmId(sale.id);
                  // The Remove button the farmer just pressed is being UNMOUNTED by this very
                  // state change — the confirm replaces the actions row — so focus has to be
                  // sent with it or the keyboard user is dropped on <body>, back at the top of
                  // the document. Same move as the planting-date Remove.
                  setPendingFocus('yes');
                }}
                onCancelDelete={() => setConfirmId(null)}
                onConfirmDelete={() => {
                  void (async () => {
                    const ok = await run(() => api.deleteSale(sale.id), 'pages.sales.deletedOk');
                    if (!ok) {
                      // The question STAYS on screen: the sale is still there, so the choice
                      // the farmer made is still available, and trying again is one tap rather
                      // than a re-opened confirm. Focus goes back to the answer they pressed.
                      setPendingFocus('yes');
                      return;
                    }
                    setConfirmId(null);
                    setPendingFocus('record');
                  })();
                }}
              />
            ),
          )}
        </ul>
      )}

      {editor === 'create' ? (
        <div className="pf-sale pf-sale--editing">
          <h4 className="pf-sale__edithead">{t('pages.sales.recordHeading')}</h4>
          <SaleForm
            idPrefix={`${idPrefix}-new-${item.cropId}`}
            cropName={item.cropName}
            watchedMarkets={item.markets}
            allMarkets={allMarkets}
            todayYmd={todayYmd}
            initialDraft={emptyDraft(todayYmd)}
            initialMarketId={item.markets[0]?.marketId ?? ''}
            mode="create"
            busy={disabled}
            autoFocus
            onSubmit={(input) => {
              void (async () => {
                const ok = await run(
                  () => api.recordSale({ cropId: item.cropId, ...input }),
                  'pages.sales.savedOk',
                );
                if (!ok) return; // never discard what the farmer typed on a refusal
                closeEditors();
                setPendingFocus('record');
              })();
            }}
            onCancel={() => {
              setMsg(null);
              closeEditors();
              setPendingFocus('record');
            }}
          />
        </div>
      ) : (
        <p className="pf-sales__cta">
          <button
            type="button"
            ref={recordBtn}
            className="pf-btn pf-btn--ghost"
            disabled={disabled}
            onClick={() => {
              setMsg(null);
              setConfirmId(null);
              setEditor('create');
            }}
            aria-label={t('pages.sales.recordCtaAria', { crop: item.cropName })}
          >
            {t('pages.sales.recordCta')}
          </button>
        </p>
      )}

      {/* The result of the farmer's OWN action, beside the control they used. */}
      <p
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

      {/* Always offered, even with nothing recorded for this crop: the book holds every crop,
          so "see all sales" is never an empty promise. The count is the truth about THIS crop
          and is only claimed once the list has really loaded. */}
      <p className="pf-sales__all">
        {/* NO aria-label. The visible text already says exactly where this goes, and an
            aria-label would have to REPEAT it verbatim to satisfy WCAG 2.5.3 (label in name)
            — a farmer using voice control says "see all sales", and a name that does not
            contain those words is a control they cannot address. Letting the contents be the
            name also keeps it honest when the text carries the count. It is distinct from the
            "My sales" link on the page behind, so the two never read as one control said
            twice. */}
        <Link className="pf-card__link" to="/portfolio/sales">
          {sales !== null && total > sales.length
            ? t('pages.sales.seeAllCount', { count: total })
            : t('pages.sales.seeAll')}
        </Link>
      </p>
    </section>
  );
}
