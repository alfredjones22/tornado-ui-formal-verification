"""Materialize locked packages at the original relative paths; never rewrite outputs."""
from pathlib import Path
import hashlib,json,shutil
from ui_source_revision import load_revision
ROOT=Path(__file__).resolve().parents[1]
revision=load_revision(ROOT)
WORK=ROOT/'.release-work'
layout=json.loads((ROOT/'release/runtime-layout.json').read_text())
def digest(path):
 rows=[]
 for f in sorted(path.rglob('*')):
  rel=f.relative_to(path)
  if 'node_modules' in rel.parts or not f.is_file():continue
  b=f.read_bytes();rows.append({'path':str(rel),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
 return hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def remove(path):
 if path.is_symlink() or path.is_file():path.unlink()
 elif path.exists():shutil.rmtree(path)
def link(path,target):
 path.parent.mkdir(parents=True,exist_ok=True);remove(path);path.symlink_to(target,target_is_directory=True)
# Retain only the npm-installed UI toolchain; all release source/output is fresh.
ui=WORK/'ui'
ui.mkdir(parents=True,exist_ok=True)
for p in ui.iterdir():
 if p.name!='node_modules':remove(p)
shutil.copytree(ROOT/'baseline/ui',ui,dirs_exist_ok=True)
for row in revision['removedFiles']:(ui/row['path']).unlink()
shutil.copytree(ROOT/'baseline/build/offline',ui/'offline-assets',dirs_exist_ok=True)
remove(WORK/'kohaku')
sdk=WORK/'kohaku/packages/tornado-cash'
shutil.copytree(ROOT/'baseline/sdk',sdk)
shutil.copyfile(ROOT/'release/sdk-tsconfig.base.json',WORK/'kohaku/tsconfig.base.json')
for relative,row in layout['packages'].items():
 source=ROOT/row['source']
 target=WORK/'kohaku'/relative
 if 'files' in row:
  for name in row['files']:
   dest=target/name;dest.parent.mkdir(parents=True,exist_ok=True)
   shutil.copyfile(source/name,dest)
 else:shutil.copytree(source,target,ignore=shutil.ignore_patterns('node_modules'))
 if 'packageJsonOverride' in row:shutil.copyfile(ROOT/row['packageJsonOverride'],target/'package.json')
 if digest(target)!=row['contentDigest']:raise RuntimeError(f'Runtime input content differs: {row["name"]}@{row["version"]}')
for relative,row in layout['packages'].items():
 for name,target in row['dependencies'].items():link(WORK/'kohaku'/relative/'node_modules'/name,WORK/'kohaku'/target)
for name,target in layout['sdkLinks'].items():link(sdk/'node_modules'/name,WORK/'kohaku'/target)
# Build/declaration tools are pinned separately; their locations are not runtime inputs.
for package in (ROOT/'release/sdk-toolchain/node_modules').iterdir():
 if package.name.startswith('.'):continue
 if package.name.startswith('@'):
  for scoped in package.iterdir():
   target=sdk/'node_modules'/package.name/scoped.name
   if not target.exists():link(target,scoped)
 else:
  target=sdk/'node_modules'/package.name
  if not target.exists():link(target,package)
link(sdk/'node_modules/.bin',ROOT/'release/sdk-toolchain/node_modules/.bin')
print(f'Rebuild workspace: frozen UI with five pinned non-runtime removals and exact README, retained SDK source, {len(layout["packages"])} authenticated runtime-package inputs; original relative layout')
