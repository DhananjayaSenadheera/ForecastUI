// The sales log's load-bearing rules, tested where they live.
//
// `canSubmitSale` is the one that matters most: it is read by BOTH the save button's
// `disabled` and the submit handler, because React consults fiber props for `disabled` and a
// test that strips the attribute and clicks proves nothing (2026-07-30). The gate is
// therefore a named rule with its own unit tests, and the boundaries are checked on BOTH
// sides — a rule tested only where it passes is a rule that has never been tested.
import { describe, it, expect } from 'vitest';
import { SALE_AMOUNT_MAX, SALE_NOTE_MAX, type SaleErrorCode } from '../api/types';
import { exactDigits, formatExactAmount } from '../lib/format';
import {
  canSubmitSale,
  isAllowedAmount,
  isAllowedSaleDate,
  isNoteWithinLimit,
  parseFarmerAmount,
  saleDateMax,
  saleDraftFrom,
  saleErrorKey,
  saleErrorParams,
  saleInputFromDraft,
  type SaleDraft,
} from '../lib/salesLog';

const TODAY = '2026-07-28';
const TOMORROW = '2026-07-29';

function draft(over: Partial<SaleDraft> = {}): SaleDraft {
  return { saleDate: TODAY, price: '215', quantity: '', note: '', ...over };
}

describe('parseFarmerAmount — forgiving, never guessing', () => {
  it('reads the ordinary forms a farmer types', () => {
    expect(parseFarmerAmount('250')).toBe(250);
    expect(parseFarmerAmount('250.50')).toBe(250.5);
    expect(parseFarmerAmount('  250.5  ')).toBe(250.5);
    expect(parseFarmerAmount('0.01')).toBe(0.01);
  });

  it('accepts thousands separators in REAL group positions', () => {
    expect(parseFarmerAmount('1,250')).toBe(1250);
    expect(parseFarmerAmount('12,000.75')).toBe(12000.75);
  });

  it('REFUSES a comma that is not a group separator rather than picking a meaning', () => {
    // "1,5" is 15 in one reading and 1.5 in another. Both are numbers the farmer did not
    // type, and a wrong price in their own book is wrong forever.
    expect(parseFarmerAmount('1,5')).toBeNull();
    expect(parseFarmerAmount('1,25')).toBeNull();
    expect(parseFarmerAmount('1,2345')).toBeNull();
  });

  it('refuses everything that is not a plain positive number', () => {
    for (const bad of ['', '   ', 'abc', '25o', '-5', '1.2.3', '250.', '1e3', '٢٥٠', 'Rs. 250']) {
      expect(parseFarmerAmount(bad)).toBeNull();
    }
  });

  it('refuses a THIRD decimal, because nothing can display one honestly', () => {
    // Every surface prints a recorded figure at two decimals (format.exactDigits), so
    // accepting 215.555 would store a number that comes back to the farmer as "215.56" —
    // their own record, showing something they never typed. Refusing it while they are still
    // looking at the field is the only cheap moment.
    expect(parseFarmerAmount('215.55')).toBe(215.55);
    expect(parseFarmerAmount('215.555')).toBeNull();
    expect(parseFarmerAmount('1,250.555')).toBeNull();
    expect(parseFarmerAmount('0.5')).toBe(0.5);
  });
});

describe('isAllowedAmount — the ceiling both sides share', () => {
  it('refuses zero and below, accepts the smallest real amount', () => {
    expect(isAllowedAmount(0)).toBe(false);
    expect(isAllowedAmount(-0.01)).toBe(false);
    expect(isAllowedAmount(0.01)).toBe(true);
  });

  it('accepts the ceiling itself and refuses one step past it', () => {
    expect(SALE_AMOUNT_MAX).toBe(100000);
    expect(isAllowedAmount(100000)).toBe(true);
    expect(isAllowedAmount(100000.01)).toBe(false);
  });

  it('treats "nothing typed" as not an amount (the caller decides what that means)', () => {
    expect(isAllowedAmount(null)).toBe(false);
  });
});

describe('isAllowedSaleDate — a sale has already happened', () => {
  it('accepts today and every day before it', () => {
    expect(isAllowedSaleDate(TODAY, TODAY)).toBe(true);
    expect(isAllowedSaleDate('2026-01-01', TODAY)).toBe(true);
    expect(saleDateMax(TODAY)).toBe(TODAY);
  });

  it('refuses tomorrow, and a day that does not exist', () => {
    expect(isAllowedSaleDate(TOMORROW, TODAY)).toBe(false);
    expect(isAllowedSaleDate('2026-02-30', TODAY)).toBe(false);
    expect(isAllowedSaleDate('not-a-date', TODAY)).toBe(false);
    expect(isAllowedSaleDate('', TODAY)).toBe(false);
  });
});

describe('isNoteWithinLimit — measured trimmed, like the server', () => {
  it('counts the trimmed value, so raw and trimmed really disagree', () => {
    expect(SALE_NOTE_MAX).toBe(500);
    const raw506 = `   ${'x'.repeat(500)}   `; // 506 raw, 500 trimmed
    expect(raw506).toHaveLength(506);
    expect(isNoteWithinLimit(raw506)).toBe(true);
    expect(isNoteWithinLimit('x'.repeat(501))).toBe(false);
  });
});

describe('canSubmitSale — the gate the button and the handler both read', () => {
  it('passes a complete, ordinary sale', () => {
    expect(canSubmitSale(draft(), TODAY)).toBe(true);
  });

  it('needs a price: blank or unreadable blocks the save', () => {
    expect(canSubmitSale(draft({ price: '' }), TODAY)).toBe(false);
    expect(canSubmitSale(draft({ price: 'two fifty' }), TODAY)).toBe(false);
    expect(canSubmitSale(draft({ price: '1,5' }), TODAY)).toBe(false);
  });

  it('holds the price boundaries on BOTH sides', () => {
    expect(canSubmitSale(draft({ price: '0' }), TODAY)).toBe(false);
    expect(canSubmitSale(draft({ price: '0.01' }), TODAY)).toBe(true);
    expect(canSubmitSale(draft({ price: '100000' }), TODAY)).toBe(true);
    expect(canSubmitSale(draft({ price: '100000.01' }), TODAY)).toBe(false);
    // A third decimal is not an amount this app can show back, so it is not one it accepts.
    expect(canSubmitSale(draft({ price: '215.555' }), TODAY)).toBe(false);
  });

  it('treats a BLANK quantity as a real answer, but a typed nonsense one as a stop', () => {
    expect(canSubmitSale(draft({ quantity: '' }), TODAY)).toBe(true);
    expect(canSubmitSale(draft({ quantity: '   ' }), TODAY)).toBe(true);
    expect(canSubmitSale(draft({ quantity: '60' }), TODAY)).toBe(true);
    // Never silently dropped: that would record a sale the farmer did not describe.
    expect(canSubmitSale(draft({ quantity: 'a lot' }), TODAY)).toBe(false);
    expect(canSubmitSale(draft({ quantity: '0' }), TODAY)).toBe(false);
    expect(canSubmitSale(draft({ quantity: '100000.01' }), TODAY)).toBe(false);
    expect(canSubmitSale(draft({ quantity: '100000' }), TODAY)).toBe(true);
  });

  it('accepts today and refuses tomorrow', () => {
    expect(canSubmitSale(draft({ saleDate: TODAY }), TODAY)).toBe(true);
    expect(canSubmitSale(draft({ saleDate: TOMORROW }), TODAY)).toBe(false);
    expect(canSubmitSale(draft({ saleDate: '' }), TODAY)).toBe(false);
  });

  it('measures the note trimmed — 506 raw / 500 trimmed passes, 501 trimmed does not', () => {
    expect(canSubmitSale(draft({ note: `   ${'x'.repeat(500)}   ` }), TODAY)).toBe(true);
    expect(canSubmitSale(draft({ note: 'x'.repeat(501) }), TODAY)).toBe(false);
  });
});

describe('a recorded figure is printed exactly, by ONE rule', () => {
  it('keeps a whole number whole and everything else at two decimals', () => {
    expect(exactDigits(60)).toBe(0);
    expect(exactDigits(215.5)).toBe(2);
    expect(formatExactAmount(60, 'en')).toBe('60');
    expect(formatExactAmount(215.5, 'en')).toBe('215.50');
    // The rule the parser enforces and the rule the display obeys are the SAME rule: every
    // amount the gate accepts survives a round trip through the display unchanged.
    const typed = parseFarmerAmount('215.55') as number;
    expect(formatExactAmount(typed, 'en')).toBe('215.55');
  });
});

describe('saleErrorKey — every refusal gets its own sentence', () => {
  const CODES: SaleErrorCode[] = [
    'invalid_price',
    'price_out_of_range',
    'invalid_sale_date',
    'sale_date_future',
    'invalid_quantity',
    'note_too_long',
    'unknown_crop',
    'unknown_market',
    'sale_not_found',
  ];

  it('maps the whole code family, and never twice to one sentence', () => {
    const keys = CODES.map(saleErrorKey);
    for (const key of keys) expect(key).toMatch(/^pages\.sales\.err/);
    expect(new Set(keys).size).toBe(CODES.length);
  });

  it('falls back to the generic sentence for a code (or a silence) it does not know', () => {
    // A network failure carries no code at all; a code minted after this build must not be
    // guessed at.
    expect(saleErrorKey(null)).toBe('common.errorBody');
    expect(saleErrorKey(undefined)).toBe('common.errorBody');
    expect(saleErrorKey('some_new_refusal')).toBe('common.errorBody');
  });

  it('hands the limits to the sentences that name them, and to no others', () => {
    expect(saleErrorParams(saleErrorKey('price_out_of_range'))).toEqual({ max: SALE_AMOUNT_MAX });
    expect(saleErrorParams(saleErrorKey('note_too_long'))).toEqual({ max: SALE_NOTE_MAX });
    expect(saleErrorParams(saleErrorKey('invalid_price'))).toEqual({});
  });
});

describe('the draft <-> wire round trip', () => {
  it('turns blanks into nulls, so the client can OMIT the keys', () => {
    expect(saleInputFromDraft(draft({ quantity: '', note: '  ' }), '')).toEqual({
      marketId: null,
      saleDate: TODAY,
      pricePerKg: 215,
      quantityKg: null,
      note: null,
    });
  });

  it('parses the numbers and trims the note the farmer really wrote', () => {
    expect(
      saleInputFromDraft(
        draft({ price: '1,250.50', quantity: '60', note: '  same buyer  ' }),
        'm1',
      ),
    ).toEqual({
      marketId: 'm1',
      saleDate: TODAY,
      pricePerKg: 1250.5,
      quantityKg: 60,
      note: 'same buyer',
    });
  });

  it('reads a stored sale back so that re-saving an untouched form changes nothing', () => {
    const stored = { saleDate: '2026-07-20', pricePerKg: 215.5, quantityKg: 60, note: 'x' };
    const back = saleDraftFrom(stored);
    expect(back).toEqual({ saleDate: '2026-07-20', price: '215.5', quantity: '60', note: 'x' });
    expect(saleInputFromDraft(back, 'm1')).toMatchObject({
      saleDate: stored.saleDate,
      pricePerKg: stored.pricePerKg,
      quantityKg: stored.quantityKg,
      note: stored.note,
    });
  });

  it('reads a sale with nothing optional recorded back as empty fields, not "null"', () => {
    expect(saleDraftFrom({ saleDate: '2026-07-20', pricePerKg: 200, quantityKg: null, note: null }))
      .toEqual({ saleDate: '2026-07-20', price: '200', quantity: '', note: '' });
  });
});
