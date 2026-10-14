/** Trusted authoring checks; never execute learner source or call a model. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContentService } from '../../apps/server/src/http/content.js';
import { validateDomain, assertContract, type Dataset, type Exercise, type Example, type Fixture } from '@evals-tutorial/contracts';
import { sha256, datasetHash } from '@evals-tutorial/contracts/node';
const root = resolve(import.meta.dirname, '..');
const setEqual = (a: unknown[], b: unknown[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) && new Set(a).size === a.length;
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function codeVerdict(id: string, example: Example, fixture: Fixture): boolean {
  const input = example.input as any, actual = fixture.output as any, reference = example.expected as any;
  if (id === 'intro' || id === '01-starred-classifier') {
    const label = input.starred ? 'starred' : 'not_starred';
    assert.equal(reference.label, label);
    return actual.label === label;
  }
  if (id === '02-document-classification') return same(actual, reference);
  if (id === '03-independent-tie-out') {
    const expectedReadings = [...reference.readings].sort((a, b) => a.documentId.localeCompare(b.documentId));
    const actualReadings = [...actual.readings].sort((a, b) => a.documentId.localeCompare(b.documentId));
    if (!same(actualReadings, expectedReadings) || actual.currency !== 'USD') return false;
    for (const [field, criterion] of [['wagesCents', 'wages'], ['withholdingCents', 'withholding']]) {
      const form = expectedReadings.find(r => r.formType === '1040');
      const wages = expectedReadings.filter(r => r.formType === 'W2');
      const unknown = expectedReadings.some(r => r.status === 'unreadable');
      const sum = unknown ? null : wages.reduce((total, r) => total + r[field], 0);
      const delta = sum === null ? null : sum - form[field];
      const verdict = delta === null ? 'indeterminate' : delta === 0 ? 'match' : 'mismatch';
      assert.equal(reference[criterion].w2SumCents, sum);
      assert.equal(reference[criterion].form1040Cents, form[field]);
      assert.equal(reference[criterion].deltaCents, delta);
      assert.equal(reference[criterion].verdict, verdict);
      for (const key of ['w2SumCents', 'form1040Cents', 'deltaCents', 'verdict']) {
        if (actual[criterion][key] !== reference[criterion][key]) return false;
      }
      if (!setEqual(actual[criterion].documentIds, reference[criterion].documentIds)) return false;
    }
    return true;
  }
  if (id === '05-package-readiness') {
    const missing = input.requiredDocumentIds.filter((id: string) => !input.presentDocumentIds.includes(id));
    const discrepancies = [...input.unresolvedDiscrepancyIds];
    if (input.humanApproval === 'rejected') discrepancies.push('approval-rejected');
    const status = missing.length ? 'incomplete' : discrepancies.length ? 'needs_reconciliation'
      : input.humanApproval === 'approved' ? 'approved' : 'ready_for_review';
    assert.equal(reference.status, status);
    assert.ok(setEqual(reference.missingDocumentIds, missing));
    assert.ok(setEqual(reference.unresolvedDiscrepancyIds, discrepancies));
    return actual.packageId === input.packageId && actual.status === status && actual.humanApproval === input.humanApproval
      && actual.transmission === 'not_sent' && setEqual(actual.missingDocumentIds, missing)
      && setEqual(actual.unresolvedDiscrepancyIds, discrepancies);
  }
  if (id === '06-simulated-travel') {
    const eligible = input.options.filter((o: any) => o.origin === input.origin && o.destination === input.destination
      && o.currency === input.currency && o.departDate === input.departDate && o.returnDate === input.returnDate
      && o.returnDate > o.departDate && o.fareCents + o.feesCents <= input.budgetCents);
    assert.ok(setEqual(reference.eligibleOptionIds, eligible.map((o: any) => o.id)));
    assert.ok(same(reference.totalsCents, Object.fromEntries(input.options.map((o: any) => [o.id, o.fareCents + o.feesCents]))));
    if (!actual.simulated || actual.booked || actual.currency !== 'USD') return false;
    if (!eligible.length) return actual.status === 'no_options'
      && [actual.optionId, actual.departDate, actual.returnDate, actual.totalCents].every(v => v === null);
    const selected = eligible.find((o: any) => o.id === actual.optionId);
    return actual.status === 'recommendation' && selected !== undefined && actual.departDate === selected.departDate
      && actual.returnDate === selected.returnDate && actual.totalCents === selected.fareCents + selected.feesCents;
  }
  throw new Error('No deterministic oracle for response-judge quality');
}
function policyEvidence(row: Example, fixture: Fixture): boolean {
  const input = row.input as any, actual = fixture.output as any, reference = row.expected as any;
  return actual.citations.length > 0 && new Set(actual.citations.map((c: any) => c.clauseId)).size === actual.citations.length
    && actual.citations.every((c: any) => input.policy.some((p: any) => p.id === c.clauseId && p.text === c.quote))
    && new Set(actual.evidenceIds).size === actual.evidenceIds.length
    && actual.evidenceIds.every((id: string) => input.facts.some((fact: any) => fact.id === id))
    && reference.requiredClauseIds.every((id: string) => actual.citations.some((c: any) => c.clauseId === id))
    && reference.requiredEvidenceIds.every((id: string) => actual.evidenceIds.includes(id));
}

test('actual content envelopes, domain schemas, shared manifest and discriminating code fixtures', async () => {
  const service = await createContentService(root);
  const tutorial = await service.tutorial();
  assert.equal(tutorial.exercises.length, 7);
  let codeFixtures = 0, judgeFixtures = 0, policyGateFailures = 0;
  const ids = new Set<string>();
  for (const exercise of tutorial.exercises) {
    const data = await service.dataset(exercise.id);
    assert.equal(datasetHash(data), data.contentHash);
    const criteria = new Set(exercise.criteria.map(c => c.id));
    let passes = 0, fails = 0;
    for (const row of data.examples) {
      assertContract('Example', row);
      assert.ok(validateDomain(exercise.inputSchema, row.input).valid);
      assert.ok(validateDomain(exercise.expectedSchema, row.expected).valid);
      assert.ok(!['expected', 'fixtures', 'source', 'reference'].some(k => k in row.input));
      for (const fixture of row.fixtures) {
        assert.ok(!ids.has(fixture.id), fixture.id); ids.add(fixture.id);
        assert.ok(validateDomain(exercise.outputSchema, fixture.output).valid, fixture.id);
        assert.ok(criteria.has(fixture.expectedEvaluation.requiredEvidence[0]!), fixture.id);
        assert.ok(fixture.expectedEvaluation.minScore <= fixture.expectedEvaluation.maxScore);
        if (exercise.mode === 'Mixed') {
          if (!policyEvidence(row, fixture)) {
            assert.deepEqual(fixture.expectedEvaluation.allowedLabels, ['fail']);
            assert.equal(fixture.expectedEvaluation.maxScore, 0);
            policyGateFailures++;
          } else judgeFixtures++;
          continue; // Semantic judge calibration requires a real provider; no fake pass.
        }
        const pass = codeVerdict(exercise.id, row, fixture);
        assert.deepEqual(fixture.expectedEvaluation.allowedLabels, [pass ? 'pass' : 'fail'], fixture.id);
        assert.equal(fixture.expectedEvaluation.minScore, pass ? 1 : 0, fixture.id);
        assert.equal(fixture.expectedEvaluation.maxScore, pass ? 1 : 0, fixture.id);
        if (pass) passes++; else fails++;
        codeFixtures++;
      }
    }
    if (!exercise.readOnly && exercise.mode === 'Code') assert.ok(passes > 0 && fails > 0, exercise.id);
    assert.equal(exercise.readOnly, exercise.id === 'intro');
    if (exercise.mode === 'Code') assert.equal(exercise.maxJudgeCallsPerRow, 0);
  }
  assert.equal(codeFixtures, 50); // 49 practical Code fixtures plus one read-only intro.
  assert.equal(judgeFixtures, 7);
  assert.equal(policyGateFailures, 3);
  assert.equal(ids.size, 60);
  const a = await service.dataset('02-document-classification');
  const b = await service.dataset('03-independent-tie-out');
  assert.deepEqual(a.documentManifestRef, b.documentManifestRef);
  const manifest = JSON.parse(await readFile(join(root, a.documentManifestRef!.path), 'utf8'));
  assert.equal(manifest.documents.length, 18);
  for (const document of manifest.documents) {
    const { bytes, mimeType } = await service.document(document.id);
    assert.equal(sha256(bytes), document.sha256);
    assert.equal(bytes.length, document.bytes);
    assert.equal(mimeType, document.mimeType);
    if (mimeType === 'image/png') assert.equal(Buffer.from(bytes).subarray(1, 4).toString(), 'PNG');
    else assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF');
  }
});

test('boundary probes reject malformed shapes rather than grading them as semantic failures', async () => {
  const service = await createContentService(root);
  const probes = JSON.parse(await readFile(join(root, 'authoring/schema-probes.json'), 'utf8'));
  for (const probe of probes) {
    const exercise = await service.exercise(probe.exerciseId);
    const schema = exercise[probe.target as 'inputSchema' | 'outputSchema' | 'expectedSchema'];
    assert.equal(validateDomain(schema, probe.value).valid, probe.valid, probe.exerciseId);
  }
});

test('content loader detects tampered reference, fixture and actual document bytes', async () => {
  const copyRoot = await mkdtemp(join(tmpdir(), 'et-wp04-'));
  try {
    await cp(root, copyRoot, { recursive: true });
    const service = await createContentService(copyRoot);
    const datasetPath = join(copyRoot, 'datasets/01-starred-classifier-v1/1.0.0.json');
    const original = await readFile(datasetPath, 'utf8');
    const data = JSON.parse(original) as Dataset;
    data.examples[0]!.fixtures[0]!.output.label = 'not_starred';
    await writeFile(datasetPath, JSON.stringify(data));
    await assert.rejects(createContentService(copyRoot), /hash mismatch/);
    await writeFile(datasetPath, original);
    await writeFile(join(copyRoot, 'documents/tax-demo-v1/TD-001.png'), 'tampered');
    await assert.rejects(service.document('TD-001'), /changed after snapshot/);
    await assert.rejects(createContentService(copyRoot), /byte\/hash mismatch/);
  } finally { await rm(copyRoot, { recursive: true, force: true }); }
});

test('independent visual authoring ledger agrees with reference readings and each dataset', async () => {
  const recipe = JSON.parse(await readFile(join(root, 'authoring/page-recipe.json'), 'utf8'));
  const truth = JSON.parse(await readFile(join(root, 'documents/tax-demo-v1/ground-truth.json'), 'utf8'));
  const cents = (text: string) => {
    assert.match(text, /^\d+\.\d{2}$/);
    const [dollars, minor] = text.split('.');
    return Number(dollars) * 100 + Number(minor);
  };
  for (const [id, title, fields] of recipe.pages) {
    const reference = truth.readings.find((r: any) => r.documentId === id);
    const visible = Object.fromEntries(fields);
    if (title === 'W-2') {
      assert.equal(reference.wagesCents, cents(visible.Wages));
      assert.equal(reference.withholdingCents, cents(visible['Federal withholding']));
    } else if (title === '1040') {
      assert.equal(reference.wagesCents, cents(visible['Total W2 wages']));
      assert.equal(reference.withholdingCents, cents(visible['Withholding from W2s']));
    } else if (title === '1099-INT') assert.equal(reference.interestCents, cents(visible['Interest income']));
    else assert.ok([reference.wagesCents, reference.withholdingCents, reference.interestCents].every(v => v === null));
  }
  const service = await createContentService(root);
  const dataset = await service.dataset('03-independent-tie-out');
  for (const row of dataset.examples) {
    const reference = row.expected as any;
    assert.ok(setEqual(reference.readings.map((r: any) => r.documentId), row.input.documentIds as string[]));
    for (const reading of reference.readings) {
      assert.ok(same(reading, truth.readings.find((r: any) => r.documentId === reading.documentId)));
    }
  }
});
