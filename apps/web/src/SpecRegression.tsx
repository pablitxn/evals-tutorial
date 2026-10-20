import React from 'react';
import type { Dataset, Exercise, RunRecord, ServiceStatus, SourceSnapshot } from '@evals-tutorial/contracts';
import { comparePreparedRuns, REQUIREMENT_IDS, type ComparisonAttempt } from './comparison.js';
import { runCurrent } from './model.js';
import { useI18n, localizeLesson } from './i18n.js';
import { Markdown } from './Markdown.js';
import { RunResults } from './components.js';

const DERIVATIONS = [
  'Match the selected option to the supplied catalog and requested route.',
  'Check exact outbound and return dates and their chronological order.',
  'Compute fare plus mandatory fees from the catalog and require matching currency and reported total.',
  'Check the full catalog total and reported total against the inclusive budget.',
  'Derive eligible options independently. Require no_options exactly when none exist, with null itinerary fields.',
  'Require simulated true and booked false for every response.',
];
export function SpecPreparation({ exercise, dataset }: { exercise: Exercise; dataset?: Dataset }) {
  const { t, locale } = useI18n();
  const lesson = localizeLesson(exercise, locale);
  return <section className="panel spec-preparation" aria-labelledby="spec-preparation-title">
    <div className="panel-heading"><h2 id="spec-preparation-title">{t('2. Inspect the prepared derivation')}</h2><span className="read-label">{t('Read-only')}</span></div>
    <p>{t('The specification above is the starting point. These fixed checks were prepared from its requirements; this page does not generate an agent or evaluator.')}</p>
    <div className="table-scroll" role="region" aria-label={t('Requirement to evaluator mapping')} tabIndex={0}><table><caption>{t('Every requirement becomes a visible check')}</caption><thead><tr><th>{t('Requirement')}</th><th>{t('Prepared evaluator check')}</th></tr></thead><tbody>{REQUIREMENT_IDS.map((id, index) => <tr key={id} id={`requirement-${id}`}><th scope="row"><strong>{id}</strong><Markdown text={lesson.criteria.find(criterion => criterion.id === id)?.description ?? id} /></th><td>{t(DERIVATIONS[index]!)}</td></tr>)}</tbody></table></div>
    <p className="help">{t('Overall pass = all six requirements pass. Any failed requirement gives overall fail. Operational errors have no score.')}</p>
    <p>{t('Inspect evaluator.ts and the Python agent below. The prepared omit-fees version intentionally ignores mandatory fees: this is the regression to investigate before running either version.')}</p>
    <details><summary>{t('Inspect the three shared test cases')}</summary>{dataset ? dataset.examples.map(example => <article key={example.id}><h3>{String(example.metadata.title ?? example.id)}</h3><code>{example.id}</code><dl>{REQUIREMENT_IDS.map(id => <div key={id}><dt><a href={`#requirement-${id}`} onClick={event => { event.preventDefault(); document.getElementById(`requirement-${id}`)?.scrollIntoView(); }}>{id}</a></dt><dd>{String((example.metadata.expectedByRequirement as Record<string, unknown> | undefined)?.[id] ?? '')}</dd></div>)}</dl></article>) : <p>{t('Loading the versioned dataset…')}</p>}</details>
  </section>;
}

export function SpecComparisonResults({ attempt, baseline, candidate, dataset, current, codeHash, status, retryRecording, busy }: {
  attempt?: ComparisonAttempt; baseline?: RunRecord; candidate?: RunRecord; dataset?: Dataset; current: SourceSnapshot; codeHash: string | null; status?: ServiceStatus;
  retryRecording(record: RunRecord): void; busy: boolean;
}) {
  const { t } = useI18n();
  const comparison = comparePreparedRuns(attempt, baseline, candidate, dataset, current, codeHash, status);
  return <div className="spec-comparison">
    <h3>{t('4. Compare requirement evidence')}</h3>
    <p>{t('A regression is an actual baseline pass becoming an omit-fees fail on the same case. Read each requirement explanation to identify the cause; provider outputs may vary.')}</p>
    {attempt && <p className="receipt-caption">{t('Comparison attempt')} <code>{attempt.id}</code></p>}
    {comparison.reason && <p className="notice warning" role="status">{t(comparison.reason)}</p>}
    {comparison.rows.length > 0 && <div className="table-scroll" role="region" aria-label={t('Requirement-linked comparison results')} tabIndex={0}><table><caption>{t('Observed changes on the shared dataset')}</caption><thead><tr><th>{t('Example')}</th><th>baseline</th><th>omit-fees</th><th>{t('Observed change')}</th><th>{t('Requirement evidence')}</th></tr></thead><tbody>{comparison.rows.map(row => <tr key={row.exampleId}><th scope="row">{row.exampleId}</th><td>{row.compared ? t(row.baseline!.evaluation!.label) : '—'}</td><td>{row.compared ? t(row.candidate!.evaluation!.label) : '—'}</td><td>{t(row.compared ? row.regression ? 'Regression: pass → fail' : row.baseline!.evaluation!.label === row.candidate!.evaluation!.label ? 'No label change' : 'Improvement: fail → pass' : 'Not compared')}{row.reason && <p>{t(row.reason)}</p>}</td><td>{REQUIREMENT_IDS.map(id => { const a = row.baseline?.evaluation?.criteria?.find(criterion => criterion.criterionId === id); const b = row.candidate?.evaluation?.criteria?.find(criterion => criterion.criterionId === id); return <details key={id}><summary>{id} · {row.compared ? `${t(a!.label)} → ${t(b!.label)}` : t('Not compared')}</summary><p><a href={`#requirement-${id}`} onClick={event => { event.preventDefault(); document.getElementById(`requirement-${id}`)?.scrollIntoView(); }}>{t('Read requirement')} {id}</a></p><p><strong>baseline: </strong>{a?.explanation ?? t('Not available')}</p><p><strong>omit-fees: </strong>{b?.explanation ?? t('Not available')}</p></details>; })}</td></tr>)}</tbody></table></div>}
    {(['baseline', 'omit-fees'] as const).map((variant, index) => { const run = index === 0 ? baseline : candidate; return <details key={variant} className="comparison-receipt" open={!!run}><summary>{t('Immutable run receipt')} · {variant}{run && ` · ${run.runId}`}</summary><RunResults idPrefix={`comparison-${variant}-`} run={run} dataset={dataset} current={!!run && runCurrent(run, current, codeHash, run.request.agentVariant, status)} />{run && !['queued', 'validating', 'running', 'cancelling'].includes(run.status) && run.rows.length > 0 && ['failed', 'not_requested'].includes(run.telemetryStatus) && <button disabled={busy} onClick={() => retryRecording(run)}>{t('Retry Phoenix recording · no inference')}</button>}</details>; })}
  </div>;
}
