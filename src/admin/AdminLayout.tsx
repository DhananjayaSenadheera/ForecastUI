// Layout shared by every admin page. It exists so the pipeline-health banner is mounted
// ONCE for the whole console rather than per page: moving between Markets, Logs and Users
// keeps the same banner (and the same 5-minute poll) instead of refetching on every tab.
//
// It is lazy-loaded from App.tsx like the pages it wraps, so none of this code — nor
// admin.css — reaches the farmer bundle.
import { Outlet } from 'react-router-dom';
import PipelineHealthBanner from './PipelineHealthBanner';
import './admin.css';

export default function AdminLayout() {
  return (
    <>
      <PipelineHealthBanner />
      <Outlet />
    </>
  );
}
