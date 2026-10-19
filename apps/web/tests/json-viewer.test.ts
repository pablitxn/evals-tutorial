import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type KeyboardEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { activateJsonToggle, JsonViewer } from '../src/JsonViewer.js';
import { LanguageProvider } from '../src/i18n.js';

function render(value: unknown, options: { initialDepth?: number; compact?: boolean; locale?: 'en' | 'es' } = {}): string {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: () => JSON.stringify(options.locale ?? 'en') } } });
  try {
    return renderToStaticMarkup(createElement(LanguageProvider, { children: createElement(JsonViewer, {
      value, label: 'Dataset JSON', initialDepth: options.initialDepth, compact: options.compact,
    }) }));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('JSON tree preserves complete immutable evidence, escaped strings, types and insertion order', () => {
  const longString = 'a'.repeat(5000) + '\n"quoted"\t<script>literal</script>\\';
  const value = Object.freeze({ second: Object.freeze([true, false, null, 0, 42.25]), first: longString, empty: Object.freeze({}) });
  const original = JSON.stringify(value);
  const html = render(value, { initialDepth: 4 });
  assert.match(html, /role="tree"/);
  assert.match(html, /role="treeitem" aria-expanded="true"/);
  assert.match(html, /class="json-tree-number">42\.25<\/span>/);
  assert.match(html, /class="json-tree-boolean">false<\/span>/);
  assert.match(html, /class="json-tree-null">null<\/span>/);
  assert.ok(html.includes('a'.repeat(5000)));
  assert.match(html, /\\n\\&quot;quoted\\&quot;\\t&lt;script&gt;literal&lt;\/script&gt;\\\\&quot;/);
  assert.ok(html.indexOf('&quot;second&quot;:') < html.indexOf('&quot;first&quot;:'));
  assert.doesNotMatch(html, /<(input|textarea|script|img)\b|contenteditable=/i);
  assert.equal(JSON.stringify(value), original);
});

test('JSON retains accessible branch toggles without global expand or collapse controls', () => {
  const collapsed = render({ nested: { value: 'hidden-until-expanded' } }, { initialDepth: 0 });
  const expanded = render({ nested: { value: 'hidden-until-expanded' } }, { initialDepth: 3 });
  for (const html of [collapsed, expanded, render({ nested: {} }, { compact: true })]) {
    assert.doesNotMatch(html, /<button\b|>Expand all<|>Collapse all</);
    assert.match(html, /class="json-viewer-title"/);
  }
  assert.match(collapsed, /role="button" aria-label="Expand JSON" aria-expanded="false" tabindex="0"/);
  assert.doesNotMatch(collapsed, /hidden-until-expanded/);
  assert.match(expanded, /hidden-until-expanded/);
  assert.match(expanded, /role="button" aria-label="Collapse JSON" aria-expanded="true"/);
});

test('JSON primitives and empty objects stay literal without branch toggles', () => {
  for (const value of [null, true, 0, '<script>text</script>', {}, []]) {
    const html = render(value, { compact: true });
    assert.match(html, /json-viewer-compact/);
    assert.doesNotMatch(html, /role="button"|<button\b|<script>/);
  }
  assert.match(render(null), /class="json-viewer-primitive">null<\/pre>/);
  assert.match(render('**literal**'), /&quot;\*\*literal\*\*&quot;/);
});

test('Enter and Space activate library expanders while arrows retain native tree navigation', () => {
  for (const key of ['Enter', ' ', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'Tab']) {
    let clicks = 0; let prevented = false; let stopped = false;
    const event = { key, target: { getAttribute: () => 'button', click: () => { clicks += 1; } },
      preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } } as unknown as KeyboardEvent<HTMLDivElement>;
    activateJsonToggle(event);
    const activation = key === 'Enter' || key === ' ';
    assert.equal(clicks, activation ? 1 : 0, key);
    assert.equal(prevented, activation, key);
    assert.equal(stopped, activation, key);
  }
  let activated = false;
  activateJsonToggle({ key: 'Enter', target: { getAttribute: () => 'tree', click: () => { activated = true; } },
    preventDefault() { throw new Error('Tree text must not consume Enter'); },
    stopPropagation() { throw new Error('Tree text must not consume Enter'); } } as unknown as KeyboardEvent<HTMLDivElement>);
  assert.equal(activated, false);
});
