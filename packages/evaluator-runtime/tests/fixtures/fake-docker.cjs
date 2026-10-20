#!/usr/bin/env node
'use strict';
// Deterministic daemon model only. Never contacts Docker or executes submitted source.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const file = path.join(root, 'daemon.json');
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const all = process.argv.slice(2);
const args = all[0] === '--config' ? all.slice(2) : all;
const command = args[0];
fs.appendFileSync(path.join(root, 'commands.jsonl'), JSON.stringify(args) + '\n');
const save = () => fs.writeFileSync(file, JSON.stringify(state));
if (command === 'info') {
  console.log(JSON.stringify({ SecurityOptions: ['seccomp'], MemoryLimit: true, SwapLimit: true, PidsLimit: true, CpuCfsQuota: true }));
} else if (command === 'image') {
  console.log('sha256:' + 'a'.repeat(64));
} else if (command === 'ps') {
  const name = args.find(arg => arg.startsWith('name=^/'));
  if (state.visible && (!name || name === 'name=^/' + state.visible + '$')) console.log('a'.repeat(64));
} else if (command === 'create') {
  state.pending = args[args.indexOf('--name') + 1];
  if (state.mode === 'timeout') {
    save();
    setInterval(() => {}, 1000); // The real, unchanged five-second CLI bound kills this frontend.
  } else if (state.mode === 'reject') {
    save();
    console.error('synthetic-private-cli-detail');
    process.exitCode = 1;
  } else {
    state.visible = state.pending;
    save();
    console.log('a'.repeat(64));
  }
} else if (command === 'rm') {
  if (state.failRemove) {
    console.error('synthetic-private-cleanup-detail');
    process.exitCode = 1;
  } else {
    state.visible = null;
    save(); // Successful removal is deliberately allowed before pending create becomes visible.
  }
} else if (command === 'start') {
  if (state.failWorker) console.log(JSON.stringify({ type: 'execution.error', error: { code: 'runtime_error', message: 'Synthetic worker failure', retryable: false } }));
  else console.log(JSON.stringify({ type: 'compile.result', valid: true, diagnostics: [], javascript: 'synthetic-unused' }));
} else {
  process.exitCode = 2;
}
