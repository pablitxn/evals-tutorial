import { useEffect, useId, useRef, useState } from 'react';
import { LanguageSelector, useI18n } from './i18n.js';
import { useTheme, type ThemePreference } from './theme.js';
import './preferences.css';

const sections = [
  { id: 'appearance', label: 'Appearance', path: 'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 0v18' },
  { id: 'language', label: 'Language', path: 'm3 5 12 0M9 3v2m-4 0c0 5 3 8 8 10M13 5c0 5-3 8-8 10m10 6 4-10 4 10m-6.8-3h5.6' },
] as const;

function Icon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

export function Preferences({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const { preference, setTheme, saved } = useTheme();
  const [section, setSection] = useState<(typeof sections)[number]['id']>('appearance');
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const backdropPointer = useRef(false);
  const id = useId();

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (element && !element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="preferences-dialog" aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      backdropPointer.current = event.target === event.currentTarget &&
        (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    }}
    onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (backdropPointer.current && event.target === event.currentTarget &&
        (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose();
      backdropPointer.current = false;
    }}>
    <header className="preferences-heading">
      <h2 id={`${id}-title`}>{t('Preferences')}</h2>
      <button type="button" className="preferences-close" aria-label={t('Close preferences')} onClick={onClose} autoFocus>
        <Icon path="m6 6 12 12M18 6 6 18" />
      </button>
    </header>
    <div className="preferences-layout">
      <nav className="preferences-nav" aria-label={t('Preferences sections')}>
        {sections.map(item => <button key={item.id} type="button" aria-current={section === item.id ? 'page' : undefined}
          aria-controls={`${id}-content`} onClick={() => { setSection(item.id); content.current?.scrollTo(0, 0); }}>
          <Icon path={item.path} /><span>{t(item.label)}</span>
        </button>)}
      </nav>
      <div className="preferences-content" id={`${id}-content`} ref={content}>
        {section === 'appearance' ? <section aria-labelledby={`${id}-appearance`}>
          <h3 id={`${id}-appearance`}>{t('Appearance')}</h3>
          <fieldset className="theme-choices">
            <legend>{t('Theme')}</legend>
            {([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as const).map(([value, label]) =>
              <label className="theme-choice" key={value}>
                <input type="radio" name={`${id}-theme`} value={value} checked={preference === value}
                  onChange={() => setTheme(value as ThemePreference)} />
                <span className={`theme-preview theme-preview-${value}`} aria-hidden="true">
                  <span className="theme-preview-window"><span className="theme-preview-sidebar" /><span className="theme-preview-lines"><i /><i /><i /></span></span>
                </span>
                <span className="theme-choice-label"><span>{t(label)}</span><span className="theme-check" aria-hidden="true"><Icon path="m5 12 4 4L19 6" /></span></span>
              </label>)}
          </fieldset>
          {preference === 'system' && <p className="preferences-hint">{t("Match your device's appearance automatically.")}</p>}
          {!saved && <p className="preferences-storage-notice" role="status">{t('Theme preference could not be saved. This tab keeps your selection.')}</p>}
        </section> : <section aria-labelledby={`${id}-language`}>
          <h3 id={`${id}-language`}>{t('Language')}</h3>
          <div className="preferences-language"><LanguageSelector /></div>
        </section>}
      </div>
    </div>
  </dialog>;
}
