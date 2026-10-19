import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_KEY = 'evals-tutorial-ui:theme';

function parseTheme(value: string | null): ThemePreference | undefined {
  try {
    const preference: unknown = JSON.parse(value ?? 'null');
    if (preference === 'light' || preference === 'dark' || preference === 'system') return preference;
  } catch { /* Invalid saved preferences fall back to the device setting. */ }
  return undefined;
}

export function initialTheme(): ThemePreference {
  try { return parseTheme(window.localStorage.getItem(THEME_KEY)) ?? 'system'; }
  catch { return 'system'; }
}

export function saveTheme(preference: ThemePreference): boolean {
  try { window.localStorage.setItem(THEME_KEY, JSON.stringify(preference)); return true; }
  catch { return false; }
}

function deviceIsDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function watchDeviceTheme(onChange: (dark: boolean) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const changed = () => onChange(media.matches);
  changed();
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
}

function applyTheme(preference: ThemePreference, systemDark = deviceIsDark()): void {
  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/** Apply the saved appearance before React renders the first frame. */
export function initializeTheme(): void {
  applyTheme(initialTheme());
}

type Theme = { preference: ThemePreference; saved: boolean; setTheme(preference: ThemePreference): void };
const ThemeContext = createContext<Theme | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialTheme);
  const [systemDark, setSystemDark] = useState(deviceIsDark);
  const [saved, setSaved] = useState(true);

  useLayoutEffect(() => { applyTheme(preference, systemDark); }, [preference, systemDark]);

  useEffect(() => watchDeviceTheme(setSystemDark), []);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      const next = event.newValue === null ? 'system' : parseTheme(event.newValue);
      if (next) { setPreference(next); setSaved(true); }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  return <ThemeContext.Provider value={{ preference, saved, setTheme(next) {
    setPreference(next);
    setSaved(saveTheme(next));
  } }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required.');
  return context;
}
