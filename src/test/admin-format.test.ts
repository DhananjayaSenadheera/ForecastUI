import { describe, it, expect } from 'vitest';
import {
  compareModelVersionsDesc,
  derivePolicyStatus,
  formatCount,
  formatMae,
  formatPercentNumber,
  formatPointsAbs,
  formatPrice,
  formatRange,
  formatRatePercent,
  formatSignedPercentNumber,
  formatSignedPrice,
  mapMaturityState,
  mapGateOutcome,
  mapMarketType,
  mapPolicyDirection,
  mapPolicyType,
  mapUserActivityEvent,
  predictorKind,
  truncateId,
} from '../lib/format';
import {
  FORECAST_MATURITY_STATES,
  USER_ACTIVITY_CONTENT_EVENT_TYPES,
  USER_ACTIVITY_EVENT_TYPES,
  USER_ACTIVITY_PIPELINE_EVENT_TYPES,
  USER_ACTIVITY_SIGN_IN_EVENT_TYPES,
  USER_ACTIVITY_USER_MGMT_EVENT_TYPES,
} from '../api/types';

describe('admin enum mappers', () => {
  it('maps every known PolicyType int to a label key', () => {
    expect(mapPolicyType(0).labelKey).toBe('admin.policy.type.subsidy');
    expect(mapPolicyType(1).labelKey).toBe('admin.policy.type.importBan');
    expect(mapPolicyType(2).labelKey).toBe('admin.policy.type.exportBan');
    expect(mapPolicyType(5).labelKey).toBe('admin.policy.type.fertiliserSubsidy');
    expect(mapPolicyType(8).labelKey).toBe('admin.policy.type.budget');
  });

  it('degrades an unknown PolicyType int to a muted raw label (never crashes)', () => {
    const unknown = mapPolicyType(99);
    expect(unknown.labelKey).toBeNull();
    expect(unknown.fallback).toBe('#99');
  });

  it('maps PolicyDirection including the -1 (Bearish) with glyph + word + tone', () => {
    const bearish = mapPolicyDirection(-1);
    expect(bearish.labelKey).toBe('admin.policy.dir.bearish');
    expect(bearish.glyph).toBe('▼');
    expect(bearish.tone).toBe('bearish'); // -> amber badge (red stays verdict-only)

    const neutral = mapPolicyDirection(0);
    expect(neutral.labelKey).toBe('admin.policy.dir.neutral');
    expect(neutral.glyph).toBe('–');
    expect(neutral.tone).toBe('neutral');

    const bullish = mapPolicyDirection(1);
    expect(bullish.labelKey).toBe('admin.policy.dir.bullish');
    expect(bullish.glyph).toBe('▲');
    expect(bullish.tone).toBe('bullish'); // -> green badge
  });

  it('degrades an unknown direction int to a muted raw label with no tone', () => {
    const unknown = mapPolicyDirection(7);
    expect(unknown.labelKey).toBeNull();
    expect(unknown.fallback).toBe('#7');
    expect(unknown.glyph).toBe('•');
    expect(unknown.tone).toBeNull();
  });

  it('maps every known MarketType and degrades unknowns', () => {
    expect(mapMarketType(0).labelKey).toBe('admin.markets.type.wholesale');
    expect(mapMarketType(1).labelKey).toBe('admin.markets.type.retail');
    expect(mapMarketType(2).labelKey).toBe('admin.markets.type.dec');
    expect(mapMarketType(3).labelKey).toBe('admin.markets.type.nationalAggregate');
    expect(mapMarketType(42).labelKey).toBeNull();
    expect(mapMarketType(42).fallback).toBe('#42');
  });
});

describe('derivePolicyStatus', () => {
  const today = new Date('2026-07-12T09:00:00');

  it('is Active when today is within the window', () => {
    expect(derivePolicyStatus('2026-01-01T00:00:00', '2026-12-31T00:00:00', today)).toBe('active');
  });

  it('is Active when open-ended (no effectiveTo) and started', () => {
    expect(derivePolicyStatus('2022-09-01T00:00:00', null, today)).toBe('active');
  });

  it('is Scheduled when effectiveFrom is in the future', () => {
    expect(derivePolicyStatus('2026-09-15T00:00:00', '2027-03-31T00:00:00', today)).toBe('scheduled');
  });

  it('is Expired when effectiveTo is in the past', () => {
    expect(derivePolicyStatus('2021-05-06T00:00:00', '2021-11-24T00:00:00', today)).toBe('expired');
  });

  it('compares calendar dates only — a same-day boundary is Active, not flipped by clock time', () => {
    // effectiveTo is today: still active (inclusive), regardless of the time component.
    expect(derivePolicyStatus('2026-01-01T00:00:00', '2026-07-12T23:59:00', today)).toBe('active');
    // effectiveFrom is today: active (inclusive).
    expect(derivePolicyStatus('2026-07-12T00:00:00', null, today)).toBe('active');
  });
});

describe('Logs P2 mappers — training', () => {
  it('formats MAE to exactly 2 decimals (rounds, keeps a trailing zero)', () => {
    expect(formatMae(97.925, 'en')).toBe('97.93');
    expect(formatMae(118.4, 'en')).toBe('118.40');
    expect(formatMae(100, 'en')).toBe('100.00');
  });

  it('returns null for a missing MAE (no fabricated 0.00)', () => {
    expect(formatMae(null, 'en')).toBeNull();
    expect(formatMae(undefined, 'en')).toBeNull();
    expect(formatMae(NaN, 'en')).toBeNull();
  });

  it('maps the gate outcome independently of live status', () => {
    expect(mapGateOutcome(true)).toEqual({ tone: 'promoted', labelKey: 'admin.logs.training.gate.promoted' });
    expect(mapGateOutcome(false)).toEqual({ tone: 'declined', labelKey: 'admin.logs.training.gate.declined' });
  });
});

describe('Logs P2 mappers — user activity', () => {
  it('maps each event type to a label key and a non-red tone', () => {
    expect(mapUserActivityEvent('loginSucceeded')).toMatchObject({
      labelKey: 'admin.logs.userActivity.event.loginSucceeded',
      tone: 'neutral',
    });
    expect(mapUserActivityEvent('loginFailed').tone).toBe('warn'); // amber, a failed attempt
    expect(mapUserActivityEvent('userRegistered').tone).toBe('good'); // green, a new account
    expect(mapUserActivityEvent('roleChanged').tone).toBe('neutral');
    expect(mapUserActivityEvent('userDeleted').tone).toBe('neutral');
  });

  it('maps every content-change event type to a label key with a NEUTRAL tone', () => {
    // An admin edit is neither good news nor a warning — it is a record of who did what.
    for (const ev of USER_ACTIVITY_CONTENT_EVENT_TYPES) {
      expect(mapUserActivityEvent(ev)).toMatchObject({
        labelKey: `admin.logs.userActivity.event.${ev}`,
        tone: 'neutral',
      });
    }
  });

  it('keeps the five ORIGINAL wire strings intact and first in the known set', () => {
    // Frozen contract: the sign-in + user-management strings must never be renamed or
    // reordered away — the server 400s anything it does not recognise.
    expect([...USER_ACTIVITY_SIGN_IN_EVENT_TYPES, ...USER_ACTIVITY_USER_MGMT_EVENT_TYPES]).toEqual([
      'loginSucceeded',
      'loginFailed',
      'userRegistered',
      'roleChanged',
      'userDeleted',
    ]);
    expect(USER_ACTIVITY_CONTENT_EVENT_TYPES).toEqual([
      'policyFlagChanged',
      'festivalChanged',
      'newsEventChanged',
      'cropChanged',
      'marketChanged',
    ]);
    expect(USER_ACTIVITY_PIPELINE_EVENT_TYPES).toEqual([
      'ingestionServiceStarted',
      // "…StopRequested", never "…Stopped": the API only ASKS for a cancellation.
      'ingestionServiceStopRequested',
    ]);
    expect(USER_ACTIVITY_EVENT_TYPES).toHaveLength(12);
    // Every known type has a label key — no badge can fall back to a raw wire string
    // for a type this build DOES know about.
    for (const ev of USER_ACTIVITY_EVENT_TYPES) {
      expect(mapUserActivityEvent(ev).labelKey).not.toBeNull();
    }
  });

  it('degrades an unknown event type to a muted raw fallback (never crashes)', () => {
    const unknown = mapUserActivityEvent('somethingNew');
    expect(unknown.labelKey).toBeNull();
    expect(unknown.fallback).toBe('somethingNew');
    expect(unknown.tone).toBe('neutral');
  });

  it('truncates a GUID to the first 8 chars + ellipsis; short/empty ids pass through', () => {
    expect(truncateId('a1111111-1111-4111-8111-111111111111')).toBe('a1111111…');
    expect(truncateId('abc')).toBe('abc');
    expect(truncateId(null)).toBe('');
    expect(truncateId(undefined)).toBe('');
  });
});

// Forecast-accuracy formatters. The unit split is the whole point: percent NUMBERS
// (12.34 = 12.34%) and fraction RATES (0.75 = 75%) arrive on the same response, and
// formatting one as the other misreports accuracy by two orders of magnitude.
describe('forecast-accuracy formatters', () => {
  it('formats a percent NUMBER as a percentage (12.34 -> "12.34%"), not as 1234%', () => {
    expect(formatPercentNumber(12.34, 'en')).toBe('12.34%');
    expect(formatPercentNumber(8.1, 'en')).toBe('8.10%'); // trailing zero kept at 2dp
  });

  it('formats a FRACTION rate as a percentage (0.6667 -> "66.7%")', () => {
    expect(formatRatePercent(0.6667, 'en')).toBe('66.7%');
    expect(formatRatePercent(0.8, 'en', 0)).toBe('80%'); // the nominal band target
  });

  it('shows the sign on a row percentage error, because the direction is the point', () => {
    expect(formatSignedPercentNumber(3.21, 'en')).toBe('+3.21%');
    expect(formatSignedPercentNumber(-20.21, 'en')).toBe('-20.21%');
  });

  // signedBias is MONEY (mean of predicted − actual in Rs/kg). Formatting it as a
  // percentage would turn a Rs 12.58/kg bias into "-12.58%" — a different, wrong claim.
  it('formats signedBias as signed rupees, never as a percentage', () => {
    expect(formatSignedPrice(-12.58, 'en', 'Rs.')).toBe('-Rs. 12.58');
    expect(formatSignedPrice(23.25, 'en', 'Rs.')).toBe('+Rs. 23.25');
    // an exact zero bias carries no direction, so it carries no sign
    expect(formatSignedPrice(0, 'en', 'Rs.')).toBe('Rs. 0.00');
    // decimals survive: rounding an error figure away is how Rs 0.49/kg becomes "Rs 0"
    expect(formatSignedPrice(-0.49, 'en', 'Rs.')).toBe('-Rs. 0.49');
    expect(formatSignedPrice(null, 'en', 'Rs.')).toBeNull();
    expect(formatSignedPrice(-78.5, 'en', 'රු.')).toBe('-රු. 78.50');
  });

  it('renders a coverage gap as unsigned percentage points (the word carries direction)', () => {
    expect(formatPointsAbs(-0.1333, 'en')).toBe('13.3');
    expect(formatPointsAbs(0.2, 'en')).toBe('20.0');
  });

  it('returns null (never 0) for every metric the server could not compute', () => {
    for (const fn of [formatPercentNumber, formatSignedPercentNumber, formatRatePercent, formatPointsAbs]) {
      expect(fn(null, 'en')).toBeNull();
      expect(fn(undefined, 'en')).toBeNull();
      expect(fn(Number.NaN, 'en')).toBeNull();
    }
    expect(formatCount(null, 'en')).toBeNull();
    // ...and a real zero is still a real number, not a no-data marker.
    expect(formatCount(0, 'en')).toBe('0');
    expect(formatPercentNumber(0, 'en')).toBe('0.00%');
  });

  it('orders model versions numerically, newest first, with no-version last', () => {
    // The whole point: lexically "v9" > "v17", which would rank a year-old model top.
    expect(['v17', 'v9', 'v2'].sort(compareModelVersionsDesc)).toEqual(['v17', 'v9', 'v2']);
    expect(['v2', 'v9', 'v17'].sort(compareModelVersionsDesc)).toEqual(['v17', 'v9', 'v2']);
    expect(compareModelVersionsDesc('v17', 'v9')).toBeLessThan(0);
    // A row with no recorded version is the oldest thing there is — it sorts last.
    expect(compareModelVersionsDesc(null, 'v1')).toBeGreaterThan(0);
    expect(compareModelVersionsDesc('v1', null)).toBeLessThan(0);
    expect(compareModelVersionsDesc(null, null)).toBe(0);
  });

  it('splits predictors into model vs fallback by name, defaulting unknown ones to model', () => {
    expect(predictorKind('residual')).toBe('model');
    expect(predictorKind('hybrid')).toBe('model');
    expect(predictorKind('crop_mean_fallback')).toBe('fallback');
    expect(predictorKind('CATEGORY_MEAN_FALLBACK')).toBe('fallback');
    expect(predictorKind('some_new_predictor')).toBe('model');
  });

  it('maps every maturity state to a glyph AND a word, with no state coloured red', () => {
    for (const state of FORECAST_MATURITY_STATES) {
      const display = mapMaturityState(state);
      expect(display.labelKey).not.toBeNull();
      expect(display.glyph.length).toBeGreaterThan(0);
      // red is reserved app-wide for "Not recommended" — an unscorable row is a fact.
      expect(['good', 'neutral', 'skipped']).toContain(display.tone);
    }
    expect(mapMaturityState('matured').labelKey).toBe('admin.forecastAccuracy.state.matured');
    expect(mapMaturityState('actual_unavailable').labelKey).toBe(
      'admin.forecastAccuracy.state.actualUnavailable',
    );
  });

  it('degrades an unknown maturity state to the raw string (never crashes the table)', () => {
    const unknown = mapMaturityState('teleported');
    expect(unknown.labelKey).toBeNull();
    expect(unknown.fallback).toBe('teleported');
    expect(unknown.tone).toBe('unknown');
  });

  it('keeps exact decimals on an accuracy price, where rounding would misstate the error', () => {
    expect(formatPrice(27.5, 'en', 'Rs.', 2)).toBe('Rs. 27.50');
    expect(formatRange(205, 280.5, 'en', 'Rs.', 2)).toBe('Rs. 205.00 – 280.50');
    // the default stays whole-rupee for the farmer surfaces
    expect(formatPrice(27.5, 'en', 'Rs.')).toBe('Rs. 28');
  });
});
