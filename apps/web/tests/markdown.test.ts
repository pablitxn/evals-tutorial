import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../src/Markdown.js';
import { LessonText, ReviewFeedback, RunResults } from '../src/components.js';
import { LanguageProvider } from '../src/i18n.js';
import { dataset, review, run } from './mock-data.js';

function render(text: string): string {
  return renderToStaticMarkup(createElement(Markdown, { text }));
}

function localized(content: ReactElement): string {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: () => '"en"' } } });
  try { return renderToStaticMarkup(createElement(LanguageProvider, { children: content })); }
  finally { if (before) Object.defineProperty(globalThis, 'window', before); else Reflect.deleteProperty(globalThis, 'window'); }
}

test('lesson prose renders nested Markdown, fenced code and GFM without losing structure', () => {
  const text = '# Heading\n\nPress **Run Demo** and inspect *one row*.\n\n1. First\n   - Nested `label`\n2. Second\n\n> Compare independently.\n\n```ts\nconst label = "**literal**";\n```\n\n| Expected | Actual |\n| --- | --- |\n| pass | fail |\n\n- [x] Read\n- [ ] Review\n\n~~Old advice~~';
  const html = renderToStaticMarkup(createElement(LessonText, { text }));
  for (const pattern of [/<h1>Heading<\/h1>/, /<strong>Run Demo<\/strong>/, /<em>one row<\/em>/,
    /<ol>[\s\S]*<ul>[\s\S]*<code>label<\/code>[\s\S]*<\/ul>[\s\S]*<\/ol>/,
    /<blockquote>/, /<pre><code class="language-ts">const label = &quot;\*\*literal\*\*&quot;;/,
    /class="markdown-table-scroll"/, /<table>/, /<th>Expected<\/th>/, /type="checkbox" disabled="" checked=""/,
    /<del>Old advice<\/del>/]) assert.match(html, pattern);
});

test('Markdown treats raw HTML as text and rejects unsafe, credential-bearing and relative URLs', () => {
  const text = '<script>alert("unsafe")</script>\n\n<img src="https://example.test/pixel" onerror="alert(1)">\n\n' +
    '[script](javascript:alert%281%29) [encoded](jav&#x61;script:alert%281%29) [data](data:text/html;base64,PHNjcmlwdD4=) ' +
    '[file](file:///etc/passwd) [mail](mailto:person@example.test) [credentials](https://user:pass@example.test/) ' +
    '[relative](/api/runs) [network](//example.test/path)';
  const html = render(text);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=/);
  assert.doesNotMatch(html, /<(script|img|iframe|object)\b/);
  assert.doesNotMatch(html, /<a\b/);
  for (const label of ['script', 'encoded', 'data', 'file', 'mail', 'credentials', 'relative', 'network']) assert.match(html, new RegExp(`<span>${label}</span>`));
});

test('links are explicit and safe, while Markdown images never load media automatically', () => {
  const html = render('[Docs](https://example.test/docs) [Local](http://127.0.0.1:6006/)\n\n![A chart](https://example.test/pixel?secret=synthetic) ![Blocked](data:image/svg+xml,svg)\n\nA note.[^one]\n\n[^one]: Footnote.');
  assert.match(html, /href="https:\/\/example.test\/docs" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:6006\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /class="markdown-image-link" href="https:\/\/example.test\/pixel\?secret=synthetic"[^>]*>A chart<\/a>/);
  assert.match(html, /<span class="markdown-image-link">Blocked<\/span>/);
  assert.match(html, /href="#user-content-fn-one"/);
  assert.doesNotMatch(html, /<(img|link|video|audio|iframe)\b/);
});

test('review prose is formatted while quoted evidence remains exact and records stay immutable', () => {
  const feedback = review();
  feedback.assessment!.summary = '**One finding**';
  feedback.assessment!.findings = [{ criterionId: 'criterion', exampleIds: ['example-1'],
    evidence: '**exact quote**\n<script>literal</script>', feedback: 'Inspect `row.output`.', nextAction: '- Compare the reference\n- Retest' }];
  const original = structuredClone(feedback);
  const html = localized(createElement(ReviewFeedback, { review: feedback, current: true, jumpToRow() {} }));
  assert.match(html, /<strong>One finding<\/strong>/);
  assert.match(html, /Inspect <code>row\.output<\/code>/);
  assert.match(html, /<li>Compare the reference<\/li>/);
  assert.match(html, /class="evidence-quote"><strong>Evidence: <\/strong>\*\*exact quote\*\*\n&lt;script&gt;literal&lt;\/script&gt;<\/p>/);
  assert.deepEqual(feedback, original);
});

test('formatted evaluator explanations retain raw JSON inspection and literal diagnostics and rationale', () => {
  const result = run();
  const data = dataset();
  result.rows[0]!.evaluation!.explanation = '**Mismatch** in `label`.';
  result.rows[0]!.error = { code: 'runtime_error', message: '**RAW_DIAGNOSTIC** <script>', retryable: false };
  data.examples[0]!.fixtures[0]!.rationale = '**EXACT_RATIONALE**';
  const original = structuredClone({ result, data });
  const html = localized(createElement(RunResults, { run: result, dataset: data, current: true }));
  assert.match(html, /<strong>Mismatch<\/strong> in <code>label<\/code>/);
  const rawEvaluation = html.match(/<section[^>]+aria-label="Evaluation">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(rawEvaluation, 'The complete evaluation remains available in the JSON tree.');
  assert.match(rawEvaluation.replace(/<[^>]*>/g, ''), /&quot;explanation&quot;:\s*&quot;\*\*Mismatch\*\* in `label`\.&quot;/);
  assert.doesNotMatch(rawEvaluation, /<strong>Mismatch<\/strong>|<code>label<\/code>/);
  assert.match(html, /runtime_error: \*\*RAW_DIAGNOSTIC\*\* &lt;script&gt;/);
  assert.match(html, /class="evidence-quote">\*\*EXACT_RATIONALE\*\*<\/p>/);
  assert.deepEqual({ result, data }, original);
});
