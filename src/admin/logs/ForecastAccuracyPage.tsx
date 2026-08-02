// Admin "Forecast accuracy" tab (/admin/logs/forecast-accuracy): the read surface over
// the nightly forecast-snapshot ledger. Two panels that fail independently, same idiom as
// the ingestion tab — an accuracy summary and a server-paged snapshot table.
//
// Three honesty rules drive the whole layout:
//  1. MODEL AND FALLBACK NEVER BLEND (PRD §3.4). Every aggregate is rendered inside the
//     activePredictor group the server put it in; nothing on this page adds, averages or
//     otherwise combines two predictors' numbers.
//  2. SCOPES ARE LABELLED. `counts` is an all-time census of the ledger, the metrics
//     cover the last `windowDays` days, and the per-predictor cards blend all model
//     versions — so they say so, and the per-version table is where version-specific
//     numbers live.
//  3. A NULL METRIC IS NOT ZERO. Anything the server could not compute renders as an
//     em-dash with a screen-reader "no data yet", never as 0 or a spinner.
// An empty ledger is the NORMAL state for the first months after launch (rows only score
// once their harvest date passes), so the empty state is written as a fact, not a fault.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type {
  ConfidenceString,
  ForecastAccuracyMetrics,
  ForecastAccuracySummary,
  ForecastSnapshot,
  ForecastSnapshotPage,
} from '../../api/types';
import {
  compareModelVersionsDesc,
  formatCount,
  formatDate,
  formatDateTime,
  formatPercentNumber,
  formatPointsAbs,
  formatPrice,
  formatRange,
  formatRatePercent,
  formatSignedPercentNumber,
  formatSignedPrice,
  mapConfidenceString,
  mapMaturityState,
  predictorKind,
} from '../../lib/format';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  DemoNote,
  useServerPagination,
} from '../adminShared';

const SNAPSHOTS_PAGE_SIZE = 25;
const CONFIDENCE_STRINGS = new Set<string>(['Low', 'Medium', 'High']);

/** The frozen confidence contract is Low/Medium/High; anything else is shown verbatim
 *  rather than mapped to a tone this build invented. */
function isConfidenceString(value: string): value is ConfidenceString {
  return CONFIDENCE_STRINGS.has(value);
}

/** DOM-id-safe slug for a predictor / version pair (used for aria-labelledby only). */
function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'none';
}

export default function ForecastAccuracyPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  // Summary — counts + per-predictor + per-version aggregates.
  const [summary, setSummary] = useState<ForecastAccuracySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const summaryReq = useRef(0);

  const loadSummary = useCallback(async () => {
    const id = ++summaryReq.current;
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const data = await api.getForecastAccuracySummary();
      if (id !== summaryReq.current) return; // a newer load superseded this one
      setSummary(data);
    } catch {
      if (id !== summaryReq.current) return;
      setSummaryError(true);
    } finally {
      if (id === summaryReq.current) setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // Snapshot ledger — server-paged, with two optional filters.
  const [snapshots, setSnapshots] = useState<ForecastSnapshotPage | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [snapshotsError, setSnapshotsError] = useState(false);
  const [modelVersion, setModelVersion] = useState(''); // '' = every version
  const [maturedOnly, setMaturedOnly] = useState(false);
  const pager = useServerPagination(snapshots?.total ?? 0, SNAPSHOTS_PAGE_SIZE);
  const { page, perPage, totalPages, setPage, setPerPage } = pager;
  const snapshotsReq = useRef(0); // stale-response guard for overlapping page/filter loads

  const loadSnapshots = useCallback(async () => {
    const id = ++snapshotsReq.current;
    setSnapshotsLoading(true);
    setSnapshotsError(false);
    try {
      const data = await api.getForecastSnapshots(page, perPage, {
        ...(modelVersion ? { modelVersion } : {}),
        ...(maturedOnly ? { maturedOnly: true } : {}),
      });
      if (id !== snapshotsReq.current) return; // a newer load superseded this one
      setSnapshots(data);
    } catch {
      if (id !== snapshotsReq.current) return;
      setSnapshotsError(true);
    } finally {
      if (id === snapshotsReq.current) setSnapshotsLoading(false);
    }
  }, [page, perPage, modelVersion, maturedOnly]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  // Filter vocabulary = the versions the SUMMARY scored ∪ the versions on the loaded
  // ledger page ∪ whatever is selected right now. The summary alone is not enough: its
  // groups only cover matured rows, so a freshly promoted version whose snapshots are
  // all still pending would be unfilterable for months. Keeping the current selection in
  // the set stops the chosen option vanishing when a page happens to hold no rows of
  // that version. Nulls are dropped — "no version recorded" is not a filterable value.
  const versionOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const group of summary?.byModelVersion ?? []) {
      if (group.modelVersion) seen.add(group.modelVersion);
    }
    for (const snapshot of snapshots?.items ?? []) {
      if (snapshot.modelVersion) seen.add(snapshot.modelVersion);
    }
    if (modelVersion) seen.add(modelVersion);
    return [...seen].sort(compareModelVersionsDesc);
  }, [summary, snapshots, modelVersion]);

  const items = snapshots?.items ?? [];
  const filtered = modelVersion !== '' || maturedOnly;
  const ledgerEmpty = summary !== null && summary.counts.total === 0;

  return (
    <>
      {/* No page title: this renders inside the Logs hub, under its H1 and tab strip. */}
      <section className="panel adm" aria-label={t('admin.forecastAccuracy.summaryTitle')}>
        <DemoNote />
        <h2 className="adm-title">{t('admin.forecastAccuracy.summaryTitle')}</h2>

        {summaryError && !summary ? (
          <AdminError onRetry={() => void loadSummary()} />
        ) : summaryLoading && !summary ? (
          <AdminLoading rows={4} />
        ) : ledgerEmpty ? (
          // The normal state for the first months: snapshots are being written, but no
          // harvest has come round yet. Say exactly that instead of showing zeroes.
          <AdminEmpty
            title={t('admin.forecastAccuracy.ledgerEmptyTitle')}
            body={t('admin.forecastAccuracy.ledgerEmptyBody')}
          />
        ) : summary ? (
          <SummaryBody summary={summary} lang={lang} staleError={summaryError} />
        ) : null}
      </section>

      <section className="panel adm" aria-label={t('admin.forecastAccuracy.snapshotsTitle')}>
        <h2 className="adm-title">{t('admin.forecastAccuracy.snapshotsTitle')}</h2>

        <div className="adm-toolbar">
          <label className="adm-field ing-filter">
            <span className="wrap-label">{t('admin.forecastAccuracy.filterVersion')}</span>
            <select
              className="adm-select"
              value={modelVersion}
              onChange={(e) => {
                setModelVersion(e.target.value);
                setPage(1); // a new filter invalidates the page cursor
              }}
            >
              <option value="">{t('admin.forecastAccuracy.filterVersionAll')}</option>
              {versionOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-field adm-field--check">
            <input
              type="checkbox"
              checked={maturedOnly}
              onChange={(e) => {
                setMaturedOnly(e.target.checked);
                setPage(1);
              }}
            />
            <span>{t('admin.forecastAccuracy.filterMaturedOnly')}</span>
          </label>
        </div>

        {snapshotsError && !snapshots ? (
          <AdminError onRetry={() => void loadSnapshots()} />
        ) : snapshotsLoading && !snapshots ? (
          <AdminLoading />
        ) : snapshots && items.length === 0 ? (
          <AdminEmpty
            title={t('admin.forecastAccuracy.snapshotsEmptyTitle')}
            // "Nothing recorded yet" and "nothing matches this filter" are different
            // facts and must not share one sentence.
            body={t(
              filtered
                ? 'admin.forecastAccuracy.snapshotsEmptyBodyFiltered'
                : 'admin.forecastAccuracy.snapshotsEmptyBody',
            )}
          />
        ) : snapshots ? (
          <>
            {snapshotsError && (
              <p className="adm-note adm-note--error" role="alert">
                {t('common.errorBody')}
              </p>
            )}
            <div className="adm-tablewrap">
              <table className="ing-table">
                <caption className="sr-only">{t('admin.forecastAccuracy.snapshotsTitle')}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="ing-th-toggle">
                      <span className="sr-only">{t('admin.forecastAccuracy.expand')}</span>
                    </th>
                    <th scope="col">{t('admin.forecastAccuracy.colSnapshotDate')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colCrop')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colHarvestDate')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colPrediction')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colConfidence')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colServedBy')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colState')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colActual')}</th>
                    <th scope="col">{t('admin.forecastAccuracy.colError')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((snapshot) => (
                    <SnapshotRow key={snapshot.id} snapshot={snapshot} lang={lang} />
                  ))}
                </tbody>
              </table>
              <AdminPagination
                page={page}
                totalPages={totalPages}
                perPage={perPage}
                total={snapshots.total}
                setPage={setPage}
                setPerPage={setPerPage}
              />
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}

/** The "not computable yet" marker. An em-dash for sighted readers, a sentence for
 *  screen readers — and never the number 0, which would read as a real measurement. */
function NoData() {
  const { t } = useTranslation();
  return (
    <span className="adm-muted fa-nodata">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t('admin.forecastAccuracy.noData')}</span>
    </span>
  );
}

/** Renders a formatted value, or the no-data marker when the formatter returned null. */
function Value({ text }: { text: string | null }) {
  return text === null ? <NoData /> : <>{text}</>;
}

function SummaryBody({
  summary,
  lang,
  staleError,
}: {
  summary: ForecastAccuracySummary;
  lang: string;
  staleError: boolean;
}) {
  const { t } = useTranslation();
  const { counts } = summary;

  return (
    <>
      {staleError && (
        <p className="adm-note adm-note--error" role="alert">
          {t('common.errorBody')}
        </p>
      )}

      <p className="adm-caption">
        {t('admin.forecastAccuracy.latestSnapshot')}{' '}
        {summary.latestSnapshotDate ? (
          formatDate(summary.latestSnapshotDate, lang)
        ) : (
          <NoData />
        )}
        {' · '}
        {t('admin.forecastAccuracy.generatedAt', {
          when: formatDateTime(summary.generatedAtUtc, lang),
        })}
      </p>

      <p className="adm-caption fa-scope">{t('admin.forecastAccuracy.countsScope')}</p>
      <dl className="fa-counts">
        <Count label={t('admin.forecastAccuracy.countTotal')} value={counts.total} lang={lang} />
        <Count label={t('admin.forecastAccuracy.countPending')} value={counts.pending} lang={lang} />
        <Count label={t('admin.forecastAccuracy.countMatured')} value={counts.matured} lang={lang} />
        <Count
          label={t('admin.forecastAccuracy.countActualUnavailable')}
          value={counts.actualUnavailable}
          lang={lang}
        />
        <Count
          label={t('admin.forecastAccuracy.countNotMaturable')}
          value={counts.notMaturable}
          lang={lang}
        />
      </dl>

      <h3 className="fa-subhead">{t('admin.forecastAccuracy.byPredictorTitle')}</h3>
      <p className="adm-note" role="note">
        {t('admin.forecastAccuracy.splitNote')}
      </p>
      {summary.byActivePredictor.length === 0 ? (
        <AdminEmpty
          title={t('admin.forecastAccuracy.noMetricsTitle')}
          body={t('admin.forecastAccuracy.noMetricsBody')}
        />
      ) : (
        <div className="fa-cards">
          {summary.byActivePredictor.map((group) => (
            <PredictorCard
              key={group.activePredictor}
              activePredictor={group.activePredictor}
              metrics={group.metrics}
              windowDays={summary.windowDays}
              lang={lang}
            />
          ))}
        </div>
      )}

      {summary.byModelVersion.length > 0 && (
        <>
          <h3 className="fa-subhead">{t('admin.forecastAccuracy.byVersionTitle')}</h3>
          <p className="adm-caption">
            {t('admin.forecastAccuracy.metricsWindow', { days: summary.windowDays })}
          </p>
          <div className="adm-tablewrap">
            <table className="ing-table">
              <caption className="sr-only">{t('admin.forecastAccuracy.byVersionTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.forecastAccuracy.colVersion')}</th>
                  <th scope="col">{t('admin.forecastAccuracy.colPredictor')}</th>
                  <th scope="col">{t('admin.forecastAccuracy.colMatured')}</th>
                  <th scope="col">{t('admin.forecastAccuracy.colMedianApe')}</th>
                  <th scope="col">{t('admin.forecastAccuracy.colMape')}</th>
                  <th scope="col">{t('admin.forecastAccuracy.colBias')}</th>
                  <th scope="col">{t('admin.forecastAccuracy.colCoverage')}</th>
                  <th scope="col">{t('admin.forecastAccuracy.colDirectional')}</th>
                </tr>
              </thead>
              <tbody>
                {/* One row per (version, predictor) group EXACTLY as served — two rows
                    sharing a version are never merged, because merging them is the same
                    mistake as averaging a model with a fallback. Only the ORDER is ours
                    to choose (the server leaves it to the UI): newest version first,
                    compared numerically so v9 cannot outrank v17. */}
                {[...summary.byModelVersion]
                  .sort((a, b) => compareModelVersionsDesc(a.modelVersion, b.modelVersion))
                  .map((group) => (
                    <VersionRow
                      key={`${group.modelVersion ?? 'none'}-${group.activePredictor}`}
                      modelVersion={group.modelVersion}
                      activePredictor={group.activePredictor}
                      metrics={group.metrics}
                      lang={lang}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Count({ label, value, lang }: { label: string; value: number; lang: string }) {
  return (
    <div className="fa-count">
      <dt>{label}</dt>
      <dd>
        <Value text={formatCount(value, lang)} />
      </dd>
    </div>
  );
}

/** One predictor's headline metrics. The predictor string is shown VERBATIM (the wire
 *  name is the fact), paired with a Model/Fallback word so the split is readable at a
 *  glance, and captioned with both scopes: the metric window and "all model versions". */
function PredictorCard({
  activePredictor,
  metrics,
  windowDays,
  lang,
}: {
  activePredictor: string;
  metrics: ForecastAccuracyMetrics;
  windowDays: number;
  lang: string;
}) {
  const { t } = useTranslation();
  const kind = predictorKind(activePredictor);
  const headId = `fa-pred-${slug(activePredictor)}`;

  return (
    <section className="fa-card" aria-labelledby={headId}>
      <h4 className="fa-card__head" id={headId}>
        <span className="fa-card__predictor">{activePredictor}</span>{' '}
        <span className={`adm-status adm-status--${kind === 'model' ? 'good' : 'neutral'}`}>
          {t(
            kind === 'model'
              ? 'admin.forecastAccuracy.kind.model'
              : 'admin.forecastAccuracy.kind.fallback',
          )}
        </span>
      </h4>
      <p className="adm-caption fa-scope">
        {t('admin.forecastAccuracy.metricsWindow', { days: windowDays })}
        {' · '}
        {t('admin.forecastAccuracy.allVersionsScope')}
      </p>

      <p className="fa-headline">
        <span className="fa-headline__value">
          <Value text={formatPercentNumber(metrics.medianApe, lang)} />
        </span>
        <span className="fa-headline__label">{t('admin.forecastAccuracy.medianApe')}</span>
      </p>

      <dl className="fa-metrics">
        <Metric
          label={t('admin.forecastAccuracy.scored')}
          value={t('admin.forecastAccuracy.scoredValue', {
            matured: formatCount(metrics.maturedCount, lang) ?? '—',
            scored: formatCount(metrics.scoredCount, lang) ?? '—',
          })}
        />
        <Metric
          label={t('admin.forecastAccuracy.mape')}
          value={formatPercentNumber(metrics.mape, lang)}
        />
        <Metric
          label={t('admin.forecastAccuracy.signedBias')}
          // Money, not a percentage: the mean of (predicted − actual) in Rs/kg.
          value={formatSignedPrice(metrics.signedBias, lang, t('common.rs'))}
          hint={t('admin.forecastAccuracy.signedBiasHint')}
        />
        <Metric
          label={t('admin.forecastAccuracy.intervalCoverage')}
          value={formatRatePercent(metrics.intervalCoverage, lang)}
          hint={coverageHint(metrics, lang, t)}
        />
        <Metric
          label={t('admin.forecastAccuracy.directionalAccuracy')}
          value={formatRatePercent(metrics.directionalAccuracy, lang)}
          // The denominators travel with the rate, always: a direction score computed
          // over 3 rows and one computed over 300 are not the same claim.
          hint={t('admin.forecastAccuracy.directionalScope', {
            scored: formatCount(metrics.directionalScored, lang) ?? '—',
            excluded: formatCount(metrics.directionalExcluded, lang) ?? '—',
          })}
        />
      </dl>
    </section>
  );
}

/** "Nominal 80% · 13.3 points below" — the band's target and how far off it is, with the
 *  direction as a WORD so the sign is never the only signal. */
function coverageHint(
  metrics: ForecastAccuracyMetrics,
  lang: string,
  t: TFunction,
): string | null {
  const nominal = formatRatePercent(metrics.nominalIntervalCoverage, lang, 0);
  if (nominal === null) return null;
  const nominalText = t('admin.forecastAccuracy.nominal', { value: nominal });
  const gap = metrics.intervalCoverageGap;
  const points = formatPointsAbs(gap, lang);
  if (gap === null || points === null) return nominalText;
  if (gap === 0) return `${nominalText} · ${t('admin.forecastAccuracy.gapOnTarget')}`;
  const key =
    gap < 0 ? 'admin.forecastAccuracy.gapBelow' : 'admin.forecastAccuracy.gapAbove';
  return `${nominalText} · ${t(key, { points })}`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string | null;
}) {
  return (
    <div className="fa-metric">
      <dt>{label}</dt>
      <dd className="fa-metric__value">
        <Value text={value} />
      </dd>
      {hint ? <dd className="fa-metric__hint">{hint}</dd> : null}
    </div>
  );
}

function VersionRow({
  modelVersion,
  activePredictor,
  metrics,
  lang,
}: {
  modelVersion: string | null;
  activePredictor: string;
  metrics: ForecastAccuracyMetrics;
  lang: string;
}) {
  const { t } = useTranslation();
  const kind = predictorKind(activePredictor);

  return (
    <tr className="ing-row">
      <td data-label={t('admin.forecastAccuracy.colVersion')}>
        {modelVersion ? (
          <span className="ing-src">{modelVersion}</span>
        ) : (
          <span className="adm-muted">{t('admin.forecastAccuracy.versionUnknown')}</span>
        )}
      </td>
      <td data-label={t('admin.forecastAccuracy.colPredictor')}>
        <span className="fa-predictor">{activePredictor}</span>{' '}
        <span className={`adm-status adm-status--${kind === 'model' ? 'good' : 'neutral'}`}>
          {t(
            kind === 'model'
              ? 'admin.forecastAccuracy.kind.model'
              : 'admin.forecastAccuracy.kind.fallback',
          )}
        </span>
      </td>
      <td data-label={t('admin.forecastAccuracy.colMatured')}>
        {t('admin.forecastAccuracy.scoredValue', {
          matured: formatCount(metrics.maturedCount, lang) ?? '—',
          scored: formatCount(metrics.scoredCount, lang) ?? '—',
        })}
      </td>
      <td data-label={t('admin.forecastAccuracy.colMedianApe')}>
        <Value text={formatPercentNumber(metrics.medianApe, lang)} />
      </td>
      <td data-label={t('admin.forecastAccuracy.colMape')}>
        <Value text={formatPercentNumber(metrics.mape, lang)} />
      </td>
      <td data-label={t('admin.forecastAccuracy.colBias')}>
        {/* Rs/kg, never a percentage — see ForecastAccuracyMetrics. */}
        <Value text={formatSignedPrice(metrics.signedBias, lang, t('common.rs'))} />
      </td>
      <td data-label={t('admin.forecastAccuracy.colCoverage')}>
        <span className="fa-stack">
          <Value text={formatRatePercent(metrics.intervalCoverage, lang)} />
          <span className="fa-stack__sub">{coverageHint(metrics, lang, t)}</span>
        </span>
      </td>
      <td data-label={t('admin.forecastAccuracy.colDirectional')}>
        <span className="fa-stack">
          <Value text={formatRatePercent(metrics.directionalAccuracy, lang)} />
          <span className="fa-stack__sub">
            {t('admin.forecastAccuracy.directionalScope', {
              scored: formatCount(metrics.directionalScored, lang) ?? '—',
              excluded: formatCount(metrics.directionalExcluded, lang) ?? '—',
            })}
          </span>
        </span>
      </td>
    </tr>
  );
}

/** The confidence the forecast was SERVED with, translated but never re-graded: the
 *  Low/Medium/High wire strings are frozen, and a string outside that set is shown
 *  verbatim rather than dressed in a tone this build invented. */
function ConfidenceCell({ confidence }: { confidence: string }) {
  const { t } = useTranslation();
  if (!isConfidenceString(confidence)) {
    return <span className="adm-muted">{confidence}</span>;
  }
  const display = mapConfidenceString(confidence);
  // Low confidence is amber caution; Medium neutral; High good. Red stays reserved.
  const tone = display.tone === 'good' ? 'good' : display.tone === 'fair' ? 'neutral' : 'warn';
  return <span className={`adm-status adm-status--${tone}`}>{t(display.labelKey)}</span>;
}

/** One snapshot row plus its expandable detail row (why this forecast was served, and
 *  what it was scored against). */
function SnapshotRow({ snapshot, lang }: { snapshot: ForecastSnapshot; lang: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rs = t('common.rs');
  const na = t('admin.forecastAccuracy.notApplicable');
  const state = mapMaturityState(snapshot.maturityState);
  const kind = predictorKind(snapshot.activePredictor);
  const detailId = `fa-detail-${snapshot.id}`;

  return (
    <>
      <tr className="ing-row">
        <td className="ing-td-toggle" data-label="">
          <button
            type="button"
            className="ing-toggle"
            aria-expanded={open}
            {...(open ? { 'aria-controls': detailId } : {})}
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            <span className="sr-only">
              {open
                ? t('admin.forecastAccuracy.collapseRow', { crop: snapshot.cropName })
                : t('admin.forecastAccuracy.expandRow', { crop: snapshot.cropName })}
            </span>
          </button>
        </td>
        <td data-label={t('admin.forecastAccuracy.colSnapshotDate')}>
          {formatDate(snapshot.snapshotDate, lang)}
        </td>
        <td data-label={t('admin.forecastAccuracy.colCrop')}>
          <span className="fa-crop">
            <span className="fa-crop__name">{snapshot.cropName}</span>
            {/* cropCode is nullable on the wire — no empty muted line when it is absent. */}
            {snapshot.cropCode && (
              <span className="fa-crop__code adm-muted">{snapshot.cropCode}</span>
            )}
          </span>
        </td>
        <td data-label={t('admin.forecastAccuracy.colHarvestDate')}>
          {snapshot.harvestDate ? (
            formatDate(snapshot.harvestDate, lang)
          ) : (
            <span className="adm-muted">{na}</span>
          )}
        </td>
        <td data-label={t('admin.forecastAccuracy.colPrediction')}>
          {/* The band travels with the number: a p50 shown alone reads as a promise. */}
          <span className="fa-pred">
            <span className="fa-pred__p50">{formatPrice(snapshot.predictedPrice, lang, rs, 2)}</span>
            <span className="fa-pred__band">
              {t('admin.forecastAccuracy.band', {
                range: formatRange(snapshot.lowerBound, snapshot.upperBound, lang, rs, 2),
              })}
            </span>
          </span>
        </td>
        <td data-label={t('admin.forecastAccuracy.colConfidence')}>
          <ConfidenceCell confidence={snapshot.confidence} />
        </td>
        <td data-label={t('admin.forecastAccuracy.colServedBy')}>
          <span className="fa-stack">
            <span className="ing-src">
              {snapshot.modelVersion ?? t('admin.forecastAccuracy.versionUnknown')}
            </span>
            <span className="fa-stack__sub">
              {snapshot.activePredictor}
              {' · '}
              {t(
                kind === 'model'
                  ? 'admin.forecastAccuracy.kind.model'
                  : 'admin.forecastAccuracy.kind.fallback',
              )}
            </span>
          </span>
        </td>
        <td data-label={t('admin.forecastAccuracy.colState')}>
          {/* Glyph AND word — the colour is never the only signal, and no state is red:
              an unavailable actual is a fact about the price data, not a failure. */}
          <span className={`adm-status adm-status--${state.tone}`}>
            <span aria-hidden="true">{state.glyph} </span>
            {state.labelKey ? t(state.labelKey) : state.fallback}
          </span>
        </td>
        <td data-label={t('admin.forecastAccuracy.colActual')}>
          {snapshot.actualPrice !== null ? (
            formatPrice(snapshot.actualPrice, lang, rs, 2)
          ) : (
            <NoData />
          )}
        </td>
        <td data-label={t('admin.forecastAccuracy.colError')}>
          <Value text={formatSignedPercentNumber(snapshot.percentageError, lang)} />
        </td>
      </tr>
      {open && (
        <tr className="ing-detail" id={detailId}>
          <td colSpan={10}>
            <div className="ing-detailbody">
              <div>
                <p className="ing-checks__head">{t('admin.forecastAccuracy.whyHeading')}</p>
                <dl className="fa-metrics">
                  <Metric
                    label={t('admin.forecastAccuracy.reasonCode')}
                    value={snapshot.reasonCode}
                  />
                  <Metric
                    label={t('admin.forecastAccuracy.fallbackTier')}
                    value={snapshot.fallbackTier}
                  />
                  <Metric
                    label={t('admin.forecastAccuracy.growthPeriod')}
                    value={
                      snapshot.growthPeriodDays === null
                        ? null
                        : t('admin.forecastAccuracy.days', {
                            count: snapshot.growthPeriodDays,
                          })
                    }
                  />
                  <Metric
                    label={t('admin.forecastAccuracy.referencePrice')}
                    value={
                      snapshot.referencePrice === null
                        ? null
                        : formatPrice(snapshot.referencePrice, lang, rs, 2)
                    }
                  />
                </dl>
              </div>
              <div>
                <p className="ing-checks__head">{t('admin.forecastAccuracy.scoringHeading')}</p>
                <dl className="fa-metrics">
                  <Metric
                    label={t('admin.forecastAccuracy.actualObservedDate')}
                    value={
                      snapshot.actualObservedDate
                        ? formatDate(snapshot.actualObservedDate, lang)
                        : null
                    }
                  />
                  <Metric
                    label={t('admin.forecastAccuracy.signedError')}
                    value={
                      // Same quantity class as the bias: signed money in Rs/kg.
                      snapshot.signedError === null
                        ? null
                        : formatSignedPrice(snapshot.signedError, lang, rs)
                    }
                  />
                  <Metric
                    label={t('admin.forecastAccuracy.withinInterval')}
                    value={
                      snapshot.withinInterval === null
                        ? null
                        : t(
                            snapshot.withinInterval
                              ? 'admin.forecastAccuracy.insideBand'
                              : 'admin.forecastAccuracy.outsideBand',
                          )
                    }
                  />
                  <Metric
                    label={t('admin.forecastAccuracy.recordedAt')}
                    value={formatDateTime(snapshot.createdAtUtc, lang)}
                  />
                  <Metric
                    label={t('admin.forecastAccuracy.maturedAt')}
                    value={
                      snapshot.maturedAtUtc ? formatDateTime(snapshot.maturedAtUtc, lang) : null
                    }
                  />
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
