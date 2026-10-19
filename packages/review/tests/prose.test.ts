import test from 'node:test';
import assert from 'node:assert/strict';
import { hasDisallowedEducationalProse } from '../src/prose.js';

test('ordinary educational feedback does not trigger the prose guard', () => {
  assert.equal(hasDisallowedEducationalProse('Inspect the cited evidence and retest changes. This review is fallible.'), false);
});

test('clear English and Spanish negations do not become accusations or guarantees', () => {
  for (const prose of [
    'This educational review is not infallible.',
    'This review is NOT INFALLIBLE.',
    'The review is not a guarantee of correctness.',
    'Passing the fixtures does not guarantee correctness.',
    'This does not necessarily guarantee correctness.',
    'This does not automatically prove correctness.',
    'Passing the fixtures cannot guarantee correctness.',
    "This review isn't infallible.",
    'This review isn’t infallible.',
    "Passing the fixtures doesn't guarantee correctness.",
    'Passing the fixtures doesn’t guarantee correctness.',
    'This review is never infallible.',
    'This review is not always correct.',
    'This review is not 100% correct.',
    'You are not cheating.',
    'You are not a cheater.',
    'You did not plagiarize the evaluator.',
    'There is no evidence of cheating.',
    'There is no plagiarism.',
    'Continue without cheating.',
    'This review is not infallible and does not guarantee correctness.',
    'Esta revisión no es infalible.',
    'Esta revisión no puede ser infalible.',
    'Esta revisión nunca es infalible.',
    'Esta revisión jamás es infalible.',
    'La revisión no garantiza un resultado correcto.',
    'La revisión no puede garantizar que sea correcto.',
    'No se garantiza que sea correcto.',
    'No se puede garantizar que sea correcto.',
    'No garantiza necesariamente que sea correcto.',
    'Continúa sin garantizar que sea correcto.',
    'Esto no es plagio.',
    'No hay trampas.',
    'No hace trampas.',
    'No es un tramposo.',
    'La revisión no es infalible y no garantiza que sea correcto.',
  ]) assert.equal(hasDisallowedEducationalProse(prose), false, prose);
});

test('affirmative accusations and correctness promises remain disallowed', () => {
  for (const prose of [
    'You are cheating.',
    'You are a cheater.',
    'You plagiarized the evaluator.',
    'This is plagiarism.',
    'This review is infallible.',
    'I guarantee this is correct.',
    'This guarantees correctness.',
    'This proves correctness.',
    'This is proven correct.',
    'This review is always correct.',
    'This review is 100% correct.',
    'This review is certainly correct.',
    'Esto es trampa.',
    'Haces trampas.',
    'Esto es plagio.',
    'Es una revisión infalible.',
    'Garantiza un resultado correcto.',
    'Es siempre correcto.',
  ]) assert.equal(hasDisallowedEducationalProse(prose), true, prose);
});

test('negation is local and cannot hide a separate affirmative claim', () => {
  for (const prose of [
    'This is not infallible, but guarantees correctness.',
    'This does not guarantee correctness but proves correctness.',
    'This does not guarantee correctness and guarantees correctness.',
    'You are not cheating. This review is infallible.',
    'There is no plagiarism, but you are cheating.',
    'This review is not infallible; the evaluator is infallible.',
    'Esta revisión no es infalible, pero garantiza que sea correcto.',
    'No garantiza que sea correcto y es infalible.',
    'No es plagio. Haces trampas.',
    'This review is not only infallible.',
    'La revisión no solo es infalible.',
  ]) assert.equal(hasDisallowedEducationalProse(prose), true, prose);
});

test('double and nested negative claims are not exempted', () => {
  for (const prose of [
    'This review is not not infallible.',
    'This does not not guarantee correctness.',
    "This isn't not infallible.",
    "This doesn't mean it does not guarantee correctness.",
    'It is not true that this review is not infallible.',
    'It is false that this review is not infallible.',
    'I deny that you are not cheating.',
    'This review is not without infallibility.',
    'Esta revisión no no es infalible.',
    'No es cierto que la revisión no sea infalible.',
    'Es falso que no garantiza que sea correcto.',
    'No puede no garantizar que sea correcto.',
    'No es verdad que no hay plagio.',
  ]) assert.equal(hasDisallowedEducationalProse(prose), true, prose);
});
