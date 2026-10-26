import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import bn from './locales/bn';

export function systemLanguage(): 'bn' | 'en' {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    return locale.toLowerCase().startsWith('bn') ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: systemLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyUiLanguage(setting: 'system' | 'bn' | 'en') {
  const lng = setting === 'system' ? systemLanguage() : setting;
  if (i18n.language !== lng) {
    i18n.changeLanguage(lng);
  }
}

/** Bangla digits for Bangla UI, so numbers read naturally. */
export function localizeDigits(text: string, lng = i18n.language): string {
  if (lng !== 'bn') {
    return text;
  }
  return text.replace(/[0-9]/g, d => String.fromCharCode(0x09e6 + Number(d)));
}

export default i18n;
