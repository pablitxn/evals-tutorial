import test from 'node:test';
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
