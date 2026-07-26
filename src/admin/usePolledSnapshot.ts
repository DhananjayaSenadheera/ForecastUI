// Shared "keep one admin snapshot fresh" hook, extracted from the ingestion status card
// so the pipeline-health banner polls with exactly the same rules instead of a second,
// subtly different copy.
//
// The rules it exists to keep (all four were bugs at some point):
//  - setTimeout, never setInterval: the cadence stays exact under backoff, and a hidden
//    tab simply stops rescheduling instead of queueing a burst of catch-up requests.
//  - Paused while document.hidden; visibilitychange resumes with an IMMEDIATE poll, so
//    an admin returning to the tab sees current truth, not a snapshot up to 5 minutes old.
//  - Errors back off (base -> 2x -> 4x, capped at maxMs) and a success resets to base;
//    the last good snapshot stays on screen through a transient failure.
//  - Only the newest in-flight request may commit, so a slow response cannot overwrite a
//    newer one.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PolledSnapshot<T> {
  /** The last snapshot that loaded. Survives a later error on purpose. */
  data: T | null;
  /** True until the first attempt settles (success OR failure). */
  loading: boolean;
  /** True when the LAST attempt failed — `data` may still hold an older good snapshot. */
  error: boolean;
  /** Poll now (retry button, or after an action that changed the truth). */
  refetch: () => void;
}

export function usePolledSnapshot<T>(
  fetcher: () => Promise<T>,
  { baseMs, maxMs }: { baseMs: number; maxMs: number },
): PolledSnapshot<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timer = useRef<number | null>(null);
  const errorCount = useRef(0);
  const mounted = useRef(true);
  const reqId = useRef(0); // stale-response guard: only the latest in-flight poll may commit
  const pollRef = useRef<() => Promise<void>>(async () => {});
  // The fetcher is read through a ref so an inline arrow at the call site does not
  // restart polling on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const schedule = useCallback(
    (delayMs: number) => {
      stop();
      // Paused while the tab is hidden — the visibilitychange handler re-polls.
      if (typeof document !== 'undefined' && document.hidden) return;
      timer.current = window.setTimeout(() => void pollRef.current(), delayMs);
    },
    [stop],
  );

  const poll = useCallback(async () => {
    const id = ++reqId.current;
    const isStale = () => !mounted.current || id !== reqId.current;
    try {
      const next = await fetcherRef.current();
      if (isStale()) return;
      setData(next);
      setError(false);
      errorCount.current = 0;
      schedule(baseMs);
    } catch {
      if (isStale()) return;
      setError(true);
      const delay = Math.min(baseMs * 2 ** errorCount.current, maxMs);
      errorCount.current += 1;
      schedule(delay);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [schedule, baseMs, maxMs]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    mounted.current = true;
    // Don't fetch on mount while the tab is hidden; visibilitychange does the first poll.
    if (typeof document === 'undefined' || !document.hidden) {
      void pollRef.current();
    }
    const onVisibility = () => {
      if (document.hidden) stop();
      else void pollRef.current(); // resume: poll immediately when the tab returns
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // Run-once: poll/stop are stable and re-read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = useCallback(() => void pollRef.current(), []);
  return { data, loading, error, refetch };
}
