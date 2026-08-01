// SalesSection — "what did you get for this crop?", inside the More-details popup.
//
// This is the ONLY place a sale is RECORDED, and that is a deliberate scope decision: here
// the crop is already the subject of the screen, so the one thing a farmer can get wrong —
// filing a sale against the wrong crop — cannot happen. The My-sales page (/portfolio/sales)
// is where the whole book is read, changed and tidied; it offers no "new sale" of its own,
// because a sale form there would have to ask "which crop?" as its first question and that is
// exactly the question this surface has already answered.
//
// It shows: the last few sales for THIS crop as a TABLE, a "+" that inserts an empty row to
// type into, and the way through to the full book. Not a total, not an average, not a "you are
// doing well" — the farmer's own arithmetic is not ours to narrate, and a summary line invites
// a comparison with the forecast that the two numbers do not support (one is a national model
// price, the other is what one buyer paid one farmer on one day).
//
// The section is drawn as its OWN SURFACE inside the popup — a separator above it and a tinted
// inset panel around it — because it is the only part of this sheet the farmer writes into.
// The rest of the popup is something to read; this part is theirs to fill in, and it says so
// before a word is read.
//
// Writes go straight to the API rather than through the page's watchlist machinery: nothing
// here changes the watchlist, so re-reading the dashboard after a sale would be a request
// (and a whole-page repaint) for nothing. The results are reported beside the controls that
// caused them, in this section's own live region — the page's status strip is behind the
// popup's backdrop.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Market, PortfolioDashboardItem, SaleItem } from '../api/types';
import { saleErrorKey, saleErrorParams } from '../lib/salesLog';
import SalesTable, { type SaleWriteInput } from './SalesTable';
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
  const [msg, setMsg] = useState<WriteMessage | null>(null);
  const [saving, setSaving] = useState(false);

  const headingId = `${idPrefix}-sales-head-${item.cropId}`;
  const disabled = busy || saving;

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

  /**
   * One write, one answer. The server's own code wins over any client-side guess about why:
   * "that date is in the future" and "we could not save" are different sentences and the
   * farmer can act on only one of them.
   *
   * `alreadyDoneCode` is the done-and-continue case (the same shape PortfolioPage.runWrites
   * uses for `watchlist_entry_not_found`): a delete answered "that sale is no longer saved"
   * has ALREADY achieved what the farmer asked for. The sentence is still shown — it is true
   * and it explains why the list just changed under them — but the row is closed and the list
   * re-read, instead of leaving a question standing over a record that no longer exists.
   */
  const run = useCallback(
    async (
      write: () => Promise<unknown>,
      okKey: string,
      opts: { alreadyDoneCode?: string } = {},
    ): Promise<boolean> => {
      setSaving(true);
      setMsg(null);
      let outcome: WriteMessage = { tone: 'ok', key: okKey };
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
      // The re-read is OUTSIDE the write's failure path: a list that could not be refreshed
      // is not a write that failed, and saying so would send the farmer to record the same
      // sale twice.
      await load();
      setMsg(outcome);
      return true;
    },
    [load],
  );

  const onInsert = useCallback(
    (input: SaleWriteInput) =>
      run(() => api.recordSale({ cropId: item.cropId, ...input }), 'pages.sales.savedOk'),
    [run, item.cropId],
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

  return (
    <section className="pf-sales" aria-labelledby={headingId}>
      {/* The owner's divider: this section is a different KIND of thing from the price and the
          forecast above it — the part of the popup the farmer writes in — and the rule says so
          before the heading does. Decorative in the same way a section break is: it carries the
          separator role and no text. */}
      <hr className="pf-sales__sep" />

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
      ) : (
        <SalesTable
          sales={sales}
          lang={lang}
          todayYmd={todayYmd}
          showCrop={false}
          // In the popup the crop's OWN markets are the likely ones — that is where this
          // farmer watches this crop, so that is most likely where they sold it.
          watchedMarketsFor={() => item.markets}
          allMarkets={allMarkets}
          busy={disabled}
          idPrefix={`${idPrefix}-${item.cropId}`}
          caption={t('pages.sales.tableCaption')}
          emptyText={t('pages.sales.sectionEmpty')}
          insertCropName={item.cropName}
          onInsert={onInsert}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEditorOpen={() => setMsg(null)}
        />
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
