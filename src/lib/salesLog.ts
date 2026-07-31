// The farmer's sales log — the load-bearing rules, as pure functions.
//
// A sale is a RECORD OF SOMETHING THAT ALREADY HAPPENED. Everything here follows from that
// one sentence: the date cannot be in the future, the price is money the farmer really got,
// and nothing in this module (or anywhere downstream of it) feeds a forecast. Recording a
// sale changes the farmer's own book and nothing else, and the copy says so.
//
// Why these live outside the components:
//  - `canSubmitSale` is the SUBMIT GATE, read by BOTH the button's `disabled` and the submit
//    handler. React consults fiber props for `disabled`, so a test that strips the attribute
//    and clicks proves nothing against any implementation (2026-07-30 lesson); the gate has
//    to be a named rule with its own unit tests, and the handler has to re-ask it so a
//    request the server will refuse never leaves the browser.
//  - `parseFarmerAmount` is the one place a typed number becomes a number. Two parsers would
//    be two opinions about what "1,250.50" means.
//  - `saleErrorKey` maps every refusal the routes can answer to its own sentence.
import { isRealYmd } from './plantDate';
import { SALE_AMOUNT_MAX, SALE_NOTE_MAX, type SaleErrorCode } from '../api/types';

/**
 * A farmer-typed amount as a number, or null when it is not one.
 *
 * FORGIVING, but never GUESSING. Accepted: surrounding spaces, and thousands separators in
 * REAL group positions ("1,250.50", "12,000"). Rejected: everything else, including a lone
 * comma in a decimal position ("1,5"). That last refusal is the point — in Sri Lanka the
 * decimal mark is a dot and the comma groups thousands, so silently reading "1,5" as either
 * 15 or 1.5 would put a number the farmer never typed into their own book. A refusal costs
 * one correction; a misread price is wrong forever.
 *
 * AT MOST TWO DECIMALS, for the same reason one step further on: everything that displays a
 * recorded figure prints it at two (lib/format exactDigits), so accepting "215.555" would
 * store a number that comes back on screen as "215.56" — a figure the farmer never typed,
 * shown to them as their own record. Refusing it while they are still looking at the field is
 * the only point at which that is cheap.
 *
 * Returns null for blank input: "nothing typed" is the caller's decision to interpret
 * (optional for quantity, a missing answer for price), not this function's.
 */
export function parseFarmerAmount(raw: string): number | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  // Plain form first, then the grouped form; anything else (currency words, minus signs,
  // two dots, a third decimal, a comma out of position) is not a number we may interpret.
  const plain = /^\d+(\.\d{1,2})?$/.test(trimmed);
  const grouped = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(trimmed);
  if (!plain && !grouped) return null;
  const n = Number(grouped ? trimmed.replace(/,/g, '') : trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Is this an amount the routes will accept — a real number above zero, at or under the
 *  shared ceiling? Used for the price (required) and, when one was typed, the quantity. */
export function isAllowedAmount(value: number | null): boolean {
  if (value === null) return false;
  return value > 0 && value <= SALE_AMOUNT_MAX;
}

/** Is this a day a sale can have happened on? A real calendar day, today or earlier —
 *  `sale_date_future` is the server's own refusal and this is the same rule, asked first so
 *  the farmer hears it beside the field instead of after a round trip. ISO dates sort
 *  lexicographically, so the comparison needs no Date object. */
export function isAllowedSaleDate(date: string, todayYmd: string): boolean {
  if (!isRealYmd(date)) return false;
  return date <= todayYmd;
}

/** The newest date the field offers: today, local. A sale is not something that is going to
 *  happen. (Named rather than inlined so the input's `max` and the gate cannot drift.) */
export function saleDateMax(todayYmd: string): string {
  return todayYmd;
}

/** Is the note within the limit the SERVER measures — on the trimmed value? Over-long is
 *  refused, never truncated, on both sides of the wire. */
export function isNoteWithinLimit(note: string): boolean {
  return (note ?? '').trim().length <= SALE_NOTE_MAX;
}

/** Exactly what the farmer has typed into the sale form, as strings — the form's own state,
 *  before any of it is a number. */
export interface SaleDraft {
  saleDate: string;
  price: string;
  quantity: string;
  note: string;
}

/**
 * THE SUBMIT GATE. True only when every answer on the form is one the routes accept:
 *   • the date is a real day, today or earlier;
 *   • the price parses and sits in (0, 100000];
 *   • the quantity is either BLANK (optional, and blank is a real answer) or parses into the
 *     same range — a typed-but-unreadable quantity blocks the save rather than being dropped,
 *     because dropping it would record a sale the farmer did not describe;
 *   • the note is within the limit as the server counts it (trimmed).
 * The market is never part of this: every market the picker offers is a real one, and "no
 * market" is a legitimate answer.
 *
 * Read by the button's `disabled` AND re-asked by the submit handler. The attribute is a
 * courtesy; this function is the rule.
 */
export function canSubmitSale(draft: SaleDraft, todayYmd: string): boolean {
  if (!isAllowedSaleDate(draft.saleDate, todayYmd)) return false;
  if (!isAllowedAmount(parseFarmerAmount(draft.price))) return false;
  const quantityTyped = (draft.quantity ?? '').trim() !== '';
  if (quantityTyped && !isAllowedAmount(parseFarmerAmount(draft.quantity))) return false;
  return isNoteWithinLimit(draft.note ?? '');
}

/**
 * The farmer-language sentence for a sales refusal, as an i18n key.
 *
 * Every code the routes can answer gets its own arm: "that date is in the future" and "that
 * price is too large" are different things to fix, and collapsing them into one shrug throws
 * away the only actionable part of the response. An unrecognised code — or a plain network
 * failure, which carries none — falls back to the generic sentence rather than guessing.
 */
export function saleErrorKey(code: string | null | undefined): string {
  switch (code as SaleErrorCode) {
    case 'invalid_price':
      return 'pages.sales.errInvalidPrice';
    case 'price_out_of_range':
      return 'pages.sales.errPriceOutOfRange';
    case 'invalid_sale_date':
      return 'pages.sales.errInvalidSaleDate';
    case 'sale_date_future':
      return 'pages.sales.errSaleDateFuture';
    case 'invalid_quantity':
      return 'pages.sales.errInvalidQuantity';
    case 'note_too_long':
      return 'pages.sales.errNoteTooLong';
    case 'unknown_crop':
      return 'pages.sales.errUnknownCrop';
    case 'unknown_market':
      return 'pages.sales.errUnknownMarket';
    case 'sale_not_found':
      return 'pages.sales.errSaleNotFound';
    default:
      return 'common.errorBody';
  }
}

/** The interpolation values a sales error sentence needs — the ceiling or the limit it
 *  names. The COPY must never hardcode 100000 or 500: those numbers are owned by the
 *  constants that mirror the server, and a sentence carrying its own copy of them goes
 *  quietly wrong in three languages the day a limit moves. */
export function saleErrorParams(key: string): { max?: number } {
  switch (key) {
    case 'pages.sales.errPriceOutOfRange':
      return { max: SALE_AMOUNT_MAX };
    case 'pages.sales.errNoteTooLong':
      return { max: SALE_NOTE_MAX };
    default:
      return {};
  }
}

/**
 * The draft as the wire wants it: numbers parsed, the note trimmed, and every optional
 * answer the farmer left blank turned into `null` — which the CLIENT then omits entirely.
 *
 * Null and not undefined, and not an empty string, because these three mean different things
 * one layer down: on a PUT an omitted key CLEARS the stored value, which is exactly what
 * "the farmer emptied this field" must do. Only ever called behind `canSubmitSale`, so the
 * price is known to parse.
 */
export function saleInputFromDraft(
  draft: SaleDraft,
  marketId: string,
): {
  marketId: string | null;
  saleDate: string;
  pricePerKg: number;
  quantityKg: number | null;
  note: string | null;
} {
  const note = (draft.note ?? '').trim();
  return {
    marketId: marketId.trim() === '' ? null : marketId,
    saleDate: draft.saleDate,
    pricePerKg: parseFarmerAmount(draft.price) as number,
    quantityKg: parseFarmerAmount(draft.quantity),
    note: note === '' ? null : note,
  };
}

/** A recorded sale read back INTO the form, for an edit. The numbers become the strings the
 *  farmer sees, so re-saving an untouched form sends back exactly what was stored — a
 *  round trip that changes nothing must really change nothing.
 *
 *  (A stored figure with MORE than two decimals — which the money contract does not produce —
 *  would come back into the field as itself and be refused by the gate until the farmer
 *  retypes it. That is the honest failure: the alternative is quietly rounding their record
 *  on their behalf.) */
export function saleDraftFrom(sale: {
  saleDate: string;
  pricePerKg: number;
  quantityKg: number | null;
  note: string | null;
}): SaleDraft {
  return {
    saleDate: sale.saleDate,
    price: String(sale.pricePerKg),
    quantity: sale.quantityKg === null ? '' : String(sale.quantityKg),
    note: sale.note ?? '',
  };
}
