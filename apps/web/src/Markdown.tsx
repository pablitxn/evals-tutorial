import React, { type MouseEvent } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeUrl } from './model.js';

function markdownUrl(value: string): string | undefined {
  if (/^[#]/.test(value)) return value;
  return safeUrl(value);
}

function followFragment(event: MouseEvent<HTMLAnchorElement>, href: string) {
  // Lessons use hash routing. Footnotes must scroll within their prose instead
  // of changing the selected lesson or resetting its execution state.
  event.preventDefault();
  let id: string;
  try { id = decodeURIComponent(href.slice(1)); } catch { return; }
  const prose = event.currentTarget.closest('.markdown');
  const target = Array.from(prose?.querySelectorAll<HTMLElement>('[id]') ?? []).find(element => element.id === id);
  if (!target) return;
  target.scrollIntoView({ block: 'nearest' });
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

const components: Components = {
  a({ node: _node, href, children, ...props }) {
    const safe = href ? markdownUrl(href) : undefined;
    if (!safe) return <span>{children}</span>;
    return safe.startsWith('#')
      ? <a {...props} href={safe} onClick={event => followFragment(event, safe)}>{children}</a>
      : <a {...props} href={safe} target="_blank" rel="noopener noreferrer">{children}</a>;
  },
  img({ src, alt, title }) {
    // Provider-authored content must never trigger image requests on render.
    // Keep its description and an explicit, protocol-checked link instead.
    const href = typeof src === 'string' ? safeUrl(src) : undefined;
    return href
      ? <a className="markdown-image-link" href={href} title={title} target="_blank" rel="noopener noreferrer">{alt || href}</a>
      : <span className="markdown-image-link">{alt}</span>;
  },
  table({ node: _node, ...props }) {
    return <div className="markdown-table-scroll" tabIndex={0}><table {...props} /></div>;
  },
};

/** Render prose only. Code, JSON, diagnostics and exact evidence stay literal. */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`markdown markdown-content ${className}`.trim()}>
    {/* Raw HTML is escaped by react-markdown; no HTML-processing plugin is used. */}
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={markdownUrl} components={components}>{text}</ReactMarkdown>
  </div>;
}
