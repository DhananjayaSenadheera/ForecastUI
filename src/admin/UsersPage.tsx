// ADM-4 — User management (/admin/users). LIVE against API-9 (backend PR #26):
// list (GET /api/users/get/all), role change (PUT /api/users/update-role), delete
// (DELETE /api/users/delete/{id}). Mutations go through api.* then REFETCH the list
// (honest re-read of server truth at the 500-cap scale). Server guard messages
// ("cannot delete yourself", "cannot delete/demote the last remaining admin") are
// surfaced verbatim in the flash. In FIXTURES mode the same calls mutate an
// in-memory copy so the demo flow still works. There is NO add-user affordance by
// design: farmers self-register (/register, always Farmer); admins assign roles here.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, apiMode } from '../api/client';
import type { AdminUser } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { formatDate } from '../lib/format';
import {
  AdminDialog,
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTopbar,
  DemoNote,
  SortableTh,
  usePagination,
} from './adminShared';

type SortKey = 'username' | 'email' | 'role' | 'created';
type SortDir = 'asc' | 'desc';
type Flash = { msg: string; kind: 'ok' | 'error' };

const isFixtures = apiMode === 'fixtures';

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { session } = useAuth();
  const me = session?.username ?? '';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setUsers(await api.getAdminUsers());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Server guard messages (house error shape) arrive on ApiError.message — show
  // them verbatim so honest constraints ("last remaining admin", "cannot delete
  // yourself") reach the admin. Non-ApiError / network -> generic human line.
  const errMessage = useCallback(
    (e: unknown) => (e instanceof ApiError && e.message && e.status !== 0 ? e.message : t('common.errorBody')),
    [t],
  );

  const onSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(key);
        setSortDir(key === 'created' ? 'desc' : 'asc');
      }
    },
    [sortKey],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...users].sort((a, b) => {
      let d: number;
      if (sortKey === 'created') d = a.createdAt.localeCompare(b.createdAt);
      else d = a[sortKey].localeCompare(b[sortKey]);
      return d * dir || a.username.localeCompare(b.username);
    });
  }, [users, sortKey, sortDir]);

  const pager = usePagination(sorted);

  const saveRole = useCallback(
    async (id: string, role: 'Farmer' | 'Admin') => {
      setBusyId(id);
      setFlash(null);
      try {
        await api.updateUserRole(id, role);
        setEditing(null);
        setFlash({ msg: t(isFixtures ? 'admin.users.savedFlash' : 'admin.users.savedFlashLive'), kind: 'ok' });
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
    async (u: AdminUser) => {
      setBusyId(u.id);
      setFlash(null);
      try {
        await api.deleteUser(u.id);
        setConfirmDelete(null);
        setFlash({
          msg: t(isFixtures ? 'admin.users.deletedFlash' : 'admin.users.deletedFlashLive', { name: u.username }),
          kind: 'ok',
        });
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
      <AdminTopbar title={t('admin.users.title')} subtitle={t('admin.users.subtitle')} />
      <section className="panel adm" aria-label={t('admin.users.title')}>
        <DemoNote hasLiveEndpoint={true} />
        <p className="adm-note" role="note">
          {t('admin.users.selfRegisterNote')}
        </p>
        {flash && (
          <p className={`adm-note${flash.kind === 'error' ? ' adm-note--error' : ''}`} role="status">
            {flash.msg}
          </p>
        )}

        {error ? (
          <AdminError onRetry={() => void load()} />
        ) : loading ? (
          <AdminLoading />
        ) : sorted.length === 0 ? (
          <AdminEmpty title={t('admin.users.emptyTitle')} body={t('admin.users.emptyBody')} />
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <caption className="sr-only">{t('admin.users.title')}</caption>
              <thead>
                <tr>
                  <SortableTh col="username" label={t('admin.users.colUsername')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="email" label={t('admin.users.colEmail')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="role" label={t('admin.users.colRole')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh col="created" label={t('admin.users.colCreated')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th scope="col">
                    <span className="sr-only">{t('admin.users.colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pager.pageRows.map((u) => {
                  const isMe = u.username === me;
                  const rowBusy = busyId === u.id;
                  return (
                    <tr key={u.id}>
                      <th scope="row" className="adm-c-title" data-label={t('admin.users.colUsername')}>
                        <span className="adm-title">
                          {u.username}
                          {isMe && <span className="adm-badge"> {t('admin.users.you')}</span>}
                        </span>
                      </th>
                      <td data-label={t('admin.users.colEmail')}>{u.email}</td>
                      <td data-label={t('admin.users.colRole')}>
                        <span className="adm-badge">{t(`admin.users.role.${u.role.toLowerCase()}`)}</span>
                      </td>
                      <td data-label={t('admin.users.colCreated')}>{formatDate(u.createdAt.slice(0, 10), lang)}</td>
                      <td data-label={t('admin.users.colActions')}>
                        <button
                          type="button"
                          className="adm-rowbtn"
                          onClick={() => setEditing(u)}
                          disabled={rowBusy}
                        >
                          {t('admin.users.editRole')}
                        </button>
                        <button
                          type="button"
                          className="adm-rowbtn adm-rowbtn--danger"
                          onClick={() => setConfirmDelete(u)}
                          disabled={isMe || rowBusy}
                          title={isMe ? t('admin.users.cannotDeleteSelf') : undefined}
                        >
                          {rowBusy ? t('admin.users.working') : t('admin.users.delete')}
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
        <EditRoleDialog
          user={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={saveRole}
        />
      )}
      {confirmDelete && (
        <AdminDialog title={t('admin.users.deleteTitle')} onClose={() => setConfirmDelete(null)}>
          <p>{t('admin.users.deleteConfirm', { name: confirmDelete.username })}</p>
          <div className="adm-form__actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={busyId === confirmDelete.id}
            >
              {t('admin.users.cancel')}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--danger"
              onClick={() => void doDelete(confirmDelete)}
              disabled={busyId === confirmDelete.id}
            >
              {busyId === confirmDelete.id ? t('admin.users.working') : t('admin.users.delete')}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

function EditRoleDialog({
  user,
  busy,
  onClose,
  onSave,
}: {
  user: AdminUser;
  busy: boolean;
  onClose: () => void;
  onSave: (id: string, role: 'Farmer' | 'Admin') => void;
}) {
  const { t } = useTranslation();
  // Role whitelist is strictly Admin | Farmer — never invent other roles.
  const [role, setRole] = useState<'Farmer' | 'Admin'>(user.role);
  return (
    <AdminDialog title={t('admin.users.editRoleTitle', { name: user.username })} onClose={onClose}>
      <form
        className="adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(user.id, role);
        }}
      >
        <label className="adm-field">
          <span className="wrap-label">{t('admin.users.colRole')}</span>
          <select
            className="adm-select"
            value={role}
            onChange={(e) => setRole(e.target.value as 'Farmer' | 'Admin')}
            disabled={busy}
          >
            <option value="Farmer">{t('admin.users.role.farmer')}</option>
            <option value="Admin">{t('admin.users.role.admin')}</option>
          </select>
        </label>
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('admin.users.cancel')}
          </button>
          <button type="submit" className="adm-btn" disabled={busy}>
            {busy ? t('admin.users.working') : t('admin.users.save')}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
