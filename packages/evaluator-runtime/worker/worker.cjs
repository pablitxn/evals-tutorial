'use strict';
// Container-only entrypoint. Never import this file into the server process.
const readline = require('node:readline');
const { compile } = require('./compiler.cjs');
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let started = false;
const pending = new Map();
let sequence = 0;
lines.on('line', async line => {
  try {
    if (Buffer.byteLength(line) > 1048576) process.exit(3);
    const message = JSON.parse(line);
    if (started) {
      if (message.type !== 'judge.response' || !pending.has(message.id)) process.exit(3);
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(Object.assign(new Error('Broker operation failed'), { operationError: message.error }));
      else resolve(message.result);
      return;
    }
    started = true;
    if (message.operation === 'compile') {
      emit({ type: 'compile.result', ...compile(message.source) });
      process.exit(0);
    }
    if (message.operation !== 'evaluate') process.exit(3);
    const module = { exports: {} };
    // This is deliberately untrusted code, inside the Docker OS boundary.
    new Function('exports', 'module', message.javascript)(module.exports, module);
    const ctx = Object.freeze({ judge: request => new Promise((resolve, reject) => {
      const id = String(++sequence);
      pending.set(id, { resolve, reject });
      emit({ schemaVersion: '1.0.0', type: 'judge.request', id, runId: message.runId, exampleId: message.row.metadata.exampleId, request });
    }) });
    const result = await module.exports.evaluate(message.row, ctx);
    if (pending.size) { emit({ type: 'execution.error', error: { code: 'protocol_error', message: 'Evaluator left pending judge operations', retryable: false } }); process.exit(3); }
    emit({ type: 'evaluation.result', result });
    process.exit(0);
  } catch (error) {
    const detail = error?.operationError;
    emit({ type: 'execution.error', error: detail ?? { code: 'runtime_error', message: 'Evaluator threw an exception', retryable: false } });
    process.exit(1);
  }
});
