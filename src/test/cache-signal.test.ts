import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCacheState,
  reportFromHeaders,
  reportFresh,
  subscribeCacheSignal,
  __resetCacheSignal,
} from '../api/cacheSignal';

describe('cacheSignal (client-side cache-provenance handling)', () => {
  beforeEach(() => __resetCacheSignal());

  it('starts fresh (no stale flag)', () => {
    expect(getCacheState()).toEqual({ fromCache: false, cachedAt: null });
  });

  it('flags fromCache + timestamp when the SW stamps a cache hit', () => {
    const headers = new Headers({
      'X-SW-Cache': 'hit',
      'X-SW-Cached-At': '2026-07-11T08:00:00.000Z',
    });
    reportFromHeaders(headers);
    expect(getCacheState()).toEqual({
      fromCache: true,
      cachedAt: '2026-07-11T08:00:00.000Z',
    });
  });

  it('treats an unstamped (fresh network) response as fresh', () => {
    reportFromHeaders(new Headers({ 'X-SW-Cache': 'hit', 'X-SW-Cached-At': 'x' }));
    expect(getCacheState().fromCache).toBe(true);
    reportFromHeaders(new Headers()); // fresh response, no SW header
    expect(getCacheState()).toEqual({ fromCache: false, cachedAt: null });
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const seen: boolean[] = [];
    const unsub = subscribeCacheSignal((s) => seen.push(s.fromCache));
    reportFromHeaders(new Headers({ 'X-SW-Cache': 'hit' }));
    reportFresh();
    unsub();
    reportFromHeaders(new Headers({ 'X-SW-Cache': 'hit' }));
    expect(seen).toEqual([true, false]); // no third event after unsubscribe
  });
});
