"""Package an exact clean Git revision from an explicit source allowlist."""
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
TOP={'AGENTS.md','README.md','package.json','package-lock.json','turbo.json','tsconfig.base.json','compose.yaml','.env.example','.gitignore','.npmrc','.dockerignore'}
PREFIXES=('apps/','packages/','content/','scripts/','tests/','docs/')
BAD_PARTS={'node_modules','.venv','.git','.local','.turbo','__pycache__','dist','coverage','.pytest_cache'}
SECRET=re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|\bgh[pousr]_[A-Za-z0-9]{30,}')

def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def allowed(name):
    p=PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or any(v in BAD_PARTS for v in p.parts):return False
    if any(v.startswith('.env') and v!='.env.example' for v in p.parts):return False
    if p.suffix.lower() in {'.pem','.key','.p12','.pfx','.sqlite','.db','.log','.zip','.pyc'}:return False
    return name in TOP or name.startswith(PREFIXES)

def main():
    revision=git('rev-parse','HEAD').decode().strip()
    if git('status','--porcelain','--untracked-files=all').strip():raise SystemExit('Source packaging requires a clean committed worktree')
    entries=[]
    for record in git('ls-tree','-rz','--full-tree',revision).split(b'\0'):
        if not record:continue
        metadata,name=record.split(b'\t',1);mode,kind,oid=metadata.split();name=name.decode('utf-8')
        if mode==b'120000' or kind!=b'blob':raise SystemExit(f'Unexpected symlink/submodule: {name}')
        if not allowed(name):raise SystemExit(f'Tracked file outside source allowlist: {name}')
        data=git('cat-file','blob',oid.decode())
        if SECRET.search(data):raise SystemExit(f'Secret-like content in source: {name}')
        entries.append((name,data,mode==b'100755'))
    manifest={'schemaVersion':'1.0.0','kind':'source-candidate','sourceRevision':revision,'releaseAccepted':False,'files':[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data,_ in entries]}
    manifest_bytes=(json.dumps(manifest,indent=2,sort_keys=True)+'\n').encode()
    output=ROOT/'dist';output.mkdir(exist_ok=True)
    archive=output/f'evals-tutorial-{revision[:12]}.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,data,executable in entries+[('SOURCE-MANIFEST.json',manifest_bytes,False)]:
            info=zipfile.ZipInfo('evals-tutorial/'+name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o100755 if executable else 0o100644)<<16
            z.writestr(info,data)
    with zipfile.ZipFile(archive) as z:
        if z.testzip():raise SystemExit('Archive integrity failure')
        expected={'evals-tutorial/'+x['path']:x for x in manifest['files']}
        if set(z.namelist()) != set(expected)|{'evals-tutorial/SOURCE-MANIFEST.json'}:raise SystemExit('Unexpected ZIP entry')
        for name,entry in expected.items():
            data=z.read(name)
            if not allowed(name.removeprefix('evals-tutorial/')) or SECRET.search(data) or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise SystemExit('Archive content verification failure')
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
    archive.with_suffix('.manifest.json').write_bytes(manifest_bytes)
    print(f'Source candidate: {archive}\nSHA-256: {digest}\nRevision: {revision}\nNot a release acceptance receipt; provider, clean-extraction and rehearsal gates remain separate.')
if __name__=='__main__':main()
