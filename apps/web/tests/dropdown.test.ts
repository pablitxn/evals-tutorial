import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dropdown } from '../src/Dropdown.js';

test('choice fields expose their localized name and selected text before browser effects', () => {
  const html = renderToStaticMarkup(createElement(Dropdown, {
    id: 'language', label: 'Idioma', value: 'es', onValueChange() {},
    options: [{ value: 'en', label: 'English', lang: 'en' }, { value: 'es', label: 'Español', lang: 'es' }],
  }));
  assert.match(html, /<button[^>]*role="combobox"[^>]*aria-expanded="false"[^>]*id="language"[^>]*aria-label="Idioma"/);
  assert.match(html, /class="dropdown-value" lang="es">Español<\/span>/);
  assert.doesNotMatch(html, /role="listbox"/);
});

test('disabled fields retain explanatory association and escape option text', () => {
  const html = renderToStaticMarkup(createElement(Dropdown, {
    label: 'Prepared agent variant', describedBy: 'variant-help', disabled: true,
    value: 'baseline', onValueChange() {}, options: [{ value: 'baseline', label: '<script>not executable</script>' }],
  }));
  assert.match(html, /<button[^>]*disabled=""/);
  assert.match(html, /aria-describedby="variant-help"/);
  assert.match(html, /&lt;script&gt;not executable&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
