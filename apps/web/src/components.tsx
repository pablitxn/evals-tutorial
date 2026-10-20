import { useI18n } from './i18n.js';
import React, { useRef, useState, type KeyboardEvent } from 'react';
import type { Dataset, Diagnostic, EvaluationMode, Exercise, PhoenixLinks, ReviewRecord, RunRecord } from '@evals-tutorial/contracts';
import { safeUrl } from './model.js';
import { LessonMarkdown, Markdown } from './Markdown.js';
import { CodeEditor, type EditorHandle } from './CodeEditor.js';
import { JsonViewer } from './JsonViewer.js';

export function ModeBadge({ mode }: { mode: EvaluationMode }) {
  const { t } = useI18n();
  return <span className={`mode mode-${mode === 'Code' ? 'code' : 'judge'}`}>{t(mode)}</span>;
}

export function ExternalLink({ url, children }: { url?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const href = safeUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}<span aria-label={t(" opens in new tab")}> ↗</span></a> : null;
}

export function PhoenixEvidence({ links, state }: { links?: PhoenixLinks; state: RunRecord['telemetryStatus'] }) {
  const { t } = useI18n();
  return <div className="phoenix-links">
    <ExternalLink url={links?.datasetUrl}>{t("Actual dataset")}</ExternalLink>
    <ExternalLink url={links?.experimentUrl}>{t("Actual experiment")}</ExternalLink>
    <ExternalLink url={links?.traceUrl}>{t("Actual trace")}</ExternalLink>
    {(!links?.experimentUrl || !safeUrl(links.experimentUrl)) && <span>{state === 'pending' ? t("Recording in Phoenix…") : state === 'failed' ? t("Phoenix recording failed. Check local Phoenix; do not rerun inference to recover recording.") : t("Phoenix experiment unavailable.")}</span>}
  </div>;
}

export function LessonText({ text, specificationLabel }: { text: string; specificationLabel?: string }) {
  return <LessonMarkdown text={text} specificationLabel={specificationLabel} />;
}

export function Editor({ source, readOnly, busy, onChange, editorRef, diagnostics, onCopy }: {
  source: string; readOnly: boolean; busy: boolean; onChange: (source: string) => void;
  editorRef: React.RefObject<EditorHandle | null>; diagnostics: Diagnostic[]; onCopy: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  function position(diagnostic: Diagnostic) {
    editorRef.current?.reveal(diagnostic.line, diagnostic.column);
  }
  return <section className="panel editor-panel" aria-labelledby="editor-heading">
    <div className="panel-heading"><h2 id="editor-heading">evaluator.ts</h2>
      <div className="editor-tools">
        <button type="button" className="editor-icon-button" aria-label={t("Copy evaluator")} title={t("Copy evaluator")} onClick={onCopy}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></svg>
        </button>
        <button type="button" className="editor-icon-button" aria-label={t("Expand / reduce")} title={t("Expand / reduce")} aria-expanded={expanded} aria-controls="evaluator-source" onClick={() => setExpanded(value => !value)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={expanded ? 'M4 9h5V4m6 16v-5h5M9 9 3 3m12 12 6 6' : 'M9 3H3v6m12 12h6v-6M3 3l6 6m6 6 6 6'} /></svg>
        </button>
      </div>
    </div>
    <div id="evaluator-source" className="editor-area">
      <CodeEditor source={source} language="typescript" readOnly={readOnly || busy} onChange={onChange} editorRef={editorRef}
        label={t(readOnly ? 'Read-only TypeScript evaluator' : 'Editable TypeScript evaluator')} unavailableLabel={t("Editor unavailable. Source remains available to select and copy.")} diagnostics={diagnostics} expanded={expanded} />
    </div>
    {diagnostics.length > 0 && <p className="help">{t("Raw TypeScript diagnostics and execution evidence keep their original text.")}</p>}
    {diagnostics.length > 0 && <ul className="diagnostics" aria-label={t("TypeScript diagnostics")}>{diagnostics.map((d, i) => <li key={i}><button className="text-button" onClick={() => position(d)}>{d.code} {t("· line")}{' '}{d.line}{t(", column")}{' '}{d.column}</button><span>{d.message}</span></li>)}</ul>}
  </section>;
}

export function ReferenceTabs({ exercise, dataset }: { exercise: Exercise; dataset?: Dataset }) {
  const { t } = useI18n();
  const tabs = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  function select(index: number) {
    setSelected(index);
  }
  function key(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault(); select(next); tabs.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
  }
  return <section className="panel reference-panel" aria-label={t("Read-only consultation")} ref={tabs}>
    <div className="panel-heading"><h2>{t("Reference")}</h2><span className="read-label">{t("Read-only")}</span></div>
    <div className="tabs" role="tablist" aria-label={t("Reference source")}>
      <button role="tab" id="dataset-tab" aria-controls="dataset-panel" aria-selected={selected === 0} tabIndex={selected === 0 ? 0 : -1} onClick={() => select(0)} onKeyDown={event => key(event, 0)}>{t("Dataset JSON")}</button>
      <button role="tab" id="python-tab" aria-controls="python-panel" aria-selected={selected === 1} tabIndex={selected === 1 ? 0 : -1} onClick={() => select(1)} onKeyDown={event => key(event, 1)}>{t("Python agent")}</button>
    </div>
    <div id="dataset-panel" role="tabpanel" aria-labelledby="dataset-tab" tabIndex={0} hidden={selected !== 0}>
      <p className="help">{t("Version")}{' '}{exercise.datasetVersion} · {dataset?.examples.length ?? '—'} {t("examples. Reference answers are separate from agent input.")}</p>
      <>{dataset ? <JsonViewer value={dataset} label={t("Dataset JSON")} /> : <p className="help">{t("Loading the versioned dataset…")}</p>}</>
    </div>
    <div id="python-panel" role="tabpanel" aria-labelledby="python-tab" tabIndex={0} hidden={selected !== 1}><p className="help">{t(exercise.id === '07-spec-regression' ? 'Prepared source includes both variant prompts and the runtime agent call. Each immutable run records the selected variant.' : 'Prepared source for consultation. Variant-specific source is not exposed separately by v1; the configured variant is recorded with each run.')}</p><CodeEditor source={exercise.pythonSource} language="python" readOnly unavailableLabel={t("Editor unavailable. Source remains available to select and copy.")} label={t("Python agent")} /></div>
  </section>;
}

export function RunResults({ run, dataset, current, idPrefix = '' }: { run?: RunRecord; dataset?: Dataset; current: boolean; idPrefix?: string }) {
  const { t, locale } = useI18n();
  if (!run) return <div className="empty-results"><span className="empty-symbol" aria-hidden="true">↳</span><p>{t("Results will appear here.")}</p><span>{t("Test known responses, then run the prepared agent on the same dataset.")}</span></div>;
  const matchingDataset = dataset?.datasetId === run.request.snapshot.datasetId && dataset.datasetVersion === run.request.snapshot.datasetVersion && dataset.contentHash === run.request.snapshot.datasetHash ? dataset : undefined;
  return <div className="run-results">
    <div className="result-summary"><span className={`state-pill ${run.status === 'completed' ? 'success' : ''}`}>{t(run.status)}</span><span>{run.completedRows} / {run.totalRows} {t("rows completed")}</span>{!current && <strong className="warning">{t("Previous version · stale")}</strong>}</div>
    <p className="receipt-caption">{run.request.mode === 'fixtures' ? t("Prepared response fixtures") : t("Actual agent outputs")} {t("· source")}{' '}{run.codeHash.slice(0, 10)} {t("· dataset")}{' '}{run.request.snapshot.datasetVersion} {t("· variant")}{' '}{run.request.agentVariant} · {run.provenance.provider ? `${run.provenance.provider.provider} / ${run.provenance.provider.model}` : t("No provider reported")} · {new Date(run.updatedAt).toLocaleString(locale)}</p>
    {run.error && <p className="error-text">{t("Raw service diagnostics (original language).")} {run.error.code}: {run.error.message}</p>}
    <PhoenixEvidence links={run.phoenix} state={run.telemetryStatus} />
    <div className="table-scroll" role="region" aria-label={t("Run results; scroll horizontally on narrow screens")} tabIndex={0}>
      <table><caption>{run.request.mode === 'fixtures' ? t("Expected and observed fixture evaluations") : t("Reference and actual agent response")}</caption><thead><tr><th>{t("Example")}</th><th>{run.request.mode === 'fixtures' ? t("Expected evaluation") : t("Expected reference")}</th><th>{run.request.mode === 'fixtures' ? t("Observed evaluation") : t("Actual response")}</th><th>{run.request.mode === 'fixtures' ? t("Assertion") : t("Evaluation")}</th><th>{t("Evidence")}</th></tr></thead>
        <tbody>{run.rows.map((row, index) => {
          const example = matchingDataset?.examples.find(item => item.id === row.exampleId);
          const fixture = example?.fixtures.find(item => item.id === row.fixtureId);
          const evaluation = row.evaluation;
          const assertion = row.status !== 'completed' ? 'Error' : row.fixtureMatched === true ? 'Matched' : row.fixtureMatched === false ? 'Mismatch' : 'Inconclusive';
          return <tr key={`${row.exampleId}:${row.fixtureId ?? index}`} id={`row-${idPrefix}${encodeURIComponent(row.exampleId)}-${index}`}><th scope="row">{row.exampleId}{row.fixtureId && <small>{row.fixtureId}</small>}<small>{t(row.status)}</small></th>
            <td><pre>{JSON.stringify(run.request.mode === 'fixtures' ? fixture?.expectedEvaluation : example?.expected, null, 2) ?? t("Not available")}</pre></td>
            <td>{run.request.mode === 'fixtures' ? evaluation ? <><strong className={evaluation.label === 'pass' ? 'success' : 'warning'}>{t(evaluation.label)} / {evaluation.score}</strong><Markdown text={evaluation.explanation} /></> : '—' : <pre>{JSON.stringify(row.output, null, 2) ?? '—'}</pre>}</td>
            <td><strong>{run.request.mode === 'fixtures' ? t(assertion) : evaluation ? `${t(evaluation.label)} / ${evaluation.score}` : '—'}</strong>{run.request.mode === 'agent' && evaluation && <Markdown text={evaluation.explanation} />}{row.error && <p className="error-text">{t("Raw service diagnostics (original language).")} {row.error.code}: {row.error.message}</p>}</td>
            <td><ExternalLink url={row.phoenix?.traceUrl}>{t("Actual trace")}</ExternalLink>{!safeUrl(row.phoenix?.traceUrl) && <span className="help">{t("Trace")}{' '}{run.telemetryStatus === 'pending' ? t("pending") : t("unavailable")}</span>}
              <details><summary>{t("Row details")}</summary><p className="evidence-quote">{fixture?.rationale}</p><JsonViewer compact label={t("Input")} value={example?.input} /><JsonViewer compact label={t("Reference")} value={example?.expected} /><JsonViewer compact label={t("Response")} value={row.output ?? fixture?.output} />{evaluation && <JsonViewer compact label={t("Evaluation")} value={evaluation} />}</details>
            </td></tr>;
        })}</tbody></table>
    </div>
    {run.rows.length === 0 && <p className="help">{t("No completed rows yet. Missing rows have no score.")}</p>}
    <p className="help">{t("Stored evaluations, fixture rationale and JSON are original evidence.")}</p>
    <p className="help">{t("A failing evaluation can correctly detect a bad response. Operational errors have no score. Token usage / monetary cost: not reported by the v1 run receipt.")}</p>
  </div>;
}

export function DocumentPreviews({ dataset }: { dataset?: Dataset }) {
  const { t } = useI18n();
  const ids = new Set<string>();
  function collect(value: unknown, key = '') {
    if (typeof value === 'string' && ['documentId', 'documentIds'].includes(key) && /^[a-zA-Z0-9._:-]+$/.test(value)) ids.add(value);
    if (Array.isArray(value)) value.forEach(item => collect(item, key));
    else if (value && typeof value === 'object') for (const [field, item] of Object.entries(value)) {
      if (key === 'documents' && field === 'id') collect(item, 'documentId'); else collect(item, field);
    }
  }
  dataset?.examples.forEach(example => collect(example.input));
  return ids.size ? <details className="document-previews"><summary>{t("Synthetic source documents (")}{ids.size})</summary><p className="help">{t("The same allowlisted document files supplied to the agent. No separate OCR or substituted reference text.")}</p>{[...ids].map(id => <div key={id}><a href={`/api/documents/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer">{t("Open synthetic document")}{' '}{id} ↗</a><img loading="lazy" src={`/api/documents/${encodeURIComponent(id)}`} alt={t("Synthetic source {id}. Open the document if an inline image preview is unavailable.", { id })} /></div>)}</details> : null;
}

export function ReviewFeedback({ review, current, jumpToRow }: { review: ReviewRecord; current: boolean; jumpToRow: (id: string) => void }) {
  const { t } = useI18n();
  const labels = { ready: 'Reviewed — current version', needs_changes: 'Needs revision', inconclusive: 'Review inconclusive', failed: 'Review unavailable', cancelled: 'Review cancelled', pending: 'Review in progress', running: 'Review in progress' };
  return <div className="review-feedback"><strong className={current && review.status === 'ready' ? 'success' : 'warning'}>{current ? t(labels[review.status]) : t("Previous review is stale")}</strong>
    {!current && <p>{t("Retest and rerun this version before requesting a new review. Previous feedback is retained below.")}</p>}
    {review.error && <p className="error-text">{t("Raw service diagnostics (original language).")} {review.error.code}: {review.error.message}</p>}
    {review.assessment && <><p className="help">{review.feedbackLocale ? t("Requested feedback language: {language}. Original feedback is retained; the provider may not follow the requested language.", { language: t(review.feedbackLocale === "es" ? "Spanish" : "English") }) : t("Feedback language was not recorded for this older result. Original feedback is retained.")}</p><p className="help">{t("Changing language does not translate stored feedback or request another review. Request a new paid review explicitly if needed.")}</p><Markdown text={review.assessment.summary} />{review.assessment.findings.map((finding, i) => <article className="finding" key={i}><h3>{finding.criterionId}</h3><p className="evidence-quote"><strong>{t("Evidence:")}{' '}</strong>{finding.evidence}</p><Markdown text={finding.feedback} /><div className="next-action"><strong>{t("Next:")}</strong><Markdown text={finding.nextAction} /></div><div>{finding.exampleIds.map(id => <button className="text-button" key={id} onClick={() => jumpToRow(id)}>{t("Jump to")}{' '}{id}</button>)}</div></article>)}</>}
    <p className="receipt-caption">{t("Review")}{' '}{review.reviewId} {t("· source")}{' '}{review.binding.codeHash.slice(0, 10)} {t("· rubric")}{' '}{review.binding.rubricVersion}</p>
  </div>;
}
