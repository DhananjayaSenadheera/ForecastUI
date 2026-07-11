// =============================================================================
// Cache-provenance signal (FE-9). The service worker serves the LAST-KNOWN API
// response from cache ONLY when the network is unreachable, and stamps that
// response with two headers:
//   X-SW-Cache: hit            -> this body came from the offline cache
//   X-SW-Cached-At: <ISO>      -> when it was last fetched fresh
// The typed api.* methods still return their plain JSON shape (contract intact);
// this tiny observable lets the UI surface an honest "showing saved data" banner
// WITHOUT threading a new field through every call site or breaking any test.
//
// FIXTURE MODE: request() is never called, so nothing ever reports here — the
// state stays { fromCache: false } and the banner never renders (unchanged UX).
// =============================================================================
export interface CacheState {
  /** true when the most recent live response was served from the offline cache. */
  fromCache: boolean;
  /** ISO timestamp of when that cached response was last fetched fresh. */
  cachedAt: string | null;
}

type Listener = (s: CacheState) => void;

let state: CacheState = { fromCache: false, cachedAt: null };
const listeners = new Set<Listener>();

export function getCacheState(): CacheState {
  return state;
}

export function subscribeCacheSignal(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function emit(): void {
  for (const l of listeners) l(state);
}

/** A fresh (network) response arrived — clear any stale-data flag. */
export function reportFresh(): void {
  if (state.fromCache || state.cachedAt !== null) {
    state = { fromCache: false, cachedAt: null };
    emit();
  }
}

/**
 * Inspect a live Response's headers and update the shared signal. Exposed as a
 * pure-ish function so it is unit-testable in jsdom without a real service worker.
 */
export function reportFromHeaders(headers: Headers): void {
  const hit = headers.get('X-SW-Cache') === 'hit';
  if (hit) {
    const cachedAt = headers.get('X-SW-Cached-At');
    state = { fromCache: true, cachedAt };
    emit();
  } else {
    reportFresh();
  }
}

/** Test-only reset so specs start from a known state. */
export function __resetCacheSignal(): void {
  state = { fromCache: false, cachedAt: null };
  emit();
}
