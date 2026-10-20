import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { Dataset, Tutorial } from '@evals-tutorial/contracts';
import { SpecPreparation, SpecComparisonResults } from '../src/SpecRegression.js';
import { snapshot } from '../src/model.js';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Editor, ModeBadge, ReviewFeedback, RunResults } from '../src/components.js';
import { LanguageProvider, LanguageSelector } from '../src/i18n.js';
import type { Locale } from '../src/i18n-core.js';
import { dataset, review, run, source } from './mock-data.js';

function render(locale: Locale, content: ReactElement): string {
  const names = ['window', 'navigator'] as const;
  const before = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: () => JSON.stringify(locale) } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en-US'] } });
  try { return renderToStaticMarkup(createElement(LanguageProvider, { children: content })); }
  finally { names.forEach((name, index) => { if (before[index]) Object.defineProperty(globalThis, name, before[index]!); else Reflect.deleteProperty(globalThis, name); }); }
}

test('localized selector, badges, editor accessibility and diagnostics preserve executable source and raw diagnostics', () => {
  const props = { source, readOnly: false, busy: false, onChange() {}, editorRef: { current: null },
    diagnostics: [{ file: 'evaluator.ts', line: 2, column: 3, code: 'TS123', severity: 'error' as const, message: 'RAW_DIAGNOSTIC <untranslated>' }], onCopy() {} };
  const english = render('en', createElement(Editor, props));
  const spanish = render('es', createElement(Editor, props));
  assert.match(english, /Editable TypeScript evaluator/);
  assert.match(spanish, /Evaluador TypeScript editable/);
  assert.match(spanish, /TS123.*línea.*2.*columna.*3/);
  const fallbackSource = (html: string) => html.match(/<pre[^>]*>(.*?)<\/pre>/s)?.[1];
  const escapedSource = renderToStaticMarkup(createElement('pre', null, source)).slice(5, -6);
  assert.equal(fallbackSource(english), escapedSource);
  assert.equal(fallbackSource(spanish), escapedSource);
  assert.match(spanish, /RAW_DIAGNOSTIC &lt;untranslated&gt;/);
  assert.match(render('es', createElement(ModeBadge, { mode: 'Mixed' })), /Mixto/);
  const selector = render('es', createElement(LanguageSelector));
  assert.match(selector, /Idioma/); assert.match(selector, /role="combobox"[^>]*aria-label="Idioma"/);
  assert.match(selector, /class="dropdown-value" lang="es">Español<\/span>/);
});

test('localized run and review chrome preserves original data, errors, quotes, feedback and receipt binding', () => {
  const result = run();
  result.error = { code: 'runtime_error', message: 'RAW_RUNTIME_ERROR', retryable: false };
  const feedback = review(); feedback.feedbackLocale = 'en';
  feedback.assessment!.summary = 'ORIGINAL_ENGLISH_FEEDBACK';
  feedback.assessment!.findings = [{ criterionId: 'criterion', exampleIds: ['example-1'], evidence: 'EXACT_CODE_QUOTE', feedback: 'ORIGINAL_ADVICE', nextAction: 'ORIGINAL_NEXT_ACTION' }];
  const before = structuredClone({ result, feedback });
  const en = render('en', createElement(RunResults, { run: result, dataset: dataset(), current: true }));
  const es = render('es', createElement(RunResults, { run: result, dataset: dataset(), current: true }));
  assert.match(es, /Evaluación esperada/);
  assert.match(es, /Coincide/);
  assert.match(es, /runtime_error: RAW_RUNTIME_ERROR/);
  assert.equal(es.match(/<pre>(.*?)<\/pre>/s)?.[1], en.match(/<pre>(.*?)<\/pre>/s)?.[1]);
  const spanish = render('es', createElement(ReviewFeedback, { review: feedback, current: true, jumpToRow() {} }));
  assert.match(spanish, /Revisado — versión actual/);
  assert.match(spanish, /Idioma solicitado para los comentarios: Inglés/);
  for (const original of ['ORIGINAL_ENGLISH_FEEDBACK', 'EXACT_CODE_QUOTE', 'ORIGINAL_ADVICE', 'ORIGINAL_NEXT_ACTION', feedback.reviewId, feedback.binding.codeHash.slice(0, 10)]) assert.ok(spanish.includes(original));
  delete feedback.feedbackLocale;
  assert.match(render('es', createElement(ReviewFeedback, { review: feedback, current: true, jumpToRow() {} })), /No se registró el idioma/);
  feedback.feedbackLocale = 'en';
  assert.deepEqual({ result, feedback }, before);
});


test('guided example localizes its fixed requirement derivation and shows an honest unrun comparison', () => {
  const tutorial = JSON.parse(readFileSync(new URL('../../../content/tutorial.json', import.meta.url), 'utf8')) as Tutorial;
  const dataset = JSON.parse(readFileSync(new URL('../../../content/datasets/07-spec-regression-v1/1.0.0.json', import.meta.url), 'utf8')) as Dataset;
  const exercise = tutorial.exercises[7]!;
  const before = structuredClone(exercise);
  const datasetBefore = structuredClone(dataset);
  const preparation = render('es', createElement(SpecPreparation, { exercise, dataset }));
  const originalSummaries = [...new Set(dataset.examples.flatMap(example => Object.values(example.metadata.expectedByRequirement as Record<string, string>)))];
  assert.match(preparation, /2\. Inspecciona la derivación preparada/);
  assert.match(preparation, /«sin tasas» omite intencionadamente/);
  for (const title of ['Viaje habitual dentro del presupuesto', 'Tarifa accesible frente a tasas obligatorias elevadas', 'Ninguna opción dentro del presupuesto']) assert.ok(preparation.includes(title));
  for (const title of ['Routine trip within budget', 'Affordable fare versus high mandatory fees', 'No affordable option']) assert.ok(!preparation.includes(title));
  assert.equal(originalSummaries.length, 12);
  for (const summary of originalSummaries) assert.ok(!preparation.includes(summary), `Original English summary remains visible: ${summary}`);
  for (const criterion of exercise.criteria) assert.ok(preparation.includes(`id="requirement-${criterion.id}"`));
  const current = snapshot(tutorial, exercise, exercise.starterSource);
  const unrun = render('es', createElement(SpecComparisonResults, { current, codeHash: null, busy: false, retryRecording() {} }));
  assert.match(unrun, /Ejecuta ambas versiones explícitamente/);
  assert.match(unrun, /4\. Compara la evidencia de los requisitos/);
  assert.match(unrun, /Registro inmutable de ejecución.*Versión base/);
  assert.match(unrun, /Registro inmutable de ejecución.*Sin tasas obligatorias/);
  assert.doesNotMatch(unrun, /Regresión: pass/);
  assert.deepEqual(exercise, before);
  assert.deepEqual(dataset, datasetBefore);
});
