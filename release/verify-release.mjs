// Reproduce every byte, then recompute the content address. No output normalization.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { directoryCID, importSettings } from './cid.mjs';
import { verifyRegistrySDK } from './registry-sdk.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const profile=read('verification-profile.json'), baseline=read('baseline/manifest.json');
const output=resolve(root,'reports/release-correspondence.json');
rmSync(output,{force:true});
const sourceRevisionAnchor=profile.uiSourceRevision;
if(sourceRevisionAnchor.manifest!=='release/ui-source-revision.json')throw Error('Unsupported UI source revision');
const sourceRevisionBytes=readFileSync(resolve(root,sourceRevisionAnchor.manifest));
if(hash(sourceRevisionBytes)!==sourceRevisionAnchor.sha256)throw Error('UI source revision changed');
const uiSourceRevision=JSON.parse(sourceRevisionBytes);
const inputsBytes=readFileSync(resolve(root,'release/input-manifest.json'));
if(hash(inputsBytes)!==profile.releaseCorrespondence.inputManifestSHA256)throw Error('Rebuild input manifest changed');
for(const row of JSON.parse(inputsBytes).files)if(hash(readFileSync(resolve(root,row.path)))!==row.sha256)throw Error('Rebuild input changed: '+row.path);
function command(label,executable,args) {
  const r=spawnSync(executable,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
  const path=resolve(root,`reports/rebuild/${label}.log`);mkdirSync(resolve(root,'reports/rebuild'),{recursive:true});
  writeFileSync(path,(r.stdout??'')+(r.stderr??''));
  if(r.error||r.status!==0)throw Error(`${label} failed (${r.error?.message??r.signal??r.status}); see ${relative(root,path)}`);
}
command('workspace',resolve(root,'.venv/bin/python'),['release/prepare-workspace.py']);
command('sdk','npm',['--prefix','.release-work/kohaku/packages/tornado-cash','run','build']);
function inventory(directory) {
  function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]); }
  return files(directory).sort().map(p=>{const b=readFileSync(p);return{path:relative(directory,p),bytes:b.length,sha256:hash(b)}});
}
function compare(namespace,directory) {
  const actual=inventory(directory),expected=baseline.files.filter(r=>r.namespace===namespace).map(({path,bytes,sha256})=>({path,bytes,sha256}));
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Byte-for-byte ${namespace} rebuild mismatch; no normalization or baseline replacement is allowed`);
  return actual;
}
const toolVersions={node:process.version,ipfsUnixfsImporter:read('node_modules/ipfs-unixfs-importer/package.json').version,blockstoreCore:read('node_modules/blockstore-core/package.json').version,tsup:read('release/sdk-toolchain/node_modules/tsup/package.json').version,esbuild:read('release/sdk-toolchain/node_modules/esbuild/package.json').version,rollup:read('release/sdk-toolchain/node_modules/rollup/package.json').version,sdkTypeScript:read('release/sdk-toolchain/node_modules/typescript/package.json').version,vite:read('.release-work/ui/node_modules/vite/package.json').version,vueTsc:read('.release-work/ui/node_modules/vue-tsc/package.json').version,vue:read('.release-work/ui/node_modules/vue/package.json').version};
const sdk=compare('sdk-dist',resolve(root,'.release-work/kohaku/packages/tornado-cash/dist'));
const registrySDK=verifyRegistrySDK(root,baseline,profile,resolve(root,'.release-work/kohaku/packages/tornado-cash/dist'));
command('ui','npm',['--prefix','.release-work/ui','run','build:ipfs']);
const build=compare('build',resolve(root,'.release-work/ui/dist'));
const rebuiltCID=await directoryCID(resolve(root,'.release-work/ui/dist'));
const expected=profile.releaseCorrespondence.expectedCID;
if(rebuiltCID!==expected||expected!==baseline.expectedCID)throw Error('Expected CID does not match the byte-checked rebuild');
if(profile.releaseCorrespondence.deploymentRecord!=='release/deployment.json')throw Error('Unsupported deployment record');
const deploymentEvidence=read(profile.releaseCorrespondence.deploymentRecord);
if(deploymentEvidence.schemaVersion!==1||deploymentEvidence.baselineDigest!==baseline.contentDigest||deploymentEvidence.expectedCID!==expected||deploymentEvidence.reportedUploadedCID!==expected||deploymentEvidence.result!=='MATCH'||deploymentEvidence.evidenceKind!=='PUBLISHER_REPORTED_INDEPENDENT_UPLOAD_CID'||deploymentEvidence.gatewayDelivery!=='NOT_CHECKED'||profile.releaseCorrespondence.deploymentStatus!=='PUBLISHER_REPORTED_CID_MATCH')throw Error('Publisher-reported upload CID does not match the verified release');
const report={schemaVersion:1,runId:process.env.FV_RUN_ID??randomUUID(),finishedAtUTC:new Date().toISOString(),
 baselineDigest:baseline.contentDigest,result:'MATCH',sourceBuildCorrespondence:'BYTE_IDENTICAL_SDK_AND_UI_REBUILD',
 cidCorrespondence:'EXACT_UNIXFS_ROOT_MATCH',expectedCID:expected,deploymentStatus:profile.releaseCorrespondence.deploymentStatus,capturedBuildManifestMatched:true,rebuiltCID,
 uiSourceRevision,deploymentEvidence,registrySDK,sdkArtifacts:sdk,buildFiles:build,importSettings,toolVersions,inputManifestSHA256:hash(inputsBytes),
 outputNormalization:false,gatewayDelivery:'NOT_CHECKED',
 scope:'Frozen UI source with exactly five pinned non-runtime publication removals, including unchanged README, builds with the exact registry SDK. All published SDK JavaScript and 14 captured SDK artifacts reproduce from retained source. The extra package declaration and metadata are pinned inputs without a source-rebuild claim. Toolchains, external libraries and runtime semantics remain trusted. The publisher reports a matching independent upload CID; gateway delivery remains unchecked.'};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Release correspondence: ${sdk.length} SDK artifacts and ${build.length} UI files byte-identical; exact CID ${rebuiltCID}`);
