import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import LanguageGate, { hasSeenLanguageGate } from './components/LanguageGate';
import OverviewPage from './pages/OverviewPage';
import MyHarvestPage from './pages/MyHarvestPage';
import BestCropsPage from './pages/BestCropsPage';
import CompareCropsPage from './pages/CompareCropsPage';
import PricesPage from './pages/PricesPage';

export default function App() {
  // First-launch language gate (onboarding O1). Shown once until chosen/skipped.
  const [gateDone, setGateDone] = useState(hasSeenLanguageGate);

  if (!gateDone) {
    return <LanguageGate onDone={() => setGateDone(true)} />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/my-harvest" element={<MyHarvestPage />} />
        <Route path="/best-crops" element={<BestCropsPage />} />
        {/* Non-tab child route — keeps the 4-tab IA; Best-crops nav stays active. */}
        <Route path="/best-crops/compare" element={<CompareCropsPage />} />
        <Route path="/prices" element={<PricesPage />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
