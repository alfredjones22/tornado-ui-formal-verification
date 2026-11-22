"""Maintainer validation of fresh setup, offline verification and fail-closed results."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,platform,shutil,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/consumer'
OUT.mkdir(parents=True,exist_ok=True)
work=Path(tempfile.mkdtemp(prefix='tornado-fv-registry-consumer-'))
clone=work/'fv'
cache_ignore=shutil.ignore_patterns('node_modules','.venv','.npm-cache','.release-work','.git','__pycache__','*.pyc','.DS_Store','.env','.env.local')
def ignore(directory,names):
 excluded=set(cache_ignore(directory,names))
 if Path(directory)==ROOT:excluded.update({'artifacts','reports'})
 return excluded
shutil.copytree(ROOT,clone,ignore=ignore)
env=dict(os.environ);env.pop('NODE_OPTIONS',None)
def read(p):return json.loads(p.read_text())
def run(args,label,where=clone,environment=env):
 with (OUT/(label+'.log')).open('w') as stream:
  p=subprocess.run(args,cwd=where,env=environment,stdout=stream,stderr=subprocess.STDOUT)
 return p.returncode
assert not (clone/'node_modules').exists() and not (clone/'.venv').exists()
assert run(['npm','run','setup'],'fresh-setup')==0,'Fresh setup failed'
print('Fresh setup passed',flush=True)
offline=dict(env);offline['NODE_OPTIONS']='--import='+str(clone/'scripts/network-guard.mjs')
assert run(['npm','run','verify'],'fresh-verify-offline',environment=offline)==0,'Offline verification failed'
positive=read(clone/'reports/result.json')
assert positive['status']=='PASS_WITH_ASSUMPTIONS'
assert positive['baselineDigest']==read(ROOT/'baseline/manifest.json')['contentDigest']
assert positive['expectedCID']==read(ROOT/'verification-profile.json')['releaseCorrespondence']['expectedCID']
print('Fresh offline verification passed',flush=True)
# Preserve the actual successful verdict as a stale prior result before each failing run.
prior_result=(clone/'reports/result.json').read_bytes();prior_summary=(clone/'reports/summary.json').read_bytes()
def negative(label,args):
 (clone/'reports/result.json').write_bytes(prior_result);(clone/'reports/summary.json').write_bytes(prior_summary)
 code=run(args,label,environment=offline)
 result=read(clone/'reports/result.json')
 assert code!=0 and result['status']=='FAIL' and not (clone/'reports/summary.json').exists(),label
 assert result['runId']!=positive['runId'],label
 print('Rejected '+label,flush=True)
 return {'exitCode':code,'status':result['status'],'staleSummaryRemoved':True,'freshRunId':result['runId'],'error':result['error']}
checks={}
# A real independently located UI source tree, with the same inventory rules as consumers.
ui=work/'ui';shutil.copytree(clone/'baseline/ui',ui)
source_revision=read(clone/read(clone/'verification-profile.json')['uiSourceRevision']['manifest'])
for row in source_revision['removedFiles']:(ui/row['path']).unlink()
subprocess.run(['git','init','-q',str(ui)],check=True,env=env)
assert run([str(clone/'.venv/bin/python'),'scripts/check-baseline.py','--ui',str(ui)],'external-ui-exact',environment=offline)==0
for label,path in [('changed-readme','README.md'),('changed-runtime-source','src/core/withdrawals.ts')]:
 target=ui/path;original=target.read_bytes();target.write_bytes(original+b'\n')
 try:checks[label]=negative(label,['npm','run','verify','--','--ui',str(ui)])
 finally:target.write_bytes(original)
extra=ui/'unexpected-fv-source.ts';extra.write_text('export const unexpected = true;\n')
try:checks['additional-ui-file']=negative('additional-ui-file',['npm','run','verify','--','--ui',str(ui)])
finally:extra.unlink()
target=clone/'baseline/ui/src/core/withdrawals.ts';original=target.read_bytes();target.write_bytes(original+b'\n')
try:checks['changed-frozen-source']=negative('changed-frozen-source',['npm','run','verify'])
finally:target.write_bytes(original)
# Exercise the new package bridge through the complete verifier, not only a helper call.
target=clone/'.release-work/ui/node_modules/@kohaku-eth/tornado-cash/dist/index.js';original=target.read_bytes();target.write_bytes(original+b'\n')
try:checks['changed-installed-registry-sdk']=negative('changed-installed-registry-sdk',['npm','run','verify'])
finally:target.write_bytes(original)
# Even a link to the exact locked package is rejected as a local SDK dependency.
package=clone/'.release-work/ui/node_modules/@kohaku-eth/tornado-cash';saved=package.with_name('tornado-cash-saved')
package.rename(saved);package.symlink_to(saved,target_is_directory=True)
bridge="import {verifyRegistrySDK} from './release/registry-sdk.mjs'; import {readFileSync} from 'node:fs'; const read=p=>JSON.parse(readFileSync(p)); verifyRegistrySDK(process.cwd(),read('baseline/manifest.json'),read('verification-profile.json'),'.release-work/kohaku/packages/tornado-cash/dist');"
try:
 code=run(['node','--input-type=module','-e',bridge],'local-sdk-symlink',environment=offline)
 assert code!=0
 checks['local-sdk-symlink']={'exitCode':code,'result':'REJECTED_EXACT_CONTENT_LOCAL_LINK'}
finally:package.unlink();saved.rename(package)
(clone/'.venv').rename(clone/'.venv-missing')
try:checks['missing-python-environment']=negative('missing-python-environment',['npm','run','verify'])
finally:(clone/'.venv-missing').rename(clone/'.venv')
target=clone/'.release-work/ui/dist/index.html';original=target.read_bytes();target.write_bytes(original+b'\n')
cid_script="import {directoryCID} from './release/cid.mjs'; console.log(await directoryCID('.release-work/ui/dist'));"
try:
 changed=subprocess.check_output(['node','--input-type=module','-e',cid_script],cwd=clone,env=offline,text=True).strip()
 assert changed!=positive['expectedCID']
 checks['changed-build-byte']={'result':'DETECTED','expectedCID':positive['expectedCID'],'changedCID':changed}
finally:target.write_bytes(original)
versions={'node':subprocess.check_output(['node','--version'],env=env,text=True).strip(),'python':subprocess.check_output([str(clone/'.venv/bin/python'),'-c','import platform; print(platform.python_version())'],env=env,text=True).strip(),'z3':subprocess.check_output([str(clone/'.venv/bin/python'),'-c','import z3; print(z3.get_version_string())'],env=env,text=True).strip(),'os':platform.system(),'machine':platform.machine()}
report={'schemaVersion':2,'finishedAtUTC':datetime.now(timezone.utc).isoformat(),'status':'PASS','baselineDigest':positive['baselineDigest'],'expectedCID':positive['expectedCID'],
 'freshInstall':{'setupExitCode':0,'priorNodeModules':False,'priorPythonEnvironment':False,'originalCheckoutsRequired':False},'environment':versions,
 'offlinePositiveRun':{k:positive[k] for k in ['status','runId','baselineDigest','expectedCID','deploymentStatus','sourceBuildCorrespondence','cidCorrespondence','conditionalSMTObligations','modelProperties','implementationTests']},
 'nodeNetworkingBlocked':True,'externalUISourceExactMatch':True,'negativeChecks':checks,'logs':'reports/consumer/','temporaryExportRemoved':True}
(ROOT/'reports/consumer-check.json').write_text(json.dumps(report,indent=2)+'\n')
(ROOT/'reports/source-check.json').write_text(json.dumps({'schemaVersion':1,'baselineDigest':positive['baselineDigest'],'includedUISourceFilesAccepted':len([r for r in read(clone/'baseline/manifest.json')['files'] if r['namespace']=='ui'])-len(source_revision['removedFiles']),'uiSourceRevision':source_revision,'negativeChecks':{k:checks[k] for k in ['changed-readme','changed-runtime-source','additional-ui-file']}},indent=2)+'\n')
shutil.rmtree(work)
print('Fresh consumer validation and all negative checks passed; report refreshed',flush=True)
