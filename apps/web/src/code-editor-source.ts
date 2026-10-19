import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';

export interface SourceEdit { from: number; to: number; insert: string }

/** The display uses LF; these offsets retain the original UTF-16 source positions. */
export function sourceDocument(source: string): { text: string; offsets: number[]; lineBreak: string } {
  let text = '';
  const offsets = [0];
  for (let index = 0; index < source.length;) {
    if (source[index] === '\r') {
      text += '\n';
      index += source[index + 1] === '\n' ? 2 : 1;
    } else {
      text += source[index];
      index += 1;
    }
    offsets.push(index);
  }
  return { text, offsets, lineBreak: source.match(/\r\n|\r|\n/)?.[0] ?? '\n' };
}

/** Only replaced ranges change. Untouched CRLF, CR, LF and Unicode remain exact. */
export function applySourceEdits(source: string, edits: readonly SourceEdit[]): string {
  const document = sourceDocument(source);
  let result = '';
  let previous = 0;
  for (const edit of edits) {
    const from = document.offsets[edit.from];
    const to = document.offsets[edit.to];
    if (from === undefined || to === undefined || from < previous || to < from) throw new RangeError('Invalid source edit range.');
    result += source.slice(previous, from) + edit.insert.replace(/\n/g, document.lineBreak);
    previous = to;
  }
  return result + source.slice(previous);
}

/** Server diagnostics use one-based lines and UTF-16 columns, as TypeScript does. */
export function sourcePosition(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.trunc(Number.isFinite(line) ? line : 1) - 1));
  const columnIndex = Math.max(0, Math.min(lines[lineIndex]!.length, Math.trunc(Number.isFinite(column) ? column : 1) - 1));
  let position = columnIndex;
  for (let index = 0; index < lineIndex; index += 1) position += lines[index]!.length + 1;
  return position;
}

export const exactSourceEffect = StateEffect.define<string>();

export const exactSourceField = StateField.define<string>({
  create: state => state.doc.toString(),
  update(source, transaction) {
    let supplied: string | undefined;
    for (const effect of transaction.effects) if (effect.is(exactSourceEffect)) supplied = effect.value;
    if (supplied !== undefined) {
      if (sourceDocument(supplied).text !== transaction.newDoc.toString()) throw new Error('Exact source and editor document disagree.');
      return supplied;
    }
    if (!transaction.docChanged) return source;
    const edits: SourceEdit[] = [];
    transaction.changes.iterChanges((from, to, _fromAfter, _toAfter, inserted) => edits.push({ from, to, insert: inserted.toString() }));
    return applySourceEdits(source, edits);
  },
});

export function exactSourceExtensions(source: string): Extension {
  let clipboardInput: { state: EditorState; text: string } | undefined;
  return [
    exactSourceField.init(() => source),
    // Native drag/drop knows whether to move or copy a selection, but its
    // ChangeSet normalizes incoming text. Capture the bytes before that step.
    EditorView.clipboardInputFilter.of((text, state) => {
      clipboardInput = { state, text };
      return text;
    }),
    EditorState.transactionExtender.of(transaction => {
      const input = clipboardInput;
      clipboardInput = undefined;
      if (!input || input.state !== transaction.startState
        || !(transaction.isUserEvent('input.drop') || transaction.isUserEvent('move.drop') || transaction.isUserEvent('input.paste'))) return null;
      const previous = transaction.startState.field(exactSourceField);
      const { offsets } = sourceDocument(previous);
      const displayInsertion = sourceDocument(input.text).text;
      let result = '', end = 0, insertions = 0;
      let matches = true;
      transaction.changes.iterChanges((from, to, _fromAfter, _toAfter, inserted) => {
        result += previous.slice(end, offsets[from]);
        if (inserted.length) {
          insertions += 1;
          matches &&= inserted.toString() === displayInsertion;
          result += input.text;
        }
        end = offsets[to]!;
      });
      if (!matches || insertions !== 1) return null;
      return { effects: exactSourceEffect.of(result + previous.slice(end)) };
    }),
    // CodeMirror history stores display text. Keep exact source in its inverse effects too.
    invertedEffects.of(transaction => transaction.docChanged || transaction.effects.some(effect => effect.is(exactSourceEffect))
      ? [exactSourceEffect.of(transaction.startState.field(exactSourceField))] : []),
  ];
}

/** Pasting preserves the clipboard's own line endings instead of the display's LF. */
export function exactReplacement(state: EditorState, from: number, to: number, insertion: string) {
  const source = state.field(exactSourceField);
  const document = sourceDocument(source);
  const start = document.offsets[from];
  const end = document.offsets[to];
  if (start === undefined || end === undefined || end < start) throw new RangeError('Invalid source replacement range.');
  const inserted = sourceDocument(insertion).text;
  return {
    changes: { from, to, insert: inserted },
    selection: { anchor: from + inserted.length },
    effects: exactSourceEffect.of(source.slice(0, start) + insertion + source.slice(end)),
  };
}
