// AgriForecast i18n bootstrap (FE-2).
// Trilingual from day one — Sinhala/Tamil are first-class, English is the fallback
// (PRD §2.1: computer literacy skews to Sinhala/Tamil speakers). si/ta resources
// are DRAFTS pending native-speaker review (see each locale file's _note).
//
// TEXT-EXPANSION RULE: Sinhala/Tamil labels run ~20–40% longer than English.
// Components must let labels WRAP and grow in height — never a fixed-height
// overflow:hidden box (clips Sinhala ascenders / Tamil vowel marks). Enforced in
// base.css; documented here so it is not "styled away" later.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import si from './locales/si.json';
import ta from './locales/ta.json';

export const SUPPORTED_LANGUAGES = ['si', 'ta', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'agriforecast.lang';

export function getStoredLanguage(): AppLanguage | null {
  try {
    const v = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(v as AppLanguage) ? (v as AppLanguage) : null;
  } catch {
    return null;
  }
}

export function persistLanguage(lang: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* private mode / storage disabled — non-fatal, language just won't persist */
  }
  document.documentElement.lang = lang; // drives :lang(ta) line-height + a11y
}

const initialLang: AppLanguage = getStoredLanguage() ?? 'en';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    si: { translation: si },
    ta: { translation: ta },
  },
  lng: initialLang,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

document.documentElement.lang = initialLang;

export default i18n;
