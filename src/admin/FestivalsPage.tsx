// Admin page for the festival calendar (/admin/festivals), grouped by year.
// Festival dates feed model training, so a mutation can return a trainingDataWarning:
// the save SUCCEEDED, so show it as a note, never as an error.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { FestivalEntry } from '../api/types';
import { formatDate } from '../lib/format';
import {
  AdminDialog,
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminTopbar,
  DemoNote,
  TrainingWarningBanner,
} from './adminShared';
import { IconEdit, IconTrash } from '../components/icons';

const FESTIVAL_KEYS = ['AVURUDU', 'THAI_PONGAL', 'VESAK', 'DEEPAVALI', 'CHRISTMAS'] as const;
const DEFAULT_LEAD_UP = 14;
const MAX_LEAD_UP = 90; // server sanity cap; 0 is allowed (paired-day convention)

type Flash = { msg: string; kind: 'ok' | 'error' };

interface FormState {
  festivalKey: string;
  date: string;
  leadUpDays: string;
  isProvisional: boolean;
  source: string;
}

const emptyForm = (): FormState => ({
  festivalKey: 'AVURUDU',
  date: '',
  leadUpDays: String(DEFAULT_LEAD_UP),
  isProvisional: false,
  source: '',
});

// Blank means "use the default"; otherwise the typed number is used verbatim.
// Not `Number(s) || DEFAULT` — that would turn a valid leadUpDays of 0 into the default.
const parseLeadUp = (s: string): number => (s.trim() === '' ? DEFAULT_LEAD_UP : Number(s));

export default function FestivalsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [items, setItems] = useState<FestivalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<FestivalEntry | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FestivalEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  // Warning returned by a SUCCESSFUL mutation, not an error. Dismissible.
  const [warning, setWarning] = useState<string | null>(null);

  // Year filter defaults to the current year, with an "all years" option.
  const currentYear = useMemo(() => String(new Date().getFullYear()), []);
  const [yearFilter, setYearFilter] = useState<string>(currentYear);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await api.getFestivals());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Server validation messages arrive on ApiError.message — show them verbatim.
  const errMessage = useCallback(
    (e: unknown) => (e instanceof ApiError && e.message && e.status !== 0 ? e.message : t('common.errorBody')),
    [t],
  );

  const festivalLabel = useCallback(
    (f: FestivalEntry) => t(`admin.festivals.key.${f.festivalKey}`, f.festivalKey),
    [t],
  );

  // group by occurrence year, newest year first, sorted by date within year
  const byYear = useMemo(() => {
    const groups = new Map<string, FestivalEntry[]>();
    for (const f of items) {
      const y = f.date.slice(0, 4);
      (groups.get(y) ?? groups.set(y, []).get(y)!).push(f);
    }
    return [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, rows]) => [year, rows.sort((a, b) => a.date.localeCompare(b.date))] as const);
  }, [items]);

  // Dropdown years: every year in the data plus the current year, newest first.
  const years = useMemo(() => {
    const set = new Set<string>(byYear.map(([y]) => y));
    set.add(currentYear);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [byYear, currentYear]);

  // The year groups actually rendered: all, or just the selected year.
  const visibleYears = useMemo(
    () => (yearFilter === 'all' ? byYear : byYear.filter(([y]) => y === yearFilter)),
    [byYear, yearFilter],
  );

  // Create (no id) or update (id); both refetch afterwards.
  const save = useCallback(
    async (form: FormState, id: string | null) => {
      setBusyId(id ?? 'new');
      setFlash(null);
      setWarning(null);
      const dto = {
        festivalKey: form.festivalKey,
        date: form.date,
        leadUpDays: parseLeadUp(form.leadUpDays),
        isProvisional: form.isProvisional,
        source: form.source.trim(),
      };
      try {
        if (id) {
          const res = await api.updateFestival({ id, ...dto });
          setWarning(res.trainingDataWarning);
        } else {
          await api.createFestival(dto);
        }
        setEditing(null);
        setFlash({ msg: t(id ? 'admin.festivals.savedFlash' : 'admin.festivals.addedFlash'), kind: 'ok' });
        await load();
      } catch (e) {
        setEditing(null);
        setFlash({ msg: errMessage(e), kind: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [t, load, errMessage],
  );

  const doDelete = useCallback(
    async (f: FestivalEntry) => {
      setBusyId(f.id);
      setFlash(null);
      setWarning(null);
      try {
        const res = await api.deleteFestival(f.id);
        setConfirmDelete(null);
        setFlash({
          msg: t('admin.festivals.deletedFlash', {
            festival: festivalLabel(f),
            date: formatDate(f.date.slice(0, 10), lang),
          }),
          kind: 'ok',
        });
        setWarning(res.trainingDataWarning);
        await load();
      } catch (e) {
        setConfirmDelete(null);
        setFlash({ msg: errMessage(e), kind: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [t, load, lang, errMessage, festivalLabel],
  );

  return (
    <>
      <AdminTopbar title={t('admin.festivals.title')} subtitle={t('admin.festivals.subtitle')} />
      <section className="panel adm" aria-label={t('admin.festivals.title')}>
        <DemoNote />

        {flash && (
          <p className={`adm-note${flash.kind === 'error' ? ' adm-note--error' : ''}`} role="status">
            {flash.msg}
          </p>
        )}
        {warning && (
          <TrainingWarningBanner
            title={t('admin.festivals.trainingWarningTitle')}
            body={t('admin.festivals.trainingWarning')}
            onDismiss={() => setWarning(null)}
          />
        )}

        <p className="adm-warn" role="note">
          <span aria-hidden="true">⚠️ </span>
          {t('admin.festivals.modelWarning')}
        </p>

        <div className="adm-toolbar">
          <label className="adm-field ing-filter">
            <span className="wrap-label">{t('admin.festivals.filterLabel')}</span>
            <select
              className="adm-select"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="all">{t('admin.festivals.filterAll')}</option>
            </select>
          </label>
          <button type="button" className="adm-btn" onClick={() => setEditing('new')}>
            + {t('admin.festivals.add')}
          </button>
        </div>

        {error ? (
          <AdminError onRetry={() => void load()} />
        ) : loading ? (
          <AdminLoading />
        ) : items.length === 0 ? (
          <AdminEmpty title={t('admin.festivals.emptyTitle')} body={t('admin.festivals.emptyBody')} />
        ) : visibleYears.length === 0 ? (
          <AdminEmpty
            title={t('admin.festivals.emptyYearTitle', { year: yearFilter })}
            body={t('admin.festivals.emptyYearBody', { year: yearFilter })}
          />
        ) : (
          visibleYears.map(([year, rows]) => (
            <div key={year}>
              <h2 className="adm-yeargroup">{year}</h2>
              <div className="adm-tablewrap">
                <table className="adm-table">
                  <caption className="sr-only">{t('admin.festivals.yearCaption', { year })}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('admin.festivals.colFestival')}</th>
                      <th scope="col">{t('admin.festivals.colDate')}</th>
                      <th scope="col" className="adm-th--num">{t('admin.festivals.colLeadUp')}</th>
                      <th scope="col">{t('admin.festivals.colStatus')}</th>
                      <th scope="col">{t('admin.festivals.colSource')}</th>
                      <th scope="col">
                        <span className="sr-only">{t('admin.festivals.colActions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}>
                        <th scope="row" className="adm-c-title" data-label={t('admin.festivals.colFestival')}>
                          <span className="adm-title">{festivalLabel(f)}</span>
                        </th>
                        <td data-label={t('admin.festivals.colDate')}>{formatDate(f.date.slice(0, 10), lang)}</td>
                        <td className="adm-td--num" data-label={t('admin.festivals.colLeadUp')}>
                          {t('admin.festivals.days', { count: f.leadUpDays })}
                        </td>
                        <td data-label={t('admin.festivals.colStatus')}>
                          {f.isProvisional ? (
                            <span className="adm-status adm-provisional">{t('admin.festivals.provisional')}</span>
                          ) : (
                            <span className="adm-status adm-status--active">{t('admin.festivals.confirmed')}</span>
                          )}
                        </td>
                        <td data-label={t('admin.festivals.colSource')}>
                          {f.source ?? <span className="adm-muted">—</span>}
                        </td>
                        <td data-label={t('admin.festivals.colActions')}>
                          <div className="adm-actions">
                            <button
                              type="button"
                              className="adm-rowbtn"
                              onClick={() => setEditing(f)}
                              disabled={busyId === f.id}
                            >
                              <IconEdit />
                              {t('admin.festivals.edit')}
                            </button>
                            <button
                              type="button"
                              className="adm-rowbtn adm-rowbtn--danger"
                              onClick={() => setConfirmDelete(f)}
                              disabled={busyId === f.id}
                            >
                              <IconTrash />
                              {busyId === f.id ? t('admin.festivals.working') : t('admin.festivals.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>

      {editing && (
        <FestivalDialog
          entry={editing === 'new' ? null : editing}
          busy={busyId === (editing === 'new' ? 'new' : editing.id)}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {confirmDelete && (
        <AdminDialog title={t('admin.festivals.deleteTitle')} onClose={() => setConfirmDelete(null)}>
          <p className="adm-warn" role="note">
            <span aria-hidden="true">⚠️ </span>
            {t('admin.festivals.deleteWarning')}
          </p>
          <p>{t('admin.festivals.deleteConfirm', { festival: festivalLabel(confirmDelete), date: formatDate(confirmDelete.date.slice(0, 10), lang) })}</p>
          <div className="adm-form__actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId === confirmDelete.id}
            >
              {t('admin.festivals.cancel')}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--danger"
              onClick={() => void doDelete(confirmDelete)}
              disabled={busyId === confirmDelete.id}
            >
              {busyId === confirmDelete.id ? t('admin.festivals.working') : t('admin.festivals.delete')}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

function FestivalDialog({
  entry,
  busy,
  onClose,
  onSave,
}: {
  entry: FestivalEntry | null;
  busy: boolean;
  onClose: () => void;
  onSave: (form: FormState, id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(
    entry
      ? {
          festivalKey: entry.festivalKey,
          date: entry.date.slice(0, 10), // live sends "YYYY-MM-DDT00:00:00" — date input needs YYYY-MM-DD
          leadUpDays: String(entry.leadUpDays),
          isProvisional: entry.isProvisional,
          source: entry.source ?? '',
        }
      : emptyForm(),
  );
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) return setErr(t('admin.festivals.errDate'));
    if (!form.source.trim()) return setErr(t('admin.festivals.errSource'));
    // leadUpDays mirrors the server rule: whole number 0..90 (0 is valid).
    const lead = parseLeadUp(form.leadUpDays);
    if (!Number.isInteger(lead) || lead < 0 || lead > MAX_LEAD_UP) return setErr(t('admin.festivals.errLeadUp'));
    setErr(null);
    onSave(form, entry?.id ?? null);
  };

  return (
    <AdminDialog
      title={entry ? t('admin.festivals.editTitle') : t('admin.festivals.addTitle')}
      onClose={onClose}
    >
      <form className="adm-form" onSubmit={submit}>
        <p className="adm-warn" role="note">
          <span aria-hidden="true">⚠️ </span>
          {t('admin.festivals.modelWarning')}
        </p>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.festivals.colFestival')}</span>
          <select className="adm-select" value={form.festivalKey} onChange={(e) => setForm((f) => ({ ...f, festivalKey: e.target.value }))} disabled={busy}>
            {FESTIVAL_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`admin.festivals.key.${k}`, k)}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.festivals.colDate')}</span>
          <input type="date" className="adm-input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={busy} required />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.festivals.colLeadUp')}</span>
          <input type="number" min={0} max={MAX_LEAD_UP} className="adm-input" value={form.leadUpDays} onChange={(e) => setForm((f) => ({ ...f, leadUpDays: e.target.value }))} disabled={busy} />
          <span className="adm-caption">{t('admin.festivals.leadUpHint')}</span>
        </label>
        <label className="adm-field adm-field--check">
          <input type="checkbox" checked={form.isProvisional} onChange={(e) => setForm((f) => ({ ...f, isProvisional: e.target.checked }))} disabled={busy} />
          <span>{t('admin.festivals.isProvisional')}</span>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.festivals.colSource')} *</span>
          <input type="text" className="adm-input" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder={t('admin.festivals.sourcePlaceholder')} disabled={busy} />
        </label>
        {err && <p className="adm-error" role="alert">{err}</p>}
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('admin.festivals.cancel')}
          </button>
          <button type="submit" className="adm-btn" disabled={busy}>
            {busy ? t('admin.festivals.working') : t('admin.festivals.save')}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
