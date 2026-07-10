import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, persistLanguage, type AppLanguage } from '../i18n';

// Segmented language switcher (si / த / EN). Present in the shell footer on
// desktop and the mobile top bar. PRD: never buried in settings, never a flag,
// never resets the user's route/data mid-task.
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.language as AppLanguage;

  const shortLabel: Record<AppLanguage, string> = {
    si: 'සිං',
    ta: 'த',
    en: 'EN',
  };

  const change = (lang: AppLanguage) => {
    if (lang === current) return;
    void i18n.changeLanguage(lang);
    persistLanguage(lang);
  };

  return (
    <div className="langswitch" role="group" aria-label={t('lang.label')}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          className={`langswitch__opt${lang === current ? ' is-active' : ''}`}
          aria-pressed={lang === current}
          lang={lang}
          onClick={() => change(lang)}
        >
          {shortLabel[lang]}
        </button>
      ))}
    </div>
  );
}
