// ADM-8 — Ingestion runs (/admin/ingestion). READ-ONLY admin observability over the
// data pipeline (admin ingestion API — run tracking #43, verification CLI #44, admin
// API #46). Two independent surfaces that FAIL INDEPENDENTLY:
//   1. A status snapshot card — service state, last run + verification rollup, per-
//      source health. POLLED every 30s while the tab is visible (paused on
//      document.hidden, exponential backoff 30→60→120s on error, reset on success).
//   2. A SERVER-PAGED runs table (desktop) / stacked cards (<600px) with a source
//      filter, a manual refresh, and per-row expansion revealing the verification
//      checks (parsed defensively from the checksJson STRING) + any error summary.
//
// AUTH: both routes sit behind an Admin JWT; a 401/403 flows through the existing
// global client interceptor (silent renew → /login), so there is ZERO new auth code.
// HONEST STATUS: the pulsing dot is aria-hidden decoration — the TEXTUAL state in an
// aria-live region is the source of truth. Verdicts are never colour-only (text always
// present). checksJson parse failure degrades to a plain note, never a crash.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import {
  INGESTION_SOURCES,
  type IngestionRun,
  type IngestionRunPage,
  type IngestionSourceHealth,
  type IngestionStatus,
} from '../api/types';
import {
  formatDate,
  formatDateTime,
  mapCheckSeverity,
  mapRunStatus,
  mapVerificationVerdict,
  parseVerificationChecks,
} from '../lib/format';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTopbar,
  DemoNote,
  useServerPagination,
} from './adminShared';

const POLL_BASE_MS = 30_000;
const POLL_MAX_MS = 120_000;
const RUNS_PAGE_SIZE = 25;
const KNOWN_SOURCE_STATUS = new Set(['ok', 'disabled', 'failed']);

// ---------------------------------------------------------------------------
// Status polling hook. setTimeout-scheduled (NOT setInterval) so the backoff cadence
// is exact and a tab-hidden pause simply stops rescheduling. Resumes with an immediate
// poll on visibilitychange. Backoff sequence on consecutive errors: 30 → 60 → 120s
// (capped); any success resets to 30s. A prior status is kept on a transient error
// (the card shows a small "couldn't refresh" note instead of blanking).
// ---------------------------------------------------------------------------
function useIngestionStatus() {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timer = useRef<number | null>(null);
  const errorCount = useRef(0);
  const mounted = useRef(true);
  const reqId = useRef(0); // stale-response guard: only the latest in-flight poll may commit
  const pollRef = useRef<() => Promise<void>>(async () => {});

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
    // A newer poll (manual retry / visibility resume) supersedes an in-flight one:
    // drop the stale response so it can never overwrite fresher state or re-schedule.
    const isStale = () => !mounted.current || id !== reqId.current;
    try {
      const s = await api.getIngestionStatus();
      if (isStale()) return;
      setStatus(s);
      setError(false);
      errorCount.current = 0;
      schedule(POLL_BASE_MS);
    } catch {
      if (isStale()) return;
      setError(true);
      const delay = Math.min(POLL_BASE_MS * 2 ** errorCount.current, POLL_MAX_MS);
      errorCount.current += 1;
      schedule(delay);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [schedule]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    mounted.current = true;
    // Skip the immediate mount fetch when the tab is already hidden (a background
    // tab) — the visibilitychange handler fires the first poll when it becomes visible.
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

  const retry = useCallback(() => void pollRef.current(), []);
  return { status, loading, error, retry };
}

export default function IngestionRunsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const { status, loading: statusLoading, error: statusError, retry: retryStatus } = useIngestionStatus();

  // ---- runs list (server-paged; loads on mount / page / filter change + manual refresh)
  const [runs, setRuns] = useState<IngestionRunPage | null>(null);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState('');
  const pager = useServerPagination(runs?.total ?? 0, RUNS_PAGE_SIZE);
  const { page, perPage, totalPages, setPage, setPerPage } = pager;
  const runsReq = useRef(0); // stale-response guard for overlapping page/filter/refresh loads

  const loadRuns = useCallback(
    async (mode: 'full' | 'refresh' = 'full') => {
      const id = ++runsReq.current;
      if (mode === 'refresh') setRefreshing(true);
      else setRunsLoading(true);
      setRunsError(false);
      try {
        const data = await api.getIngestionRuns(page, perPage, source || undefined);
        // Drop a slow response that a newer load has already superseded.
        if (id !== runsReq.current) return;
        setRuns(data);
      } catch {
        if (id !== runsReq.current) return;
        setRunsError(true);
      } finally {
        if (id === runsReq.current) {
          setRunsLoading(false);
          setRefreshing(false);
        }
      }
    },
    [page, perPage, source],
  );

  useEffect(() => {
    void loadRuns('full');
  }, [loadRuns]);

  const items = runs?.items ?? [];

  return (
    <>
      <AdminTopbar title={t('admin.ingestion.title')} subtitle={t('admin.ingestion.subtitle')} />

      {/* Status snapshot — fails independently of the runs table below. */}
      <section className="panel adm" aria-label={t('admin.ingestion.statusTitle')}>
        <DemoNote />
        <h2 className="adm-title">{t('admin.ingestion.statusTitle')}</h2>
        <p className="adm-note" role="note">
          <span aria-hidden="true">💡 </span>
          {t('admin.ingestion.explainer')}
        </p>
        {statusLoading && !status ? (
          <AdminLoading rows={3} />
        ) : statusError && !status ? (
          <AdminError onRetry={retryStatus} />
        ) : status ? (
          <StatusCard status={status} lang={lang} staleError={statusError} />
        ) : null}
      </section>

      {/* Runs list — server-paged table / stacked cards. */}
      <section className="panel adm" aria-label={t('admin.ingestion.runsTitle')}>
        <h2 className="adm-title">{t('admin.ingestion.runsTitle')}</h2>
        <div className="adm-toolbar">
          <label className="adm-field ing-filter">
            <span className="wrap-label">{t('admin.ingestion.filterSource')}</span>
            <select
              className="adm-select"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1); // a new filter invalidates the page cursor
              }}
            >
              <option value="">{t('admin.ingestion.filterAll')}</option>
              {INGESTION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="adm-rowbtn"
            onClick={() => void loadRuns('refresh')}
            disabled={refreshing || runsLoading}
          >
            <span aria-hidden="true">↻ </span>
            {refreshing ? t('admin.ingestion.refreshing') : t('admin.ingestion.refresh')}
          </button>
        </div>

        {runsError && !runs ? (
          <AdminError onRetry={() => void loadRuns('full')} />
        ) : runsLoading && !runs ? (
          <AdminLoading />
        ) : runs && items.length === 0 ? (
          <AdminEmpty title={t('admin.ingestion.emptyTitle')} body={t('admin.ingestion.emptyBody')} />
        ) : runs ? (
          <>
            {runsError && (
              <p className="adm-note adm-note--error" role="alert">
                {t('common.errorBody')}
              </p>
            )}
            <div className="adm-tablewrap">
              <table className="ing-table">
                <caption className="sr-only">{t('admin.ingestion.runsTitle')}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="ing-th-toggle">
                      <span className="sr-only">{t('admin.ingestion.expand')}</span>
                    </th>
                    <th scope="col">{t('admin.ingestion.colDateTime')}</th>
                    <th scope="col">{t('admin.ingestion.colSource')}</th>
                    <th scope="col">{t('admin.ingestion.colStatus')}</th>
                    <th scope="col">{t('admin.ingestion.colRows')}</th>
                    <th scope="col" className="ing-th--num">
                      {t('admin.ingestion.colCrops')}
                    </th>
                    <th scope="col">{t('admin.ingestion.colCovered')}</th>
                    <th scope="col">{t('admin.ingestion.colVerdict')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((run) => (
                    <RunRow key={run.id} run={run} lang={lang} />
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={page}
              totalPages={totalPages}
              perPage={perPage}
              total={runs.total}
              setPage={setPage}
              setPerPage={setPerPage}
            />
          </>
        ) : null}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Status card.
// ---------------------------------------------------------------------------
function StatusCard({
  status,
  lang,
  staleError,
}: {
  status: IngestionStatus;
  lang: string;
  staleError: boolean;
}) {
  const { t } = useTranslation();
  const stateLabel = t(`admin.ingestion.state.${status.state}`, status.state);
  const lastRunFailed = status.lastRunStatus === 'failed';
  const v = status.lastVerification;
  const lastRun = status.lastRunStatus ? mapRunStatus(status.lastRunStatus) : null;

  return (
    <div className="ing-status">
      {/* aria-hidden dot is decoration; the textual state is the a11y source of truth. */}
      <p className="ing-status__state" aria-live="polite">
        <StatusDot state={status.state} lastRunFailed={lastRunFailed} />
        <span className="ing-status__word">{t('admin.ingestion.stateLive', { state: stateLabel })}</span>
      </p>

      <dl className="ing-meta">
        <div className="ing-meta__row">
          <dt>{t('admin.ingestion.serviceAddress')}</dt>
          <dd>{status.serviceAddress}</dd>
        </div>
        <div className="ing-meta__row">
          <dt>{t('admin.ingestion.lastRun')}</dt>
          <dd>
            {status.lastRunAtUtc ? (
              <>
                {formatDateTime(status.lastRunAtUtc, lang)}
                {lastRun && (
                  <span className={`adm-status adm-status--${lastRun.tone} ing-inline-badge`}>
                    {t(lastRun.labelKey)}
                  </span>
                )}
              </>
            ) : (
              <span className="adm-muted">{t('admin.ingestion.lastRunNever')}</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Verification rollup — verdict + count chips (never colour-only: counts labelled). */}
      <div className="ing-verif">
        <span className="ing-verif__label">{t('admin.ingestion.verificationTitle')}</span>
        {v ? (
          <>
            <VerdictBadge verdict={v.overallStatus} />
            <span className="ing-chip ing-chip--pass">{t('admin.ingestion.checksPass', { count: v.nChecksPass })}</span>
            <span className="ing-chip ing-chip--warn">{t('admin.ingestion.checksWarn', { count: v.nChecksWarn })}</span>
            <span className="ing-chip ing-chip--fail">{t('admin.ingestion.checksFail', { count: v.nChecksFail })}</span>
            <span className="ing-verif__time adm-muted">
              {t('admin.ingestion.verifiedAt', { time: formatDateTime(v.ranAtUtc, lang) })}
              {v.pipelineDate ? ` · ${t('admin.ingestion.verifiedFor', { date: formatDate(v.pipelineDate, lang) })}` : ''}
            </span>
          </>
        ) : (
          <span className="adm-muted">{t('admin.ingestion.noVerification')}</span>
        )}
      </div>

      {staleError && (
        <p className="adm-note adm-note--error" role="status">
          {t('common.errorBody')}
        </p>
      )}

      <div className="ing-sources">
        <h3 className="ing-sources__title">{t('admin.ingestion.sourcesTitle')}</h3>
        <ul className="ing-sources__list">
          {status.sources.map((s) => (
            <SourceRow key={s.source} source={s} lang={lang} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatusDot({ state, lastRunFailed }: { state: IngestionState; lastRunFailed: boolean }) {
  // green pulsing = running · static red = last run failed · static gray = stopped/unknown.
  const tone = state === 'running' ? 'running' : lastRunFailed ? 'failed' : 'idle';
  return <span className={`ing-dot ing-dot--${tone}`} aria-hidden="true" />;
}

type IngestionState = IngestionStatus['state'];

function SourceRow({ source, lang }: { source: IngestionSourceHealth; lang: string }) {
  const { t } = useTranslation();
  const statusLabel = KNOWN_SOURCE_STATUS.has(source.status)
    ? t(`admin.ingestion.sourceStatus.${source.status}`)
    : source.status;
  return (
    <li className="ing-source">
      <span className="ing-source__head">
        <span className="ing-source__name">{source.source}</span>
        <span className={`adm-status ing-srcstatus--${source.status}`}>{statusLabel}</span>
      </span>
      <span className="ing-source__meta adm-muted">
        {source.lastObservedDate
          ? t('admin.ingestion.lastObserved', { date: formatDate(source.lastObservedDate, lang) })
          : ''}
        {source.lastSuccessUtc
          ? `${source.lastObservedDate ? ' · ' : ''}${t('admin.ingestion.lastSuccess', { time: formatDateTime(source.lastSuccessUtc, lang) })}`
          : `${source.lastObservedDate ? ' · ' : ''}${t('admin.ingestion.neverSucceeded')}`}
      </span>
      {source.lastMessage && <span className="ing-source__msg">{source.lastMessage}</span>}
    </li>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const { t } = useTranslation();
  const v = mapVerificationVerdict(verdict);
  return <span className={`ing-verdict ing-verdict--${v.tone}`}>{t(v.labelKey)}</span>;
}

// ---------------------------------------------------------------------------
// One run row (+ its expandable verification detail row).
// ---------------------------------------------------------------------------
function RunRow({ run, lang }: { run: IngestionRun; lang: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const nf = useMemo(
    () => new Intl.NumberFormat(lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : 'en-LK'),
    [lang],
  );

  const st = mapRunStatus(run.status);
  const verdict = run.verification ? mapVerificationVerdict(run.verification.overallStatus) : null;
  const canExpand = !!run.verification || !!run.errorSummary;
  const detailId = `ing-detail-${run.id}`;
  const na = t('admin.ingestion.notApplicable');
  const hasRows = run.rowsInserted != null || run.rowsSkipped != null;

  return (
    <>
      <tr className="ing-row">
        <td className="ing-td-toggle" data-label="">
          {canExpand ? (
            <button
              type="button"
              className="ing-toggle"
              aria-expanded={open}
              // aria-controls only references the detail row while it is actually in the
              // DOM (rendered on expand) — a dangling reference is an a11y anti-pattern.
              {...(open ? { 'aria-controls': detailId } : {})}
              onClick={() => setOpen((o) => !o)}
            >
              <span aria-hidden="true">{open ? '▾' : '▸'}</span>
              <span className="sr-only">{open ? t('admin.ingestion.collapse') : t('admin.ingestion.expand')}</span>
            </button>
          ) : null}
        </td>
        <td data-label={t('admin.ingestion.colDateTime')}>{formatDateTime(run.startedUtc, lang)}</td>
        <td data-label={t('admin.ingestion.colSource')}>
          <span className="ing-src">{run.source}</span>
        </td>
        <td data-label={t('admin.ingestion.colStatus')}>
          <span className={`adm-status adm-status--${st.tone}`}>{t(st.labelKey)}</span>
        </td>
        <td data-label={t('admin.ingestion.colRows')}>
          {hasRows
            ? t('admin.ingestion.rowsInSkip', {
                inserted: nf.format(run.rowsInserted ?? 0),
                skipped: nf.format(run.rowsSkipped ?? 0),
              })
            : na}
        </td>
        <td data-label={t('admin.ingestion.colCrops')} className="ing-td--num">
          {run.distinctCrops != null ? nf.format(run.distinctCrops) : na}
        </td>
        <td data-label={t('admin.ingestion.colCovered')}>
          {run.coveredFromDate && run.coveredToDate
            ? t('admin.ingestion.coveredRange', {
                from: formatDate(run.coveredFromDate, lang),
                to: formatDate(run.coveredToDate, lang),
              })
            : na}
        </td>
        <td data-label={t('admin.ingestion.colVerdict')}>
          {verdict ? (
            <span className={`ing-verdict ing-verdict--${verdict.tone}`}>{t(verdict.labelKey)}</span>
          ) : (
            <span className="adm-muted">{t('admin.ingestion.verdict.none')}</span>
          )}
        </td>
      </tr>
      {open && canExpand && (
        <tr className="ing-detail" id={detailId}>
          <td colSpan={8}>
            <RunDetail run={run} />
          </td>
        </tr>
      )}
    </>
  );
}

function RunDetail({ run }: { run: IngestionRun }) {
  const { t } = useTranslation();
  // checksJson is a JSON STRING — parse defensively; null => "unavailable" note, never a crash.
  const checks = run.verification ? parseVerificationChecks(run.verification.checksJson) : null;

  return (
    <div className="ing-detailbody">
      {run.errorSummary && (
        <p className="ing-errbox" role="note">
          <span className="ing-errbox__label">{t('admin.ingestion.errorHeading')}: </span>
          {run.errorSummary}
        </p>
      )}
      {run.verification && (
        <div>
          <p className="ing-checks__head">{t('admin.ingestion.checksHeading')}</p>
          {checks === null ? (
            <p className="ing-checks__note adm-muted">{t('admin.ingestion.checksUnavailable')}</p>
          ) : checks.length === 0 ? (
            <p className="ing-checks__note adm-muted">{t('admin.ingestion.noChecks')}</p>
          ) : (
            <ul className="ing-checks">
              {checks.map((c, i) => {
                const sev = mapCheckSeverity(c.severity);
                const counts =
                  c.counts && Object.keys(c.counts).length > 0
                    ? Object.entries(c.counts)
                        // Values can be nested objects/arrays (e.g. alias_regression's
                        // passion_mapping) — String() would render "[object Object]".
                        .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
                        .join(' · ')
                    : null;
                return (
                  <li key={`${c.name}-${i}`} className="ing-check">
                    <span className={`ing-verdict ing-verdict--${sev.tone}`}>{t(sev.labelKey)}</span>
                    <span className="ing-check__name">{c.name || t('admin.ingestion.notApplicable')}</span>
                    {c.message && <span className="ing-check__msg">{c.message}</span>}
                    {counts && <span className="ing-check__counts adm-muted">{counts}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
