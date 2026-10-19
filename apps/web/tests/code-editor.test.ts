import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';
import { CodeEditor } from '../src/CodeEditor.js';
import { applySourceEdits, exactReplacement, exactSourceExtensions, exactSourceField, sourceDocument, sourcePosition } from '../src/code-editor-source.js';

const mixed = '\uFEFF// 🧪\r\nconst a = 1;\nconst b = 2;\rreturn a;\r\n';
const hash = (source: string) => createHash('sha256').update(source).digest('hex');
const stateFor = (source: string) => EditorState.create({ doc: sourceDocument(source).text, extensions: [exactSourceExtensions(source), history()] });

test('the displayed document retains exact mixed line endings, BOM and Unicode source for hashes', () => {
  const state = stateFor(mixed);
  assert.equal(state.doc.toString(), '\uFEFF// 🧪\nconst a = 1;\nconst b = 2;\nreturn a;\n');
  assert.equal(state.field(exactSourceField), mixed);
  assert.equal(hash(state.field(exactSourceField)), hash(mixed));
  assert.notEqual(hash(state.doc.toString()), hash(mixed));
  assert.equal(state.update({ selection: { anchor: 3 } }).state.field(exactSourceField), mixed);
});

test('edits change only their original ranges, preserving every untouched line separator', () => {
  const text = sourceDocument(mixed).text;
  const from = text.indexOf('a = 1');
  const end = text.indexOf('b = 2');
  assert.equal(applySourceEdits(mixed, [
    { from, to: from + 1, insert: 'alpha' },
    { from: end, to: end + 1, insert: 'beta' },
  ]), '\uFEFF// 🧪\r\nconst alpha = 1;\nconst beta = 2;\rreturn a;\r\n');
  assert.throws(() => applySourceEdits(mixed, [{ from: -1, to: 4, insert: '' }]), RangeError);
});

test('ordinary typing uses the document line ending while exact undo and redo restore mixed endings', () => {
  let state = stateFor(mixed);
  const from = state.doc.toString().indexOf('const a');
  const to = state.doc.toString().indexOf('return');
  state = state.update({ changes: { from, to, insert: 'const total = 3;\n' }, userEvent: 'input.type' }).state;
  const changed = '\uFEFF// 🧪\r\nconst total = 3;\r\nreturn a;\r\n';
  assert.equal(state.field(exactSourceField), changed);
  const dispatch = (transaction: Transaction) => { state = transaction.state; };
  assert.equal(undo({ state, dispatch }), true);
  assert.equal(state.field(exactSourceField), mixed);
  assert.equal(hash(state.field(exactSourceField)), hash(mixed));
  assert.equal(redo({ state, dispatch }), true);
  assert.equal(state.field(exactSourceField), changed);
});

test('grouped typing and its undo preserve an original mixed source', () => {
  let state = stateFor(mixed);
  for (const character of ['x', 'y', 'z']) state = state.update({ changes: { from: 0, insert: character }, userEvent: 'input.type' }).state;
  assert.equal(state.field(exactSourceField), 'zyx' + mixed);
  const dispatch = (transaction: Transaction) => { state = transaction.state; };
  assert.equal(undo({ state, dispatch }), true);
  assert.equal(state.field(exactSourceField), mixed);
  assert.equal(redo({ state, dispatch }), true);
  assert.equal(state.field(exactSourceField), 'zyx' + mixed);
});

test('pasted mixed line endings and replacements identical on screen retain exact clipboard text', () => {
  let state = stateFor('a\r\nb\r\nc');
  state = state.update({ ...exactReplacement(state, 0, state.doc.length, 'a\nb\rc'), userEvent: 'input.paste' }).state;
  assert.equal(state.doc.toString(), 'a\nb\nc');
  assert.equal(state.field(exactSourceField), 'a\nb\rc');
  const dispatch = (transaction: Transaction) => { state = transaction.state; };
  assert.equal(undo({ state, dispatch }), true);
  assert.equal(state.field(exactSourceField), 'a\r\nb\r\nc');
  assert.equal(redo({ state, dispatch }), true);
  assert.equal(state.field(exactSourceField), 'a\nb\rc');
});

test('native selection drag moves exact CRLF and CR bytes in either direction and supports undo', () => {
  const original = 'first\nsecond\r\nthird\rfourth';
  const dragged = 'second\r\nthird\r';
  for (const dropPosition of [0, sourceDocument(original).text.length]) {
    let state = stateFor(original);
    // CodeMirror calls this public facet before constructing its normalized
    // native drop ChangeSet, then combines insertion with the selected deletion.
    let input = dragged;
    for (const filter of state.facet(EditorView.clipboardInputFilter)) input = filter(input, state);
    const changes = state.changes([{ from: 6, to: 19 }, { from: dropPosition, insert: input }]);
    state = state.update({ changes, userEvent: 'move.drop' }).state;
    const expected = dropPosition === 0 ? dragged + 'first\nfourth' : 'first\nfourth' + dragged;
    assert.equal(state.field(exactSourceField), expected);
    assert.equal(hash(state.field(exactSourceField)), hash(expected));
    assert.equal(state.doc.toString(), sourceDocument(expected).text);
    const dispatch = (transaction: Transaction) => { state = transaction.state; };
    assert.equal(undo({ state, dispatch }), true);
    assert.equal(state.field(exactSourceField), original);
    assert.equal(redo({ state, dispatch }), true);
    assert.equal(state.field(exactSourceField), expected);
  }
});

test('native copy and external file/text drops retain their own separators without deleting the selection', () => {
  const original = '\uFEFFfirst\nsecond\r\nthird\rfourth';
  const dropped = '\uFEFF🧪\r\nexternal\rtail\n';
  let state = stateFor(original);
  state = state.update({ selection: { anchor: 7, head: 20 } }).state;
  let input = dropped;
  for (const filter of state.facet(EditorView.clipboardInputFilter)) input = filter(input, state);
  state = state.update({ changes: { from: state.doc.length, insert: input }, userEvent: 'input.drop' }).state;
  assert.equal(state.field(exactSourceField), original + dropped);
  assert.equal(state.doc.toString(), sourceDocument(original + dropped).text);
  // The captured input belongs only to that native transaction.
  state = state.update({ changes: { from: state.doc.length, insert: 'next\n' }, userEvent: 'input.type' }).state;
  assert.equal(state.field(exactSourceField), original + dropped + 'next\n');
});

test('read-only filtering rejects a native drop without changing exact source', () => {
  let state = EditorState.create({ doc: sourceDocument(mixed).text, extensions: [
    exactSourceExtensions(mixed), EditorState.readOnly.of(true),
    EditorState.changeFilter.of(transaction => !transaction.docChanged || !transaction.startState.readOnly),
  ] });
  let input = 'dropped\r\ntext\r';
  for (const filter of state.facet(EditorView.clipboardInputFilter)) input = filter(input, state);
  state = state.update({ changes: { from: 0, insert: input }, userEvent: 'input.drop' }).state;
  assert.equal(state.field(exactSourceField), mixed);
  assert.equal(state.doc.toString(), sourceDocument(mixed).text);
});

test('diagnostic navigation clamps out-of-range values without splitting UTF-16 coordinates', () => {
  const text = sourceDocument(mixed).text;
  assert.equal(sourcePosition(text, 2, 1), text.indexOf('const a'));
  assert.equal(sourcePosition('🧪x\ny', 1, 3), 2);
  assert.equal(sourcePosition('abc\nd', -10, -8), 0);
  assert.equal(sourcePosition('abc\nd', 99, 99), 5);
  assert.equal(sourcePosition('', Number.NaN, Number.POSITIVE_INFINITY), 0);
});

test('SSR fallback is readable exact source, never an edit or executable HTML', () => {
  let edits = 0;
  const source = '// <script>\r\nconst value = "<b>";\r';
  const html = renderToStaticMarkup(createElement(CodeEditor, { source, language: 'typescript', readOnly: false, label: 'Evaluator', onChange: () => { edits += 1; } }));
  assert.match(html, /data-editor-state="loading"/);
  assert.match(html, /aria-readonly="true"/);
  assert.ok(html.includes('// &lt;script&gt;\r\nconst value = &quot;&lt;b&gt;&quot;;\r'));
  assert.doesNotMatch(html, /<script>/);
  assert.equal(edits, 0);
});
