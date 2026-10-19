import { globSync, existsSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { fail, root, python, run } from './lib.mjs';
try {
  const patterns=['packages/contracts/tests/*.test.ts','packages/review/tests/*.test.ts','packages/phoenix/tests/record.test.ts','apps/server/tests/*.test.ts','apps/server/src/providers/*.test.ts','apps/server/src/judge-broker/*.test.ts','apps/server/src/runs/service.test.ts','content/authoring/*.test.ts','tests/integration/*.test.ts'];
  if(existsSync(resolve(root,'apps/web/tests/model.test.ts'))) patterns.push('apps/web/tests/*.test.ts');
  const files=[...globSync(patterns,{cwd:root})].sort();
  const env={...process.env,ET_TEST_CONTENT_ROOT:resolve(root,'content'),TUTORIAL_TEST_PYTHON:process.env.TUTORIAL_TEST_PYTHON??python,PYTHONPATH:[resolve(root,'apps/agents/src'),resolve(root,'packages/contracts/python')].join(delimiter)};
  run(process.execPath,['--import','tsx','--test',...files],{env});
  run(env.TUTORIAL_TEST_PYTHON,['-m','unittest','discover','-s','apps/agents/tests','-v'],{env});
  run(env.TUTORIAL_TEST_PYTHON,['-m','unittest','discover','-s','apps/web/tests','-p','test_browser_harness.py','-v'],{env});
} catch(error){fail(error);}
