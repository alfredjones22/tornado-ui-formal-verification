// Connect retained source-build evidence to the exact npm package used by Vite.
import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
function inventory(directory) {
  function files(dir) {
    return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
      const path=resolve(dir,e.name);
      if(e.isSymbolicLink())throw Error('Registry package contains a symlink: '+path);
      return e.isDirectory()?files(path):[path];
    });
  }
  return files(directory).sort().map(p=>{const b=readFileSync(p);return {path:relative(directory,p),bytes:b.length,sha256:hash(b)}});
}
export function verifyRegistrySDK(root,baseline,profile,rebuiltSDK) {
  const expected=profile.registrySDK;
  if(JSON.stringify(expected)!==JSON.stringify(baseline.registrySDK))throw Error('Registry SDK profile/manifest disagreement');
  const ui=resolve(root,'.release-work/ui');
  const packagePath=resolve(ui,'node_modules/@kohaku-eth/tornado-cash');
  if(lstatSync(packagePath).isSymbolicLink()||realpathSync(packagePath)!==packagePath)throw Error('UI must use its installed registry SDK, without a local link');
  const pkg=JSON.parse(readFileSync(resolve(packagePath,'package.json')));
  const uiPackage=JSON.parse(readFileSync(resolve(ui,'package.json')));
  const lock=JSON.parse(readFileSync(resolve(ui,'package-lock.json')));
  const entry=lock.packages['node_modules/@kohaku-eth/tornado-cash'];
  if(pkg.name!==expected.name||pkg.version!==expected.version||uiPackage.dependencies[expected.name]!==expected.version||lock.packages[''].dependencies[expected.name]!==expected.version)throw Error('Registry SDK exact version pin changed');
  for(const key of ['version','resolved','integrity'])if(entry[key]!==expected[key])throw Error('SDK lockfile '+key+' changed');
  for(const [path,row] of Object.entries(lock.packages))if(row.link||path.startsWith('../')||String(row.resolved??'').startsWith('file:'))throw Error('Local dependency in frozen UI lockfile: '+path);
  const actual=inventory(packagePath);
  const frozen=baseline.files.filter(r=>r.namespace==='sdk-package').map(({path,bytes,sha256})=>({path,bytes,sha256}));
  if(actual.length!==expected.packageFileCount||JSON.stringify(actual)!==JSON.stringify(frozen))throw Error('Installed registry SDK package bytes/inventory changed');
  const sourceBuilt=inventory(rebuiltSDK);
  if(sourceBuilt.length!==expected.sourceRebuiltArtifacts)throw Error('SDK source-build artifact count changed');
  const packaged=new Map(actual.map(r=>[r.path,r]));
  for(const row of sourceBuilt) {
    const p=packaged.get('dist/'+row.path);
    if(!p||p.bytes!==row.bytes||p.sha256!==row.sha256)throw Error('Source-built SDK differs from npm package: '+row.path);
  }
  const sourceJS=sourceBuilt.filter(r=>r.path.endsWith('.js')).map(r=>'dist/'+r.path).sort();
  const packagedJS=actual.filter(r=>r.path.endsWith('.js')).map(r=>r.path).sort();
  if(JSON.stringify(sourceJS)!==JSON.stringify(packagedJS))throw Error('Published SDK JavaScript lacks source-build coverage');
  const covered=new Set(sourceBuilt.map(r=>'dist/'+r.path));
  const extras=actual.filter(r=>!covered.has(r.path)).map(r=>r.path).sort();
  if(expected.additionalDeclaration!=='dist/merkle-tree.node.d.ts'||JSON.stringify(extras)!==JSON.stringify(['README.md','dist/merkle-tree.node.d.ts','package.json']))throw Error('Unexpected source-unrebuilt SDK package files');
  return {result:'MATCH',name:expected.name,version:expected.version,resolved:expected.resolved,integrity:expected.integrity,
    installedPackageFiles:actual,sourceRebuiltArtifacts:sourceBuilt.length,sourceCoveredJavaScriptFiles:sourceJS,
    runtimeArtifactCoverage:'ALL_PUBLISHED_JAVASCRIPT_BYTE_IDENTICAL_TO_SOURCE_REBUILD',
    sourceUnrebuiltPackageFiles:extras,
    additionalDeclaration:'dist/merkle-tree.node.d.ts is integrity-pinned package content; no source-rebuild claim for this extra declaration.',
    localDependencyLinks:false};
}
