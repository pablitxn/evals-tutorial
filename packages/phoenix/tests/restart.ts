import { readFile } from 'node:fs/promises';
import { createPhoenixTelemetry } from '../src/index.js';
const { dataset, run, options } = JSON.parse(await readFile(process.argv[2]!, 'utf8'));
try {
  console.log(JSON.stringify(await createPhoenixTelemetry(options).record(dataset, run, new AbortController().signal)));
} catch (error) {
  if ((error as Error).message === 'Verified Phoenix GlobalIDs do not fit the installed PhoenixLinks contract') console.log(JSON.stringify({ contractBlocked: true }));
  else throw error;
}
