import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import RequireAuth from '../auth/RequireAuth';

// Stub login page: mirrors the real return-to behaviour (navigate to state.from)
// so we can assert the guard lets the farmer back into the intended route.
function LoginStub() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return (
    <div>
      <span>LOGIN</span>
      <span data-testid="from">{from ?? ''}</span>
      <button
        onClick={async () => {
          await login('farmer1', 'secret12');
          navigate(from ?? '/', { replace: true });
        }}
      >
        do-login
      </button>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginStub />} />
          <Route element={<RequireAuth />}>
            <Route path="/prices" element={<div>PRICES</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAuth guard', () => {
  it('redirects an unauthenticated visitor to /login and remembers the destination', () => {
    renderAt('/prices');
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('PRICES')).toBeNull();
    // Return-to: the intended destination is carried in navigation state.
    expect(screen.getByTestId('from').textContent).toBe('/prices');
  });

  it('lets the farmer back into the intended route after login (return-to)', async () => {
    renderAt('/prices');
    fireEvent.click(screen.getByText('do-login'));
    await waitFor(() => expect(screen.getByText('PRICES')).toBeInTheDocument());
  });
});
