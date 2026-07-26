import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Error boundary — a white screen is worse than an honest error for our audience. Used
// app-level (main.tsx) for a crash in the shell or i18n bootstrap, and route-level (keyed
// on pathname) so one crashed panel leaves the nav usable and navigating away recovers.
// No response bodies are ever logged.

interface Props {
  children: ReactNode;
  /** When any value here changes, the boundary clears its error (route change). */
  resetKey?: string;
  /** 'panel' keeps the surrounding shell; 'page' is the full-screen app fallback. */
  variant?: 'page' | 'panel';
}
interface State {
  hasError: boolean;
}

// Localized fallback — a small functional child so it can use hooks. If i18n
// itself failed, react-i18next returns the key/English fallback; still no crash.
function ErrorFallback({ variant }: { variant: 'page' | 'panel' }) {
  const { t } = useTranslation();
  return (
    <div className={`err-fallback err-fallback--${variant}`} role="alert">
      <p className="err-fallback__title">{t('error.boundaryTitle')}</p>
      <p className="err-fallback__body">{t('error.boundaryBody')}</p>
      <button
        type="button"
        className="btn-primary err-fallback__reload"
        onClick={() => window.location.reload()}
      >
        {t('error.reload')}
      </button>
    </div>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(prev: Props): void {
    // Route change (or any resetKey change) clears the error so the next page can
    // render — a stuck boundary must not trap the user on a dead screen.
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally no console logging of error payloads (bundle-leak / PII rule).
    // A privacy-safe telemetry hook can go here later.
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback variant={this.props.variant ?? 'page'} />;
    }
    return this.props.children;
  }
}
