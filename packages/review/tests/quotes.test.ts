import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '@evals-tutorial/contracts/node';
import { buildReviewPrompt, REVIEW_LIMITS, validateReviewAssessment } from '../src/index.js';
import { evidenceQuotes, QUOTE_LIMITS } from '../src/quotes.js';
import { assessment, brokerMaterial, sample } from './support.js';

test('quote catalog preserves original material and contains only exact source or correlated row slices', () => {
  const evidence = sample();
  const material = brokerMaterial(evidence);
  const before = structuredClone({ source: material.source, fixtureRun: material.fixtureRun, agentRun: material.agentRun });
  const data = JSON.parse(buildReviewPrompt(material, evidence.dataset)[1].content);
  assert.deepEqual({ source: data.source, fixtureRun: data.fixtureRun, agentRun: data.agentRun }, before);
  const quotes = evidenceQuotes(material);
  assert.deepEqual(data.evidenceQuotes, quotes);
  assert.deepEqual(quotes.map(item => item.id), quotes.map((_, index) => `quote-${index + 1}`));
  assert.deepEqual(new Set(quotes.map(item => item.kind)), new Set(['source', 'output', 'evaluation']));
  for (const item of quotes) {
    const rows = [material.fixtureRun, material.agentRun].flatMap(run => run.rows).filter(row => item.exampleIds.includes(row.exampleId));
    const originals = item.kind === 'source' ? [material.source] : item.kind === 'output'
      ? rows.map(row => canonicalJson(row.output ?? {}))
      : rows.flatMap(row => [canonicalJson(row.evaluation ?? {}), row.evaluation?.explanation ?? '']);
    assert(originals.some(text => text.includes(item.quote)), item.quote);
    assert(Array.from(item.quote.trim()).length >= 8);
  }
  assert.deepEqual({ source: material.source, fixtureRun: material.fixtureRun, agentRun: material.agentRun }, before);
});

test('large and Unicode material produces bounded choices from the beginning and end without reordering source', () => {
  const material = brokerMaterial();
  material.source = Array.from({ length: 1000 }, (_, n) => `const value${n} = "${'😀'.repeat(20)}";`).join('\r\n');
  material.agentRun.rows = Array.from({ length: 64 }, (_, n) => ({ exampleId: `example-${n}`, status: 'completed', output: { id: n, text: '🎓'.repeat(1000) },
    evaluation: { score: 1, label: 'pass', explanation: `example-${n}: ${'✓'.repeat(1000)}` } }));
  const quotes = evidenceQuotes(material);
  assert(quotes.length <= QUOTE_LIMITS.entries);
  assert(quotes.every(item => Array.from(item.quote).length <= QUOTE_LIMITS.characters));
  assert(quotes.reduce((sum, item) => sum + Buffer.byteLength(item.quote), 0) <= QUOTE_LIMITS.bytes);
  assert(quotes.some(item => item.quote.startsWith('const value0 =')));
  assert(quotes.some(item => item.quote.startsWith('const value999 =')));
  assert.deepEqual(new Set(quotes.map(item => item.kind)), new Set(['source', 'output', 'evaluation']));
  assert(quotes.filter(item => item.kind === 'source').every(item => material.source.includes(item.quote)));
  material.source = '😀'.repeat(7);
  assert(!evidenceQuotes(material).some(item => item.kind === 'source'));
});

test('quote selection keeps every evidence grounding and criterion coverage gate', () => {
  const material = brokerMaterial();
  const source = 'const actual = row.output.label;\r\nreturn actual === expected;\r';
  material.source = source;
  const selected = evidenceQuotes(material).find(item => item.kind === 'source' && item.quote.startsWith('return'))!;
  const valid = assessment(); valid.findings[0]!.evidence = selected.quote;
  assert.equal(validateReviewAssessment(valid, material).status, 'ready');
  for (const evidence of ['return expected === actual;', 'const actual = row.output.label;\nreturn actual === expected;']) {
    assert.throws(() => validateReviewAssessment({ ...valid, findings: [{ ...valid.findings[0]!, evidence }] }, material));
  }
  material.agentRun.rows.push({ exampleId: 'unrelated-example', status: 'completed', output: { distinctive: 'Evidence belonging only to this second example' },
    evaluation: { score: 0, label: 'fail', explanation: 'The second example is uniquely different.' } });
  const other = evidenceQuotes(material).find(item => item.kind === 'output' && item.exampleIds.includes('unrelated-example'))!;
  assert.throws(() => validateReviewAssessment({ ...valid, findings: [{ ...valid.findings[0]!, evidence: other.quote }] }, material));
  assert.equal(validateReviewAssessment({ ...valid, findings: [{ ...valid.findings[0]!, evidence: other.quote, exampleIds: ['unrelated-example'] }] }, material).status, 'ready');
  material.exercise.criteria.push({ id: 'uncovered', description: 'Still needs coverage.', mode: 'Code' });
  assert.throws(() => validateReviewAssessment(valid, material));
});

test('quote whitespace uses ECMAScript trimming consistently with the Python transport', () => {
  const material = brokerMaterial();
  for (const character of ['\u0085', '\u001c', '\u001d', '\u001e', '\u001f']) {
    material.source = '// abcd' + character;
    const selected = evidenceQuotes(material).find(item => item.kind === 'source')!;
    assert.equal(selected.quote, material.source);
    const value = assessment(); value.findings[0]!.evidence = selected.quote;
    assert.equal(validateReviewAssessment(value, material).status, 'ready');
  }
  for (const character of ['\ufeff', '\u00a0', '\u2028', '\u2029']) {
    material.source = '// abcd' + character;
    assert(!evidenceQuotes(material).some(item => item.kind === 'source'));
  }
});

test('catalog overhead is included in the input limit and never truncates original evidence', () => {
  const evidence = sample();
  evidence.agentRun.rows[0]!.output = { text: '' };
  const initial = JSON.parse(buildReviewPrompt(brokerMaterial(evidence), evidence.dataset)[1].content);
  delete initial.evidenceQuotes;
  const originalBytes = Buffer.byteLength(canonicalJson(initial));
  evidence.agentRun.rows[0]!.output = { text: 'a'.repeat(REVIEW_LIMITS.inputBytes - originalBytes - 16) };
  assert.throws(() => buildReviewPrompt(brokerMaterial(evidence), evidence.dataset), (error: any) => error.detail.code === 'resource_limit');
});
