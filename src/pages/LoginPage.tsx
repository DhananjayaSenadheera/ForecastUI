import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { loginErrorKey } from '../lib/authErrors';
import { USE_FIXTURES } from '../api/client';
import LanguageSwitcher from '../components/LanguageSwitcher';

// Login (FE-17). Farmer-friendly: big touch targets, minimal fields matching the
// LoginDto EXACTLY (username + password — login is by USERNAME, not email), plain
// inline validation, loading/disabled states. Return-to after login preserves the
// route the guard interrupted (location.state.from).
interface FromState {
  from?: { pathname?: string; search?: string };
  reason?: string;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as FromState;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: { username?: string; password?: string } = {};
    if (!username.trim()) next.username = t('auth.requiredUsername');
    if (!password) next.password = t('auth.requiredPassword');
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await login(username.trim(), password);
      const to = state.from?.pathname
        ? `${state.from.pathname}${state.from.search ?? ''}`
        : '/overview';
      navigate(to, { replace: true });
    } catch (err) {
      setFormError(t(loginErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authpage">
      <div className="authcard">
        <div className="authcard__top">
          <span className="authcard__brand">
            <span className="authcard__leaf" aria-hidden="true">🌱</span>
            {t('app.name')}
          </span>
          <LanguageSwitcher />
        </div>

        <div className="authcard__body">
          <h1 className="authcard__title">{t('auth.loginTitle')}</h1>
          <p className="authcard__sub">{t('auth.loginSubtitle')}</p>

          {USE_FIXTURES && <p className="authcard__demo">{t('auth.demoMode')}</p>}

          {state.reason === 'expired' && (
            <p className="authcard__notice" role="status">
              {t('auth.expiredNotice')}
            </p>
          )}

          <form className="authform" onSubmit={onSubmit} noValidate>
            <div className="field">
              <label className="field__label wrap-label" htmlFor="login-username">
                {t('auth.username')}
              </label>
              <input
                id="login-username"
                className="field__input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={errors.username ? true : undefined}
                aria-describedby={errors.username ? 'login-username-err' : 'login-username-hint'}
              />
              {errors.username ? (
                <p id="login-username-err" className="field__error" role="alert">
                  {errors.username}
                </p>
              ) : (
                <p id="login-username-hint" className="field__hint">
                  {t('auth.usernameLoginHint')}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field__label wrap-label" htmlFor="login-password">
                {t('auth.password')}
              </label>
              <div className="field__pw">
                <input
                  id="login-password"
                  className="field__input"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? 'login-password-err' : undefined}
                />
                <button
                  type="button"
                  className="field__pwtoggle"
                  aria-pressed={showPw}
                  aria-label={showPw ? t('auth.hidePassword') : t('auth.showPassword')}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? t('auth.hidePassword') : t('auth.showPassword')}
                </button>
              </div>
              {errors.password && (
                <p id="login-password-err" className="field__error" role="alert">
                  {errors.password}
                </p>
              )}
            </div>

            {formError && (
              <p className="authform__error" role="alert">
                {formError}
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          </form>

          <p className="authcard__alt">
            {t('auth.noAccountQ')}{' '}
            <Link to="/register" state={location.state}>
              {t('auth.goRegister')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
