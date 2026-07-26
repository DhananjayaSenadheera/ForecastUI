// Admin page for model training runs (/admin/logs/training), read-only and
// server-paged.
// `promoted` (live right now) and `decisionPromoted` (the quality gate's verdict) are
// shown as independent signals and never collapsed: a manual override shows BOTH
// "Live" and "Failed quality check", with promotionDecision as the explanation.
// MAE is shown to 2dp and is never colour-coded.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { TrainingRun, TrainingRunPage } from '../../api/types';
import { formatDateTime, formatMae, mapGateOutcome } from '../../lib/format';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  DemoNote,
  useServerPagination,
} from '../adminShared';

const RUNS_PAGE_SIZE = 25;

export default function TrainingRunsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [runs, setRuns] = useState<TrainingRunPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pager = useServerPagination(runs?.total ?? 0, RUNS_PAGE_SIZE);
  const { page, perPage, totalPages, setPage, setPerPage } = pager;
  const req = useRef(0); // stale-response guard for overlapping page loads

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    setError(false);
    try {
      const data = await api.getTrainingRuns(page, perPage);
      if (id !== req.current) return; // a newer load superseded this one
      setRuns(data);
    } catch {
      if (id !== req.current) return;
      setError(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = runs?.items ?? [];

  return (
    <section className="panel adm" aria-label={t('admin.logs.training.runsTitle')}>
      <DemoNote />

      {error && !runs ? (
        <AdminError onRetry={() => void load()} />
      ) : loading && !runs ? (
        <AdminLoading />
      ) : runs && items.length === 0 ? (
        <AdminEmpty
          title={t('admin.logs.training.emptyTitle')}
          body={t('admin.logs.training.emptyBody')}
        />
      ) : runs ? (
        <>
          {error && (
            <p className="adm-note adm-note--error" role="alert">
              {t('common.errorBody')}
            </p>
          )}
          <div className="adm-tablewrap">
            <table className="ing-table">
              <caption className="sr-only">{t('admin.logs.training.runsTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="ing-th-toggle">
                    <span className="sr-only">{t('admin.logs.training.expand')}</span>
                  </th>
                  <th scope="col">{t('admin.logs.training.colVersion')}</th>
                  <th scope="col">{t('admin.logs.training.colTrained')}</th>
                  <th scope="col">{t('admin.logs.training.colBestMl')}</th>
                  <th scope="col">{t('admin.logs.training.colBaseline')}</th>
                  <th scope="col">{t('admin.logs.training.colGate')}</th>
                  <th scope="col">{t('admin.logs.training.colLive')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <TrainingRow key={run.version} run={run} lang={lang} />
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
  );
}

// One training row plus its expandable promotion-decision detail row.
function TrainingRow({ run, lang }: { run: TrainingRun; lang: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const gate = mapGateOutcome(run.decisionPromoted);
  const na = t('admin.logs.training.notApplicable');
  // Manual override: live even though the gate declined it. Both badges are shown.
  const isOverride = run.promoted && !run.decisionPromoted;
  const canExpand = !!run.promotionDecision;
  const detailId = `train-detail-${run.version}`;

  return (
    <>
      <tr className="ing-row">
        <td className="ing-td-toggle" data-label="">
          {canExpand ? (
            <button
              type="button"
              className="ing-toggle"
              aria-expanded={open}
              {...(open ? { 'aria-controls': detailId } : {})}
              onClick={() => setOpen((o) => !o)}
            >
              <span aria-hidden="true">{open ? '▾' : '▸'}</span>
              <span className="sr-only">
                {open ? t('admin.logs.training.collapse') : t('admin.logs.training.expand')}
              </span>
            </button>
          ) : null}
        </td>
        <td data-label={t('admin.logs.training.colVersion')}>
          <span className="ing-src">{run.version}</span>
        </td>
        <td data-label={t('admin.logs.training.colTrained')}>
          {formatDateTime(run.trainedAtUtc, lang)}
        </td>
        <td data-label={t('admin.logs.training.colBestMl')}>
          <MetricCell kind={run.bestMlKind} mae={run.bestMlMae} lang={lang} na={na} />
        </td>
        <td data-label={t('admin.logs.training.colBaseline')}>
          <MetricCell kind={run.bestBaselineKind} mae={run.bestBaselineMae} lang={lang} na={na} />
        </td>
        <td data-label={t('admin.logs.training.colGate')}>
          <span
            className={`adm-status adm-status--${gate.tone}`}
            // On an override, promotionDecision explains why we promoted anyway.
            title={isOverride ? run.promotionDecision ?? undefined : undefined}
          >
            {t(gate.labelKey)}
          </span>
        </td>
        <td data-label={t('admin.logs.training.colLive')}>
          {run.promoted ? (
            <span
              className="adm-status adm-status--live"
              title={isOverride ? run.promotionDecision ?? undefined : undefined}
            >
              {t('admin.logs.training.live')}
            </span>
          ) : (
            <span className="adm-muted">{na}</span>
          )}
        </td>
      </tr>
      {open && canExpand && (
        <tr className="ing-detail" id={detailId}>
          <td colSpan={7}>
            <div className="ing-detailbody">
              {isOverride && (
                <p className="adm-note adm-note--warn" role="note">
                  <span aria-hidden="true">⚠️ </span>
                  {t('admin.logs.training.overrideNote')}
                </p>
              )}
              <div>
                <p className="ing-checks__head">{t('admin.logs.training.decisionHeading')}</p>
                <p className="train-decision">{run.promotionDecision}</p>
              </div>
              {(run.nTrainRows !== null || run.nCrops !== null) && (
                <p className="train-scope">
                  {run.nTrainRows !== null &&
                    t('admin.logs.training.trainRows', { count: run.nTrainRows })}
                  {run.nTrainRows !== null && run.nCrops !== null && ' · '}
                  {run.nCrops !== null && t('admin.logs.training.crops', { count: run.nCrops })}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Kind + MAE cell ("kind · MAE x.xx"), degrading when a piece is null. MAE is never
 *  colour-coded. */
function MetricCell({
  kind,
  mae,
  lang,
  na,
}: {
  kind: string | null;
  mae: number | null;
  lang: string;
  na: string;
}) {
  const { t } = useTranslation();
  const maeStr = useMemo(() => formatMae(mae, lang), [mae, lang]);
  if (!kind && maeStr === null) return <span className="adm-muted">{na}</span>;
  return (
    <span className="train-metric">
      {kind && <span className="train-metric__kind">{kind}</span>}
      {maeStr !== null && (
        <span className="train-metric__mae">{t('admin.logs.training.mae', { mae: maeStr })}</span>
      )}
    </span>
  );
}
