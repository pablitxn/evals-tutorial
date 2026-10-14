import { readFile } from 'node:fs/promises';
import { createPhoenixTelemetry } from '../src/index.js';
const { dataset, run, options } = JSON.parse(await readFile(process.argv[2]!, 'utf8'));
console.log(JSON.stringify(await createPhoenixTelemetry(options).record(dataset, run, new AbortController().signal)));
