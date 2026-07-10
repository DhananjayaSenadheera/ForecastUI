import { Component, type ErrorInfo, type ReactNode } from 'react';

// App-level error boundary — a white screen is worse than an honest error for our
// audience. Renders a plain retry surface; no response bodies logged (no PII leak).
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally no console logging of error payloads (bundle-leak / PII rule).
    // A privacy-safe telemetry hook can go here later.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
          <h1 style={{ marginBottom: 8 }}>Could not load</h1>
          <p style={{ color: 'var(--text-2)', marginBottom: 20 }}>
            Something went wrong. Please try again.
          </p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
