if not __debug__:
    raise RuntimeError("Verification requires Python assertions enabled; unset PYTHONOPTIMIZE.")
from pathlib import Path
import argparse,hashlib,json,subprocess,sys
parser=argparse.ArgumentParser(description="Check the frozen registry-SDK release and optionally a UI checkout.")
options=parser.add_mutually_exclusive_group()
options.add_argument('--live',action='store_true')
options.add_argument('--ui',type=Path,help='Require the exact captured UI main inventory and bytes, including README.')
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'release'))
from ui_source_revision import load_revision
from baseline_storage import stored_path,distributed_input
revision=load_revision(ROOT)
removed={r['path'] for r in revision['removedFiles']}
m=json.loads((ROOT/'baseline/manifest.json').read_text())
profile=json.loads((ROOT/'verification-profile.json').read_text())
rows=m['files']
digest=hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
assert digest==m['contentDigest']==profile['baselineDigest'],'Manifest/profile content digest mismatch'
assert len({(r['namespace'],r['path']) for r in rows})==len(rows),'Duplicate manifest entry'
expected={f'{r["namespace"]}/{r["path"]}' for r in rows if distributed_input(r)}
actual={str(p.relative_to(ROOT/'baseline')) for p in (ROOT/'baseline').rglob('*') if p.is_file()}-{'manifest.json'}
assert actual==expected,f'Baseline file-set mismatch: {actual ^ expected}'
bases={'ui':Path(m['ui']['originalPath']),'sdk':Path(m['sdk']['originalPath']),
 'sdk-dist':Path(m['sdk']['originalPath'])/'dist','sdk-root':Path(m['sdk']['repositoryPath']),
 'sdk-package':Path(m['ui']['originalPath'])/'node_modules/@kohaku-eth/tornado-cash','build':Path(m['ui']['originalPath'])/'dist'}
for row in rows:
    path=bases[row['namespace']]/row['path'] if args.live else stored_path(ROOT,row)
    if path is None:continue
    data=path.read_bytes()
    assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],f'Content changed: {path}'
print(f'{"Live recorded files" if args.live else "Frozen baseline"}: immutable manifest {digest}; input hashes match, generated outputs checked by the release stage')
print('Pinned UI source revision: exact clean main capture; no source-file exceptions')
if args.live:print('Maintainer check includes the original SDK source checkout; its independent drift is expected to fail.')
if args.ui:
    ui=args.ui.resolve()
    output=subprocess.check_output(['git','-C',str(ui),'ls-files','-z','--cached','--others','--exclude-standard'])
    def included(name):
        return not any(part.startswith('.env') or part in {'.git','.aws','.codex','.agents','node_modules'} for part in Path(name).parts)
    actual_ui={name.decode() for name in output.split(b'\0') if name and included(name.decode()) and (ui/name.decode()).is_file()}
    ui_rows=[r for r in rows if r['namespace']=='ui' and r['path'] not in removed]
    expected_ui={r['path'] for r in ui_rows}
    assert actual_ui==expected_ui,f'UI source file-set mismatch: {actual_ui ^ expected_ui}'
    for row in ui_rows:
        data=(ui/row['path']).read_bytes()
        assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],f'UI source changed: {row["path"]}'
    print(f'External UI source: all {len(ui_rows)} files, including exact README, match {ui}')
    print('Installed registry SDK, rebuilt output and expected CID are checked separately in the required release stage.')
