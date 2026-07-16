// ADM-2 — Policy flags admin page (/admin/policy-flags). Sortable data table over the
// LIVE GET /api/policy-flag/get/all, with LIVE Edit + Delete (API-13).
//
// Honest display: Direction is a GLYPH + WORD on a NEUTRAL badge — never colour-only,
// and never red/green (RED is reserved app-wide for the farmer "Not recommended"
// verdict). Status (Active / Scheduled / Expired) is DERIVED client-side from the
// effective window (derivePolicyStatus, tested). An as-of date filter maps to the
// ?asOfDate= query. referenceUrl renders as an external link when present.
//
// MUTATIONS (API-13, Admin-only): PUT /api/policy-flag/update (full-object; wrapped
// under policyFlagUpdateDto) and DELETE /api/policy-flag/delete/{id}. Both return
// { id, trainingDataWarning }: policy flags are as-of-joined into the model's training
// data, so mutating a PAST-dated flag returns a non-null warning. The mutation still
// SUCCEEDED — we surface the warning in a dismissible amber note, NEVER as an error.
// After a mutation we REFETCH (honest re-read of server truth). Server guard messages
// are surfaced verbatim in the flash (house pattern from UsersPage).
//
// EMPTY-RESULT QUIRK: the .NET GetAll handler returns HTTP 400 ("No policy flags
// found.") for an empty list (and for an as-of date with no active flags), NOT 200 [].
// We treat a 400 on this route as the honest EMPTY state, not a hard error.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { PolicyDirection, PolicyType } from '../api/types';
import type { PolicyFlag, PolicyFlagUpdateDto, PolicyStatus } from '../api/types';
import { derivePolicyStatus, formatDate, mapPolicyDirection, mapPolicyType, ymdLocal } from '../lib/format';
import {
  AdminDialog,
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
type Flash = { msg: string; kind: 'ok' | 'error' };

const STATUS_LABEL: Record<PolicyStatus, string> = {
  active: 'admin.policy.status.active',
  scheduled: 'admin.policy.status.scheduled',
  expired: 'admin.policy.status.expired',
};

// Option orders for the edit form. Types 0..8 in enum order; direction Bullish/Neutral/
// Bearish (the -1 is the LAST option so the list reads high→low market impact).
const POLICY_TYPE_OPTIONS: number[] = [
  PolicyType.Subsidy,
  PolicyType.ImportBan,
  PolicyType.ExportBan,
  PolicyType.PriceCeiling,
  PolicyType.PriceFloor,
  PolicyType.FertiliserSubsidy,
  PolicyType.FuelPriceChange,
  PolicyType.Other,
  PolicyType.Budget,
];
const DIRECTION_OPTIONS: number[] = [PolicyDirection.Bullish, PolicyDirection.Neutral, PolicyDirection.Bearish];

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
  const [editing, setEditing] = useState<PolicyFlag | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PolicyFlag | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  // trainingDataWarning banner: a non-null warning off a SUCCESSFUL mutation (never
  // an error). Dismissible; cleared on the next mutation attempt.
  const [warning, setWarning] = useState<string | null>(null);

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

  // Server guard / validation messages (house error shape) arrive on ApiError.message
  // — surface them verbatim so honest constraints reach the admin. Network -> generic.
  const errMessage = useCallback(
    (e: unknown) => (e instanceof ApiError && e.message && e.status !== 0 ? e.message : t('common.errorBody')),
    [t],
  );

  const save = useCallback(
    async (dto: PolicyFlagUpdateDto) => {
      setBusyId(dto.id);
      setFlash(null);
      setWarning(null);
      try {
        const res = await api.updatePolicyFlag(dto);
        setEditing(null);
        setFlash({ msg: t('admin.policy.savedFlash'), kind: 'ok' });
        setWarning(res.trainingDataWarning);
        await load(asOf);
      } catch (e) {
        setEditing(null);
        setFlash({ msg: errMessage(e), kind: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [t, load, asOf, errMessage],
  );

  const doDelete = useCallback(
    async (f: PolicyFlag) => {
      setBusyId(f.id);
      setFlash(null);
      setWarning(null);
      try {
        const res = await api.deletePolicyFlag(f.id);
        setConfirmDelete(null);
        setFlash({ msg: t('admin.policy.deletedFlash', { title: f.title }), kind: 'ok' });
        setWarning(res.trainingDataWarning);
        await load(asOf);
      } catch (e) {
        setConfirmDelete(null);
        setFlash({ msg: errMessage(e), kind: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [t, load, asOf, errMessage],
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

        {flash && (
          <p className={`adm-note${flash.kind === 'error' ? ' adm-note--error' : ''}`} role="status">
            {flash.msg}
          </p>
        )}
        {warning && (
          <div className="adm-warn adm-warn--dismiss" role="status" aria-live="polite">
            <span className="adm-warn__body">
              <span className="adm-warn__title">
                <span aria-hidden="true">⚠️ </span>
                {t('admin.policy.trainingWarningTitle')}
              </span>{' '}
              {t('admin.policy.trainingWarning')}
            </span>
            <button
              type="button"
              className="adm-warn__close"
              onClick={() => setWarning(null)}
              aria-label={t('common.dismiss')}
            >
              ✕
            </button>
          </div>
        )}

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
                  <th scope="col">
                    <span className="sr-only">{t('admin.policy.colActions')}</span>
                  </th>
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
                      <td data-label={t('admin.policy.colActions')}>
                        <button
                          type="button"
                          className="adm-rowbtn"
                          onClick={() => setEditing(f)}
                          disabled={busyId === f.id}
                        >
                          {t('admin.policy.edit')}
                        </button>
                        <button
                          type="button"
                          className="adm-rowbtn adm-rowbtn--danger"
                          onClick={() => setConfirmDelete(f)}
                          disabled={busyId === f.id}
                        >
                          {busyId === f.id ? t('admin.policy.working') : t('admin.policy.delete')}
                        </button>
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

      {editing && (
        <EditFlagDialog
          flag={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {confirmDelete && (
        <AdminDialog title={t('admin.policy.deleteTitle')} onClose={() => setConfirmDelete(null)}>
          <p className="adm-warn" role="note">
            <span aria-hidden="true">⚠️ </span>
            {t('admin.policy.deleteWarning')}
          </p>
          <p>{t('admin.policy.deleteConfirm', { title: confirmDelete.title })}</p>
          <div className="adm-form__actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId === confirmDelete.id}
            >
              {t('admin.policy.cancel')}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--danger"
              onClick={() => void doDelete(confirmDelete)}
              disabled={busyId === confirmDelete.id}
            >
              {busyId === confirmDelete.id ? t('admin.policy.working') : t('admin.policy.delete')}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

interface FormState {
  policyType: number;
  title: string;
  description: string;
  direction: number;
  effectiveFrom: string; // "YYYY-MM-DD"
  effectiveTo: string; // "YYYY-MM-DD" | "" (open-ended)
  source: string;
  referenceUrl: string;
}

function EditFlagDialog({
  flag,
  busy,
  onClose,
  onSave,
}: {
  flag: PolicyFlag;
  busy: boolean;
  onClose: () => void;
  onSave: (dto: PolicyFlagUpdateDto) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({
    policyType: flag.policyType,
    title: flag.title,
    description: flag.description ?? '',
    direction: flag.direction,
    effectiveFrom: flag.effectiveFrom.slice(0, 10),
    effectiveTo: flag.effectiveTo ? flag.effectiveTo.slice(0, 10) : '',
    source: flag.source ?? '',
    referenceUrl: flag.referenceUrl ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setErr(t('admin.policy.errTitle'));
    if (!form.effectiveFrom) return setErr(t('admin.policy.errFrom'));
    if (!form.source.trim()) return setErr(t('admin.policy.errSource'));
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) return setErr(t('admin.policy.errDateOrder'));
    setErr(null);
    onSave({
      id: flag.id,
      policyType: form.policyType,
      title: form.title.trim(),
      description: form.description.trim() || null,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      direction: form.direction,
      source: form.source.trim(),
      referenceUrl: form.referenceUrl.trim() || null,
    });
  };

  return (
    <AdminDialog title={t('admin.policy.editTitle')} onClose={onClose}>
      <form className="adm-form" onSubmit={submit}>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colType')}</span>
          <select
            className="adm-select"
            value={form.policyType}
            onChange={(e) => set('policyType', Number(e.target.value))}
            disabled={busy}
          >
            {POLICY_TYPE_OPTIONS.map((n) => {
              const label = mapPolicyType(n).labelKey;
              return (
                <option key={n} value={n}>
                  {label ? t(label) : `#${n}`}
                </option>
              );
            })}
          </select>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colTitle')}</span>
          <input
            type="text"
            className="adm-input"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colDescription')}</span>
          <textarea
            className="adm-textarea"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colDirection')}</span>
          <select
            className="adm-select"
            value={form.direction}
            onChange={(e) => set('direction', Number(e.target.value))}
            disabled={busy}
          >
            {DIRECTION_OPTIONS.map((n) => {
              const d = mapPolicyDirection(n);
              return (
                <option key={n} value={n}>
                  {d.glyph} {d.labelKey ? t(d.labelKey) : `#${n}`}
                </option>
              );
            })}
          </select>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colFrom')}</span>
          <input
            type="date"
            className="adm-input"
            value={form.effectiveFrom}
            onChange={(e) => set('effectiveFrom', e.target.value)}
            disabled={busy}
            required
          />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colTo')}</span>
          <input
            type="date"
            className="adm-input"
            value={form.effectiveTo}
            onChange={(e) => set('effectiveTo', e.target.value)}
            disabled={busy}
          />
          <span className="adm-caption">{t('admin.policy.openEndedHint')}</span>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colSource')} *</span>
          <input
            type="text"
            className="adm-input"
            value={form.source}
            onChange={(e) => set('source', e.target.value)}
            placeholder={t('admin.policy.sourcePlaceholder')}
            disabled={busy}
          />
          <span className="adm-caption">{t('admin.policy.sourceRequired')}</span>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.policy.colReference')}</span>
          <input
            type="url"
            className="adm-input"
            value={form.referenceUrl}
            onChange={(e) => set('referenceUrl', e.target.value)}
            placeholder={t('admin.policy.referencePlaceholder')}
            disabled={busy}
          />
        </label>
        {err && (
          <p className="adm-error" role="alert">
            {err}
          </p>
        )}
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('admin.policy.cancel')}
          </button>
          <button type="submit" className="adm-btn" disabled={busy}>
            {busy ? t('admin.policy.working') : t('admin.policy.save')}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
