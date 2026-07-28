import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

// "My crops" entry point. The portfolio is a personal, signed-in surface with no nav tab
// (the 4-tab IA is locked), so it sits beside the other shell affordances: the sidebar
// footer on desktop, the top bar on mobile. Renders nothing when signed out.
// (Identity + sign-out used to live here too; they now sit in the top navbar.)
export default function MyCropsLink({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <Link className={`mycrops mycrops--${variant}`} to="/portfolio">
      <span aria-hidden="true">🧺</span>
      <span className="wrap-label">{t('nav.portfolio')}</span>
    </Link>
  );
}
