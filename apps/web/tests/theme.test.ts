import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTheme, initializeTheme, saveTheme, THEME_KEY, watchDeviceTheme } from '../src/theme.js';
import { resetStorage } from '../src/storage.js';

function withBrowser(run: (browser: {
  values: Record<string, string>;
  root: { dataset: { theme?: string }; style: { colorScheme?: string } };
  media: { matches: boolean };
  listeners: Set<() => void>;
  denyStorage(): void;
}) => void) {
  const names = ['window', 'document', 'localStorage'] as const;
  const before = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const values: Record<string, string> = {};
  const storage = new Proxy(values, { get(target, key) {
    if (key === 'getItem') return (name: string) => target[name] ?? null;
    if (key === 'setItem') return (name: string, value: string) => { target[name] = value; };
    if (key === 'removeItem') return (name: string) => { delete target[name]; };
    return target[key as string];
  } });
  const root = { dataset: {} as { theme?: string }, style: {} as { colorScheme?: string } };
  const listeners = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener(_name: string, listener: () => void) { listeners.add(listener); },
    removeEventListener(_name: string, listener: () => void) { listeners.delete(listener); },
  };
  const browserWindow = { localStorage: storage, matchMedia: () => media };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: root } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    run({ values, root, media, listeners, denyStorage() {
      Object.defineProperty(browserWindow, 'localStorage', { get() { throw new Error('Storage access denied'); } });
    } });
  } finally {
    names.forEach((name, index) => {
      if (before[index]) Object.defineProperty(globalThis, name, before[index]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

test('appearance follows the device by default, while explicit preferences override it before render', () => {
  withBrowser(({ root, media, values }) => {
    assert.equal(initialTheme(), 'system');
    initializeTheme();
    assert.equal(root.dataset.theme, 'light');
    assert.equal(root.style.colorScheme, 'light');
    media.matches = true;
    initializeTheme();
    assert.equal(root.dataset.theme, 'dark');
    values[THEME_KEY] = '"light"';
    initializeTheme();
    assert.equal(root.dataset.theme, 'light');
    values[THEME_KEY] = '"dark"';
    media.matches = false;
    initializeTheme();
    assert.equal(root.dataset.theme, 'dark');
    values[THEME_KEY] = '"system"';
    initializeTheme();
    assert.equal(root.dataset.theme, 'light');
  });
});

test('invalid and denied storage preserve a usable device-based theme and expose save failures', () => {
  withBrowser(({ values, media, root, denyStorage }) => {
    media.matches = true;
    for (const invalid of ['not-json', 'null', '"unexpected"', '{}']) {
      values[THEME_KEY] = invalid;
      assert.equal(initialTheme(), 'system');
      initializeTheme();
      assert.equal(root.dataset.theme, 'dark');
    }
    assert.equal(saveTheme('light'), true);
    assert.equal(values[THEME_KEY], '"light"');
    denyStorage();
    assert.equal(initialTheme(), 'system');
    assert.equal(saveTheme('dark'), false);
    assert.doesNotThrow(initializeTheme);
    assert.equal(root.dataset.theme, 'dark');
  });
});

test('device appearance subscription reports changes and releases its listener', () => {
  withBrowser(({ media, listeners }) => {
    const observed: boolean[] = [];
    const unsubscribe = watchDeviceTheme(dark => observed.push(dark));
    assert.deepEqual(observed, [false]);
    assert.equal(listeners.size, 1);
    media.matches = true;
    for (const listener of listeners) listener();
    assert.deepEqual(observed, [false, true]);
    unsubscribe();
    assert.equal(listeners.size, 0);
  });
});

test('resetting tutorial work preserves appearance and locale preferences', () => {
  withBrowser(({ values }) => {
    saveTheme('dark');
    values['evals-tutorial:locale'] = '"es"';
    values['evals-tutorial:1.0.0:01-starred-messages:1.0.0'] = '{"source":"saved evaluator"}';
    assert.equal(resetStorage(), true);
    assert.deepEqual(values, { [THEME_KEY]: '"dark"', 'evals-tutorial:locale': '"es"' });
  });
});
