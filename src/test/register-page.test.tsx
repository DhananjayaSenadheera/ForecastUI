import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../i18n';
import { AuthProvider } from '../auth/AuthContext';
import RequireAuth from '../auth/RequireAuth';
import RegisterPage from '../pages/RegisterPage';
import { ApiError } from '../api/client';

const { loginMock, registerMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  registerMock: vi.fn(),
}));
vi.mock('../api/auth', () => ({ login: loginMock, register: registerMock }));

const session = {
  token: 't',
  expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
  username: 'farmer1',
  email: 'a@b.com',
  role: 'Farmer',
  simulated: false,
};

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/overview" element={<div>OVERVIEW PAGE</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  registerMock.mockReset();
  await i18n.changeLanguage('en');
});

describe('RegisterPage', () => {
  it('renders the three DTO fields (username, email, password) — no invented fields', () => {
    renderRegister();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('rejects an invalid email before any API call', () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'farmer1' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('enforces the 8-char minimum password (mirrors the server rule)', () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'farmer1' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('registers and auto-enters the app', async () => {
    registerMock.mockResolvedValue(session);
    renderRegister();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'farmer1' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByText('OVERVIEW PAGE')).toBeInTheDocument());
    expect(registerMock).toHaveBeenCalledWith('farmer1', 'a@b.com', 'secret12');
  });

  it('shows a localized message when the email is already registered (400)', async () => {
    registerMock.mockRejectedValue(new ApiError('Email is already registered.', 400));
    renderRegister();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'farmer1' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(
        screen.getByText('That email is already registered. Try signing in instead.'),
      ).toBeInTheDocument(),
    );
  });
});
