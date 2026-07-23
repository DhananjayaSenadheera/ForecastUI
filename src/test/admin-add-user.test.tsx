import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import UsersPage from '../admin/UsersPage';

// ADM-4 add-user (owner request 2026-07-23). Covers the dialog contract: the mirrored
// client-side rules save a round-trip, the SERVER's uniqueness verdicts are shown verbatim
// without closing the form, and — the security-relevant one — creation goes through the
// Admin-only create route, never the anonymous register path that would re-cookie the
// acting admin. Runs in fixtures mode (VITE_API_MODE=fixtures), so no network.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <AuthProvider>
        <UsersPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function openDialog() {
  renderPage();
  await screen.findByText('claudetest');
  fireEvent.click(screen.getByRole('button', { name: /Add user/ }));
  return screen.getByRole('dialog');
}

function fill(dialog: HTMLElement, values: { username?: string; email?: string; password?: string }) {
  const inputs = dialog.querySelectorAll('input');
  if (values.username !== undefined) fireEvent.change(inputs[0], { target: { value: values.username } });
  if (values.email !== undefined) fireEvent.change(inputs[1], { target: { value: values.email } });
  if (values.password !== undefined) fireEvent.change(inputs[2], { target: { value: values.password } });
}

describe('UsersPage — add user', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a dialog with username, email, password and a role selector defaulting to Farmer', async () => {
    const dialog = await openDialog();

    const inputs = dialog.querySelectorAll('input');
    expect(inputs.length).toBe(3);
    expect(inputs[1].getAttribute('type')).toBe('email');
    // The password is masked, and marked new-password so a manager never offers the
    // ADMIN's own saved credentials for someone else's account.
    expect(inputs[2].getAttribute('type')).toBe('password');
    expect(inputs[2].getAttribute('autocomplete')).toBe('new-password');
    const select = dialog.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('Farmer');
  });

  it('creates the account, closes the dialog, flashes the name and shows the new row', async () => {
    const spy = vi.spyOn(api, 'createUser');
    const dialog = await openDialog();
    fill(dialog, { username: 'newfarmer_a', email: 'newfarmer_a@test.lk', password: 'correct-horse' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).toHaveBeenCalledWith({
      username: 'newfarmer_a',
      email: 'newfarmer_a@test.lk',
      password: 'correct-horse',
      role: 'Farmer',
    });
    // The name lands in BOTH the flash and the refetched table — assert the row itself.
    await waitFor(() =>
      expect(document.querySelector('.adm-table')!.textContent).toContain('newfarmer_a'),
    );
  });

  it('sends the chosen role when the admin picks Admin', async () => {
    const spy = vi.spyOn(api, 'createUser');
    const dialog = await openDialog();
    fill(dialog, { username: 'newadmin_b', email: 'newadmin_b@test.lk', password: 'correct-horse' });
    fireEvent.change(dialog.querySelector('select') as HTMLSelectElement, { target: { value: 'Admin' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0].role).toBe('Admin');
  });

  it('trims username and email but never the password', async () => {
    const spy = vi.spyOn(api, 'createUser');
    const dialog = await openDialog();
    fill(dialog, { username: '  spaced_c  ', email: '  spaced_c@test.lk ', password: ' pad ded pw ' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const sent = spy.mock.calls[0][0];
    expect(sent.username).toBe('spaced_c');
    expect(sent.email).toBe('spaced_c@test.lk');
    // Trimming a password would silently change the credential the admin set.
    expect(sent.password).toBe(' pad ded pw ');
  });

  it('rejects a short password client-side without calling the API', async () => {
    const spy = vi.spyOn(api, 'createUser');
    const dialog = await openDialog();
    fill(dialog, { username: 'shortpw', email: 'shortpw@test.lk', password: 'abc' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/8 and 128/);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // stays open
  });

  it('rejects a malformed email client-side without calling the API', async () => {
    const spy = vi.spyOn(api, 'createUser');
    const dialog = await openDialog();
    fill(dialog, { username: 'bademail', email: 'not-an-email', password: 'correct-horse' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an empty username client-side', async () => {
    const spy = vi.spyOn(api, 'createUser');
    const dialog = await openDialog();
    fill(dialog, { username: '   ', email: 'blank@test.lk', password: 'correct-horse' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows a server guard message verbatim and keeps the form open with the typed values', async () => {
    const msg = 'Username is already taken.';
    vi.spyOn(api, 'createUser').mockRejectedValueOnce(new ApiError(msg, 400));
    const dialog = await openDialog();
    fill(dialog, { username: 'claudetest', email: 'dupe@test.lk', password: 'correct-horse' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(msg)).toBeInTheDocument();
    // Still open, values intact — the admin fixes one field rather than retyping the form.
    const stillOpen = screen.getByRole('dialog');
    expect((stillOpen.querySelectorAll('input')[0] as HTMLInputElement).value).toBe('claudetest');
    expect((stillOpen.querySelectorAll('input')[2] as HTMLInputElement).value).toBe('correct-horse');
  });

  it('duplicate username is refused by the fixture store too, mirroring the server guard', async () => {
    const dialog = await openDialog();
    fill(dialog, { username: 'claudetest', email: 'other@test.lk', password: 'correct-horse' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });

  it('cancel closes the dialog without creating anything', async () => {
    const spy = vi.spyOn(api, 'createUser');
    const dialog = await openDialog();
    fill(dialog, { username: 'never_saved', email: 'never@test.lk', password: 'correct-horse' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText('never_saved')).toBeNull();
  });
});
