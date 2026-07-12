// ADM-5 — Festival calendar with DEMO CRUD (/admin/festivals). List grouped by year
// (movable festivals repeat per year = one row per occurrence). Add/edit/delete mutate
// in-memory fixture state (PROVISIONAL shape; no live endpoint yet). A visible WARNING
// states this table feeds the forecasting model; Source is REQUIRED on save and an
// isProvisional badge flags unconfirmed dates. Honest "demo data" note in fixtures mode.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { FestivalEntry } from '../api/types';
import { formatDate } from '../lib/format';
import {
  AdminDialog,
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminTopbar,
  DemoNote,
} from './adminShared';

const FESTIVAL_KEYS = ['AVURUDU', 'THAI_PONGAL', 'VESAK', 'DEEPAVALI', 'CHRISTMAS'] as const;
const DEFAULT_LEAD_UP = 14;

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

export default function FestivalsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [items, setItems] = useState<FestivalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<FestivalEntry | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FestivalEntry | null>(null);

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

  const upsert = (form: FormState, id: string | null) => {
    if (id) {
      setItems((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, festivalKey: form.festivalKey, date: form.date, leadUpDays: Number(form.leadUpDays) || DEFAULT_LEAD_UP, isProvisional: form.isProvisional, source: form.source.trim() }
            : f,
        ),
      );
    } else {
      const entry: FestivalEntry = {
        id: `f-new-${Date.now()}`,
        festivalKey: form.festivalKey,
        date: form.date,
        leadUpDays: Number(form.leadUpDays) || DEFAULT_LEAD_UP,
        isProvisional: form.isProvisional,
        source: form.source.trim(),
        createdAtUtc: new Date().toISOString(),
      };
      setItems((prev) => [...prev, entry]);
    }
    setEditing(null);
  };

  const doDelete = (f: FestivalEntry) => {
    setItems((prev) => prev.filter((x) => x.id !== f.id));
    setConfirmDelete(null);
  };

  return (
    <>
      <AdminTopbar title={t('admin.festivals.title')} subtitle={t('admin.festivals.subtitle')} />
      <section className="panel adm" aria-label={t('admin.festivals.title')}>
        <DemoNote hasLiveEndpoint={false} />
        <p className="adm-warn" role="note">
          <span aria-hidden="true">⚠️ </span>
          {t('admin.festivals.modelWarning')}
        </p>

        <div className="adm-toolbar">
          <span />
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
        ) : (
          byYear.map(([year, rows]) => (
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
                          <span className="adm-title">{t(`admin.festivals.key.${f.festivalKey}`, f.festivalKey)}</span>
                        </th>
                        <td data-label={t('admin.festivals.colDate')}>{formatDate(f.date, lang)}</td>
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
                          <button type="button" className="adm-rowbtn" onClick={() => setEditing(f)}>
                            {t('admin.festivals.edit')}
                          </button>
                          <button type="button" className="adm-rowbtn adm-rowbtn--danger" onClick={() => setConfirmDelete(f)}>
                            {t('admin.festivals.delete')}
                          </button>
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
          onClose={() => setEditing(null)}
          onSave={upsert}
        />
      )}
      {confirmDelete && (
        <AdminDialog title={t('admin.festivals.deleteTitle')} onClose={() => setConfirmDelete(null)}>
          <p className="adm-warn" role="note">
            <span aria-hidden="true">⚠️ </span>
            {t('admin.festivals.deleteWarning')}
          </p>
          <p>{t('admin.festivals.deleteConfirm', { festival: t(`admin.festivals.key.${confirmDelete.festivalKey}`, confirmDelete.festivalKey), date: formatDate(confirmDelete.date, lang) })}</p>
          <div className="adm-form__actions">
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              {t('admin.festivals.cancel')}
            </button>
            <button type="button" className="adm-btn adm-btn--danger" onClick={() => doDelete(confirmDelete)}>
              {t('admin.festivals.delete')}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

function FestivalDialog({
  entry,
  onClose,
  onSave,
}: {
  entry: FestivalEntry | null;
  onClose: () => void;
  onSave: (form: FormState, id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(
    entry
      ? {
          festivalKey: entry.festivalKey,
          date: entry.date,
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
          <select className="adm-select" value={form.festivalKey} onChange={(e) => setForm((f) => ({ ...f, festivalKey: e.target.value }))}>
            {FESTIVAL_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`admin.festivals.key.${k}`, k)}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.festivals.colDate')}</span>
          <input type="date" className="adm-input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.festivals.colLeadUp')}</span>
          <input type="number" min={0} max={120} className="adm-input" value={form.leadUpDays} onChange={(e) => setForm((f) => ({ ...f, leadUpDays: e.target.value }))} />
        </label>
        <label className="adm-field adm-field--check">
          <input type="checkbox" checked={form.isProvisional} onChange={(e) => setForm((f) => ({ ...f, isProvisional: e.target.checked }))} />
          <span>{t('admin.festivals.isProvisional')}</span>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.festivals.colSource')} *</span>
          <input type="text" className="adm-input" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder={t('admin.festivals.sourcePlaceholder')} />
        </label>
        {err && <p className="adm-error" role="alert">{err}</p>}
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('admin.festivals.cancel')}
          </button>
          <button type="submit" className="adm-btn">
            {t('admin.festivals.save')}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
