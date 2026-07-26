// System log (/admin/logs/user-activity — route kept for old bookmarks). Read-only,
// server-paged audit trail of sign-ins, user changes and admin content edits.
// Two filters that are not redundant: the GROUP sub-tabs send the group's wire strings
// as `types`, and the single-event dropdown sends `type`. The dropdown is always scoped
// to the active group, and the group lives in ?group= so the view deep-links.
// The filters only ever send known wire strings — the server 400s anything else. An
// event type this build does not know still renders verbatim: a log that silently
// drops rows is not a log.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import ActivityGroupTabs, {
  ACTIVITY_GROUPS,
  ACTIVITY_GROUP_PANEL_ID,
  activityGroupTabId,
  resolveActivityGroup,
  type ActivityGroup,
} from './ActivityGroupTabs';

const EVENTS_PAGE_SIZE = 25;
const ALL_GROUP = ACTIVITY_GROUPS[0];

export default function UserActivityPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [searchParams, setSearchParams] = useSearchParams();
  // The URL is the source of truth for the group; an unknown ?group= falls back to All.
  const group = resolveActivityGroup(searchParams.get('group'));
  const groupTypes = group.types;

  const [data, setData] = useState<UserActivityPageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [type, setType] = useState(''); // '' = every event in the group; else one wire string
  const pager = useServerPagination(data?.total ?? 0, EVENTS_PAGE_SIZE);
  const { page, perPage, totalPages, setPage, setPerPage } = pager;
  const req = useRef(0); // stale-response guard for overlapping page/filter loads

  // Ignore a selected type the active group cannot show (Back/Forward changes the group
  // without going through selectGroup).
  const activeType = !type || !groupTypes || groupTypes.includes(type) ? type : '';
  const options = groupTypes ?? USER_ACTIVITY_EVENT_TYPES;
  const filtered = activeType !== '' || groupTypes !== null;

  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    setError(false);
    try {
      // `type` is the narrower request and wins; otherwise the group's set (All sends
      // neither, i.e. no filter at all).
      const filter = activeType ? { type: activeType } : groupTypes ? { types: groupTypes } : {};
      const res = await api.getUserActivity(page, perPage, filter);
      if (id !== req.current) return; // a newer load superseded this one
      setData(res);
    } catch {
      if (id !== req.current) return;
      setError(true);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [page, perPage, activeType, groupTypes]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectGroup(next: ActivityGroup) {
    const params = new URLSearchParams(searchParams);
    // Default group = clean URL. replace, not push: a filter is not a navigation step.
    if (next.id === ALL_GROUP.id) params.delete('group');
    else params.set('group', next.id);
    setSearchParams(params, { replace: true });
    setPage(1); // a new group invalidates the page cursor
    if (type && next.types && !next.types.includes(type)) setType('');
  }

  const items = data?.items ?? [];
  // A load with rows already on screen answers the PREVIOUS query, so those rows are
  // marked stale rather than left looking like the new group's result.
  const refreshing = loading && data !== null;

  return (
    <section className="panel adm" aria-label={t('admin.logs.userActivity.title')}>
      <DemoNote />

      <ActivityGroupTabs
        groups={ACTIVITY_GROUPS}
        activeId={group.id}
        onSelect={selectGroup}
        ariaLabel={t('admin.logs.userActivity.groups.label')}
      />

      <div
        role="tabpanel"
        id={ACTIVITY_GROUP_PANEL_ID}
        aria-labelledby={activityGroupTabId(group.id)}
        // A refetch keeps the old rows (no layout jump) but must not let them look like
        // the new filter's result: aria-busy says "being replaced" to assistive tech,
        // the dimming says it to everyone else.
        aria-busy={loading}
      >
        <div className="adm-toolbar">
          <label className="adm-field ing-filter">
            <span className="wrap-label">{t('admin.logs.userActivity.filterType')}</span>
            <select
              className="adm-select"
              value={activeType}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1); // a new filter invalidates the page cursor
              }}
            >
              <option value="">{t('admin.logs.userActivity.filterAll')}</option>
              {options.map((ev) => (
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
            // "Nothing has happened yet" and "nothing matches this filter" are
            // different facts and must not share one sentence.
            body={t(
              filtered
                ? 'admin.logs.userActivity.emptyBodyFiltered'
                : 'admin.logs.userActivity.emptyBody',
            )}
          />
        ) : data ? (
          <div className={`syslog-results${refreshing ? ' is-stale' : ''}`}>
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
          </div>
        ) : null}
      </div>
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

/** Details cell. A loginFailed shows usernameAttempted quoted and flagged as an
 *  unverified attempt, so it is never read as an authenticated identity. */
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
