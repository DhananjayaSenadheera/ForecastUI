// ADM-2 — Policy flags VIEW page (/admin/policy-flags). Sortable data table over the
// LIVE GET /api/policy-flag/get/all. VIEW ONLY in this slice (no create/edit UI).
//
// Honest display: Direction is a GLYPH + WORD on a NEUTRAL badge — never colour-only,
// and never red/green (RED is reserved app-wide for the farmer "Not recommended"
// verdict). Status (Active / Scheduled / Expired) is DERIVED client-side from the
// effective window (derivePolicyStatus, tested). An as-of date filter maps to the
// ?asOfDate= query. referenceUrl renders as an external link when present.
//
// EMPTY-RESULT QUIRK: the .NET GetAll handler returns HTTP 400 ("No policy flags
// found.") for an empty list (and for an as-of date with no active flags), NOT 200 [].
// We treat a 400 on this route as the honest EMPTY state, not a hard error.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { PolicyFlag, PolicyStatus } from '../api/types';
import { derivePolicyStatus, formatDate, mapPolicyDirection, mapPolicyType, ymdLocal } from '../lib/format';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTopbar,
  DemoNote,
  EnumBadge,
  SortableTh,
  usePagination,
} from './adminShared';

type SortKey = 'type' | 'title' | 'direction' | 'from' | 'to' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_LABEL: Record<PolicyStatus, string> = {
  active: 'admin.policy.status.active',
  scheduled: 'admin.policy.status.scheduled',
  expired: 'admin.policy.status.expired',
};

export default function PolicyFlagsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [flags, setFlags] = useState<PolicyFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);
  // Defaults to TODAY (owner request 2026-07-12): the everyday admin question is
  // "what's in force right now". "Show all flags" clears it to the full register
  // (scheduled + expired included) — without that escape the other rows would be
  // invisible by default.
  const [asOf, setAsOf] = useState(() => ymdLocal(new Date()));
  const [sortKey, setSortKey] = useState<SortKey>('from');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async (asOfDate: string) => {
    setLoading(true);
    setError(false);
    setEmpty(false);
    try {
      const data = await api.getPolicyFlags(asOfDate || undefined);
      setFlags(data);
      setEmpty(data.length === 0);
    } catch (e) {
      // Contract quirk: empty result comes back as 400 — treat as the empty state.
      if (e instanceof ApiError && e.status === 400) {
        setFlags([]);
        setEmpty(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(asOf);
  }, [load, asOf]);

  const onSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(key);
        setSortDir(key === 'title' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  const rows = useMemo(() => {
    const withDerived = flags.map((f) => ({
      f,
      status: derivePolicyStatus(f.effectiveFrom, f.effectiveTo),
    }));
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: (typeof withDerived)[number], b: (typeof withDerived)[number]): number => {
      switch (sortKey) {
        case 'type':
          return a.f.policyType - b.f.policyType;
        case 'title':
          return a.f.title.localeCompare(b.f.title);
        case 'direction':
          return a.f.direction - b.f.direction;
        case 'to':
          // open-ended (null) sorts as "far future" so still-in-effect flags lead on desc.
          return (a.f.effectiveTo ?? '9999').localeCompare(b.f.effectiveTo ?? '9999');
        case 'status':
          return a.status.localeCompare(b.status);
        case 'from':
        default:
          return a.f.effectiveFrom.localeCompare(b.f.effectiveFrom);
      }
    };
    return [...withDerived].sort((a, b) => cmp(a, b) * dir || a.f.title.localeCompare(b.f.title));
  }, [flags, sortKey, sortDir]);

  const pager = usePagination(rows);

  return (
    <>
      <AdminTopbar title={t('admin.policy.title')} subtitle={t('admin.policy.subtitle')} />
      <section className="panel adm" aria-label={t('admin.policy.title')}>
        <DemoNote />

        {/* As-of date filter -> ?asOfDate= */}
        <div className="adm-filters">
          <label className="adm-field">
            <span className="wrap-label">{t('admin.policy.asOfLabel')}</span>
            <input
              type="date"
              className="adm-input"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          {asOf && (
            <button type="button" className="btn-ghost adm-clear" onClick={() => setAsOf('')}>
              {t('admin.policy.asOfClear')}
            </button>
          )}
        </div>
        {asOf && <p className="adm-caption">{t('admin.policy.asOfCaption', { date: formatDate(asOf, lang) })}</p>}

        {error ? (
          <AdminError onRetry={() => void load(asOf)} />
        ) : loading ? (
          <AdminLoading />
        ) : empty ? (
          <AdminEmpty
            title={t('admin.policy.emptyTitle')}
            body={asOf ? t('admin.policy.emptyAsOf') : t('admin.policy.emptyBody')}
          />
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <caption className="sr-only">{t('admin.policy.title')}</caption>
              <thead>
                <tr>
                  <SortableTh col="type" label={t('admin.policy.colType')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="title" label={t('admin.policy.colTitle')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="direction" label={t('admin.policy.colDirection')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="from" label={t('admin.policy.colFrom')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="to" label={t('admin.policy.colTo')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="status" label={t('admin.policy.colStatus')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th scope="col">{t('admin.policy.colSource')}</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map(({ f, status }) => {
                  const type = mapPolicyType(f.policyType);
                  const direction = mapPolicyDirection(f.direction);
                  return (
                    <tr key={f.id}>
                      <td data-label={t('admin.policy.colType')}>
                        <EnumBadge labelKey={type.labelKey} fallback={type.fallback} />
                      </td>
                      <th scope="row" className="adm-c-title" data-label={t('admin.policy.colTitle')}>
                        <span className="adm-title">{f.title}</span>
                        {f.description && <span className="adm-desc">{f.description}</span>}
                      </th>
                      <td data-label={t('admin.policy.colDirection')}>
                        <EnumBadge labelKey={direction.labelKey} fallback={direction.fallback} glyph={direction.glyph} className={`adm-badge--dir${direction.tone ? ` is-${direction.tone}` : ''}`} />
                      </td>
                      <td data-label={t('admin.policy.colFrom')}>{formatDate(f.effectiveFrom.slice(0, 10), lang)}</td>
                      <td data-label={t('admin.policy.colTo')}>
                        {f.effectiveTo ? formatDate(f.effectiveTo.slice(0, 10), lang) : <span className="adm-muted">{t('admin.policy.openEnded')}</span>}
                      </td>
                      <td data-label={t('admin.policy.colStatus')}>
                        <span className={`adm-status adm-status--${status}`}>{t(STATUS_LABEL[status])}</span>
                      </td>
                      <td data-label={t('admin.policy.colSource')}>
                        {f.source ? <span className="adm-source">{f.source}</span> : <span className="adm-muted">—</span>}
                        {f.referenceUrl && (
                          <>
                            {' '}
                            <a className="adm-reflink" href={f.referenceUrl} target="_blank" rel="noreferrer noopener">
                              {t('admin.policy.reference')}
                              <span aria-hidden="true"> ↗</span>
                            </a>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <AdminPagination {...pager} />
          </div>
        )}
      </section>
    </>
  );
}
