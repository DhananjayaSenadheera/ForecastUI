import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import RequireAuth from '../auth/RequireAuth';
import LoginPage from '../pages/LoginPage';
import { ApiError } from '../api/client';

// Deterministic auth: mock the network layer so we control success/failure.
const { loginMock, registerMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  registerMock: vi.fn(),
}));
vi.mock('../api/auth', () => ({ login: loginMock, register: registerMock }));

const session = {
  token: 't',
  expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
  username: 'farmer1',
  email: '',
  role: 'Farmer',
  simulated: false,
};

// Start guarded at /prices so the guard bounces to /login with return-to state.
function renderLoginFlow() {
  return render(
    <MemoryRouter initialEntries={['/prices']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/prices" element={<div>PRICES PAGE</div>} />
            <Route path="/overview" element={<div>OVERVIEW PAGE</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  loginMock.mockReset();
  await i18n.changeLanguage('en');
});

describe('LoginPage', () => {
  it('shows the login screen (guard redirect) with username + password fields', () => {
    renderLoginFlow();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('validates empty fields without calling the API', () => {
    renderLoginFlow();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Please enter your username.')).toBeInTheDocument();
    expect(screen.getByText('Please enter your password.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('logs in and returns the farmer to the intended route (return-to)', async () => {
    loginMock.mockResolvedValue(session);
    renderLoginFlow();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'farmer1' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByText('PRICES PAGE')).toBeInTheDocument());
    expect(loginMock).toHaveBeenCalledWith('farmer1', 'secret12');
  });

  it('surfaces a localized wrong-credentials message on 401', async () => {
    loginMock.mockRejectedValue(new ApiError('Invalid username or password.', 401));
    renderLoginFlow();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'farmer1' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(
        screen.getByText('That username or password is not correct. Please try again.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('PRICES PAGE')).toBeNull();
  });

  it('toggles password visibility', () => {
    renderLoginFlow();
    const pw = screen.getByLabelText('Password') as HTMLInputElement;
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw.type).toBe('text');
  });
});
