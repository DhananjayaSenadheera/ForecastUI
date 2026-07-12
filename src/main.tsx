import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/overview.css';
import './styles/harvest.css';
import './styles/bestcrops.css';
import './styles/prices.css';
import './styles/compare.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { applyStoredTextSize } from './lib/storage';

// Apply the persisted large-text preference BEFORE first paint (no flash of small text).
applyStoredTextSize();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

// PWA baseline (FE-2): register the app-shell service worker in production only.
// Full offline UX (staleness banner, cached last-data) is FE-9.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
