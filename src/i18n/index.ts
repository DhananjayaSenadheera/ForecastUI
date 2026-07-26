// i18n bootstrap. Sinhala and Tamil are first-class and English is the fallback; the si/ta
// resources are drafts pending native-speaker review (see each locale file's _note).
// TEXT EXPANSION: Sinhala/Tamil labels run ~20–40% longer than English, so labels must be
// allowed to wrap and grow in height — never a fixed-height overflow:hidden box, which
// clips Sinhala ascenders and Tamil vowel marks.
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

/**
 * TRUE only when `key` exists in the ACTIVE locale's OWN resource bundle — a real
 * translation, not the English fallback.
 * `i18n.exists()` and `t()` both walk fallbackLng, so an English-only key reports as
 * "existing" while the active language is Sinhala, which is how a Sinhala farmer ends up
 * reading an English paragraph. Any string shipped English-first MUST be gated on this so
 * the UI can degrade to a rendering the locale really has.
 * Empty strings count as MISSING on purpose: a blank key is a stub, not a translation.
 */
export function ownTranslation(key: string, lng?: string): string | undefined {
  const lang = lng ?? i18n.resolvedLanguage ?? i18n.language;
  if (!lang) return undefined;
  const value = i18n.getResource(lang, 'translation', key);
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Boolean form of {@link ownTranslation} — the usual gate. */
export function hasOwnTranslation(key: string, lng?: string): boolean {
  return ownTranslation(key, lng) !== undefined;
}

export default i18n;
