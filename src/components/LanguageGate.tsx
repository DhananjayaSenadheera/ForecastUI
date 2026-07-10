import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, persistLanguage, type AppLanguage } from '../i18n';

const GATE_SEEN_KEY = 'agriforecast.onboarding.langSeen';

export function hasSeenLanguageGate(): boolean {
  try {
    return localStorage.getItem(GATE_SEEN_KEY) === '1';
  } catch {
    return true; // storage disabled -> don't trap the user behind a gate
  }
}

function markSeen() {
  try {
    localStorage.setItem(GATE_SEEN_KEY, '1');
  } catch {
    /* non-fatal */
  }
}

// First-launch language pick (onboarding O1). Skippable — English is the fallback.
// No registration wall (PRD): this is the only interstitial before browsing.
export default function LanguageGate({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<AppLanguage>(i18n.language as AppLanguage);

  const fullLabelKey: Record<AppLanguage, string> = {
    si: 'lang.si',
    ta: 'lang.ta',
    en: 'lang.en',
  };

  const pick = (lang: AppLanguage) => {
    setSelected(lang);
    void i18n.changeLanguage(lang);
    persistLanguage(lang);
  };

  const finish = () => {
    persistLanguage(selected);
    markSeen();
    onDone();
  };

  const skip = () => {
    markSeen();
    onDone();
  };

  return (
    <div className="langgate" role="dialog" aria-modal="true" aria-labelledby="langgate-title">
      <div className="langgate__card">
        <span className="langgate__leaf" aria-hidden="true">
          🌱
        </span>
        <h1 id="langgate-title" className="langgate__title">
          {t('lang.choose')}
        </h1>
        <p className="langgate__help">{t('lang.chooseHelp')}</p>

        <div className="langgate__opts" role="radiogroup" aria-label={t('lang.label')}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={selected === lang}
              lang={lang}
              className={`langgate__opt${selected === lang ? ' is-active' : ''}`}
              onClick={() => pick(lang)}
            >
              {t(fullLabelKey[lang])}
            </button>
          ))}
        </div>

        <button type="button" className="btn-primary" onClick={finish}>
          {t('lang.continue')}
        </button>
        <button type="button" className="btn-ghost" onClick={skip}>
          {t('lang.skip')}
        </button>
      </div>
    </div>
  );
}
