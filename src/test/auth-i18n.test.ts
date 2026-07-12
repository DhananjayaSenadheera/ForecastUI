import { describe, it, expect } from 'vitest';
import en from '../i18n/locales/en.json';
import si from '../i18n/locales/si.json';
import ta from '../i18n/locales/ta.json';

// i18n parity: every auth string exists in all three locales with a non-empty
// value (trilingual-from-day-one; si/ta are drafts pending FE-8 native review).
describe('auth i18n parity', () => {
  const enKeys = Object.keys((en as { auth: Record<string, string> }).auth).sort();

  it('en carries the full auth string set', () => {
    expect(enKeys).toContain('loginTitle');
    expect(enKeys).toContain('invalidCredentials');
    expect(enKeys).toContain('logout');
  });

  for (const [name, loc] of [
    ['si', si],
    ['ta', ta],
  ] as const) {
    it(`${name} has the same auth keys as en, all non-empty`, () => {
      const auth = (loc as { auth: Record<string, string> }).auth;
      expect(Object.keys(auth).sort()).toEqual(enKeys);
      for (const k of enKeys) {
        expect(typeof auth[k]).toBe('string');
        expect(auth[k].trim().length).toBeGreaterThan(0);
      }
    });
  }
});
