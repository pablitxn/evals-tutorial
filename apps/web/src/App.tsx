import type { Message, Parameters } from './i18n-core.js';
import { useI18n, localizeLesson } from './i18n.js';
import { useEffect, useRef, useState } from 'react';
import { LIMITS, validateContract, type AcceptedReview, type AcceptedRun, type Dataset, type Exercise, type ExerciseId, type ReviewRecord, type RunRecord, type ServiceStatus, type Tutorial, type ValidationResult } from '@evals-tutorial/contracts';
import { ApiError, errorText, request } from './api.js';
import { DocumentPreviews, Editor, ExternalLink, LessonText, ModeBadge, ReferenceTabs, ReviewFeedback, RunResults } from './components.js';
import { fixturesDiscriminate, LESSON_IDS, LESSON_LABELS, LESSON_MINUTES, lessonFromHash, reviewActive, reviewCurrent, reviewFindingsValid, runActive, runCurrent, sameSnapshot, snapshot, sourceHash } from './model.js';
import { loadWork, PENDING_KEY, read, remove, resetStorage, save, storageKey, type PendingSubmission, type SavedWork } from './storage.js';
import { Preferences } from './preferences.js';
import { Markdown } from './Markdown.js';
import { ProviderStatus } from './ProviderStatus.js';
import { BrandMark } from './BrandMark.js';
import { EvaluationConcepts } from './EvaluationConcepts.js';
import type { EditorHandle } from './CodeEditor.js';
import { SpecPreparation, SpecComparisonResults } from './SpecRegression.js';
import { Dropdown } from './Dropdown.js';

type Work = SavedWork & { oldSource?: string; validation?: ValidationResult; fixture?: RunRecord; agent?: RunRecord; review?: ReviewRecord; baseline?: RunRecord; candidate?: RunRecord; history: (RunRecord | ReviewRecord)[]; evidenceError?: string };
type Works = Partial<Record<ExerciseId, Work>>;
const initialPending = (): PendingSubmission | undefined => {
  const pending = read<PendingSubmission>(PENDING_KEY);
  if (!pending || !['run', 'review'].includes(pending.kind)) return undefined;
  return validateContract(pending.kind === 'run' ? 'RunRequest' : 'ReviewRequest', pending.request).valid
    && (!pending.acceptedId || /^[\w.:-]+$/.test(pending.acceptedId)) ? pending : undefined;
};

export function App() {
  const { t, locale } = useI18n();
  const [tutorial, setTutorial] = useState<Tutorial>();
  const [status, setStatus] = useState<ServiceStatus>();
  const [datasets, setDatasets] = useState<Partial<Record<ExerciseId, Dataset>>>({});
  const [works, setWorks] = useState<Works>({});
  const workRef = useRef<Works>({});
  const tutorialRef = useRef<Tutorial | undefined>(undefined);
  const [hashes, setHashes] = useState<Partial<Record<ExerciseId, string>>>({});
  const [active, setActive] = useState<ExerciseId>(lessonFromHash);
  const [pending, setPending] = useState<PendingSubmission | undefined>(initialPending);
  const pendingRef = useRef(pending);
  const actionLock = useRef(false);
  const [action, setAction] = useState<string>();
  const [error, setError] = useState<string | Message>();
  const [bootError, setBootError] = useState<string>();
  const [pollError, setPollError] = useState<string>();
  const [saved, setSaved] = useState(true);
  const [resultTab, setResultTab] = useState<'fixtures' | 'agent'>('fixtures');
  const [reset, setReset] = useState<'exercise' | 'tutorial'>();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [lessonsOpen, setLessonsOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [announcement, setMessage] = useState<Message>();
  function setAnnouncement(key: string, parameters?: Parameters) { setMessage({ key, parameters }); }
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  function persist(id: ExerciseId, work: Work) {
    const t = tutorialRef.current; const exercise = t?.exercises.find(e => e.id === id);
    if (!t || !exercise) return;
    const value: SavedWork = { source: work.source, variant: work.variant, rubricVersion: work.rubricVersion, datasetHash: work.datasetHash, comparison: work.comparison,
      ...(work.fixtureRunId ? { fixtureRunId: work.fixtureRunId } : {}), ...(work.agentRunId ? { agentRunId: work.agentRunId } : {}), ...(work.reviewId ? { reviewId: work.reviewId } : {}), pastReceiptIds: [...(work.pastReceiptIds ?? []), ...work.history.map(record => ({ kind: 'runId' in record ? 'run' as const : 'review' as const, id: 'runId' in record ? record.runId : record.reviewId }))].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index).slice(-12) };
    if (!save(storageKey(t, exercise), value)) setSaved(false);
  }
  function update(id: ExerciseId, patch: Partial<Work>) {
    const current = workRef.current[id]; if (!current) return;
    const next = { ...current, ...patch };
    const all = { ...workRef.current, [id]: next }; workRef.current = all; setWorks(all); persist(id, next);
  }
  function setOperation(value: PendingSubmission | undefined) {
    pendingRef.current = value; setPending(value);
    if (!(value ? save(PENDING_KEY, value) : remove(PENDING_KEY))) setSaved(false);
  }
  function hashWork(id: ExerciseId, source: string) {
    setHashes(previous => ({ ...previous, [id]: undefined }));
    sourceHash(source).then(hash => {
      if (workRef.current[id]?.source === source) setHashes(previous => ({ ...previous, [id]: hash }));
    }).catch(() => setError({ key: 'Browser SHA-256 unavailable. Use the local loopback URL.' }));
  }

  async function boot() {
    setBootError(undefined);
    try {
      const [t, s] = await Promise.all([request<Tutorial>('/api/tutorial', 'Tutorial'), request<ServiceStatus>('/api/status', 'ServiceStatus')]);
      if (t.exercises.length !== 8 || t.exercises.some((e, i) => e.id !== LESSON_IDS[i]) || !t.exercises[0]?.readOnly || !t.exercises[7]?.readOnly || t.exercises.slice(1, 7).some(e => e.readOnly)) throw new Error('Tutorial content must contain the introduction, six editable cases and the read-only regression example.');
      tutorialRef.current = t; setTutorial(t); setStatus(s);
      const next: Works = {};
      for (const e of t.exercises) { const loaded = loadWork(t, e); next[e.id] = { ...loaded.work, ...(e.readOnly ? { source: e.starterSource } : {}), oldSource: loaded.oldSource, history: [] }; }
      workRef.current = next; setWorks(next);
      for (const e of t.exercises) {
        const work = next[e.id]!; hashWork(e.id, work.source);
        for (const [field, id] of [['fixture', work.fixtureRunId], ['agent', work.agentRunId], ['review', work.reviewId], ['baseline', work.comparison?.baselineRunId], ['candidate', work.comparison?.candidateRunId]] as const) if (id) {
          const kind = field === 'review' ? 'reviews' : 'runs';
          request<RunRecord | ReviewRecord>(`/api/${kind}/${encodeURIComponent(id)}`, field === 'review' ? 'ReviewRecord' : 'RunRecord').then(record => {
            const exerciseId = 'runId' in record ? record.request.snapshot.exerciseId : record.binding.exerciseId;
            if (exerciseId !== e.id) throw new Error('Stored receipt belongs to another exercise.');
            update(e.id, { [field]: record });
          }).catch(problem => update(e.id, { evidenceError: `Stored evidence unavailable. ${errorText(problem)}` }));
        }
      }
    } catch (problem) { setBootError(errorText(problem)); }
  }

  useEffect(() => { void boot(); }, []);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const updateMenu = () => setLessonsOpen(desktop.matches);
    desktop.addEventListener('change', updateMenu);
    return () => desktop.removeEventListener('change', updateMenu);
  }, []);
  useEffect(() => {
    const change = () => { setActive(lessonFromHash()); setError(undefined); setResultTab('fixtures'); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => { if (tutorial) headingRef.current?.focus(); }, [active, !!tutorial]);
  useEffect(() => {
    const refresh = window.setInterval(() => { request<ServiceStatus>('/api/status', 'ServiceStatus').then(setStatus).catch(problem => { setStatus(undefined); setPollError(errorText(problem)); }); }, 10000);
    return () => window.clearInterval(refresh);
  }, []);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === PENDING_KEY) { const operation = initialPending(); pendingRef.current = operation; setPending(operation); }
    };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, []);

  function storeRun(record: RunRecord) {
    const id = record.request.snapshot.exerciseId; const work = workRef.current[id]; if (!work) return;
    const field = record.request.mode === 'fixtures' ? 'fixture' : 'agent';
    const previous = work[field];
    const history = previous && previous.runId !== record.runId ? [...work.history, previous].slice(-12) : work.history;
    const pair = work.comparison;
    const role = record.request.requestId === pair?.baselineRequestId ? 'baseline' : record.request.requestId === pair?.candidateRequestId ? 'candidate' : undefined;
    const comparison = pair && role ? { ...pair, [role === 'baseline' ? 'baselineRunId' : 'candidateRunId']: record.runId } : pair;
    const keepLatest = role === 'baseline' && !!pair?.candidateRequestId;
    update(id, { ...(!keepLatest ? { [field]: record, [`${field}RunId`]: record.runId } : {}), ...(role ? { [role]: record } : {}), comparison, history: keepLatest ? work.history : history.filter((item, index, list) => list.findIndex(other => ('runId' in other ? other.runId : other.reviewId) === ('runId' in item ? item.runId : item.reviewId)) === index), evidenceError: undefined });
  }
  function storeReview(record: ReviewRecord) {
    const id = record.binding.exerciseId; const work = workRef.current[id]; if (!work) return;
    const history = work.review && work.review.reviewId !== record.reviewId ? [...work.history, work.review].slice(-12) : work.history;
    update(id, { review: record, reviewId: record.reviewId, history, evidenceError: undefined });
  }

  useEffect(() => {
    if (!tutorial) return;
    let stopped = false; let timer: number;
    async function poll() {
      try {
        const operation = pendingRef.current;
        if (operation?.acceptedId) {
          if (operation.kind === 'run') {
            const record = await request<RunRecord>(`/api/runs/${encodeURIComponent(operation.acceptedId)}`, 'RunRecord');
            if (!sameSnapshot(record.request.snapshot, operation.request.snapshot) || record.request.requestId !== operation.request.requestId) throw new Error('Run receipt does not match the accepted submission.');
            if (!stopped) { storeRun(record); if (!runActive(record)) { setOperation(undefined); setAnnouncement('Run {status}. {completed} of {total} rows completed.', { status: record.status, completed: record.completedRows, total: record.totalRows }); } }
          } else {
            const record = await request<ReviewRecord>(`/api/reviews/${encodeURIComponent(operation.acceptedId)}`, 'ReviewRecord');
            if (record.requestId !== operation.request.requestId || (record.feedbackLocale ?? 'en') !== (operation.request.feedbackLocale ?? 'en')) throw new Error('Review receipt does not match the accepted submission.');
            if (!stopped) { storeReview(record); if (!reviewActive(record)) { setOperation(undefined); setAnnouncement('Review {status}.', { status: record.status }); } }
          }
        }
        // Recover saved active receipts and late Phoenix recording with GET only.
        for (const work of Object.values(workRef.current)) {
          for (const run of [work?.fixture, work?.agent, work?.baseline, work?.candidate]) if (run && (runActive(run) || run.telemetryStatus === 'pending') && run.runId !== operation?.acceptedId) {
            const record = await request<RunRecord>(`/api/runs/${encodeURIComponent(run.runId)}`, 'RunRecord'); if (!stopped) storeRun(record);
          }
          if (work?.review && reviewActive(work.review) && work.review.reviewId !== operation?.acceptedId) {
            const record = await request<ReviewRecord>(`/api/reviews/${encodeURIComponent(work.review.reviewId)}`, 'ReviewRecord'); if (!stopped) storeReview(record);
          }
        }
        if (!stopped) setPollError(undefined);
      } catch (problem) {
        if (!stopped) {
          const operation = pendingRef.current;
          if (problem instanceof ApiError && problem.detail.code === 'not_found' && operation?.acceptedId) {
            const id = operation.request.snapshot.exerciseId;
            const field = operation.kind === 'review' ? 'review' : operation.request.mode === 'fixtures' ? 'fixture' : 'agent';
            update(id, { [field]: undefined, evidenceError: 'The backend no longer has this accepted operation. Fresh run evidence is required; previous completion cannot be restored.' });
            setOperation(undefined);
          }
          setPollError(`Evidence status unavailable. ${errorText(problem)}`);
        }
      }
      if (!stopped) timer = window.setTimeout(poll, 1200);
    }
    void poll(); return () => { stopped = true; window.clearTimeout(timer); };
  }, [!!tutorial]);

  useEffect(() => {
    if (reset) { restoreFocus.current = document.activeElement as HTMLElement; dialogRef.current?.showModal(); dialogRef.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus(); }
    else if (dialogRef.current?.open) { dialogRef.current.close(); restoreFocus.current?.focus(); }
  }, [reset]);

  const exercise = tutorial?.exercises.find(e => e.id === active);
  const work = works[active]; const dataset = datasets[active];
  useEffect(() => {
    if (!exercise || datasets[active]) return;
    const abort = new AbortController();
    request<Dataset>(`/api/exercises/${encodeURIComponent(active)}/dataset`, 'Dataset', undefined, abort.signal).then(value => {
      if (value.datasetId !== exercise.datasetId || value.datasetVersion !== exercise.datasetVersion || value.contentHash !== exercise.datasetHash) throw new Error('Dataset identity does not match the installed exercise.');
      setDatasets(previous => ({ ...previous, [active]: value }));
    }).catch(problem => { if (!abort.signal.aborted) setError(errorText(problem)); });
    return () => abort.abort();
  }, [active, exercise]);

  const activeRecords = Object.values(works).some(w => w && ([w.fixture, w.agent, w.baseline, w.candidate].some(r => r && runActive(r)) || (w.review && reviewActive(w.review))));
  const busy = !!pending || !!action || activeRecords;
  const current = tutorial && exercise && work ? snapshot(tutorial, exercise, work.source) : undefined;
  const hash = hashes[active] ?? null;
  const valid = !!work?.validation?.valid && work.validation.codeHash === hash;
  const fixtureCurrent = !!current && runCurrent(work?.fixture, current, hash, work?.variant ?? '', status);
  const agentCurrent = !!current && runCurrent(work?.agent, current, hash, work?.variant ?? '', status);
  const fixtureReady = fixtureCurrent && fixturesDiscriminate(work?.fixture, dataset);
  const readyForReview = valid && fixtureReady && agentCurrent && work?.agent?.status === 'completed'
    && work.fixture?.telemetryStatus !== 'pending' && work.agent.telemetryStatus !== 'pending';
  const reviewIsCurrent = !!current && !!exercise && reviewCurrent(work?.review, current, hash, work?.fixture, work?.agent, work?.variant ?? '', status)
    && (!['ready', 'needs_changes', 'inconclusive'].includes(work?.review?.status ?? '') || reviewFindingsValid(work?.review, exercise, work?.fixture, work?.agent));
  const cap = status?.capabilities;
  const paidReady = !!status?.provider?.configured;
  const isSpec = active === '07-spec-regression';
  const usesJudge = exercise?.mode !== 'Code';
  const canTest = !!dataset && !!cap?.runner.available && !!cap.validation.available && (!usesJudge || (paidReady && cap.judge.available)) && !busy;
  const canRun = !!cap?.agents.available && !!cap.runner.available && !!cap.validation.available && paidReady && (!usesJudge || !!cap.judge.available) && fixtureReady && !busy;
  const canReview = readyForReview && !!cap?.review.available && paidReady && !busy;
  const reviewed = tutorial?.exercises.filter(e => {
    const w = works[e.id]; if (e.readOnly || !w || !reviewCurrent(w.review, snapshot(tutorial, e, w.source), hashes[e.id] ?? null, w.fixture, w.agent, w.variant, status)) return false;
    return w.review?.status === 'ready' && reviewFindingsValid(w.review, e, w.fixture, w.agent);
  }).length ?? 0;

  async function validate() {
    if (!current || actionLock.current || busy) return;
    actionLock.current = true; setAction('Validating…'); setError(undefined);
    try {
      const result = await request<ValidationResult>('/api/validate', 'ValidationResult', current);
      const now = workRef.current[current.exerciseId];
      if (now?.source === current.source) { update(current.exerciseId, { validation: result }); setAnnouncement(result.valid ? 'Current source validated.' : '{count} TypeScript diagnostics.', { count: result.diagnostics.length }); }
    } catch (problem) { setError(errorText(problem)); } finally { actionLock.current = false; setAction(undefined); }
  }

  async function submit(operation: PendingSubmission) {
    if (actionLock.current) return;
    actionLock.current = true; setAction('Submitting…'); setError(undefined); setOperation(operation);
    try {
      if (operation.kind === 'run') {
        const accepted = await request<AcceptedRun>('/api/runs', 'AcceptedRun', operation.request);
        setOperation({ ...operation, acceptedId: accepted.runId });
        const field = operation.request.mode === 'fixtures' ? 'fixtureRunId' : 'agentRunId';
        const w = workRef.current[operation.request.snapshot.exerciseId]; const pair = w?.comparison;
        const role = operation.request.requestId === pair?.baselineRequestId ? 'baselineRunId' : operation.request.requestId === pair?.candidateRequestId ? 'candidateRunId' : undefined;
        update(operation.request.snapshot.exerciseId, { [field]: accepted.runId, ...(pair && role ? { comparison: { ...pair, [role]: accepted.runId } } : {}) });
      } else {
        const accepted = await request<AcceptedReview>('/api/reviews', 'AcceptedReview', operation.request);
        setOperation({ ...operation, acceptedId: accepted.reviewId }); update(operation.request.snapshot.exerciseId, { reviewId: accepted.reviewId });
      }
    } catch (problem) {
      if (problem instanceof ApiError) setOperation(undefined);
      setError(`${errorText(problem)}${problem instanceof ApiError ? '' : ' Submission outcome unknown. Recover using the same request ID.'}`);
    } finally { actionLock.current = false; setAction(undefined); }
  }
  function run(mode: 'fixtures' | 'agent', variant = work?.variant, requestId = crypto.randomUUID()) {
    if (!current || !variant || busy || !exercise) return;
    if (exercise.readOnly ? !paidReady || !cap?.runner.available || !cap.agents.available : mode === 'fixtures' ? !canTest : !canRun) return;
    if (new TextEncoder().encode(current.source).length > LIMITS.sourceBytes) { setError({ key: 'Source exceeds the 64 KiB limit. Shorten the evaluator before running.' }); return; }
    if (variant !== work?.variant) update(active, { variant });
    setResultTab(mode); setAnnouncement(mode === 'fixtures' ? 'Testing prepared responses.' : 'Running the prepared agent.');
    void submit({ kind: 'run', request: { requestId, snapshot: current, mode, agentVariant: variant } });
  }
  function runComparison(variant: 'baseline' | 'omit-fees') {
    if (!isSpec || !work || !current || busy || actionLock.current || !dataset || !paidReady || !cap?.runner.available || !cap.agents.available || !cap.validation.available) return;
    const requestId = crypto.randomUUID();
    if (variant === 'baseline') {
      const previous = [work.baseline, work.candidate].filter((record): record is RunRecord => !!record);
      const history = [...work.history, ...previous].filter((record, index, list) => list.findIndex(other => ('runId' in other ? other.runId : other.reviewId) === ('runId' in record ? record.runId : record.reviewId)) === index).slice(-12);
      update(active, { comparison: { id: crypto.randomUUID(), baselineRequestId: requestId }, baseline: undefined, candidate: undefined, history });
    }
    else {
      if (!work.comparison || !work.baseline || runActive(work.baseline) || work.comparison.candidateRequestId) return;
      update(active, { comparison: { ...work.comparison, candidateRequestId: requestId }, candidate: undefined });
    }
    run('agent', variant, requestId);
  }
  function review() {
    if (!canReview || !current || !hash || !work?.fixture || !work.agent) return;
    void submit({ kind: 'review', request: { requestId: crypto.randomUUID(), snapshot: current, codeHash: hash, fixtureRunId: work.fixture.runId, agentRunId: work.agent.runId, feedbackLocale: locale } });
  }
  async function cancel() {
    if (actionLock.current) return;
    const operation = pendingRef.current;
    const runRecord = Object.values(workRef.current).flatMap(w => [w?.fixture, w?.agent, w?.baseline, w?.candidate]).find(r => r && runActive(r));
    const reviewRecord = Object.values(workRef.current).map(w => w?.review).find(r => r && reviewActive(r));
    const id = operation?.acceptedId ?? runRecord?.runId ?? reviewRecord?.reviewId;
    const kind = operation?.kind ?? (runRecord ? 'run' : 'review');
    if (!id) return;
    actionLock.current = true; setAction('Cancelling…');
    try {
      if (kind === 'run') { const record = await request<RunRecord>(`/api/runs/${encodeURIComponent(id)}/cancel`, 'RunRecord', {}); storeRun(record); if (!runActive(record)) setOperation(undefined); }
      else { const record = await request<ReviewRecord>(`/api/reviews/${encodeURIComponent(id)}/cancel`, 'ReviewRecord', {}); storeReview(record); if (!reviewActive(record)) setOperation(undefined); }
      setAnnouncement('Cancellation requested. Completed results are retained.');
    } catch (problem) { setError(errorText(problem)); } finally { actionLock.current = false; setAction(undefined); }
  }
  async function retryRecording(record: RunRecord) {
    if (busy || actionLock.current) return;
    actionLock.current = true; setAction('Requesting recording…'); setError(undefined);
    try {
      storeRun(await request<RunRecord>(`/api/runs/${encodeURIComponent(record.runId)}/telemetry`, 'RunRecord', {}));
      setAnnouncement('Recording stored results in Phoenix. No inference repeated.');
    } catch (problem) { setError(errorText(problem)); }
    finally { actionLock.current = false; setAction(undefined); }
  }
  function edit(source: string) {
    if (busy || !exercise || exercise.readOnly) return;
    update(active, { source, validation: undefined }); hashWork(active, source);
  }
  function doReset() {
    if (busy || !tutorial || !exercise) return;
    const targets = reset === 'tutorial' ? tutorial.exercises : [exercise];
    if (!resetStorage(reset === 'tutorial' ? undefined : exercise.id)) setSaved(false);
    for (const e of targets) { update(e.id, { source: e.starterSource, variant: e.defaultAgentVariant, rubricVersion: e.rubricVersion, datasetHash: e.datasetHash, fixture: undefined, agent: undefined, review: undefined,
      fixtureRunId: undefined, agentRunId: undefined, reviewId: undefined, validation: undefined, history: [], pastReceiptIds: [], oldSource: undefined, evidenceError: undefined, comparison: undefined, baseline: undefined, candidate: undefined }); hashWork(e.id, e.starterSource); }
    setReset(undefined); setAnnouncement('Local work reset. Phoenix history retained.');
  }
  function jumpToRow(id: string) {
    setResultTab('agent'); requestAnimationFrame(() => { const row = document.querySelector<HTMLElement>(`[id^="row-${CSS.escape(encodeURIComponent(id))}-"]`); if (row) { row.tabIndex = -1; row.focus(); row.scrollIntoView({ block: 'center' }); } });
  }

  const preferencesButton = <button type="button" className="profile-avatar" aria-label={t('Open preferences')} title={t('Preferences')} aria-haspopup="dialog" aria-expanded={preferencesOpen} onClick={() => setPreferencesOpen(true)}>PA</button>;
  const preferencesDialog = preferencesOpen && <Preferences onClose={() => setPreferencesOpen(false)} />;
  if (!tutorial || !exercise || !work) return <><main className="startup">{preferencesButton}<BrandMark /><h1>{t("Evals tutorial")}</h1><p>{bootError ? t("Local tutorial is not ready yet.") : t("Loading the local workshop…")}</p>{bootError && <><p role="alert" className="error-text">{t("Raw service diagnostics (original language).")} {bootError}</p><p>{t("Start the local services with")}{' '}<code>npm run start</code>{t(". No provider calls have been made.")}</p><button className="primary" onClick={() => void boot()}>{t("Retry connection")}</button></>}</main>{preferencesDialog}</>;

  const index = LESSON_IDS.indexOf(active);
  const currentRun = resultTab === 'fixtures' ? work.fixture : work.agent;
  const alternative = exercise.agentVariants.find(variant => variant !== work.variant);
  const missingReview = !valid ? 'Validate the current evaluator.' : !fixtureReady ? 'Match the known correct and incorrect fixtures for this version.' : !agentCurrent || work.agent?.status !== 'completed' ? 'Complete a real agent run for the same version.' : !cap?.review.available ? 'Review service unavailable.' : !paidReady ? 'Configure the selected local provider.' : busy ? 'Finish or cancel the active operation first.' : undefined;
  const lesson = localizeLesson(exercise, locale);
  const activeOperation = pending?.acceptedId || activeRecords;
  const providerLabel = status?.provider ? `${status.provider.provider === 'openai' ? 'OpenAI' : 'Azure Foundry'} · ${status.provider.model}` : t('Provider setup required');
  return <>
    <a className="skip-link" href="#lesson-title">{t("Skip to lesson")}</a>
    <header className="app-header"><a className="brand" href="#intro"><BrandMark /><span>{t("Evals tutorial")}</span></a>
      <div className="header-actions"><ProviderStatus label={providerLabel} configured={paidReady} />{preferencesButton}</div>
    </header>
    <div className="app-layout">
      <aside className="sidebar"><details className="lesson-menu" open={lessonsOpen} onToggle={event => setLessonsOpen(event.currentTarget.open)}><summary>{t("Lessons")}{' '}<span>{reviewed} {t("/ 6 reviewed")}</span></summary><nav aria-label={t("Tutorial lessons")}><p className="eyebrow">{t("YOUR WORKSHOP")}</p><div className="progress-label">{reviewed} {t("/ 6 cases reviewed")}</div><div className="progress-track" aria-hidden="true"><span style={{ width: `${reviewed / 6 * 100}%` }} /></div>
        {tutorial.exercises.map((e, i) => {
          const w = works[e.id]; const bound = w && reviewCurrent(w.review, snapshot(tutorial, e, w.source), hashes[e.id] ?? null, w.fixture, w.agent, w.variant, status);
          const label = e.readOnly ? w?.agent?.status === 'completed' ? 'Run completed' : e.id === '07-spec-regression' ? 'Read-only guided example' : 'Read-only introduction' : bound && w?.review?.status === 'ready' && reviewFindingsValid(w.review, e, w.fixture, w.agent) ? 'Reviewed' : w?.review ? 'Needs new review' : w?.source !== e.starterSource ? 'Draft' : 'Not started';
          return <a key={e.id} className={`lesson-link ${active === e.id ? 'selected' : ''}`} href={`#${e.id}`} aria-current={active === e.id ? 'page' : undefined}><span className="lesson-number">{i === 0 ? '↳' : String(i).padStart(2, '0')}</span><span><strong>{t(LESSON_LABELS[i]!)}</strong><small>{t(label)}</small><ModeBadge mode={e.mode} /></span></a>;
        })}</nav></details><div className="sidebar-footer"><p>{t("Make the criterion visible.")}<br />{t("Test the evaluator, then the agent.")}</p><button className="text-button" disabled={busy} onClick={() => setReset('tutorial')}>{t("Reset Tutorial")}</button></div></aside>
      <main className="main-content">
        <section className="lesson-intro"><p className="eyebrow">{isSpec ? t("GUIDED EXAMPLE") : exercise.readOnly ? t("START HERE") : t("CASE {case} OF 6", { case: index })}<span> / {LESSON_MINUTES[index]} {t("MIN")}</span><ModeBadge mode={exercise.mode} /></p><h1 ref={headingRef} tabIndex={-1} id="lesson-title">{lesson.title}</h1><LessonText text={lesson.lessonMarkdown} />
          <div className="criteria">{lesson.criteria.map(criterion => <div key={criterion.id}><ModeBadge mode={criterion.mode} /><Markdown text={criterion.description} /></div>)}</div>
          <div className="docs-links">{exercise.officialDocs.map(doc => <ExternalLink key={doc.url} url={doc.url}>{t(doc.title)}</ExternalLink>)}</div>
        </section>
        {active === 'intro' && <EvaluationConcepts />}
        {isSpec && <SpecPreparation exercise={exercise} dataset={dataset} />}
        {!saved && <div className="notice warning" role="status">{t("Edits are not saved in this browser. Keep this tab open and copy your evaluator.")}</div>}
        {work.oldSource !== undefined && <div className="notice warning"><strong>{t("Saved work belongs to an older version.")}</strong><p>{t("The new starter is loaded. Old work carries no completion.")}</p><details><summary>{t("Inspect old evaluator")}</summary><pre>{work.oldSource}</pre></details><button disabled={busy || exercise.readOnly} onClick={() => { edit(work.oldSource!); update(active, { oldSource: undefined }); }}>{t("Copy old source into editor")}</button></div>}
        {work.evidenceError && <div className="notice warning">{t("Raw service diagnostics (original language).")} {work.evidenceError} {t("New evidence is required for completion.")}</div>}
        {(error || pollError) && <div className="notice error-text" role="alert">{typeof error === "object" ? t(error.key, error.parameters) : <>{t("Raw service diagnostics (original language).")} {error ?? pollError}</>}</div>}
        {pending && !pending.acceptedId && <div className="notice warning"><strong>{t("Submission outcome unknown.")}</strong><p>{t("Recover the same request ID. This does not create a new attempt.")}</p><button disabled={!!action} onClick={() => void submit(pending)}>{t("Recover submission")}</button></div>}
        <div className="workspace"><Editor key={`editor-${exercise.id}`} source={work.source} readOnly={exercise.readOnly} busy={busy} onChange={edit} editorRef={editorRef} diagnostics={work.validation?.codeHash === hash ? work.validation.diagnostics : (resultTab === 'fixtures' ? fixtureCurrent : agentCurrent) ? currentRun?.diagnostics ?? [] : []} onCopy={() => navigator.clipboard.writeText(work.source).then(() => setAnnouncement('Evaluator copied.')).catch(() => { editorRef.current?.focus(); editorRef.current?.select(); setAnnouncement('Select and copy the evaluator with your keyboard.'); })} />
        <section className={`actions ${isSpec ? 'spec-actions' : ''}`} aria-label={t("Evaluator actions")}><div className="action-buttons">
          {isSpec ? <><h2>{t('3. Run both prepared versions')}</h2><p className="help">{t('omit-fees is an intentional regression. Each button runs the same three cases with this fixed evaluator and uses agent tokens; running both versions makes six agent calls. No judge calls.')}</p><button className="primary" disabled={busy || !dataset || !paidReady || !cap?.runner.available || !cap.agents.available || !cap.validation.available} onClick={() => runComparison('baseline')}>{t(work.comparison ? 'Start new baseline attempt' : 'Run baseline · 3 cases')}</button><button disabled={busy || !work.baseline || runActive(work.baseline) || !!work.comparison?.candidateRequestId || !dataset || !paidReady || !cap?.runner.available || !cap.agents.available || !cap.validation.available} onClick={() => runComparison('omit-fees')}>{t('Run omit-fees · 3 cases')}</button></> : exercise.readOnly ? <button className="primary" disabled={busy || !dataset || !paidReady || !cap?.runner.available || !cap.agents.available || !cap.validation.available} onClick={() => run('agent')}>{t("Run Introduction")}</button> : <><button disabled={busy || !cap?.validation.available} onClick={() => void validate()}>{t("Validate")}</button><button disabled={!canTest} onClick={() => run('fixtures')}>{t("Test Fixtures")}</button><button className="primary" disabled={!canRun} onClick={() => run('agent')}>{t("Run Agent")}{' '}<span aria-hidden="true">→</span></button></>}
          {activeOperation && <button className="cancel-button" disabled={!!action} onClick={() => void cancel()}>{action === 'Cancelling…' ? t("Cancelling…") : pending?.kind === 'review' ? t("Cancel Review") : t("Cancel")}</button>}
          <button className="text-button" onClick={() => { resultsRef.current?.focus(); resultsRef.current?.scrollIntoView({ block: 'start' }); }}>{t("Inspect results ↓")}</button>
          {!exercise.readOnly && <button className="text-button" disabled={busy} onClick={() => setReset('exercise')}>{t("Reset Exercise")}</button>}
        </div><p className="cost-cue">{exercise.readOnly ? t("Run uses agent tokens.") : usesJudge ? t("Fixtures use judge tokens. Agent runs use agent + judge tokens.") : t("Code fixtures: no provider calls. Agent runs use agent tokens.")} {t("No inference on navigation.")}</p><details className="execution-details"><summary>{t('Execution details')}</summary><p className="help">{t("At most")}{' '}{dataset?.examples.length ?? '—'} {t("agent rows;")}{' '}{exercise.maxJudgeCallsPerRow} {t("judge calls / row;")}{' '}{LIMITS.maxProviderOutputTokens} {t("output tokens / call;")}{' '}{LIMITS.maxRetries} {t("automatic retries;")}{' '}{LIMITS.runTimeoutMs / 60000} {t("minute run deadline. Accepted provider calls may still cost tokens after cancellation.")}</p></details>
          {!exercise.readOnly && !fixtureReady && <p className="help">{t("Run Agent unlocks after the current evaluator distinguishes known correct and incorrect fixtures.")}</p>}
          {action && <p role="status">{t(action)}</p>}
          {!exercise.readOnly && exercise.agentVariants.length > 1 && <div className="comparison-controls"><label>{t("Prepared agent variant")}{' '}<Dropdown label={t("Prepared agent variant")} disabled={busy} value={work.variant} onValueChange={variant => update(active, { variant })} options={exercise.agentVariants.map(variant => ({ value: variant, label: variant }))} /></label><button disabled={!canRun || !agentCurrent || !alternative} onClick={() => run('agent', alternative)}>{t("Compare Prepared Agent")}</button><span className="help">{t("Optional paid comparison on identical source and dataset. Changing variant needs new review evidence.")}</span></div>}
        </section><ReferenceTabs key={exercise.id} exercise={exercise} dataset={dataset} /></div>
        {(active === '02-document-classification' || active === '03-independent-tie-out') && <DocumentPreviews dataset={dataset} />}
        <section className="panel results-panel" ref={resultsRef} tabIndex={-1} aria-labelledby="results-heading"><div className="panel-heading"><h2 id="results-heading">{t("Results")}</h2>{!isSpec && <div className="result-tabs" aria-label={t("Result views")}><button aria-pressed={resultTab === 'fixtures'} onClick={() => setResultTab('fixtures')}>{t("Fixture tests")}</button><button aria-pressed={resultTab === 'agent'} onClick={() => setResultTab('agent')}>{t("Agent run")}</button></div>}</div>{isSpec && current ? <SpecComparisonResults attempt={work.comparison} baseline={work.baseline} candidate={work.candidate} dataset={dataset} current={current} codeHash={hash} status={status} retryRecording={record => void retryRecording(record)} busy={busy} /> : <RunResults run={currentRun} dataset={dataset} current={resultTab === 'fixtures' ? fixtureCurrent : agentCurrent} />}{!isSpec && currentRun && !runActive(currentRun) && currentRun.rows.length > 0 && ['failed', 'not_requested'].includes(currentRun.telemetryStatus) && <button disabled={busy} onClick={() => void retryRecording(currentRun)}>{t("Retry Phoenix recording · no inference")}</button>}</section>
        {!exercise.readOnly && <section className="panel review-panel" aria-labelledby="review-heading"><div className="panel-heading"><div><p className="eyebrow">{t("REVIEW YOUR WORK")}</p><h2 id="review-heading">{t("DOUBLE CHECK")}</h2></div><span className="mode mode-judge">{t("Uses review tokens")}</span></div><p>{t("A separate educational review reads your evaluator, rubric and results. It never executes your source. Its feedback is fallible and does not grant human approval.")}</p><p className="help">{t("Source")}{' '}{hash?.slice(0, 10) ?? t("hashing…")} {t("· rubric")}{' '}{exercise.rubricVersion} {t("· fixture")}{' '}{work.fixtureRunId ?? t("missing")} {t("· agent")}{' '}{work.agentRunId ?? t("missing")}</p>
          {missingReview && <p className="review-prerequisite">{t(missingReview)}</p>}
          <div className="action-buttons"><button className="primary" disabled={!canReview} onClick={review}>{work.review?.status === 'failed' || work.review?.status === 'inconclusive' ? t("Retry Review") : work.review ? t("Review Again") : t("DOUBLE CHECK")}</button>{work.review?.status === 'needs_changes' && <button disabled={busy} onClick={() => editorRef.current?.focus()}>{t("Edit evaluator")}</button>}</div><p className="help">{t("Explicit retries may use more tokens. Prior attempts stay inspectable; repeated retries do not guarantee correctness.")}</p>
          {work.review && <ReviewFeedback review={work.review} current={reviewIsCurrent} jumpToRow={jumpToRow} />}
        </section>}
        {(work.pastReceiptIds?.length ?? 0) > 0 && <details className="previous-attempts"><summary>{t("Saved previous receipt IDs (")}{work.pastReceiptIds?.length})</summary>{work.pastReceiptIds?.map(receipt => <button className="text-button" key={receipt.id} onClick={() => request<RunRecord | ReviewRecord>(`/api/${receipt.kind === 'run' ? 'runs' : 'reviews'}/${encodeURIComponent(receipt.id)}`, receipt.kind === 'run' ? 'RunRecord' : 'ReviewRecord').then(record => {
          const latest = workRef.current[active]; if (latest && !latest.history.some(item => ('runId' in item ? item.runId : item.reviewId) === receipt.id)) update(active, { history: [...latest.history, record].slice(-12) });
        }).catch(problem => setError(errorText(problem)))}>{t("Inspect")}{' '}{t(receipt.kind)} {receipt.id}</button>)}</details>}
        {work.history.length > 0 && <details className="previous-attempts"><summary>{t("Previous attempts (")}{work.history.length})</summary>{work.history.map(record => 'runId' in record ? <details key={record.runId}><summary>{t("Run")}{' '}{record.runId} · {record.request.agentVariant} · {t(record.status)}</summary><RunResults run={record} dataset={dataset} current={false} /></details> : <details key={record.reviewId}><summary>{t("Review")}{' '}{record.reviewId} · {t(record.status)}</summary><ReviewFeedback review={record} current={false} jumpToRow={jumpToRow} /></details>)}</details>}
        {reviewed === 6 && <div className="notice success">{t("All six current cases reviewed.")}{' '}{tutorial.exercises.filter(e => !e.readOnly).every(e => works[e.id]?.agent?.telemetryStatus === 'recorded' && works[e.id]?.agent?.phoenix?.experimentUrl) && works.intro?.agent?.telemetryStatus === 'recorded' ? t("Inspect the actual Phoenix evidence to finish the workshop.") : t("Phoenix evidence is still incomplete; the full demonstration is not complete.")}</div>}
        <footer className="lesson-footer">{index > 0 && <a href={`#${LESSON_IDS[index - 1]}`}>← {t(LESSON_LABELS[index - 1]!)}</a>}{index < LESSON_IDS.length - 1 && <a className="next-lesson" href={`#${LESSON_IDS[index + 1]}`}>{t("Next:")}{' '}{t(LESSON_LABELS[index + 1]!)} →</a>}</footer>
      </main>
    </div>
    {preferencesDialog}
    <div className="sr-only" role="status" aria-live="polite">{announcement && t(announcement.key, Object.fromEntries(Object.entries(announcement.parameters ?? {}).map(([key, value]) => [key, key === "status" ? t(String(value)) : value])))}</div>
    <dialog ref={dialogRef} aria-labelledby="reset-title" onCancel={() => setReset(undefined)}><h2 id="reset-title">{reset === 'tutorial' ? t("Reset all local tutorial work?") : t("Reset this exercise?")}</h2><p>{t(reset === "tutorial" ? "Restore the starter evaluators and clear local tutorial progress and evidence bindings. Phoenix history and other applications’ storage are retained." : "Restore the starter evaluator and clear this exercise’s progress and evidence bindings. Phoenix history and other applications’ storage are retained.")}</p><div className="action-buttons"><button data-cancel onClick={() => setReset(undefined)}>{t("Cancel")}</button><button className="danger" disabled={busy} onClick={doReset}>{t("Reset")}{' '}{reset === 'tutorial' ? t("Tutorial") : t("Exercise")}</button></div></dialog>
  </>;
}
