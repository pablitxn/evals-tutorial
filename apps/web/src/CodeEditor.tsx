import React, { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Diagnostic } from '@evals-tutorial/contracts';
import type { CodeEditorRuntime } from './code-editor-runtime.js';

export interface EditorHandle {
  focus(): void;
  select(): void;
  reveal(line: number, column: number): void;
}

export interface CodeEditorProps {
  source: string;
  onChange?: (source: string) => void;
  readOnly: boolean;
  language: 'typescript' | 'python';
  label: string;
  describedBy?: string;
  diagnostics?: readonly Diagnostic[];
  editorRef?: Ref<EditorHandle>;
  expanded?: boolean;
  id?: string;
  unavailableLabel?: string;
}

/** The heavy editor loads locally on demand; SSR always retains exact, readable source. */
export function CodeEditor(props: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const fallback = useRef<HTMLPreElement>(null);
  const runtime = useRef<CodeEditorRuntime | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [phase, setPhase] = useState<'loading' | 'ready' | 'fallback'>('loading');

  useImperativeHandle(props.editorRef, () => ({
    focus() { if (runtime.current) runtime.current.focus(); else fallback.current?.focus(); },
    select() {
      if (runtime.current) runtime.current.select();
      else if (fallback.current) {
        fallback.current.focus();
        const range = document.createRange();
        range.selectNodeContents(fallback.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    },
    reveal(line, column) { if (runtime.current) runtime.current.reveal(line, column); else fallback.current?.focus(); },
  }), []);

  useEffect(() => {
    let disposed = false;
    import('./code-editor-runtime.js').then(({ mountCodeEditor }) => {
      if (disposed || !container.current) return;
      runtime.current = mountCodeEditor(container.current, latest.current);
      setPhase('ready');
    }).catch(() => { if (!disposed) setPhase('fallback'); });
    return () => { disposed = true; runtime.current?.destroy(); runtime.current = null; };
  }, []);

  useEffect(() => { runtime.current?.update(props); });
  useEffect(() => { if (phase === 'ready') runtime.current?.measure(); }, [phase, props.expanded]);

  return <div id={props.id} className={`code-editor code-editor--${props.language}${props.expanded ? ' code-editor--expanded' : ''}`} data-editor-state={phase} data-readonly={props.readOnly}>
    {phase !== 'ready' && <pre ref={fallback} className="code-editor-fallback" tabIndex={0} role="textbox" aria-multiline="true" aria-readonly="true" aria-label={props.label} aria-describedby={props.describedBy} aria-busy={phase === 'loading'}>{props.source}</pre>}
    <div ref={container} className="code-editor-mount" hidden={phase !== 'ready'} />
    {phase === 'fallback' && <p className="code-editor-unavailable" role="status">{props.unavailableLabel ?? 'Editor unavailable. Source remains available to select and copy.'}</p>}
  </div>;
}
