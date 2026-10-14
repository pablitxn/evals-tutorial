"""Disposable isolated runner capability probe; never mounts application files."""
import json
import subprocess

IMAGE = 'node@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df'
flags = ['--network=none', '--user=65534:65534', '--read-only', '--cap-drop=ALL',
         '--security-opt=no-new-privileges', '--memory=128m', '--memory-swap=128m',
         '--cpus=0.5', '--pids-limit=32', '--tmpfs=/tmp:rw,noexec,nosuid,size=16m']
source = r'''
const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.equal(process.getuid(), 65534);
assert.match(fs.readFileSync('/proc/self/status', 'utf8'), /CapEff:\s+0+/);
assert.match(fs.readFileSync('/proc/self/status', 'utf8'), /NoNewPrivs:\s+1/);
for (const path of ['/et-probe-write', '/var/run/docker.sock', '/workspace', '/.env']) {
  if (path === '/et-probe-write') assert.throws(() => fs.writeFileSync(path, 'x'));
  else assert.equal(fs.existsSync(path), false);
}
assert.equal(fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(), '134217728');
assert.equal(fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(), '32');
assert.equal(fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim(), '50000 100000');
assert(!Object.keys(process.env).some(k => /API_KEY|TOKEN|SECRET/.test(k)));
assert.deepEqual(Object.keys(require('node:os').networkInterfaces()), ['lo']);
require('node:net').connect({host:'1.1.1.1',port:443}).on('error', e => {
  assert.equal(e.code, 'ENETUNREACH');
  console.log(JSON.stringify({status:'pass', uid:process.getuid(), rootReadOnly:true,
    noCredentials:true, noHostMounts:true, externalNetworkBlocked:true,
    memoryBytes:134217728,pids:32,cpu:0.5,capabilitiesDropped:true,noNewPrivileges:true}));
});
'''
result = subprocess.run(['docker','run','--rm','--name','et-wp-00-runner',*flags,
                         IMAGE,'node','-e',source], capture_output=True, text=True, timeout=30)
receipt = {'flags':flags,'image':IMAGE,'exitCode':result.returncode,
           'stdout':result.stdout.strip(),'stderr':result.stderr.strip()}
assert result.returncode == 0, receipt
try:
    subprocess.run(['docker','run','--rm','--name','et-wp-00-timeout',*flags,
                    IMAGE,'node','-e','while(true){}'], capture_output=True,timeout=3)
    raise AssertionError('Infinite loop unexpectedly completed')
except subprocess.TimeoutExpired:
    subprocess.run(['docker','rm','-f','et-wp-00-timeout'],check=True,capture_output=True)
    remaining = subprocess.check_output(['docker','ps','-aq','--filter','name=^/et-wp-00-timeout$'],text=True)
    assert not remaining.strip()
    receipt['timeoutCleanup'] = 'pass: deadline terminates and removes loop container'
print(json.dumps(receipt,indent=2))
