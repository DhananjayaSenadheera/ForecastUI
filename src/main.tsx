import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
// The app-wide table skin. It sits directly after base.css and BEFORE every feature
// stylesheet on purpose: a family's own file (portfolio.css, admin.css, …) must be able to
// override the skin's density and structure on a tie, and later-in-the-cascade is how.
import './styles/tables.css';
import './styles/shell.css';
import './styles/navbar.css';
import './styles/overview.css';
import './styles/harvest.css';
import './styles/bestcrops.css';
import './styles/prices.css';
import './styles/compare.css';
import './styles/chart-tooltip.css';
import './styles/auth.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './auth/AuthContext';
import { applyStoredTextSize } from './lib/storage';

// Apply the persisted large-text preference BEFORE first paint (no flash of small text).
applyStoredTextSize();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Register the app-shell service worker in production only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
