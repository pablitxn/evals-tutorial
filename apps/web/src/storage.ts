import type { ComparisonAttempt } from './comparison.js';
import type { Exercise, ExerciseId, Tutorial, RunRequest, ReviewRequest } from '@evals-tutorial/contracts';

export type SavedWork = {
  comparison?: ComparisonAttempt;
  source: string;
  rubricVersion: string;
  datasetHash: string;
  variant: string;
  fixtureRunId?: string;
  agentRunId?: string;
  reviewId?: string;
  pastReceiptIds?: Array<{ kind: 'run' | 'review'; id: string }>;
};
export type PendingSubmission = ({ kind: 'run'; request: RunRequest } | { kind: 'review'; request: ReviewRequest }) & { acceptedId?: string };
export const PREFIX = 'evals-tutorial:';
export const PENDING_KEY = `${PREFIX}pending-operation`;
export function storageKey(tutorial: Tutorial, exercise: Exercise): string {
  return `${PREFIX}${tutorial.tutorialVersion}:${exercise.id}:${exercise.exerciseVersion}`;
}
export function save(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function read<T>(key: string): T | undefined {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : undefined; } catch { return undefined; }
}
export function remove(key: string): boolean {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}
export function loadWork(tutorial: Tutorial, exercise: Exercise): { work: SavedWork; oldSource?: string } {
  const saved = read<Partial<SavedWork>>(storageKey(tutorial, exercise));
  const base: SavedWork = { source: exercise.starterSource, variant: exercise.defaultAgentVariant, rubricVersion: exercise.rubricVersion, datasetHash: exercise.datasetHash };
  if (saved && typeof saved.source === 'string') {
    if (saved.rubricVersion !== exercise.rubricVersion || saved.datasetHash !== exercise.datasetHash) return { work: base, oldSource: saved.source };
    const work = { ...base, source: saved.source, variant: exercise.agentVariants.includes(saved.variant ?? '') ? saved.variant! : exercise.defaultAgentVariant };
    for (const key of ['fixtureRunId', 'agentRunId', 'reviewId'] as const) if (typeof saved[key] === 'string' && /^[\w.:-]+$/.test(saved[key]!)) Object.assign(work, { [key]: saved[key] });
    if (Array.isArray(saved.pastReceiptIds)) Object.assign(work, { pastReceiptIds: saved.pastReceiptIds.filter(item => item && ['run', 'review'].includes(item.kind) && typeof item.id === 'string' && /^[\w.:-]+$/.test(item.id)).slice(-12) });
    const pair = saved.comparison;
    const safeId = (value: unknown): value is string => typeof value === 'string' && /^[\w.:-]+$/.test(value);
    if (pair && safeId(pair.id) && safeId(pair.baselineRequestId) && ['candidateRequestId', 'baselineRunId', 'candidateRunId'].every(key => pair[key as keyof ComparisonAttempt] === undefined || safeId(pair[key as keyof ComparisonAttempt]))) Object.assign(work, { comparison: pair });
    return { work };
  }
  try {
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(PREFIX) && key.includes(`:${exercise.id}:`)).sort().reverse()) {
      const previous = read<{ source?: unknown }>(key);
      if (typeof previous?.source === 'string') return { work: base, oldSource: previous.source };
    }
  } catch { /* In-memory work remains available when storage is disabled. */ }
  return { work: base };
}
export function resetStorage(exerciseId?: ExerciseId): boolean {
  try {
    for (const key of Object.keys(localStorage)) if (key !== `${PREFIX}locale` && key.startsWith(PREFIX) && (!exerciseId || key.includes(`:${exerciseId}:`))) localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
