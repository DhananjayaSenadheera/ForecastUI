// SalesTable — every sale the farmer has written down, as ONE table on BOTH surfaces.
//
// It replaces the old SaleRow (a card) and SaleForm (a separate five-field block): the popup's
// "Sales you have recorded" section and the My-sales page now render the same rows, the same
// columns and the same editing behaviour. Two presentations of one book would drift the day
// either gained a field, and a farmer who learns to change a sale in the popup must not have
// to learn it again on the page.
//
// ROW EDITING, not a form step (the owner's ask, and the DataGrid pattern they named): "+"
// inserts an EMPTY row at the TOP of the table and the farmer types straight into its cells;
// "Change" turns an existing row into those same cells in place. The last column carries the
// actions — Save/Cancel while editing, Change/Remove otherwise — so the farmer's eye never
// leaves the row they are working on.
//
// What survived the redesign unchanged, because it is load-bearing rather than decorative:
//  - The submit gate is the NAMED, EXPORTED rule `canSubmitSale` (lib/salesLog), read by BOTH
//    the Save button's `disabled` and its handler. React consults fiber props for `disabled`,
//    so the attribute alone can never be the guarantee.
//  - NO maxLength on the note. A browser enforces maxLength by TRUNCATING a paste, silently
//    dropping the end of what the farmer wrote; the server refuses an over-long note and never
//    shortens it, so neither may we. The trimmed count is the live gate.
//  - Every rule that can block the save EXPLAINS ITSELF. A table cell is far too narrow for a
//    sentence, so the explanations live in a full-width row directly under the editing row and
//    are wired to their own field with aria-describedby — the sentence is still the field's
//    own, it is simply drawn where it fits.
//  - The delete confirm is a choice (role="alertdialog"), it takes focus into itself because it
//    unmounts the button that opened it, a refused delete keeps it open, and Escape inside it
//    is swallowed UNCONDITIONALLY — on the popup surface a bubbled Escape closes the only
//    surface that reports the outcome.
//  - Nothing here is red. This is money vocabulary: a low price is a fact about a market, and
//    "Remove" discards a line the farmer can type again in ten seconds.
//
// Narrow screens: the SAME table becomes the app's key/value card list under 600px (the
// .pf-table pattern, CSS only — no matchMedia deciding layout in JavaScript). Every cell
// carries data-label, so a stacked cell keeps the column heading that names it, and the
// editing cells keep their aria-labels either way.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SALE_AMOUNT_MAX, SALE_NOTE_MAX, type Market, type SaleItem } from '../api/types';
import { exactDigits, formatDate, formatExactAmount, formatPrice } from '../lib/format';
import {
  canSubmitSale,
  isAllowedAmount,
  isAllowedSaleDate,
  isNoteWithinLimit,
  parseFarmerAmount,
  saleDateMax,
  saleDraftFrom,
  saleInputFromDraft,
  type SaleDraft,
} from '../lib/salesLog';

/** A market a row's picker can offer: the crop's own watched markets come from the dashboard
 *  item, the sale's own market from the sale itself, and both are reduced to this. */
export interface SaleMarketOption {
  marketId: string;
  name: string;
}

/** Exactly what the wire takes for a sale, minus the crop (which is fixed per surface and
 *  immutable on an edit). */
export type SaleWriteInput = ReturnType<typeof saleInputFromDraft>;

/** The column headings, resolved once per render. They are also the editing inputs' accessible
 *  names: the visible column heading IS the visual label for the cell under it, so a screen
 *  reader hears the same word a sighted farmer reads. */
interface ColumnLabels {
  date: string;
  crop: string;
  price: string;
  quantity: string;
  market: string;
  note: string;
  actions: string;
}

export interface SalesTableProps {
  sales: SaleItem[];
  lang: string;
  todayYmd: string;
  /** True on the My-sales page, where one book holds every crop. */
  showCrop: boolean;
  /** The markets to offer FIRST for a given row — the crop's watched markets in the popup, the
   *  sale's own market on the page (which knows nothing about what the farmer watches). Called
   *  with `null` for the insert row. */
  watchedMarketsFor: (sale: SaleItem | null) => SaleMarketOption[];
  /** Every market we know of, for the farmer who sold somewhere else. Empty is fine. */
  allMarkets: Market[];
  /** A write is in flight on this surface: every control is disabled together. */
  busy: boolean;
  /** DOM id prefix. Two tables can exist at once (the popup over the page). */
  idPrefix: string;
  /** The table's accessible name, as a real <caption>. */
  caption: string;
  /** Shown instead of an empty table when there is nothing recorded and nothing being typed.
   *  Omitted on the page, which has a whole empty state of its own. */
  emptyText?: string;
  /** Given ⇒ this surface can RECORD a sale, and the "+" appears. The page passes none: a sale
   *  is recorded where its crop is already the subject, so it cannot be filed against the
   *  wrong one. Resolves true when the sale really landed. */
  onInsert?: (input: SaleWriteInput) => Promise<boolean>;
  /** The crop an inserted sale belongs to — it names the "+" control. Required with onInsert. */
  insertCropName?: string;
  onUpdate: (saleId: string, input: SaleWriteInput) => Promise<boolean>;
  /** Resolves true when the row is GONE — including the case where it was already gone, which
   *  is done-and-continue rather than a failure. */
  onDelete: (saleId: string) => Promise<boolean>;
  /** The farmer has started something new: the surface's own result message is about the
   *  PREVIOUS action and must not stand over it. */
  onEditorOpen?: () => void;
  /** Last resort for focus when every control that could take it has unmounted (the page's
   *  result line). */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

/** An empty row: today's date (a farmer recording a sale has usually just made it) and nothing
 *  else assumed. */
function emptyDraft(todayYmd: string): SaleDraft {
  return { saleDate: todayYmd, price: '', quantity: '', note: '' };
}

export default function SalesTable({
  sales,
  lang,
  todayYmd,
  showCrop,
  watchedMarketsFor,
  allMarkets,
  busy,
  idPrefix,
  caption,
  emptyText,
  onInsert,
  insertCropName,
  onUpdate,
  onDelete,
  onEditorOpen,
  fallbackFocusRef,
}: SalesTableProps) {
  const { t } = useTranslation();

  // Which editor is open: none, the insert row, or one existing sale's id. One at a time,
  // because two open editors are two drafts and only one of them can be the farmer's intent.
  const [editor, setEditor] = useState<'none' | 'insert' | { saleId: string }>('none');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const addBtn = useRef<HTMLButtonElement>(null);
  const yesBtn = useRef<HTMLButtonElement>(null);
  // The per-row "Change" buttons, so focus can go back to the row that was just saved. A single
  // ref cannot do it: the destination is one of many rows and is chosen at runtime.
  const editBtns = useRef(new Map<string, HTMLButtonElement>());
  const [pendingFocus, setPendingFocus] = useState<
    { kind: 'add' } | { kind: 'yes' } | { kind: 'edit'; saleId: string } | null
  >(null);

  /**
   * Focus goes somewhere deliberate, always, and every destination is a CHAIN.
   * The control the farmer pressed can unmount under them — the confirm replaces the actions,
   * a saved row can vanish from a re-read page, and the "+" does not exist on every surface —
   * so a single ref would be null at that moment and a keyboard user would land on <body>.
   */
  useEffect(() => {
    if (pendingFocus === null) return;
    const row = pendingFocus.kind === 'edit' ? editBtns.current.get(pendingFocus.saleId) : null;
    const chain: (HTMLElement | null | undefined)[] =
      pendingFocus.kind === 'add'
        ? [addBtn.current, fallbackFocusRef?.current]
        : pendingFocus.kind === 'yes'
          ? [yesBtn.current, addBtn.current, fallbackFocusRef?.current]
          : [row, addBtn.current, fallbackFocusRef?.current];
    chain.find((el) => el !== null && el !== undefined)?.focus();
    setPendingFocus(null);
  }, [pendingFocus, fallbackFocusRef]);

  const closeEditors = useCallback(() => {
    setEditor('none');
    // A confirm merely HIDDEN by an editor comes back stale — asking to remove a sale the
    // farmer has since walked away from. It is RESET here, inline, every time.
    setConfirmId(null);
  }, []);

  const labels: ColumnLabels = {
    date: t('pages.sales.colDate'),
    crop: t('pages.sales.colCrop'),
    price: t('pages.sales.colPrice'),
    quantity: t('pages.sales.colQuantity'),
    market: t('pages.sales.colMarket'),
    note: t('pages.sales.colNote'),
    actions: t('pages.sales.colActions'),
  };
  // Day sold · [Crop] · Price · Amount · Market · Note · actions.
  const colCount = showCrop ? 7 : 6;

  const inserting = editor === 'insert';
  const editingId = typeof editor === 'object' ? editor.saleId : null;
  const nothingToShow = sales.length === 0 && !inserting;

  return (
    <div className="pf-stbl">
      {onInsert && (
        // Above the table, at its end: the row it creates appears immediately below, so the
        // control and its effect are next to each other. It is small BY REQUEST, which is why
        // the glyph is decorative and the accessible name is a whole sentence — "+" is not a
        // name anybody could say to a voice assistant or hear from a screen reader.
        <div className="pf-stbl__bar">
          <button
            type="button"
            ref={addBtn}
            className="pf-stbl__add"
            disabled={busy || inserting}
            aria-label={t('pages.sales.recordCtaAria', { crop: insertCropName ?? '' })}
            onClick={() => {
              onEditorOpen?.();
              setConfirmId(null);
              setEditor('insert');
            }}
          >
            <PlusIcon />
          </button>
        </div>
      )}

      {nothingToShow ? (
        emptyText ? (
          <p className="pf-sales__empty">{emptyText}</p>
        ) : null
      ) : (
        <div className="pf-tablewrap">
          <table className="pf-table pf-stbl__table">
            {/* A real caption, not an aria-label: it is the table's own name in the document,
                and it survives a farmer who reads the page with images and CSS off. */}
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.date}</th>
                {showCrop && <th scope="col">{labels.crop}</th>}
                <th scope="col">{labels.price}</th>
                <th scope="col">{labels.quantity}</th>
                <th scope="col">{labels.market}</th>
                <th scope="col">{labels.note}</th>
                <th scope="col">{labels.actions}</th>
              </tr>
            </thead>
            <tbody>
              {inserting && onInsert && (
                <SaleEditRow
                  key="insert"
                  idPrefix={`${idPrefix}-new`}
                  labels={labels}
                  colCount={colCount}
                  showCrop={showCrop}
                  cropName={insertCropName ?? ''}
                  initialDraft={emptyDraft(todayYmd)}
                  initialMarketId={watchedMarketsFor(null)[0]?.marketId ?? ''}
                  watchedMarkets={watchedMarketsFor(null)}
                  allMarkets={allMarkets}
                  todayYmd={todayYmd}
                  busy={busy}
                  mode="create"
                  onSubmit={(input) => {
                    void (async () => {
                      const ok = await onInsert(input);
                      if (!ok) return; // never discard what the farmer typed on a refusal
                      closeEditors();
                      setPendingFocus({ kind: 'add' });
                    })();
                  }}
                  onCancel={() => {
                    closeEditors();
                    setPendingFocus({ kind: 'add' });
                  }}
                />
              )}

              {sales.map((sale) =>
                editingId === sale.id ? (
                  <SaleEditRow
                    // A new key per sale reseeds the draft: an editing row still holding the
                    // previous sale's numbers is a way to overwrite the wrong record.
                    key={`edit-${sale.id}`}
                    idPrefix={`${idPrefix}-edit-${sale.id}`}
                    labels={labels}
                    colCount={colCount}
                    showCrop={showCrop}
                    cropName={sale.cropName}
                    initialDraft={saleDraftFrom(sale)}
                    initialMarketId={sale.marketId ?? ''}
                    watchedMarkets={watchedMarketsFor(sale)}
                    allMarkets={allMarkets}
                    todayYmd={todayYmd}
                    busy={busy}
                    mode="edit"
                    onSubmit={(input) => {
                      void (async () => {
                        const ok = await onUpdate(sale.id, input);
                        if (!ok) return; // the row stays open with the farmer's numbers in it
                        closeEditors();
                        setPendingFocus({ kind: 'edit', saleId: sale.id });
                      })();
                    }}
                    onCancel={() => {
                      closeEditors();
                      setPendingFocus({ kind: 'edit', saleId: sale.id });
                    }}
                  />
                ) : (
                  <SaleViewRow
                    key={sale.id}
                    sale={sale}
                    lang={lang}
                    labels={labels}
                    colCount={colCount}
                    showCrop={showCrop}
                    busy={busy}
                    confirming={confirmId === sale.id}
                    yesRef={confirmId === sale.id ? yesBtn : undefined}
                    editRef={(el) => {
                      if (el) editBtns.current.set(sale.id, el);
                      else editBtns.current.delete(sale.id);
                    }}
                    onEdit={() => {
                      onEditorOpen?.();
                      setConfirmId(null);
                      setEditor({ saleId: sale.id });
                    }}
                    onAskDelete={() => {
                      onEditorOpen?.();
                      setEditor('none');
                      setConfirmId(sale.id);
                      // The Remove button the farmer just pressed is being UNMOUNTED by this
                      // very state change — the confirm replaces the actions — so focus has to
                      // be sent with it or the keyboard user is dropped on <body>, back at the
                      // top of the document.
                      setPendingFocus({ kind: 'yes' });
                    }}
                    onCancelDelete={() => setConfirmId(null)}
                    onConfirmDelete={() => {
                      void (async () => {
                        const gone = await onDelete(sale.id);
                        if (!gone) {
                          // The question STAYS on screen: the sale is still there, so the
                          // choice the farmer made is still available, and trying again is one
                          // tap rather than a re-opened confirm.
                          setPendingFocus({ kind: 'yes' });
                          return;
                        }
                        setConfirmId(null);
                        setPendingFocus({ kind: 'add' });
                      })();
                    }}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One recorded sale, read-only, plus its remove-question when that is open.
 *
 *  Honesty rules kept from the card this replaces: the price prints EXACTLY as recorded
 *  (Rs. 215.50 never becomes Rs. 216 — it is the farmer's own money, not a forecast), and
 *  "No market recorded" is a FACT rather than missing data, because selling at the farm gate
 *  is a normal answer. */
function SaleViewRow({
  sale,
  lang,
  labels,
  colCount,
  showCrop,
  busy,
  confirming,
  yesRef,
  editRef,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  sale: SaleItem;
  lang: string;
  labels: ColumnLabels;
  colCount: number;
  showCrop: boolean;
  busy: boolean;
  confirming: boolean;
  yesRef?: React.Ref<HTMLButtonElement>;
  editRef: (el: HTMLButtonElement | null) => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { t } = useTranslation();
  const when = formatDate(sale.saleDate, lang);
  const confirmId = `sale-confirm-${sale.id}`;

  return (
    <Fragment>
      <tr className="pf-row pf-stbl__row">
        <td data-label={labels.date}>{when}</td>
        {showCrop && <td data-label={labels.crop}>{sale.cropName}</td>}
        <td className="pf-stbl__num" data-label={labels.price}>
          {formatPrice(sale.pricePerKg, lang, t('common.rs'), exactDigits(sale.pricePerKg))}
        </td>
        <td className="pf-stbl__num" data-label={labels.quantity}>
          {sale.quantityKg === null
            ? t('pages.sales.notRecorded')
            : t('pages.sales.quantityValue', { qty: formatExactAmount(sale.quantityKg, lang) })}
        </td>
        <td data-label={labels.market}>
          {sale.marketId === null ? t('pages.sales.noMarket') : sale.marketName}
        </td>
        <td className="pf-stbl__note" data-label={labels.note}>
          {sale.note}
        </td>
        <td className="pf-stbl__act" data-label={labels.actions}>
          {/* While the question below is open this cell is EMPTY on purpose: the two answers
              are the only choices, and leaving Change/Remove beside them offers a way to walk
              away from a question the farmer was just asked. */}
          {!confirming && (
            <div className="pf-stbl__actions">
              <button
                type="button"
                ref={editRef}
                className="pf-plant__link"
                disabled={busy}
                onClick={onEdit}
                aria-label={t('pages.sales.editAria', { crop: sale.cropName, date: when })}
              >
                {t('pages.sales.edit')}
              </button>
              <button
                type="button"
                className="pf-plant__link"
                disabled={busy}
                onClick={onAskDelete}
                aria-label={t('pages.sales.deleteAria', { crop: sale.cropName, date: when })}
              >
                {t('pages.sales.delete')}
              </button>
            </div>
          )}
        </td>
      </tr>

      {confirming && (
        // A full-width row under the one it is about: a cell is nowhere near wide enough for a
        // question and two answers, and a farmer must be able to read what they are agreeing to.
        <tr className="pf-stbl__wide">
          <td colSpan={colCount} data-label="">
            {/* alertdialog, not alert: this region is a CHOICE, and a plain alert announces
                text while telling a screen-reader user nothing about the decision they are
                standing in. Escape is swallowed UNCONDITIONALLY and only the cancel is
                conditional: on the popup surface this sits inside a dialog, and a mid-flight
                Escape that bubbled would close the only surface reporting the result. */}
            <div
              className="pf-confirm pf-sale__confirm"
              role="alertdialog"
              aria-labelledby={confirmId}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.stopPropagation();
                e.preventDefault();
                if (!busy) onCancelDelete();
              }}
            >
              <p className="pf-confirm__q" id={confirmId}>
                {t('pages.sales.deleteConfirmQuestion', { crop: sale.cropName, date: when })}
              </p>
              <div className="pf-confirm__actions">
                <button
                  type="button"
                  ref={yesRef}
                  className="btn-primary pf-sale__yes"
                  disabled={busy}
                  onClick={onConfirmDelete}
                >
                  {t('pages.sales.deleteConfirmYes')}
                </button>
                <button
                  type="button"
                  className="btn-ghost pf-confirm__no"
                  disabled={busy}
                  onClick={onCancelDelete}
                >
                  {t('pages.sales.deleteConfirmNo')}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** The row the farmer is typing in — inserted empty at the top, or an existing row turned
 *  editable in place. Same cells either way, so nobody has to learn a second layout.
 *
 *  It owns its draft from mount; the parent gives it a new React `key` to reseed it. */
function SaleEditRow({
  idPrefix,
  labels,
  colCount,
  showCrop,
  cropName,
  initialDraft,
  initialMarketId,
  watchedMarkets,
  allMarkets,
  todayYmd,
  busy,
  mode,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  labels: ColumnLabels;
  colCount: number;
  showCrop: boolean;
  cropName: string;
  initialDraft: SaleDraft;
  initialMarketId: string;
  watchedMarkets: SaleMarketOption[];
  allMarkets: Market[];
  todayYmd: string;
  busy: boolean;
  mode: 'create' | 'edit';
  onSubmit: (input: SaleWriteInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SaleDraft>(initialDraft);
  const [marketId, setMarketId] = useState<string>(initialMarketId);
  const dateRef = useRef<HTMLInputElement>(null);

  // On mount only. The control the farmer pressed ("+", "Change") has just been replaced by
  // these cells, so focus has to be sent somewhere deliberate or a keyboard user is dropped
  // back on <body>. Re-focusing on every render would fight their own cursor as they move
  // along the row; a remount (new key), not a prop change, is what re-runs this.
  useEffect(() => {
    dateRef.current?.focus();
  }, []);

  const dateErrId = `${idPrefix}-date-err`;
  const priceErrId = `${idPrefix}-price-err`;
  const qtyErrId = `${idPrefix}-qty-err`;
  const noteHintId = `${idPrefix}-note-hint`;
  const noteErrId = `${idPrefix}-note-err`;

  const set = (patch: Partial<SaleDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // Each answer is judged only once the farmer has actually given it: an empty field is
  // unfinished, not wrong, and telling someone their blank price is invalid before they have
  // typed it is nagging.
  const dateBad = draft.saleDate !== '' && !isAllowedSaleDate(draft.saleDate, todayYmd);
  const priceBad = draft.price.trim() !== '' && !isAllowedAmount(parseFarmerAmount(draft.price));
  const qtyBad = draft.quantity.trim() !== '' && !isAllowedAmount(parseFarmerAmount(draft.quantity));
  const trimmedNote = draft.note.trim();
  const noteBad = !isNoteWithinLimit(draft.note);

  // The watched markets first (most likely), then everything else that is not already listed
  // above — one market must never appear twice in one picker.
  const watchedIds = new Set(watchedMarkets.map((m) => m.marketId.toLowerCase()));
  const otherMarkets = allMarkets.filter((m) => !watchedIds.has(m.id.toLowerCase()));

  const canSubmit = canSubmitSale(draft, todayYmd);

  return (
    <Fragment>
      <tr
        className="pf-row pf-stbl__edit"
        // Escape leaves the row alone: the same manners the remove-question has, for the same
        // reason. stopPropagation is UNCONDITIONAL — on the popup surface this row sits inside
        // a dialog, and a key that bubbled while a save was in flight would close the only
        // surface that can report what happened. Only the cancel itself is conditional.
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          e.preventDefault();
          if (!busy) onCancel();
        }}
      >
        <td data-label={labels.date}>
          <input
            ref={dateRef}
            type="date"
            className="pf-plant__input pf-stbl__input"
            value={draft.saleDate}
            // Today is the ceiling: a sale is something that has already happened. There is no
            // floor, because the wire states none and inventing one would refuse a record the
            // server would have accepted.
            max={saleDateMax(todayYmd)}
            disabled={busy}
            aria-label={labels.date}
            aria-invalid={dateBad || undefined}
            aria-describedby={dateBad ? dateErrId : undefined}
            onChange={(e) => set({ saleDate: e.target.value })}
          />
        </td>

        {/* The crop is NOT editable: a sale's crop is fixed at recording, which is why
            recording happens on the crop's own popup. It is shown, not offered. */}
        {showCrop && <td data-label={labels.crop}>{cropName}</td>}

        <td data-label={labels.price}>
          {/* type="text" with inputMode="decimal": the phone shows a number pad, and the value
              stays exactly what the farmer typed — a number input silently discards a string it
              dislikes, so "1,250" would vanish rather than be corrected. */}
          <input
            type="text"
            inputMode="decimal"
            className="pf-plant__input pf-stbl__input"
            value={draft.price}
            disabled={busy}
            aria-label={labels.price}
            aria-invalid={priceBad || undefined}
            aria-describedby={priceBad ? priceErrId : undefined}
            onChange={(e) => set({ price: e.target.value })}
          />
        </td>

        <td data-label={labels.quantity}>
          <input
            type="text"
            inputMode="decimal"
            className="pf-plant__input pf-stbl__input"
            value={draft.quantity}
            disabled={busy}
            aria-label={labels.quantity}
            aria-invalid={qtyBad || undefined}
            aria-describedby={qtyBad ? qtyErrId : undefined}
            onChange={(e) => set({ quantity: e.target.value })}
          />
        </td>

        <td data-label={labels.market}>
          {/* A native select: the phone's own picker, no invented widget. "No market" is the
              first option and a REAL answer — a farmer who sold at the gate is not missing
              data. The groups are named so a long list stays readable. */}
          <select
            className="pf-sale__select pf-stbl__input"
            value={marketId}
            disabled={busy}
            aria-label={labels.market}
            onChange={(e) => setMarketId(e.target.value)}
          >
            <option value="">{t('pages.sales.marketNone')}</option>
            {watchedMarkets.length > 0 && (
              <optgroup label={t('pages.sales.marketWatchedGroup')}>
                {watchedMarkets.map((m) => (
                  <option key={m.marketId} value={m.marketId}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
            {otherMarkets.length > 0 && (
              <optgroup label={t('pages.sales.marketOtherGroup')}>
                {otherMarkets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </td>

        <td data-label={labels.note}>
          <textarea
            className="pf-clear__input pf-stbl__input"
            rows={2}
            // NO maxLength — see the header. The trimmed count is the gate.
            value={draft.note}
            disabled={busy}
            aria-label={labels.note}
            aria-invalid={noteBad || undefined}
            aria-describedby={noteBad ? `${noteHintId} ${noteErrId}` : noteHintId}
            onChange={(e) => set({ note: e.target.value })}
          />
        </td>

        <td className="pf-stbl__act" data-label={labels.actions}>
          <div className="pf-stbl__actions">
            <button
              type="button"
              className="btn-primary pf-stbl__save"
              // The same named rule the handler re-asks. Disabled is a courtesy; the rule is
              // the guarantee.
              disabled={busy || !canSubmit}
              onClick={() => {
                if (!canSubmitSale(draft, todayYmd)) return;
                onSubmit(saleInputFromDraft(draft, marketId));
              }}
              // "Save" is what the cell has room to show; the name says which sale it saves,
              // and begins with the visible word so voice control can still address it.
              aria-label={t(
                mode === 'create' ? 'pages.sales.saveAria' : 'pages.sales.saveEditAria',
                { crop: cropName },
              )}
            >
              {t('pages.sales.saveShort')}
            </button>
            <button
              type="button"
              className="btn-ghost pf-stbl__cancel"
              disabled={busy}
              onClick={onCancel}
            >
              {t('pages.sales.cancel')}
            </button>
          </div>
        </td>
      </tr>

      {/* Why an answer cannot be used, in a FULL-WIDTH row directly under the one being typed
          in. A disabled Save that will not say why is a dead end for a farmer who is not sure
          what went wrong — but a table cell has no room for a sentence, so the sentence moves
          here and stays wired to its own field with aria-describedby. */}
      <tr className="pf-stbl__wide pf-stbl__msgs">
        <td colSpan={colCount} data-label="">
          {/* The column headings cannot carry "(optional)" — they are frozen, short and shared
              with the read-only rows — so the row says once, in words, which answers it really
              needs. Without it an empty Market or Amount looks like something the farmer failed
              to fill in. */}
          <p className="pf-plant__hint">{t('pages.sales.editRowHint')}</p>
          <p className="pf-plant__hint" id={noteHintId}>
            {t('pages.sales.noteHint', { max: SALE_NOTE_MAX })}
          </p>
          {dateBad && (
            <p className="pf-sale__err" id={dateErrId} role="alert">
              {t('pages.sales.errSaleDateFuture')}
            </p>
          )}
          {priceBad && (
            <p className="pf-sale__err" id={priceErrId} role="alert">
              {t('pages.sales.hintAmount', { max: SALE_AMOUNT_MAX })}
            </p>
          )}
          {qtyBad && (
            <p className="pf-sale__err" id={qtyErrId} role="alert">
              {t('pages.sales.hintAmount', { max: SALE_AMOUNT_MAX })}
            </p>
          )}
          {noteBad && (
            // `n`, never `count`: i18next reads `count` as a PLURAL SELECTOR, so the day si/ta
            // add _one/_other forms for this sentence the selector would silently pick them by
            // the farmer's character count. The number here is a measurement, not a quantity
            // of things.
            <p className="pf-sale__err" id={noteErrId} role="alert">
              {t('pages.sales.noteTooLong', { n: trimmedNote.length, max: SALE_NOTE_MAX })}
            </p>
          )}
        </td>
      </tr>
    </Fragment>
  );
}

/** A plus, drawn in currentColor so the button decides the hue. Decorative: the button's
 *  accessible name is the whole sentence "Record a sale of X". */
function PlusIcon() {
  return (
    <svg
      className="pf-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
