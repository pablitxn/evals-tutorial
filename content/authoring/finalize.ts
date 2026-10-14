/** Finalize only source-owned dataset identities with the frozen hash authority. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { datasetHash } from '@evals-tutorial/contracts/node';
import { assertContract, type Dataset, type Tutorial } from '@evals-tutorial/contracts';
const root = resolve(import.meta.dirname, '..');
const tutorial = JSON.parse(await readFile(resolve(root, 'tutorial.json'), 'utf8')) as Tutorial;
for (const exercise of tutorial.exercises) {
  const path = resolve(root, `datasets/${exercise.datasetId}/${exercise.datasetVersion}.json`);
  const dataset = JSON.parse(await readFile(path, 'utf8')) as Dataset;
  dataset.contentHash = datasetHash(dataset);
  exercise.datasetHash = dataset.contentHash;
  assertContract('Dataset', dataset);
  await writeFile(path, JSON.stringify(dataset, null, 2) + '\n');
}
assertContract('Tutorial', tutorial);
await writeFile(resolve(root, 'tutorial.json'), JSON.stringify(tutorial, null, 2) + '\n');
console.log('Finalized seven RFC 8785 dataset identities and Tutorial envelope.');
