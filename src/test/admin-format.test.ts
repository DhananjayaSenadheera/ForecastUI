import { describe, it, expect } from 'vitest';
import {
  derivePolicyStatus,
  formatMae,
  mapGateOutcome,
  mapMarketType,
  mapPolicyDirection,
  mapPolicyType,
  mapUserActivityEvent,
  truncateId,
} from '../lib/format';

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
