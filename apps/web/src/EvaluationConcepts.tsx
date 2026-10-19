import React, { useState, type ReactNode } from 'react';
import { useI18n } from './i18n.js';
import { read, save } from './storage.js';

const GUIDE_OPEN_KEY = 'evals-tutorial-ui:concepts-open';

type Concept = 'Input' | 'Response' | 'Reference' | 'Evaluator' | 'Score' | 'Dataset' | 'Experiment' | 'Trace';

const concepts: readonly { term: Concept; description: string }[] = [
  { term: 'Input', description: 'Synthetic material given to the agent.' },
  { term: 'Response', description: 'What the agent actually returned.' },
  { term: 'Reference', description: 'An independently authored expected answer; separate from agent input.' },
  { term: 'Evaluator', description: 'A criterion checked with code or a model judge.' },
  { term: 'Score', description: 'Normalized criterion result, separate from execution success.' },
  { term: 'Dataset', description: 'Versioned inputs and references.' },
  { term: 'Experiment', description: 'Recorded outputs and evaluations on a pinned dataset.' },
  { term: 'Trace', description: 'Recorded steps of an actual invocation.' },
];

function LineIcon({ children, className }: { children: ReactNode; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

function ConceptIcon({ term }: { term: Concept }) {
  switch (term) {
    case 'Input': return <LineIcon><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M3 12h11m-4-4 4 4-4 4" /></LineIcon>;
    case 'Response': return <LineIcon><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3Z" /><path d="M7 9h10M7 13h6" /></LineIcon>;
    case 'Reference': return <LineIcon><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" /><path d="m9 9 2 2 4-4" /></LineIcon>;
    case 'Evaluator': return <LineIcon><path d="M4 7h6m4 0h6M4 17h10m4 0h2" /><circle cx="12" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></LineIcon>;
    case 'Score': return <LineIcon><path d="M4 19V5m0 14h16M9 15v-4m5 4V7m5 8V3" /></LineIcon>;
    case 'Dataset': return <LineIcon><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></LineIcon>;
    case 'Experiment': return <LineIcon><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h3m2 4 2 2 3-4M8 15h1" /></LineIcon>;
    case 'Trace': return <LineIcon><circle cx="6" cy="5" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="19" r="2" /><path d="M8 5h6a4 4 0 0 1 4 4v1M16 12h-6a4 4 0 0 0-4 4v1" /></LineIcon>;
  }
}

export function EvaluationConcepts() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => read<unknown>(GUIDE_OPEN_KEY) === true);
  return <details className="evaluation-concepts" open={open} onToggle={event => {
    const next = event.currentTarget.open;
    if (next === open) return;
    setOpen(next);
    save(GUIDE_OPEN_KEY, next);
  }}>
    <summary className="evaluation-concepts-summary">
      <span className="evaluation-concepts-mark"><LineIcon><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 5h7a5 5 0 0 1 5 5v3m-3-3 3 3 3-3M17 19h-7a5 5 0 0 1-5-5v-3m-3 3 3-3 3 3" /></LineIcon></span>
      <span className="evaluation-concepts-summary-copy"><span className="evaluation-concepts-eyebrow">{t('FIELD GUIDE')}</span><span className="evaluation-concepts-title">{t('The evaluation loop, in eight terms')}</span></span>
      <span className="evaluation-concepts-chevron"><LineIcon><path d="m8 10 4 4 4-4" /></LineIcon></span>
    </summary>
    <dl className="evaluation-concepts-grid">
      {concepts.map(({ term, description }, index) => <div className={`evaluation-concept${term === 'Reference' ? ' evaluation-concept--reference' : ''}`} key={term}>
        <dt><span className="evaluation-concept-icon"><ConceptIcon term={term} /></span><span className="evaluation-concept-name">{t(term)}</span><span className="evaluation-concept-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></dt>
        <dd>{t(description)}</dd>
      </div>)}
    </dl>
  </details>;
}
