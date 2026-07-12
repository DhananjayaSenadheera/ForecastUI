// ADM-4 — User management (/admin/users). DEMO CRUD: mutations operate on in-memory
// fixture state so the interactions are fully demoable before the live users endpoint
// exists (PROVISIONAL shape). Edit-role dialog + delete-with-confirm; you CANNOT delete
// your own account (enforced in the UI). Honest "demo data" note in fixtures mode.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
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
  const [flash, setFlash] = useState<string | null>(null);

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

  const saveRole = (id: string, role: 'Farmer' | 'Admin') => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role, updatedAt: new Date().toISOString() } : u)),
    );
    setEditing(null);
    setFlash(t('admin.users.savedFlash'));
  };

  const doDelete = (u: AdminUser) => {
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    setConfirmDelete(null);
    setFlash(t('admin.users.deletedFlash', { name: u.username }));
  };

  return (
    <>
      <AdminTopbar title={t('admin.users.title')} subtitle={t('admin.users.subtitle')} />
      <section className="panel adm" aria-label={t('admin.users.title')}>
        <DemoNote hasLiveEndpoint={false} />
        {flash && (
          <p className="adm-note" role="status">
            {flash}
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
                        <button type="button" className="adm-rowbtn" onClick={() => setEditing(u)}>
                          {t('admin.users.editRole')}
                        </button>
                        <button
                          type="button"
                          className="adm-rowbtn adm-rowbtn--danger"
                          onClick={() => setConfirmDelete(u)}
                          disabled={isMe}
                          title={isMe ? t('admin.users.cannotDeleteSelf') : undefined}
                        >
                          {t('admin.users.delete')}
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
        <EditRoleDialog user={editing} onClose={() => setEditing(null)} onSave={saveRole} />
      )}
      {confirmDelete && (
        <AdminDialog title={t('admin.users.deleteTitle')} onClose={() => setConfirmDelete(null)}>
          <p>{t('admin.users.deleteConfirm', { name: confirmDelete.username })}</p>
          <div className="adm-form__actions">
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(null)}>
              {t('admin.users.cancel')}
            </button>
            <button type="button" className="adm-btn adm-btn--danger" onClick={() => doDelete(confirmDelete)}>
              {t('admin.users.delete')}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

function EditRoleDialog({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser;
  onClose: () => void;
  onSave: (id: string, role: 'Farmer' | 'Admin') => void;
}) {
  const { t } = useTranslation();
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
          <select className="adm-select" value={role} onChange={(e) => setRole(e.target.value as 'Farmer' | 'Admin')}>
            <option value="Farmer">{t('admin.users.role.farmer')}</option>
            <option value="Admin">{t('admin.users.role.admin')}</option>
          </select>
        </label>
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('admin.users.cancel')}
          </button>
          <button type="submit" className="adm-btn">
            {t('admin.users.save')}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
