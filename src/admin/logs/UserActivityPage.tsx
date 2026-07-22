// LOGS Phase 2 — User activity (/admin/logs/user-activity). READ-ONLY admin audit trail
// of auth + account events. A SERVER-PAGED table (desktop) / stacked cards (<600px) with
// a type filter, mirroring the ingestion tab's four async states (loading skeleton /
// error + retry / empty / data) and its source-filter idiom.
//
// HONEST DISPLAY: each event is a LABELLED badge (never colour-only — a loginFailed is
// amber, a registration green, the rest neutral, always with the text label). A
// loginFailed carries usernameAttempted, shown QUOTED and marked as an UNVERIFIED
// attempt so it is never mistaken for a real, authenticated identity. GUIDs are rendered
// truncated (first 8 chars + …) with the full value in a title attribute. The type filter
// only ever sends one of the five FROZEN wire strings (or omits it) — the server 400s any
// other value, so free text can never reach it.
//
// AUTH: the route sits behind an Admin JWT; a 401/403 flows through the existing global
// client interceptor, so there is ZERO new auth code here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import {
  USER_ACTIVITY_EVENT_TYPES,
  type UserActivityEvent,
  type UserActivityPage as UserActivityPageDto,
} from '../../api/types';
import { formatDateTime, mapUserActivityEvent, truncateId } from '../../lib/format';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  DemoNote,
  useServerPagination,
} from '../adminShared';

const EVENTS_PAGE_SIZE = 25;

export default function UserActivityPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [data, setData] = useState<UserActivityPageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [type, setType] = useState(''); // '' = all; otherwise one frozen wire string
  const pager = useServerPagination(data?.total ?? 0, EVENTS_PAGE_SIZE);
  const { page, perPage, totalPages, setPage, setPerPage } = pager;
  const req = useRef(0); // stale-response guard for overlapping page/filter loads

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    setError(false);
    try {
      const res = await api.getUserActivity(page, perPage, type || undefined);
      if (id !== req.current) return; // a newer load superseded this one
      setData(res);
    } catch {
      if (id !== req.current) return;
      setError(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [page, perPage, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];

  return (
    <section className="panel adm" aria-label={t('admin.logs.userActivity.title')}>
      <DemoNote />
      <p className="adm-note" role="note">
        <span aria-hidden="true">💡 </span>
        {t('admin.logs.userActivity.explainer')}
      </p>

      <div className="adm-toolbar">
        <label className="adm-field ing-filter">
          <span className="wrap-label">{t('admin.logs.userActivity.filterType')}</span>
          <select
            className="adm-select"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1); // a new filter invalidates the page cursor
            }}
          >
            <option value="">{t('admin.logs.userActivity.filterAll')}</option>
            {USER_ACTIVITY_EVENT_TYPES.map((ev) => (
              <option key={ev} value={ev}>
                {t(`admin.logs.userActivity.event.${ev}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && !data ? (
        <AdminError onRetry={() => void load()} />
      ) : loading && !data ? (
        <AdminLoading />
      ) : data && items.length === 0 ? (
        <AdminEmpty
          title={t('admin.logs.userActivity.emptyTitle')}
          body={t('admin.logs.userActivity.emptyBody')}
        />
      ) : data ? (
        <>
          {error && (
            <p className="adm-note adm-note--error" role="alert">
              {t('common.errorBody')}
            </p>
          )}
          <div className="adm-tablewrap">
            <table className="ing-table">
              <caption className="sr-only">{t('admin.logs.userActivity.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.logs.userActivity.colWhen')}</th>
                  <th scope="col">{t('admin.logs.userActivity.colEvent')}</th>
                  <th scope="col">{t('admin.logs.userActivity.colActor')}</th>
                  <th scope="col">{t('admin.logs.userActivity.colTarget')}</th>
                  <th scope="col">{t('admin.logs.userActivity.colDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ev, i) => (
                  <ActivityRow key={`${ev.occurredUtc}-${i}`} event={ev} lang={lang} />
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            perPage={perPage}
            total={data.total}
            setPage={setPage}
            setPerPage={setPerPage}
          />
        </>
      ) : null}
    </section>
  );
}

function ActivityRow({ event, lang }: { event: UserActivityEvent; lang: string }) {
  const { t } = useTranslation();
  const ev = mapUserActivityEvent(event.eventType);
  const na = t('admin.logs.userActivity.notApplicable');

  return (
    <tr className="ing-row">
      <td data-label={t('admin.logs.userActivity.colWhen')}>
        {formatDateTime(event.occurredUtc, lang)}
      </td>
      <td data-label={t('admin.logs.userActivity.colEvent')}>
        <span className={`adm-status adm-status--${ev.tone}`}>
          {ev.labelKey ? t(ev.labelKey) : ev.fallback}
        </span>
      </td>
      <td data-label={t('admin.logs.userActivity.colActor')}>
        <IdCell id={event.actorUserId} na={na} />
      </td>
      <td data-label={t('admin.logs.userActivity.colTarget')}>
        <IdCell id={event.targetUserId} na={na} />
      </td>
      <td data-label={t('admin.logs.userActivity.colDetails')}>
        <DetailsCell event={event} na={na} />
      </td>
    </tr>
  );
}

/** Truncated GUID (first 8 chars + …) with the full value in a title; null -> muted dash. */
function IdCell({ id, na }: { id: string | null; na: string }) {
  if (!id) return <span className="adm-muted">{na}</span>;
  return (
    <span className="ua-id" title={id}>
      {truncateId(id)}
    </span>
  );
}

/** Details cell. On a loginFailed the usernameAttempted is shown QUOTED and flagged as
 *  an unverified attempt so it is never read as an authenticated identity. */
function DetailsCell({ event, na }: { event: UserActivityEvent; na: string }) {
  const { t } = useTranslation();
  const isFailed = event.eventType === 'loginFailed';
  if (isFailed && event.usernameAttempted) {
    return (
      <span className="ua-attempt">
        <span className="ua-attempt__user">
          {t('admin.logs.userActivity.attemptedUser', { username: event.usernameAttempted })}
        </span>{' '}
        <span className="ua-attempt__flag adm-muted">
          {t('admin.logs.userActivity.unverifiedAttempt')}
        </span>
      </span>
    );
  }
  if (event.details) return <span>{event.details}</span>;
  return <span className="adm-muted">{na}</span>;
}
