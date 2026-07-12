import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { registerErrorKey } from '../lib/authErrors';
import { USE_FIXTURES } from '../api/client';
import LanguageSwitcher from '../components/LanguageSwitcher';

// Register (FE-17). Fields match RegisterDto EXACTLY: username, email, password
// (no invented fields). Client validation mirrors the RegisterCommandValidator
// (username required <=50, email required+valid, password >=8) so most errors are
// caught before a round-trip. Success auto-logs-in (the API returns a token).
interface FromState {
  from?: { pathname?: string; search?: string };
}

// Pragmatic email check — a "looks like an email" gate, not RFC 5322. The server
// (EmailAddress validator) is the source of truth; this just spares an obvious
// round-trip and gives an instant plain-language message.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as FromState;

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: { username?: string; email?: string; password?: string } = {};
    if (!username.trim()) next.username = t('auth.requiredUsername');
    if (!email.trim()) next.email = t('auth.requiredEmail');
    else if (!EMAIL_RE.test(email.trim())) next.email = t('auth.invalidEmail');
    if (!password) next.password = t('auth.requiredPassword');
    else if (password.length < 8) next.password = t('auth.shortPassword');
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await register(username.trim(), email.trim(), password);
      const to = state.from?.pathname
        ? `${state.from.pathname}${state.from.search ?? ''}`
        : '/overview';
      navigate(to, { replace: true });
    } catch (err) {
      setFormError(t(registerErrorKey(err)));
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
          <h1 className="authcard__title">{t('auth.registerTitle')}</h1>
          <p className="authcard__sub">{t('auth.registerSubtitle')}</p>

          {USE_FIXTURES && <p className="authcard__demo">{t('auth.demoMode')}</p>}

          <form className="authform" onSubmit={onSubmit} noValidate>
            <div className="field">
              <label className="field__label wrap-label" htmlFor="reg-username">
                {t('auth.username')}
              </label>
              <input
                id="reg-username"
                className="field__input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={50}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={errors.username ? true : undefined}
                aria-describedby={errors.username ? 'reg-username-err' : 'reg-username-hint'}
              />
              {errors.username ? (
                <p id="reg-username-err" className="field__error" role="alert">
                  {errors.username}
                </p>
              ) : (
                <p id="reg-username-hint" className="field__hint">
                  {t('auth.usernameNewHint')}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field__label wrap-label" htmlFor="reg-email">
                {t('auth.email')}
              </label>
              <input
                id="reg-email"
                className="field__input"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={256}
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'reg-email-err' : 'reg-email-hint'}
              />
              {errors.email ? (
                <p id="reg-email-err" className="field__error" role="alert">
                  {errors.email}
                </p>
              ) : (
                <p id="reg-email-hint" className="field__hint">
                  {t('auth.emailHint')}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field__label wrap-label" htmlFor="reg-password">
                {t('auth.password')}
              </label>
              <div className="field__pw">
                <input
                  id="reg-password"
                  className="field__input"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? 'reg-password-err' : 'reg-password-hint'}
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
              {errors.password ? (
                <p id="reg-password-err" className="field__error" role="alert">
                  {errors.password}
                </p>
              ) : (
                <p id="reg-password-hint" className="field__hint">
                  {t('auth.passwordNewHint')}
                </p>
              )}
            </div>

            {formError && (
              <p className="authform__error" role="alert">
                {formError}
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
            </button>
          </form>

          <p className="authcard__alt">
            {t('auth.haveAccountQ')}{' '}
            <Link to="/login" state={location.state}>
              {t('auth.goLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
