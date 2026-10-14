import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createContentService } from '../../apps/server/src/http/content.js';
import { withPreparedConsultation } from '../../apps/server/src/http/consultation.js';

test('served consultation binds actual prepared MAF source without changing datasets',async()=>{
  const base=await createContentService(resolve('content'));
  const integrated=await withPreparedConsultation(base,resolve('.'));
  const original=await base.tutorial();const tutorial=await integrated.tutorial();
  assert.notEqual(original.tutorialVersion,tutorial.tutorialVersion);
  for(const exercise of tutorial.exercises){
    assert.ok(exercise.pythonSource.includes('from agent_framework import Agent'));
    assert.ok(exercise.pythonSource.includes('await agent.run'));
    assert.ok(exercise.pythonSource.includes('# Installed exercise: '+exercise.id));
    assert.notEqual(exercise.exerciseVersion,(await base.exercise(exercise.id)).exerciseVersion);
    assert.deepEqual(await integrated.dataset(exercise.id),await base.dataset(exercise.id));
  }
});
