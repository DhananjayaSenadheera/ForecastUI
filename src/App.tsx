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

// Admin console (ADM-1..7) is LAZY / route-level code-split: none of it lands in the
// farmer first-load bundle, so the 150KB gz budget stays untouched. Each page is its
// own chunk; adminShared + admin.css ride along in the shared admin chunk.
const PolicyFlagsPage = lazy(() => import('./admin/PolicyFlagsPage'));
const MarketsPage = lazy(() => import('./admin/MarketsPage'));
const UsersPage = lazy(() => import('./admin/UsersPage'));
const FestivalsPage = lazy(() => import('./admin/FestivalsPage'));
const IndicatorsPage = lazy(() => import('./admin/IndicatorsPage'));
const NewsPage = lazy(() => import('./admin/NewsPage'));
const LogsPage = lazy(() => import('./admin/logs/LogsPage'));
// Each Logs tab keeps its own lazy chunk — the Logs shell renders one into an
// <Outlet/> on demand, so visiting a tab loads only that tab's code.
const IngestionRunsPage = lazy(() => import('./admin/IngestionRunsPage'));
const TrainingRunsPage = lazy(() => import('./admin/logs/TrainingRunsPage'));
const UserActivityPage = lazy(() => import('./admin/logs/UserActivityPage'));
const SystemErrorsPage = lazy(() => import('./admin/logs/SystemErrorsPage'));

/** Subtle hold while an admin chunk loads (matches the auth boot shell). */
function AdminFallback() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="boot__spinner" aria-hidden="true" />
    </div>
  );
}
const lazyAdmin = (el: React.ReactNode) => <Suspense fallback={<AdminFallback />}>{el}</Suspense>;

export default function App() {
  // First-launch language gate (onboarding O1). Shown once until chosen/skipped.
  const [gateDone, setGateDone] = useState(hasSeenLanguageGate);

  if (!gateDone) {
    return <LanguageGate onDone={() => setGateDone(true)} />;
  }

  return (
    <Routes>
      {/* Public auth routes — outside the shell + the guard (FE-17). */}
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

          {/* Admin console — role-gated by RequireAdmin (authenticated + role Admin).
              Renders inside the shell so admins keep the nav; farmers who reach it
              get an honest "no access" state, never a redirect loop. */}
          <Route path="/admin" element={<RequireAdmin />}>
            <Route index element={<Navigate to="/admin/policy-flags" replace />} />
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
