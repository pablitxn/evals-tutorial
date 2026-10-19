import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createContentService } from '../../server/src/http/content.js';
import { withPreparedConsultation } from '../../server/src/http/consultation.js';
import { localizeLesson } from '../src/i18n-core.js';

test('the served prepared consultation localizes all seven lessons without changing source or evidence', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const content = await createContentService(fileURLToPath(new URL('../../../content/', import.meta.url)));
  const original = await content.tutorial();
  const served = await (await withPreparedConsultation(content, root)).tutorial();
  const before = structuredClone(served);

  assert.equal(served.exercises.length, 7);
  for (const exercise of served.exercises) {
    const authored = original.exercises.find(item => item.id === exercise.id)!;
    assert.equal(authored.exerciseVersion, '1.0.0');
    assert.equal(exercise.exerciseVersion, '1.0.0-runtime1');
    assert.equal(exercise.lessonMarkdown, authored.lessonMarkdown);
    assert.deepEqual(exercise.criteria, authored.criteria);
    assert.equal(exercise.rubricVersion, authored.rubricVersion);

    const spanish = localizeLesson(exercise, 'es');
    assert.deepEqual(spanish, localizeLesson(authored, 'es'));
    assert.notEqual(spanish.lessonMarkdown, exercise.lessonMarkdown);
    assert.equal(localizeLesson(exercise, 'en'), exercise);
    for (const exerciseVersion of ['1.0.0-runtime2', '1.0.0-runtime1-extra', '1.0.1-runtime1', '2.0.0-runtime1']) {
      const changed = { ...exercise, exerciseVersion };
      assert.equal(localizeLesson(changed, 'es'), changed);
    }
    const changedRubric = { ...exercise, rubricVersion: '2.0.0' };
    assert.equal(localizeLesson(changedRubric, 'es'), changedRubric);
  }
  assert.deepEqual(served, before);
  assert.deepEqual(await content.tutorial(), original);
});
