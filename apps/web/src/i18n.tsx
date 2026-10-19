import React, { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { initialLocale, isLocale, LOCALE_KEY, translate, type Locale, type Parameters } from './i18n-core.js';
import { save } from './storage.js';
import { Dropdown } from './Dropdown.js';
export { localizeLesson } from './i18n-core.js';

type I18n = { locale: Locale; setLocale(locale: Locale): void; t(key: string, parameters?: Parameters): string; saved: boolean };
const Context = createContext<I18n | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLanguage] = useState<Locale>(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage access can be denied. */ }
    return initialLocale(storage, navigator.languages ?? [navigator.language]);
  });
  const [saved, setSaved] = useState(true);
  useEffect(() => { document.documentElement.lang = locale; document.title = translate(locale, 'Evals tutorial'); }, [locale]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== LOCALE_KEY) return;
      try { const value: unknown = JSON.parse(event.newValue ?? 'null'); if (isLocale(value)) setLanguage(value); } catch { /* Ignore invalid external values. */ }
    };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, []);
  return <Context.Provider value={{ locale, saved, setLocale(value) { setLanguage(value); setSaved(save(LOCALE_KEY, value)); },
    t: (key, parameters) => translate(locale, key, parameters) }}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(Context);
  if (!context) throw new Error('LanguageProvider is required.');
  return context;
}

export function LanguageSelector() {
  const { locale, setLocale, t, saved } = useI18n();
  const id = useId();
  return <div className="language-control"><div className="language-control-row"><label htmlFor={id}>{t('Language')}</label>
    <Dropdown id={id} label={t('Language')} value={locale} onValueChange={value => { if (isLocale(value)) setLocale(value); }}
      options={[{ value: 'en', label: 'English', lang: 'en' }, { value: 'es', label: 'Español', lang: 'es' }]} />
  </div>{!saved && <p className="help" role="status">{t('Language preference could not be saved. This tab keeps your selection.')}</p>}</div>;
}
