import { Suspense, lazy, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import LanguageGate, { hasSeenLanguageGate } from './components/LanguageGate';
import OverviewPage from './pages/OverviewPage';
import MyHarvestPage from './pages/MyHarvestPage';
import BestCropsPage from './pages/BestCropsPage';
import CompareCropsPage from './pages/CompareCropsPage';
import PricesPage from './pages/PricesPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RequireAuth from './auth/RequireAuth';
import RequireAdmin from './admin/RequireAdmin';

// Portfolio ("My crops") is lazy-loaded too: it is a NON-tab destination reached from the
// Overview card and the session menu, so its code must not sit in the first paint of the
// four tabs every farmer does use. Same chunking precedent as the admin console.
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const PortfolioCropPage = lazy(() => import('./pages/PortfolioCropPage'));

// Admin pages are lazy-loaded, so none of their code is in the farmer bundle.
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const PolicyFlagsPage = lazy(() => import('./admin/PolicyFlagsPage'));
const MarketsPage = lazy(() => import('./admin/MarketsPage'));
const UsersPage = lazy(() => import('./admin/UsersPage'));
const FestivalsPage = lazy(() => import('./admin/FestivalsPage'));
const IndicatorsPage = lazy(() => import('./admin/IndicatorsPage'));
const NewsPage = lazy(() => import('./admin/NewsPage'));
const LogsPage = lazy(() => import('./admin/logs/LogsPage'));
const IngestionRunsPage = lazy(() => import('./admin/IngestionRunsPage'));
const TrainingRunsPage = lazy(() => import('./admin/logs/TrainingRunsPage'));
const UserActivityPage = lazy(() => import('./admin/logs/UserActivityPage'));
const SystemErrorsPage = lazy(() => import('./admin/logs/SystemErrorsPage'));
const ForecastAccuracyPage = lazy(() => import('./admin/logs/ForecastAccuracyPage'));

/** Placeholder shown while a lazy page chunk loads. */
function AdminFallback() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="boot__spinner" aria-hidden="true" />
    </div>
  );
}
const lazyAdmin = (el: React.ReactNode) => <Suspense fallback={<AdminFallback />}>{el}</Suspense>;
/** Same wrapper for the farmer-facing lazy routes — named apart so the two stay legible. */
const lazyPage = lazyAdmin;

export default function App() {
  // Shown once on first launch, until a language is chosen or skipped.
  const [gateDone, setGateDone] = useState(hasSeenLanguageGate);

  if (!gateDone) {
    return <LanguageGate onDone={() => setGateDone(true)} />;
  }

  return (
    <Routes>
      {/* Public auth routes — outside the shell and the guard. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* All data routes require a session (RequireAuth); in fixtures mode the login
          form mints a simulated session so the guarded flow is demoable offline. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/my-harvest" element={<MyHarvestPage />} />
          <Route path="/best-crops" element={<BestCropsPage />} />
          {/* Non-tab child route — keeps the 4-tab IA; Best-crops nav stays active. */}
          <Route path="/best-crops/compare" element={<CompareCropsPage />} />
          <Route path="/prices" element={<PricesPage />} />

          {/* "My crops" — NON-tab routes (the 4-tab IA is locked). Entry points are the
              Overview card and the session menu, not the nav. */}
          <Route path="/portfolio" element={lazyPage(<PortfolioPage />)} />
          {/* The settings screen was dissolved INTO /portfolio (cards + crop table on one
              page). The route stays as a redirect so bookmarks and any link still in the
              wild land on the page that now does the job, instead of the catch-all. */}
          <Route path="/portfolio/settings" element={<Navigate to="/portfolio" replace />} />
          <Route path="/portfolio/crop/:cropId" element={lazyPage(<PortfolioCropPage />)} />

          {/* Admin console — role-gated by RequireAdmin. It renders inside the shell so
              admins keep the nav, and a farmer who reaches it gets an honest "no access"
              state rather than a redirect loop. */}
          <Route path="/admin" element={<RequireAdmin />}>
            <Route index element={<Navigate to="/admin/policy-flags" replace />} />
            {/* Pathless layout route: every real admin page renders inside AdminLayout, so
                the pipeline-health banner mounts once per visit to the console instead of
                once per page. The redirect routes stay OUTSIDE it — a redirect must not
                wait for a chunk to download. */}
            <Route element={lazyAdmin(<AdminLayout />)}>
              <Route path="policy-flags" element={lazyAdmin(<PolicyFlagsPage />)} />
              <Route path="markets" element={lazyAdmin(<MarketsPage />)} />
              <Route path="users" element={lazyAdmin(<UsersPage />)} />
              <Route path="festivals" element={lazyAdmin(<FestivalsPage />)} />
              <Route path="indicators" element={lazyAdmin(<IndicatorsPage />)} />
              <Route path="news" element={lazyAdmin(<NewsPage />)} />
              {/* Logs hub — tabbed shell; child routes are each their own lazy chunk. */}
              <Route path="logs" element={lazyAdmin(<LogsPage />)}>
                <Route index element={<Navigate to="/admin/logs/ingestion" replace />} />
                <Route path="ingestion" element={lazyAdmin(<IngestionRunsPage />)} />
                <Route path="training" element={lazyAdmin(<TrainingRunsPage />)} />
                <Route path="user-activity" element={lazyAdmin(<UserActivityPage />)} />
                <Route path="errors" element={lazyAdmin(<SystemErrorsPage />)} />
                <Route
                  path="forecast-accuracy"
                  element={lazyAdmin(<ForecastAccuracyPage />)}
                />
              </Route>
            </Route>
            {/* Legacy bookmark: the old standalone /admin/ingestion now lives in Logs. */}
            <Route path="ingestion" element={<Navigate to="/admin/logs/ingestion" replace />} />
            <Route path="*" element={<Navigate to="/admin/policy-flags" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
