import { Compartment, EditorSelection, EditorState, Prec, type Extension, type StateEffect } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentUnit, syntaxHighlighting, unfoldEffect, foldedRanges } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { lintGutter, nextDiagnostic, previousDiagnostic, setDiagnostics, type Diagnostic as EditorDiagnostic } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import type { CodeEditorProps, EditorHandle } from './CodeEditor.js';
import { exactReplacement, exactSourceExtensions, exactSourceField, sourceDocument, sourcePosition } from './code-editor-source.js';

export interface CodeEditorRuntime extends EditorHandle {
  update(props: CodeEditorProps): void;
  measure(): void;
  destroy(): void;
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, class: 'tok-keyword' },
  { tag: [tags.name, tags.variableName], class: 'tok-name' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'tok-type' },
  { tag: [tags.string, tags.special(tags.string)], class: 'tok-string' },
  { tag: [tags.number, tags.bool, tags.null], class: 'tok-literal' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'tok-function' },
  { tag: tags.propertyName, class: 'tok-property' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'tok-comment' },
  { tag: [tags.operator, tags.punctuation], class: 'tok-punctuation' },
  { tag: tags.meta, class: 'tok-meta' },
  { tag: tags.invalid, class: 'tok-invalid' },
]);

function diagnosticsFor(state: EditorState, props: CodeEditorProps): EditorDiagnostic[] {
  const text = state.doc.toString();
  return (props.diagnostics ?? []).map(diagnostic => {
    const from = sourcePosition(text, diagnostic.line, diagnostic.column);
    const line = state.doc.lineAt(from);
    return { from, to: Math.min(line.to, from + 1), severity: diagnostic.severity, message: diagnostic.message, source: diagnostic.code };
  });
}

export function mountCodeEditor(container: HTMLElement, initial: CodeEditorProps): CodeEditorRuntime {
  let props = initial;
  let destroyed = false;
  const behavior = new Compartment();
  const language = new Compartment();
  const accessibility = new Compartment();
  const attributes = (): Extension => EditorView.contentAttributes.of({
    'aria-label': props.label,
    ...(props.describedBy ? { 'aria-describedby': props.describedBy } : {}),
    'aria-readonly': String(props.readOnly),
    'aria-invalid': String(!!props.diagnostics?.some(diagnostic => diagnostic.severity === 'error')),
    spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
    tabindex: '0',
  });
  const editable = (): Extension => [EditorState.readOnly.of(props.readOnly), EditorView.editable.of(!props.readOnly)];
  const parser = (): Extension => props.language === 'python' ? python() : javascript({ typescript: true });

  function createState(): EditorState {
    return EditorState.create({
      doc: sourceDocument(props.source).text,
      extensions: [
        exactSourceExtensions(props.source),
        history(),
        EditorState.allowMultipleSelections.of(false),
        indentUnit.of('  '),
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        foldGutter(),
        bracketMatching(),
        lintGutter(),
        syntaxHighlighting(highlightStyle),
        language.of(parser()),
        behavior.of(editable()),
        accessibility.of(attributes()),
        EditorView.theme({}, { dark: true }),
        // No Tab binding: Tab and Shift+Tab always leave the editor.
        Prec.highest(keymap.of([
          { key: 'Mod-]', run: indentMore },
          { key: 'Mod-[', run: indentLess },
          { key: 'F8', run: nextDiagnostic, shift: previousDiagnostic },
        ])),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
        EditorState.changeFilter.of(transaction => !transaction.docChanged || !transaction.startState.readOnly),
        EditorView.domEventHandlers({
          paste(event, view) {
            if (view.state.readOnly || !event.clipboardData) return false;
            const text = event.clipboardData.getData('text/plain');
            if (!text) return false;
            const { from, to } = view.state.selection.main;
            event.preventDefault();
            view.dispatch({ ...exactReplacement(view.state, from, to, text), userEvent: 'input.paste' });
            return true;
          },
        }),
        EditorView.clipboardOutputFilter.of((_text, state) => {
          const selection = state.selection.main;
          if (selection.empty) return _text;
          const source = state.field(exactSourceField);
          const offsets = sourceDocument(source).offsets;
          return source.slice(offsets[selection.from], offsets[selection.to]);
        }),
        EditorView.updateListener.of(update => {
          if (destroyed) return;
          const source = update.state.field(exactSourceField);
          // Prop synchronization uses setState, never a user-edit transaction.
          if (source !== update.startState.field(exactSourceField)) props.onChange?.(source);
        }),
      ],
    });
  }

  const view = new EditorView({ parent: container, state: createState() });
  view.dispatch(setDiagnostics(view.state, diagnosticsFor(view.state, props)));

  return {
    focus() { view.focus(); },
    select() { view.dispatch({ selection: EditorSelection.single(0, view.state.doc.length) }); view.focus(); },
    reveal(line, column) {
      const position = sourcePosition(view.state.doc.toString(), line, column);
      const unfold: StateEffect<unknown>[] = [];
      foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
        if (from <= position && to >= position) unfold.push(unfoldEffect.of({ from, to }));
      });
      view.dispatch({ selection: { anchor: position }, effects: [...unfold, EditorView.scrollIntoView(position, { y: 'center' })] });
      view.focus();
    },
    update(next) {
      if (destroyed) return;
      const previous = props;
      props = next;
      if (next.source !== view.state.field(exactSourceField)) {
        // An external reset replaces the whole source and clears undo history.
        // Mounting, changing language and prop updates do not call onChange.
        view.setState(createState());
        view.dispatch(setDiagnostics(view.state, diagnosticsFor(view.state, props)));
        return;
      }
      const effects = [];
      if (previous.readOnly !== next.readOnly) effects.push(behavior.reconfigure(editable()));
      if (previous.language !== next.language) effects.push(language.reconfigure(parser()));
      if (previous.label !== next.label || previous.describedBy !== next.describedBy || previous.readOnly !== next.readOnly || previous.diagnostics !== next.diagnostics) effects.push(accessibility.reconfigure(attributes()));
      if (effects.length) view.dispatch({ effects });
      if (previous.diagnostics !== next.diagnostics) view.dispatch(setDiagnostics(view.state, diagnosticsFor(view.state, props)));
    },
    measure() { if (!destroyed) view.requestMeasure(); },
    destroy() { destroyed = true; view.destroy(); },
  };
}
