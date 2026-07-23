// ADM-4 — User management (/admin/users). LIVE against API-9 (backend PR #26):
// list (GET /api/users/get/all), create (POST /api/users/create), role change
// (PUT /api/users/update-role), delete (DELETE /api/users/delete/{id}). Mutations go
// through api.* then REFETCH the list (honest re-read of server truth at the 500-cap
// scale). Server guard messages ("cannot delete yourself", "cannot delete/demote the
// last remaining admin", "username is already taken") are surfaced verbatim in the
// flash. In FIXTURES mode the same calls mutate an in-memory copy so the demo flow
// still works.
//
// ADD USER (owner request 2026-07-23, replacing the earlier self-register-only rule):
// admins can now provision an account here, choosing the role at creation. It posts to
// the Admin-only create route, NEVER to /register — that anonymous endpoint issues a
// refresh cookie to the caller, which would replace the acting admin's own session
// cookie with the new user's. Farmers can still self-register as before.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, apiMode } from '../api/client';
import type { AdminUser, CreateUserInput } from '../api/types';
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
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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

  // Create keeps its error INSIDE the dialog (the form stays open with the typed values
  // intact so the admin can fix the one field the server rejected) — unlike role/delete,
  // whose dialogs close and report through the page flash. Only a success closes it.
  const createUser = useCallback(
    async (input: CreateUserInput) => {
      setCreating(true);
      setCreateError(null);
      setFlash(null);
      try {
        const created = await api.createUser(input);
        setAdding(false);
        setFlash({
          msg: t(isFixtures ? 'admin.users.createdFlash' : 'admin.users.createdFlashLive', {
            name: created.username,
          }),
          kind: 'ok',
        });
        await load();
      } catch (e) {
        setCreateError(errMessage(e));
      } finally {
        setCreating(false);
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
        {flash && (
          <p className={`adm-note${flash.kind === 'error' ? ' adm-note--error' : ''}`} role="status">
            {flash.msg}
          </p>
        )}

        <div className="adm-toolbar">
          <span />
          <button
            type="button"
            className="adm-btn"
            onClick={() => {
              setCreateError(null);
              setAdding(true);
            }}
          >
            + {t('admin.users.add')}
          </button>
        </div>

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

      {adding && (
        <AddUserDialog
          busy={creating}
          error={createError}
          onClose={() => setAdding(false)}
          onSave={createUser}
        />
      )}
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

// Client-side rules are a MIRROR of CreateUserCommandValidator (username <= 50, valid
// email <= 256, password 8..128, role from the closed whitelist) — they exist to save a
// round-trip, never to replace the server check. Anything the server rejects anyway
// (duplicate username/email) is left to it and shown verbatim, because only the server
// knows the current account list.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const USERNAME_MAX = 50;
const EMAIL_MAX = 256;

function AddUserDialog({
  busy,
  error,
  onClose,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: CreateUserInput) => void;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Role whitelist is strictly Admin | Farmer — never invent other roles. Farmer is the
  // default so the common case is one click, and an accidental Enter never mints an admin.
  const [role, setRole] = useState<'Farmer' | 'Admin'>('Farmer');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    const mail = email.trim();
    if (!name || name.length > USERNAME_MAX) return setLocalError(t('admin.users.errUsername'));
    if (!mail || mail.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))
      return setLocalError(t('admin.users.errEmail'));
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
      return setLocalError(t('admin.users.errPassword', { min: PASSWORD_MIN, max: PASSWORD_MAX }));
    setLocalError(null);
    // Password is passed through UNTRIMMED — leading/trailing spaces are legitimate
    // characters in a password and trimming them would silently change what the admin set.
    onSave({ username: name, email: mail, password, role });
  };

  const shown = localError ?? error;

  return (
    <AdminDialog title={t('admin.users.addTitle')} onClose={onClose}>
      {/* noValidate: type="email" still gives mobile the right keyboard, but the browser's
          own constraint bubble would speak the BROWSER's language, not the app's — and this
          app ships si/ta. Validation is ours so every message is translated. */}
      <form className="adm-form" onSubmit={submit} noValidate>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.users.colUsername')}</span>
          <input
            type="text"
            className="adm-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={USERNAME_MAX}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.users.colEmail')}</span>
          <input
            type="email"
            className="adm-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={EMAIL_MAX}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="adm-field">
          <span className="wrap-label">{t('admin.users.password')}</span>
          <input
            type="password"
            className="adm-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={PASSWORD_MAX}
            // new-password keeps a password manager from offering the ADMIN's own
            // credentials for an account they are creating for someone else.
            autoComplete="new-password"
            disabled={busy}
          />
          <span className="adm-caption">{t('admin.users.passwordHint', { min: PASSWORD_MIN })}</span>
        </label>
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
        <p className="adm-caption">{t('admin.users.addNote')}</p>
        {shown && (
          <p className="adm-error" role="alert">
            {shown}
          </p>
        )}
        <div className="adm-form__actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('admin.users.cancel')}
          </button>
          <button type="submit" className="adm-btn" disabled={busy}>
            {busy ? t('admin.users.working') : t('admin.users.create')}
          </button>
        </div>
      </form>
    </AdminDialog>
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
