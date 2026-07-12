// ADM-7 — Structured news-events capture + view (/admin/news). Owner decision: capture
// STRUCTURED events (honest facts + publish date), NOT manual point weights — the model
// LEARNS the weights later. Capture form + chronological list; direction is a GLYPH +
// WORD on a neutral badge (never colour-only; RED stays reserved for the farmer "Not
// recommended" verdict). Demo CRUD mutates in-memory fixture state (PROVISIONAL shape).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
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

const EVENT_TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // PolicyType range (reused labels)
const DIRECTIONS = [PolicyDirection.Bullish, PolicyDirection.Neutral, PolicyDirection.Bearish];

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
  const [adding, setAdding] = useState(false);

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

  const cropName = useCallback(
    (id: string) => {
      const c = crops.find((x) => x.id === id);
      return c ? cropDisplayName(c, lang) : id;
    },
    [crops, lang],
  );

  const sorted = useMemo(
    () => [...events].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [events],
  );

  const addEvent = (form: FormState) => {
    const ev: NewsEvent = {
      id: `e-new-${Date.now()}`,
      eventType: form.eventType,
      direction: form.direction,
      title: form.title.trim(),
      description: form.description.trim() || null,
      publishedAt: form.publishedAt,
      sourceUrl: form.sourceUrl.trim() || null,
      affectedCropIds: form.affectedCropIds,
      createdAtUtc: new Date().toISOString(),
    };
    setEvents((prev) => [ev, ...prev]);
    setAdding(false);
  };

  return (
    <>
      <AdminTopbar title={t('admin.news.title')} subtitle={t('admin.news.subtitle')} />
      <section className="panel adm" aria-label={t('admin.news.title')}>
        <DemoNote hasLiveEndpoint={false} />
        <p className="adm-note" role="note">
          <span aria-hidden="true">💡 </span>
          {t('admin.news.explainer')}
        </p>

        <div className="adm-toolbar">
          <span />
          <button type="button" className="adm-btn" onClick={() => setAdding(true)}>
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
                    <span className="adm-newsitem__date">{formatDate(ev.publishedAt, lang)}</span>
                  </div>
                  <p className="adm-title">{ev.title}</p>
                  {ev.description && <p className="adm-desc">{ev.description}</p>}
                  {ev.affectedCropIds.length > 0 && (
                    <p className="adm-newsitem__crops">
                      <span className="adm-muted">{t('admin.news.affects')} </span>
                      {ev.affectedCropIds.map((id) => cropName(id)).join(', ')}
                    </p>
                  )}
                  {ev.sourceUrl && (
                    <a className="adm-reflink" href={ev.sourceUrl} target="_blank" rel="noreferrer noopener">
                      {t('admin.news.source')}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {adding && (
        <NewsDialog crops={crops} lang={lang} onClose={() => setAdding(false)} onSave={addEvent} />
      )}
    </>
  );
}

function NewsDialog({
  crops,
  lang,
  onClose,
  onSave,
}: {
  crops: Crop[];
  lang: string;
  onClose: () => void;
  onSave: (form: FormState) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(emptyForm());
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
    if (!form.publishedAt) return setErr(t('admin.news.errDate'));
    onSave(form);
  };

  return (
    <AdminDialog title={t('admin.news.addTitle')} onClose={onClose}>
      <form className="adm-form" onSubmit={submit}>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colType')}</span>
          <select className="adm-select" value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: Number(e.target.value) }))}>
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
          <select className="adm-select" value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: Number(e.target.value) }))}>
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
          <input type="text" className="adm-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colDescription')}</span>
          <textarea className="adm-textarea" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colPublished')} *</span>
          <input type="date" className="adm-input" value={form.publishedAt} onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))} />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.news.colSourceUrl')}</span>
          <input type="url" className="adm-input" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://" />
        </label>
        <div className="adm-field">
          <span className="wrap-label">{t('admin.news.affectedCrops')}</span>
          <div className="adm-chips" role="group" aria-label={t('admin.news.affectedCrops')}>
            {crops.map((c) => {
              const on = form.affectedCropIds.includes(c.id);
              return (
                <button key={c.id} type="button" className={`adm-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleCrop(c.id)}>
                  {cropDisplayName(c, lang)}
                </button>
              );
            })}
          </div>
        </div>
        {err && <p className="adm-error" role="alert">{err}</p>}
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('admin.news.cancel')}
          </button>
          <button type="submit" className="adm-btn">
            {t('admin.news.save')}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
