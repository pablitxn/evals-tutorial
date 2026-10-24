#!/usr/bin/env node
'use strict';
// Concurrent fake daemon with real label/ID/name filtering; never contacts Docker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const all = process.argv.slice(2);
const args = all[0] === '--config' ? all.slice(2) : all;
const command = args[0];
fs.appendFileSync(path.join(root, 'commands.jsonl'), JSON.stringify(args) + '\n');
const directory = kind => { const p = path.join(root, kind); fs.mkdirSync(p, { recursive: true }); return p; };
const records = kind => fs.readdirSync(directory(kind)).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(directory(kind), name), 'utf8')));
const save = (kind, record) => { const destination = path.join(directory(kind), record.id + '.json'); const temporary = destination + '.tmp-' + process.pid; fs.writeFileSync(temporary, JSON.stringify(record)); fs.renameSync(temporary, destination); };
const wait = file => new Promise(resolve => { const timer = setInterval(() => { if (fs.existsSync(path.join(root, file))) { clearInterval(timer); resolve(); } }, 5); });
async function hold(phase, enabled, record) {
  if (!enabled) return;
  try { fs.writeFileSync(path.join(root, phase + '-claimed'), '', { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') return; throw error; }
  fs.writeFileSync(path.join(root, phase + '-waiting'), JSON.stringify(record || {}));
  await wait('release-' + phase);
}
const filters = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--filter') filters.push(args[++i]);
const matches = record => filters.every(filter => {
  if (filter.startsWith('label=')) {
    const label = filter.slice(6); const separator = label.indexOf('=');
    return separator === -1 ? label in record.labels : record.labels[label.slice(0, separator)] === label.slice(separator + 1);
  }
  if (filter.startsWith('name=')) return new RegExp(filter.slice(5)).test('/' + record.name);
  if (filter.startsWith('id=')) return record.id.startsWith(filter.slice(3));
  throw new Error('Unsupported fake filter');
});
async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'daemon.json'), 'utf8'));
  if (command === 'info') {
    console.log(JSON.stringify({ SecurityOptions: ['seccomp'], MemoryLimit: true, SwapLimit: true, PidsLimit: true, CpuCfsQuota: true }));
  } else if (command === 'image') {
    await hold('image', config.holdImage);
    console.log('sha256:' + 'a'.repeat(64));
  } else if (command === 'ps') {
    for (const record of records('containers').filter(matches)) console.log(args.includes('--no-trunc') ? record.id : record.id.slice(0, 12));
  } else if (command === 'create') {
    const name = args[args.indexOf('--name') + 1];
    const labels = {};
    for (let i = 0; i < args.length; i++) if (args[i] === '--label') { const value = args[++i]; const separator = value.indexOf('='); labels[value.slice(0, separator)] = value.slice(separator + 1); }
    const record = { name, id: crypto.createHash('sha256').update(name).digest('hex'), labels };
    save('pending', record);
    await hold('create', config.holdCreate, record);
    if (config.collision) {
      record.labels['evals-tutorial.' + config.collision] = 'foreign';
      save('containers', record);
    }
    if (config.mode === 'timeout') setInterval(() => {}, 1000);
    else if (config.mode === 'reject' || config.collision) { console.error('synthetic-private-cli-detail'); process.exitCode = 1; }
    else { save('containers', record); console.log(record.id); }
  } else if (command === 'rm') {
    await hold('remove', config.holdRemove);
    if (config.failRemove) { console.error('synthetic-private-cleanup-detail'); process.exitCode = 1; }
    else for (const record of records('containers')) {
      // Faithfully accept either IDs or names: the supervisor must choose owned full IDs.
      if (args.slice(2).some(target => target === record.name || record.id.startsWith(target))) fs.unlinkSync(path.join(directory('containers'), record.id + '.json'));
    }
  } else if (command === 'start') {
    await hold('start', config.holdStart);
    if (config.failWorker) console.log(JSON.stringify({ type: 'execution.error', error: { code: 'runtime_error', message: 'Synthetic worker failure', retryable: false } }));
    else console.log(JSON.stringify({ type: 'compile.result', valid: true, diagnostics: [], javascript: 'synthetic-unused' }));
  } else process.exitCode = 2;
}
main().catch(() => { console.error('Fake daemon operation failed'); process.exitCode = 2; });
