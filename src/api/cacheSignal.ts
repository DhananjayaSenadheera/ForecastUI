// Cache-provenance signal. The service worker serves the last-known API response when
// the network is unreachable and stamps it with X-SW-Cache / X-SW-Cached-At. This tiny
// observable lets the UI show an honest "showing saved data" banner without threading
// a new field through every api.* call site.
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

/** Inspect a live Response's headers and update the shared signal. */
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
