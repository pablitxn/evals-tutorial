import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Tutorial } from '@evals-tutorial/contracts';
import { catalogs, initialLocale, localizeLesson, LOCALE_KEY, translate } from '../src/i18n-core.js';
import { resetStorage } from '../src/storage.js';

const tutorial = JSON.parse(readFileSync(new URL('../../../content/tutorial.json', import.meta.url), 'utf8')) as Tutorial;
const spanish = JSON.parse(readFileSync(new URL('../src/locales/lessons.es.json', import.meta.url), 'utf8'));
const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('English and Spanish UI catalogs have identical keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs.es).sort());
  for (const key of Object.keys(catalogs.en)) {
    assert.ok(translate('es', key).trim(), key);
    assert.deepEqual(placeholders(translate('es', key)), placeholders(key), key);
  }
});

test('all static UI translation calls exist in both catalogs', () => {
  for (const name of ['App.tsx', 'components.tsx', 'i18n.tsx', 'preferences.tsx', 'ProviderStatus.tsx', 'JsonViewer.tsx', 'EvaluationConcepts.tsx', 'SpecRegression.tsx']) {
    const file = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    const source = ts.createSourceFile(name, file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        assert.ok(Object.hasOwn(catalogs.en, node.arguments[0].text), `${name}: ${node.arguments[0].text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test('preference overrides browser languages; supported region languages and English fallback are sensible', () => {
  assert.equal(initialLocale({ getItem: () => '"en"' }, ['es-AR']), 'en');
  assert.equal(initialLocale({ getItem: () => '"es"' }, ['en-US']), 'es');
  for (const invalid of ['"fr"', '{}', 'invalid', 'null']) assert.equal(initialLocale({ getItem: () => invalid }, ['es-MX']), 'es');
  assert.equal(initialLocale(undefined, ['fr-FR', 'es-ES', 'en-US']), 'es');
  assert.equal(initialLocale(undefined, ['en-GB', 'es']), 'en');
  assert.equal(initialLocale(undefined, ['ja']), 'en');
  assert.equal(initialLocale({ getItem: () => { throw new Error('denied'); } }, ['es']), 'es');
});

test('interpolation preserves supplied IDs literally and unknown keys fall back safely', () => {
  assert.equal(translate('es', 'Review {status}.', { status: 'en curso' }), 'Revisión en curso.');
  assert.equal(translate('es', 'Synthetic source {id}. Open the document if an inline image preview is unavailable.', { id: '<script>$&{status}' }), 'Fuente sintética <script>$&{status}. Abre el documento si no se puede mostrar la imagen aquí.');
  assert.equal(translate('es', 'unknown-key'), 'unknown-key');
  assert.equal(translate('es', 'constructor'), 'constructor');
  const es = catalogs.es as Record<string, string>;
  const saved = es['Validate']; delete es['Validate'];
  try { assert.equal(translate('es', 'Validate'), 'Validate'); } finally { es['Validate'] = saved!; }
  assert.equal(translate('es', 'Review {status}.'), 'Revisión {status}.');
});

test('eight Spanish lessons cover the original criterion IDs without modifying code, data or rubric identity', () => {
  assert.equal(tutorial.exercises.length, 8);
  assert.equal(tutorial.exercises.filter(exercise => !exercise.readOnly).length, 6);
  const before = structuredClone(tutorial);
  assert.deepEqual(Object.keys(spanish).sort(), tutorial.exercises.map(exercise => exercise.id).sort());
  for (const exercise of tutorial.exercises) {
    assert.deepEqual(Object.keys(spanish[exercise.id].criteria).sort(), exercise.criteria.map(criterion => criterion.id).sort());
    const localized = localizeLesson(exercise, 'es');
    assert.notEqual(localized.title, exercise.title);
    assert.ok(localized.lessonMarkdown.trim());
    assert.deepEqual(localized.criteria.map(c => [c.id, c.mode]), exercise.criteria.map(c => [c.id, c.mode]));
    assert.equal(localizeLesson(exercise, 'en'), exercise);
    assert.equal(localizeLesson({ ...exercise, exerciseVersion: 'future' }, 'es').lessonMarkdown, exercise.lessonMarkdown);
    assert.equal(localizeLesson({ ...exercise, rubricVersion: 'future' }, 'es').lessonMarkdown, exercise.lessonMarkdown);
  }
  assert.deepEqual(tutorial, before);
  const tie = localizeLesson(tutorial.exercises[3]!, 'es').lessonMarkdown;
  for (const token of ['W2', '1040', '4200000', '1850000', '6050000', '420000', '185000', '605000', 'null']) assert.ok(tie.includes(token), token);
});

test('tutorial reset retains language preference and other apps storage', () => {
  const values = { [LOCALE_KEY]: '"es"', 'evals-tutorial:1:01-starred-classifier:1': '{}', 'other-app': 'keep' };
  const storage = Object.assign(values, { removeItem(key: string) { delete (values as Record<string, unknown>)[key]; } });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    assert.equal(resetStorage(), true);
    assert.equal(values[LOCALE_KEY], '"es"');
    assert.equal(values['other-app'], 'keep');
    assert.equal(Object.hasOwn(values, 'evals-tutorial:1:01-starred-classifier:1'), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
