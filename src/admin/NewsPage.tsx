// ADM-7 — Structured news-events capture + view (/admin/news) over the LIVE News CRUD
// (API-12). Owner decision: capture STRUCTURED events (honest facts + publish date), NOT
// manual point weights — the model LEARNS the weights later. Capture list + Create/Edit/Delete.
//
// CAPTURE-ONLY: unlike Festivals/PolicyFlags these are NOT yet ML feature inputs, so there is
// deliberately NO training-data warning here. Mutation returns are BARE (create -> boolean,
// update/delete -> the affected Guid). After any mutation we REFETCH server truth. Server guard /
// validation messages (house error shape) are surfaced verbatim in the flash.
//
// publishedAt is the IMMUTABLE knowledge/vintage date: editable on create, READ-ONLY on edit
// (the update contract does not carry it). direction is a GLYPH + WORD on a neutral badge (never
// colour-only; RED stays reserved for the farmer "Not recommended" verdict).
//
// WIRE NOTE: `publishedAt` may arrive as "YYYY-MM-DDT00:00:00" — slice(0,10) before formatDate()
// (formatDate re-appends T00:00:00). affectedMarketIds has NO picker (storage-ahead-of-UI) — it
// is preserved verbatim on edit and omitted on create.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Crop, NewsEvent } from '../api/types';
import { PolicyDirection, PolicyType } from '../api/types';
import { cropDisplayName } from '../lib/crops';
import { formatDate, mapPolicyDirection, mapPolicyType } from '../lib/format';
import {
  AdminDialog,
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminTopbar,
  DemoNote,
  EnumBadge,
} from './adminShared';

const EVENT_TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // NewsEventType range (mirrors PolicyType labels)
const DIRECTIONS = [PolicyDirection.Bullish, PolicyDirection.Neutral, PolicyDirection.Bearish];

type Flash = { msg: string; kind: 'ok' | 'error' };

interface FormState {
  eventType: number;
  direction: number;
  title: string;
  description: string;
  publishedAt: string;
  sourceUrl: string;
  affectedCropIds: string[];
}

const emptyForm = (): FormState => ({
  eventType: PolicyType.Other,
  direction: PolicyDirection.Neutral,
  title: '',
  description: '',
  publishedAt: '',
  sourceUrl: '',
  affectedCropIds: [],
});

export default function NewsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<NewsEvent | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NewsEvent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [ev, cs] = await Promise.all([api.getNewsEvents(), api.getCrops()]);
      setEvents(ev);
      setCrops(cs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Server guard / validation messages (house error shape) arrive on ApiError.message —
  // surface them verbatim so honest constraints reach the admin. Network -> generic.
  const errMessage = useCallback(
    (e: unknown) => (e instanceof ApiError && e.message && e.status !== 0 ? e.message : t('common.errorBody')),
    [t],
  );

  const cropName = useCallback(
    (id: string) => {
      const c = crops.find((x) => x.id === id);
      return c ? cropDisplayName(c, lang) : id;
    },
    [crops, lang],
  );

  // Server already returns newest publishedAt first; we keep a defensive client sort so demo
  // adds (fixtures) also land in order. slice(0,10) is safe on both wire shapes.
  const sorted = useMemo(
    () => [...events].sort((a, b) => b.publishedAt.slice(0, 10).localeCompare(a.publishedAt.slice(0, 10))),
    [events],
  );

  // Create (no entry) or full-object update (entry). Update OMITS publishedAt (immutable) and
  // preserves the stored affectedMarketIds verbatim (no market picker). Both refetch server truth.
  const save = useCallback(
    async (form: FormState, entry: NewsEvent | null) => {
      setBusyId(entry?.id ?? 'new');
      setFlash(null);
      const shared = {
        eventType: form.eventType,
        direction: form.direction,
        title: form.title.trim(),
        description: form.description.trim() || null,
        sourceUrl: form.sourceUrl.trim() || null,
        affectedCropIds: form.affectedCropIds,
      };
      try {
        if (entry) {
          await api.updateNewsEvent({ id: entry.id, ...shared, affectedMarketIds: entry.affectedMarketIds });
        } else {
          await api.createNewsEvent({ ...shared, publishedAt: form.publishedAt });
        }
        setEditing(null);
        setFlash({ msg: t(entry ? 'admin.news.savedFlash' : 'admin.news.addedFlash'), kind: 'ok' });
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
    async (ev: NewsEvent) => {
      setBusyId(ev.id);
      setFlash(null);
      try {
        await api.deleteNewsEvent(ev.id);
        setConfirmDelete(null);
        setFlash({ msg: t('admin.news.deletedFlash', { title: ev.title }), kind: 'ok' });
        await load();
      } catch (e) {
        setConfirmDelete(null);
        setFlash({ msg: errMessage(e), kind: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [t, load, errMessage],
  );

  return (
    <>
      <AdminTopbar title={t('admin.news.title')} subtitle={t('admin.news.subtitle')} />
      <section className="panel adm" aria-label={t('admin.news.title')}>
        <DemoNote />
        <p className="adm-note" role="note">
          <span aria-hidden="true">💡 </span>
          {t('admin.news.explainer')}
        </p>

        {flash && (
          <p className={`adm-note${flash.kind === 'error' ? ' adm-note--error' : ''}`} role="status">
            {flash.msg}
          </p>
        )}

        <div className="adm-toolbar">
          <span />
          <button type="button" className="adm-btn" onClick={() => setEditing('new')}>
            + {t('admin.news.add')}
          </button>
        </div>

        {error ? (
          <AdminError onRetry={() => void load()} />
        ) : loading ? (
          <AdminLoading />
        ) : sorted.length === 0 ? (
          <AdminEmpty title={t('admin.news.emptyTitle')} body={t('admin.news.emptyBody')} />
        ) : (
          <ol className="adm-newslist">
            {sorted.map((ev) => {
              const type = mapPolicyType(ev.eventType);
              const dir = mapPolicyDirection(ev.direction);
              return (
                <li key={ev.id} className="adm-newsitem">
                  <div className="adm-newsitem__head">
                    <EnumBadge labelKey={type.labelKey} fallback={type.fallback} />
                    <EnumBadge labelKey={dir.labelKey} fallback={dir.fallback} glyph={dir.glyph} className={`adm-badge--dir${dir.tone ? ` is-${dir.tone}` : ''}`} />
                    <span className="adm-newsitem__date">{formatDate(ev.publishedAt.slice(0, 10), lang)}</span>
                  </div>
                  <p className="adm-title">{ev.title}</p>
                  {ev.description && <p className="adm-desc">{ev.description}</p>}
                  {ev.affectedCropIds.length > 0 && (
                    <p className="adm-newsitem__crops">
                      <span className="adm-muted">{t('admin.news.affects')} </span>
                      {ev.affectedCropIds.map((id) => cropName(id)).join(', ')}
                    </p>
                  )}
                  <div className="adm-newsitem__foot">
                    {ev.sourceUrl && (
                      <a className="adm-reflink" href={ev.sourceUrl} target="_blank" rel="noreferrer noopener">
                        {t('admin.news.source')}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    )}
                    <span className="adm-newsitem__actions">
                      <button
                        type="button"
                        className="adm-rowbtn"
                        onClick={() => setEditing(ev)}
                        disabled={busyId === ev.id}
                      >
                        {t('admin.news.edit')}
                      </button>
                      <button
                        type="button"
                        className="adm-rowbtn adm-rowbtn--danger"
                        onClick={() => setConfirmDelete(ev)}
                        disabled={busyId === ev.id}
                      >
                        {busyId === ev.id ? t('admin.news.working') : t('admin.news.delete')}
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {editing && (
        <NewsDialog
          entry={editing === 'new' ? null : editing}
          crops={crops}
          lang={lang}
          busy={busyId === (editing === 'new' ? 'new' : editing.id)}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {confirmDelete && (
        <AdminDialog title={t('admin.news.deleteTitle')} onClose={() => setConfirmDelete(null)}>
          <p>{t('admin.news.deleteConfirm', { title: confirmDelete.title })}</p>
          <div className="adm-form__actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId === confirmDelete.id}
            >
              {t('admin.news.cancel')}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--danger"
              onClick={() => void doDelete(confirmDelete)}
              disabled={busyId === confirmDelete.id}
            >
              {busyId === confirmDelete.id ? t('admin.news.working') : t('admin.news.delete')}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

function NewsDialog({
  entry,
  crops,
  lang,
  busy,
  onClose,
  onSave,
}: {
  entry: NewsEvent | null;
  crops: Crop[];
  lang: string;
  busy: boolean;
  onClose: () => void;
  onSave: (form: FormState, entry: NewsEvent | null) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(
    entry
      ? {
          eventType: entry.eventType,
          direction: entry.direction,
          title: entry.title,
          description: entry.description ?? '',
          publishedAt: entry.publishedAt.slice(0, 10), // read-only in edit; kept for display
          sourceUrl: entry.sourceUrl ?? '',
          affectedCropIds: entry.affectedCropIds,
        }
      : emptyForm(),
  );
  const [err, setErr] = useState<string | null>(null);

  const toggleCrop = (id: string) =>
    setForm((f) => ({
      ...f,
      affectedCropIds: f.affectedCropIds.includes(id)
        ? f.affectedCropIds.filter((x) => x !== id)
        : [...f.affectedCropIds, id],
    }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setErr(t('admin.news.errTitle'));
    if (!entry && !form.publishedAt) return setErr(t('admin.news.errDate')); // required on create only
    setErr(null);
    onSave(form, entry);
  };

  return (
    <AdminDialog title={entry ? t('admin.news.editTitle') : t('admin.news.addTitle')} onClose={onClose}>
      <form className="adm-form" onSubmit={submit}>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colType')}</span>
          <select className="adm-select" value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: Number(e.target.value) }))} disabled={busy}>
            {EVENT_TYPES.map((n) => {
              const m = mapPolicyType(n);
              return (
                <option key={n} value={n}>
                  {m.labelKey ? t(m.labelKey) : m.fallback}
                </option>
              );
            })}
          </select>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colDirection')}</span>
          <select className="adm-select" value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: Number(e.target.value) }))} disabled={busy}>
            {DIRECTIONS.map((n) => {
              const m = mapPolicyDirection(n);
              return (
                <option key={n} value={n}>
                  {m.glyph} {m.labelKey ? t(m.labelKey) : m.fallback}
                </option>
              );
            })}
          </select>
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colTitle')} *</span>
          <input type="text" className="adm-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={300} disabled={busy} />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colDescription')}</span>
          <textarea className="adm-textarea" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={4000} disabled={busy} />
        </label>
        {entry ? (
          // publishedAt is the immutable knowledge/vintage date — READ-ONLY on edit (the update
          // contract does not carry it). Shown for context with a short note.
          <div className="adm-field">
            <span className="wrap-label">{t('admin.news.colPublished')}</span>
            <p className="adm-readonly">{formatDate(form.publishedAt, lang)}</p>
            <span className="adm-caption">{t('admin.news.publishedReadonly')}</span>
          </div>
        ) : (
          <label className="adm-field">
            <span className="wrap-label">{t('admin.news.colPublished')} *</span>
            <input type="date" className="adm-input" value={form.publishedAt} onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))} disabled={busy} />
          </label>
        )}
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colSourceUrl')}</span>
          <input type="url" className="adm-input" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://" disabled={busy} />
        </label>
        <div className="adm-field">
          <span className="wrap-label">{t('admin.news.affectedCrops')}</span>
          <div className="adm-chips" role="group" aria-label={t('admin.news.affectedCrops')}>
            {crops.map((c) => {
              const on = form.affectedCropIds.includes(c.id);
              return (
                <button key={c.id} type="button" className={`adm-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleCrop(c.id)} disabled={busy}>
                  {cropDisplayName(c, lang)}
                </button>
              );
            })}
          </div>
        </div>
        {err && <p className="adm-error" role="alert">{err}</p>}
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('admin.news.cancel')}
          </button>
          <button type="submit" className="adm-btn" disabled={busy}>
            {busy ? t('admin.news.working') : t('admin.news.save')}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
