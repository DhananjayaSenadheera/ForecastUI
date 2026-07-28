import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useSignOut } from '../auth/useSignOut';
import MyCropsLink from './MyCropsLink';
import LanguageSwitcher from './LanguageSwitcher';
import TextSizeToggle from './TextSizeToggle';

/**
 * App-wide top bar (banner landmark). Brand on the left, the signed-in identity and the
 * sign-out control on the right. It sits ALONGSIDE the tab navigation — the sidebar on
 * desktop, the bottom tab bar on mobile — which still owns moving between the four pages.
 *
 * Responsive disclosure, CSS-only: the identity panel is markup that is laid out inline on
 * >=600px and turns into a popover under an avatar button below 600px. Only one of the two
 * (trigger or inline panel) is ever `display:none`, so the accessible tree never carries a
 * duplicate "Sign out" and no JS breakpoint/matchMedia is needed.
 */
export default function TopNavbar() {
  const { t } = useTranslation();
  const { session, isAuthenticated } = useAuth();
  const signOut = useSignOut();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // A route change means the farmer moved on — never leave the popover hanging open.
  useEffect(() => setOpen(false), [pathname]);

  // Dismiss on outside press and on Escape (Escape returns focus to the trigger).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const username = session?.username ?? '';
  // Array.from, not charAt: a Sinhala/Tamil or emoji first character can be more than one
  // UTF-16 code unit, and half a code point renders as a replacement glyph.
  const initial = (Array.from(username.trim())[0] ?? '?').toUpperCase();

  return (
    <header className="appbar" aria-label={t('nav.appbar')}>
      <div className="appbar__brand">
        <span className="appbar__leaf" aria-hidden="true">
          🌱
        </span>
        {/* Below 600px the wordmark is visually hidden (the leaf carries the identity and
            the bar has no room for it) but stays in the accessible tree. */}
        <span className="appbar__word">{t('app.name')}</span>
      </div>

      {/* Shell affordances that live in the sidebar footer on desktop; the bar carries them
          on mobile, where the sidebar is hidden. */}
      <div className="appbar__tools">
        <MyCropsLink variant="mobile" />
        <LanguageSwitcher />
        <TextSizeToggle />
      </div>

      {isAuthenticated && session && (
        <div className="acct" ref={rootRef}>
          <button
            ref={triggerRef}
            type="button"
            className="acct__trigger"
            aria-expanded={open}
            aria-controls="acct-panel"
            aria-label={t('nav.accountFor', { name: username })}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="acct__avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="acct__caret" aria-hidden="true">
              ▾
            </span>
          </button>

          <div id="acct-panel" className={`acct__panel${open ? ' is-open' : ''}`}>
            <span className="acct__avatar acct__avatar--panel" aria-hidden="true">
              {initial}
            </span>
            <span className="acct__who">
              <span className="acct__label">{t('auth.loggedInAs')}</span>
              {/* A username is user data, not a translated label: a single-line ellipsis is
                  correct here (the full value stays in title + the popover). */}
              <span className="acct__name" title={username}>
                {username}
              </span>
              {session.simulated && <span className="acct__demo">{t('auth.demoMode')}</span>}
            </span>
            <button type="button" className="acct__signout" onClick={signOut}>
              <span aria-hidden="true">⏻</span>
              <span className="wrap-label">{t('auth.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
