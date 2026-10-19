import React, { useCallback, type KeyboardEvent } from 'react';
import { JsonView } from 'react-json-view-lite';
import { useI18n } from './i18n.js';

const treeStyles = {
  container: 'json-tree',
  basicChildStyle: 'json-tree-row',
  childFieldsContainer: 'json-tree-children',
  label: 'json-tree-key',
  clickableLabel: 'json-tree-key json-tree-key-clickable',
  nullValue: 'json-tree-null',
  undefinedValue: 'json-tree-null',
  stringValue: 'json-tree-string',
  booleanValue: 'json-tree-boolean',
  numberValue: 'json-tree-number',
  otherValue: 'json-tree-value',
  punctuation: 'json-tree-punctuation',
  collapseIcon: 'json-tree-toggle json-tree-toggle-open',
  expandIcon: 'json-tree-toggle',
  collapsedContent: 'json-tree-preview',
  quotesForFieldNames: true,
  stringifyStringValues: true,
};

/** Complete activation semantics for the library's ARIA button expanders. */
export function activateJsonToggle(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target as HTMLElement;
  if (target.getAttribute?.('role') !== 'button') return;
  event.preventDefault();
  event.stopPropagation();
  target.click();
}

export function JsonViewer({ value, label, compact = false, initialDepth = compact ? 1 : 2 }: {
  value: unknown;
  label?: string;
  compact?: boolean;
  initialDepth?: number;
}) {
  const { t } = useI18n();
  const title = label ?? t('JSON data');
  const shouldExpandNode = useCallback((level: number) => level < initialDepth, [initialDepth]);
  const structured = value !== null && typeof value === 'object';
  return <section className={`json-viewer${compact ? ' json-viewer-compact' : ''}`} aria-label={title}>
    <div className="json-viewer-toolbar">
      <span className="json-viewer-title"><span aria-hidden="true">{'{ }'}</span>{title}</span>
    </div>
    <div className="json-viewer-body" onKeyDownCapture={activateJsonToggle}>
      {structured
        ? <JsonView data={value} aria-label={title} shouldExpandNode={shouldExpandNode} clickToExpandNode
          style={{ ...treeStyles, ariaLables: { expandJson: t('Expand JSON'), collapseJson: t('Collapse JSON') } }} />
        : <pre className="json-viewer-primitive">{JSON.stringify(value, null, 2) ?? String(value)}</pre>}
    </div>
  </section>;
}
