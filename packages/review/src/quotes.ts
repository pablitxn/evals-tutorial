import { canonicalJson } from '@evals-tutorial/contracts/node';
import type { ReviewBrokerBinding } from '@evals-tutorial/contracts/services';

// Bound catalog input and choices; only ASCII quote IDs enter the provider schema.
// Keep these transport bounds synchronized with tutorial_agents/broker.py.
export const QUOTE_LIMITS = Object.freeze({ entries: 240, characters: 240, bytes: 60000 });
export interface EvidenceQuote {
  id: string;
  kind: 'source' | 'output' | 'evaluation';
  quote: string;
  /** Source is shared; saved row quotes are restricted to these examples. */
  exampleIds: string[];
}

/** Select literal substrings only. In particular, never reformat or join code. */
function snippets(text: string): string[] {
  const characters = Array.from(text.trim());
  if (characters.length < 8) return [];
  const result: string[] = [];
  for (let start = 0; start < characters.length; start += QUOTE_LIMITS.characters - 32) {
    const quote = characters.slice(start, start + QUOTE_LIMITS.characters).join('').trim();
    if (Array.from(quote).length >= 8) result.push(quote);
    if (start + QUOTE_LIMITS.characters >= characters.length) break;
  }
  return result;
}

function objectQuotes(value: Record<string, unknown>): string[] {
  const whole = canonicalJson(value);
  if (Array.from(whole).length <= QUOTE_LIMITS.characters) return snippets(whole);
  // Property/value slices remain contiguous in the canonical JSON used by the
  // grounding validator, while retaining a readable field name on large rows.
  return Object.keys(value).sort().flatMap(key => snippets(`${canonicalJson(key)}:${canonicalJson(value[key])}`));
}

function sample<T>(values: T[], count: number): T[] {
  if (values.length <= count) return values;
  return Array.from({ length: count }, (_, index) => values[Math.floor(index * (values.length - 1) / (count - 1))]!);
}

/** A bounded aid to verbatim selection; raw source and receipts remain in the prompt. */
export function evidenceQuotes(material: Pick<ReviewBrokerBinding, 'source' | 'fixtureRun' | 'agentRun'>): EvidenceQuote[] {
  const groups = new Map<EvidenceQuote['kind'], Map<string, Omit<EvidenceQuote, 'id'>>>(
    ['source', 'output', 'evaluation'].map(kind => [kind as EvidenceQuote['kind'], new Map()]),
  );
  const add = (kind: EvidenceQuote['kind'], quote: string, exampleId?: string) => {
    const group = groups.get(kind)!;
    const existing = group.get(quote);
    if (existing) {
      if (exampleId && !existing.exampleIds.includes(exampleId)) existing.exampleIds.push(exampleId);
    } else group.set(quote, { kind, quote, exampleIds: exampleId ? [exampleId] : [] });
  };
  for (const line of material.source.split(/\r\n|\r|\n/u)) for (const quote of snippets(line)) add('source', quote);
  for (const run of [material.fixtureRun, material.agentRun]) for (const row of run.rows) {
    for (const quote of objectQuotes(row.output ?? {})) add('output', quote, row.exampleId);
    for (const quote of [...snippets(row.evaluation?.explanation ?? ''), ...objectQuotes(row.evaluation ?? {})]) add('evaluation', quote, row.exampleId);
  }
  const selections = [...groups.values()].map(group => sample([...group.values()], QUOTE_LIMITS.entries / 3));
  const catalog: EvidenceQuote[] = [];
  let bytes = 0;
  // Rotate the three kinds so the byte cap cannot crowd out an entire kind.
  for (let index = 0; index < QUOTE_LIMITS.entries / 3; index++) for (const selected of selections) {
    const entry = selected[index];
    if (!entry) continue;
    const size = Buffer.byteLength(entry.quote, 'utf8');
    if (bytes + size > QUOTE_LIMITS.bytes) continue;
    bytes += size;
    catalog.push({ id: `quote-${catalog.length + 1}`, ...entry });
  }
  return catalog;
}
