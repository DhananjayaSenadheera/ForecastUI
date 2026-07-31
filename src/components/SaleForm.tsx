// SaleForm — "what did you sell, when, and what did you get for it?"
//
// ONE form, two surfaces: the "Record a sale" step inside the More-details popup and the
// edit step on the My-sales page. It is written once because the two must ask the same
// questions in the same words with the same refusals — a second copy would drift the day
// one of them gained a field.
//
// What it is NOT: a price observation. Nothing recorded here reaches the model, the market
// data or anyone else's screen, and the surfaces around it say so in words. It is the
// farmer's own book.
//
// The rules it embodies (all of them learned the hard way on this codebase):
//  - The submit gate is a NAMED, EXPORTED rule (`canSubmitSale`, lib/salesLog) read by BOTH
//    the button's `disabled` and the handler. React consults fiber props for `disabled`, so
//    the attribute alone can never be the guarantee.
//  - NO maxLength on the note. A browser enforces maxLength by TRUNCATING a paste, silently
//    dropping the end of what the farmer wrote; the server rejects an over-long note and
//    never shortens it, so neither may we. The trimmed count below is the live gate.
//  - A disabled button that will not say why is a dead end for a farmer who is not sure what
//    went wrong, so every rule that can block the save explains itself BESIDE ITS OWN FIELD
//    as soon as the answer is unusable.
//  - Nothing here is red. This is money vocabulary, and a low price is not a failure — the
//    only reds in this app are the verdict "Not recommended" and a control that destroys the
//    farmer's own data.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SALE_AMOUNT_MAX, SALE_NOTE_MAX, type Market } from '../api/types';
import {
  canSubmitSale,
  isAllowedAmount,
  isAllowedSaleDate,
  isNoteWithinLimit,
  parseFarmerAmount,
  saleDateMax,
  saleInputFromDraft,
  type SaleDraft,
} from '../lib/salesLog';

/** A market the picker can offer: the crop's own watched markets come from the dashboard
 *  item, the rest from the registry, and both are reduced to this. */
export interface SaleMarketOption {
  marketId: string;
  name: string;
}

export interface SaleFormProps {
  /** DOM id prefix. Several copies of this form can exist at once (the popup over the page,
   *  one edit row per sale), so no id may be fixed. */
  idPrefix: string;
  /** The crop this sale is about — named in the submit button so a screen reader hears which
   *  of several forms it is standing in. Never editable here: a sale's crop is immutable. */
  cropName: string;
  /** The markets the farmer watches this crop at — offered first, because that is where they
   *  most likely sold. */
  watchedMarkets: SaleMarketOption[];
  /** Every market we know of, for the farmer who sold somewhere else. Empty is fine: the
   *  group simply does not appear. */
  allMarkets: Market[];
  todayYmd: string;
  /** Seed values. The form owns its draft from mount; give it a new React `key` to reseed it
   *  (switching from recording to editing, or from one sale to another). */
  initialDraft: SaleDraft;
  initialMarketId: string;
  /** 'create' asks "Record this sale", 'edit' asks "Save changes" — the same fields either
   *  way, so the farmer never has to learn a second layout. */
  mode: 'create' | 'edit';
  /** A write is in flight (here or elsewhere on the surface): every control is disabled. */
  busy: boolean;
  /** Move focus to the first field when the form appears. The control the farmer pressed
   *  ("Record a sale", "Change") has just been replaced by this form, so focus has to be sent
   *  somewhere deliberate or a keyboard user is dropped back on <body>. */
  autoFocus?: boolean;
  onSubmit: (input: ReturnType<typeof saleInputFromDraft>) => void;
  onCancel: () => void;
}

export default function SaleForm({
  idPrefix,
  cropName,
  watchedMarkets,
  allMarkets,
  todayYmd,
  initialDraft,
  initialMarketId,
  mode,
  busy,
  autoFocus = false,
  onSubmit,
  onCancel,
}: SaleFormProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SaleDraft>(initialDraft);
  const [marketId, setMarketId] = useState<string>(initialMarketId);
  const dateRef = useRef<HTMLInputElement>(null);

  // Mount only, and only when asked: re-focusing on every render would fight the farmer's
  // own cursor as they move down the form. `autoFocus` is read once here on purpose — the
  // parent gives this component a new key when it wants a fresh form, so a remount, not a
  // prop change, is what re-runs this.
  useEffect(() => {
    if (autoFocus) dateRef.current?.focus();
  }, [autoFocus]);

  const dateId = `${idPrefix}-sale-date`;
  const priceId = `${idPrefix}-sale-price`;
  const qtyId = `${idPrefix}-sale-qty`;
  const marketFieldId = `${idPrefix}-sale-market`;
  const noteId = `${idPrefix}-sale-note`;
  const dateErrId = `${dateId}-err`;
  const priceErrId = `${priceId}-err`;
  const qtyErrId = `${qtyId}-err`;
  const noteHintId = `${noteId}-hint`;
  const noteErrId = `${noteId}-err`;

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
    <div className="pf-sale__form">
      <div className="pf-sale__field">
        <label className="pf-plant__label" htmlFor={dateId}>
          {t('pages.sales.dateLabel')}
        </label>
        <input
          id={dateId}
          ref={dateRef}
          type="date"
          className="pf-plant__input"
          value={draft.saleDate}
          // Today is the ceiling: a sale is something that has already happened. There is no
          // floor, because the wire states none and inventing one would refuse a record the
          // server would have accepted.
          max={saleDateMax(todayYmd)}
          disabled={busy}
          aria-invalid={dateBad || undefined}
          {...(dateBad ? { 'aria-describedby': dateErrId } : {})}
          onChange={(e) => set({ saleDate: e.target.value })}
        />
        {dateBad && (
          <p className="pf-sale__err" id={dateErrId} role="alert">
            {t('pages.sales.errSaleDateFuture')}
          </p>
        )}
      </div>

      <div className="pf-sale__field">
        <label className="pf-plant__label" htmlFor={priceId}>
          {t('pages.sales.priceLabel')}
        </label>
        {/* type="text" with inputMode="decimal": the phone shows a number pad, and the value
            stays exactly what the farmer typed — a number input silently discards a string it
            dislikes, so "1,250" would vanish rather than be corrected. */}
        <input
          id={priceId}
          type="text"
          inputMode="decimal"
          className="pf-plant__input"
          value={draft.price}
          disabled={busy}
          aria-invalid={priceBad || undefined}
          aria-describedby={priceBad ? priceErrId : undefined}
          onChange={(e) => set({ price: e.target.value })}
        />
        {priceBad && (
          <p className="pf-sale__err" id={priceErrId} role="alert">
            {t('pages.sales.hintAmount', { max: SALE_AMOUNT_MAX })}
          </p>
        )}
      </div>

      <div className="pf-sale__field">
        <label className="pf-plant__label" htmlFor={qtyId}>
          {t('pages.sales.quantityLabel')}
        </label>
        <input
          id={qtyId}
          type="text"
          inputMode="decimal"
          className="pf-plant__input"
          value={draft.quantity}
          disabled={busy}
          aria-invalid={qtyBad || undefined}
          aria-describedby={qtyBad ? qtyErrId : undefined}
          onChange={(e) => set({ quantity: e.target.value })}
        />
        {qtyBad && (
          <p className="pf-sale__err" id={qtyErrId} role="alert">
            {t('pages.sales.hintAmount', { max: SALE_AMOUNT_MAX })}
          </p>
        )}
      </div>

      <div className="pf-sale__field">
        <label className="pf-plant__label" htmlFor={marketFieldId}>
          {t('pages.sales.marketLabel')}
        </label>
        {/* A native select: the phone's own picker, no invented widget. "No market" is the
            first option and a REAL answer — a farmer who sold at the gate is not missing
            data. The groups are named so a long list stays readable. */}
        <select
          id={marketFieldId}
          className="pf-sale__select"
          value={marketId}
          disabled={busy}
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
      </div>

      <div className="pf-sale__field">
        <label className="pf-plant__label" htmlFor={noteId}>
          {t('pages.sales.noteLabel')}
        </label>
        <textarea
          id={noteId}
          className="pf-clear__input"
          rows={2}
          // NO maxLength — see the header. The trimmed count is the gate.
          value={draft.note}
          disabled={busy}
          aria-invalid={noteBad || undefined}
          aria-describedby={noteBad ? `${noteHintId} ${noteErrId}` : noteHintId}
          onChange={(e) => set({ note: e.target.value })}
        />
        <p className="pf-plant__hint" id={noteHintId}>
          {t('pages.sales.noteHint', { max: SALE_NOTE_MAX })}
        </p>
        {noteBad && (
          <p className="pf-sale__err" id={noteErrId} role="alert">
            {t('pages.sales.noteTooLong', { count: trimmedNote.length, max: SALE_NOTE_MAX })}
          </p>
        )}
      </div>

      <div className="pf-plant__actions">
        <button
          type="button"
          className="btn-primary pf-sale__save"
          // The same named rule the handler re-asks. Disabled is a courtesy; the rule is the
          // guarantee.
          disabled={busy || !canSubmit}
          onClick={() => {
            if (!canSubmitSale(draft, todayYmd)) return;
            onSubmit(saleInputFromDraft(draft, marketId));
          }}
          aria-label={t(mode === 'create' ? 'pages.sales.saveAria' : 'pages.sales.saveEditAria', {
            crop: cropName,
          })}
        >
          {t(mode === 'create' ? 'pages.sales.save' : 'pages.sales.saveEdit')}
        </button>
        <button type="button" className="btn-ghost pf-sale__cancel" disabled={busy} onClick={onCancel}>
          {t('pages.sales.cancel')}
        </button>
      </div>
    </div>
  );
}
