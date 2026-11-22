"""Check the selected v1 evidence contract and emit an explicitly conditional verdict."""
if not __debug__:
    raise RuntimeError('Verification requires Python assertions enabled')
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, platform, re, subprocess
import z3
ROOT = Path(__file__).resolve().parents[1]
def read(name): return json.loads((ROOT/name).read_text())
def check(condition, message):
    if not condition: raise RuntimeError(message)
def indexed(rows):
    result = {r['id']: r for r in rows}
    check(len(result) == len(rows), 'Duplicate evidence ID')
    return result
def tap(path, count):
    text = (ROOT/path).read_text()
    for field, value in [('tests', count), ('pass', count), ('fail', 0), ('cancelled', 0), ('skipped', 0), ('todo', 0)]:
        check(re.search(rf'^# {field} {value}$', text, re.M) is not None, f'Incomplete TAP evidence: {path}, {field}')
    return {'passed': count, 'failed': 0}
manifest = read('baseline/manifest.json'); profile = read('verification-profile.json')
validator = read('reports/validator.json'); lifecycle = read('reports/lifecycle.json')
continuation = read('reports/continuation/summary.json'); boundary = read('reports/continuation/obligations.json')
release = read('reports/release-correspondence.json')
run_id = os.environ.get('FV_RUN_ID')
check(bool(run_id) and continuation['runId'] == release['runId'] == run_id, 'Run the consumer entry point: npm run verify')
check(release['uiSourceRevision'] == read(profile['uiSourceRevision']['manifest']), 'UI source revision missing from rebuilt release')
check(release['result'] == 'MATCH' and release['baselineDigest'] == manifest['contentDigest'], 'Release correspondence failed')
check(release['capturedBuildManifestMatched'] and release['rebuiltCID'] == profile['releaseCorrespondence']['expectedCID'], 'CID correspondence failed')
check(len(release['sdkArtifacts']) == 14 and len(release['buildFiles']) == 65 and release['outputNormalization'] is False, 'Incomplete release comparison')
registry = release['registrySDK']
check(registry['result'] == 'MATCH' and registry['version'] == profile['registrySDK']['version'], 'Registry package correspondence failed')
check(len(registry['installedPackageFiles']) == 16 and registry['sourceRebuiltArtifacts'] == 14 and not registry['localDependencyLinks'], 'Incomplete registry SDK coverage')
check(registry['runtimeArtifactCoverage'] == 'ALL_PUBLISHED_JAVASCRIPT_BYTE_IDENTICAL_TO_SOURCE_REBUILD', 'Missing SDK runtime source coverage')
check(release['deploymentStatus'] == profile['releaseCorrespondence']['deploymentStatus'], 'Deployment status disagreement')
check(profile['schemaVersion'] == 1 and profile['id'] == 'basic-direct-withdrawal-v1', 'Unsupported verification profile')
check(profile['baselineDigest'] == manifest['contentDigest'] == continuation['baselineDigest'], 'Wrong release target')
confirmation = profile['confirmation']
check(confirmation['option'] == 'B' and confirmation['confirmationImplementationChanges'] == 'HOST_RPC_RECEIPT_AND_EXACT_EVENTS', 'Current release requires its host-RPC confirmation implementation')
check(confirmation['assumptionId'] == 'A_CHAIN_RPC_REPORTING' and bool(confirmation['assumption']), 'Missing chain-RPC reporting assumption')
check(confirmation['independentInclusionVerification'] is True and confirmation['finalityVerification'] is False, 'Unsupported chain-confirmation claim')
check(continuation['step3'] == 'COMPLETE_OPTION_B_CURRENT_RELEASE', 'Confirmation implementation not recorded')
vp = indexed(validator['obligations']); lp = indexed(lifecycle['properties']); bp = indexed(boundary['obligations'])
check(len(vp) == 9 and all(x['result'] == 'UNSAT' for x in vp.values()), 'Validator obligations failed')
check(validator['nonVacuity']['result'] == 'SAT', 'Validator may be vacuous')
source_row = next(r for r in manifest['files'] if r['namespace'] == 'ui' and r['path'] == 'src/core/withdrawals.ts')
check(validator['sourceHash'] == source_row['sha256'], 'Validator proof targets another source')
check(len(bp) == 14 and all(x['result'] == 'UNSAT' for x in bp.values()), 'Continuation obligations failed')
check(boundary['savedQueryReplays'] == len(bp) and boundary['nonVacuousCallerTrace'], 'Continuation replay/nonvacuity missing')
check(len(lp) == 9 and all(x['result'] == 'PASS' for x in lp.values()) and not lifecycle['violations'], 'Lifecycle property failed')
check(lifecycle['usefulCompletionTrace'], 'Lifecycle has no useful completed path')
check(set(lifecycle['strongerClaimCounterexamples']) == {'G01_confirmation_implies_actual_inclusion'}, 'Expected stronger-claim limitation changed')
check(validator['selectedNoteIdentity']['result'] == 'UNSAT', 'Selected-note nullifier condition failed')
mutations = read('reports/validator-mutations.json')
check(len(mutations) == 9 and all(x['result'] == 'SAT' for x in mutations), 'Source mutation sensitivity checks failed')
check(len(boundary['mutants']) == 5 and all(x['result'] == 'SAT' for x in boundary['mutants']), 'Protocol mutation sensitivity checks failed')
check(len(lifecycle['mutationChecks']) == 4, 'Lifecycle mutation sensitivity checks failed')
differential = read('reports/correspondence.json')
check(differential['result'] == 'PASS' and differential['cases'] == 464 and differential['mismatches'] == 0, 'Concrete/symbolic correspondence failed')
tests = {'releaseFunctions': tap('reports/conformance.tap',17), 'sdk': tap('reports/continuation/sdk.tap',34), 'vueCaller': tap('reports/continuation/ui-scheduling.tap',21)}
claims = profile['claims']
check([c['id'] for c in claims] == [f'C{i:02}' for i in range(1,9)], 'Expected exactly C01-C08 in order')
check(all(c['evidenceKind'] == 'CONDITIONAL_SOURCE_LINKED_SMT_PROOF' for c in claims[:5]), 'Incorrect validator evidence classification')
check([c['evidenceKind'] for c in claims[5:]] == ['CONDITIONAL_PROTOCOL_PROOF_MODEL_CHECK_AND_TESTS','SOURCE_INSPECTION_AND_IMPLEMENTATION_TESTS','MODEL_CHECK_AND_IMPLEMENTATION_TESTS'], 'Unsupported promotion of evidence to a proof')
claim_results = []
for c in claims:
    check(bool(c['title']), 'Missing claim title')
    for name, evidence in [('validator',vp),('lifecycle',lp),('continuation',bp)]:
        for obligation in c.get(name,[]): check(obligation in evidence, f'Unknown evidence for {c["id"]}: {obligation}')
    claim_results.append({**c, 'status':'SUPPORTED_WITHIN_DECLARED_SCOPE', 'definition':f'docs/claims.md#{c["id"].lower()}'})
files = [p for parent in ['pilot','model','scripts','docs','continuation','release'] for p in (ROOT/parent).rglob('*') if p.is_file() and '__pycache__' not in p.parts and 'node_modules' not in p.parts]
files += [ROOT/p for p in ['README.md','package.json','package-lock.json','requirements.txt','.nvmrc','verification-profile.json']]
proof_inputs = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
finished = datetime.now(timezone.utc).isoformat()
result = {
 'schemaVersion':1, 'runId':run_id, 'startedAtUTC':os.environ['FV_STARTED_AT'], 'finishedAtUTC':finished,
 'status':'PASS_WITH_ASSUMPTIONS', 'profile':profile['id'], 'baselineDigest':manifest['contentDigest'],
 'meaning':'All required checks for this scoped profile passed. Evidence kinds and assumptions below are part of the result; not all eight claims have implementation proofs.',
 'scope':profile['scope'], 'claims':claim_results, 'confirmation':confirmation,
 'assumptions':['docs/assumptions.md','docs/continuation-1-2.md'], 'notClaimed':profile['notClaimed'],
 'sourceBuildCorrespondence':release['sourceBuildCorrespondence'], 'cidCorrespondence':release['cidCorrespondence'], 'expectedCID':release['expectedCID'],'deploymentStatus':release['deploymentStatus'],'deploymentEvidence':release['deploymentEvidence'],'registrySDK':release['registrySDK'], 'releaseEvidence':'reports/release-correspondence.json', 'endToEndUIProof':False,
 'checkedExternalUISource':os.environ.get('FV_CHECKED_UI') or None,'uiSourceRevision':release['uiSourceRevision'],
 'conditionalSMTObligations':len(vp)+len(bp), 'modelProperties':len(lp), 'implementationTests':sum(t['passed'] for t in tests.values()),
 'summary':'reports/summary.json'
}
summary = dict(schemaVersion=2, runId=run_id, status=result['status'], profile=profile['id'], finishedAtUTC=finished,
 baselineDigest=manifest['contentDigest'],sourceHash=validator['sourceHash'],functionHash=validator['functionHash'],
 tools=dict(node=subprocess.check_output(['node','--version'],text=True).strip(),python=platform.python_version(),z3=z3.get_version_string()),
 validator=dict(conditionalSMTObligations=len(vp),result='UNSAT',nonVacuous=True,sourceMutantsDetected=len(mutations),independentSMTLIBReplay=True),
 differentialTesting=differential,
 lifecycle=dict(states=lifecycle['states'],edges=lifecycle['edges'],checkedProperties=len(lp),strongerClaimCounterexamples=len(lifecycle['strongerClaimCounterexamples']),mutantsDetected=len(lifecycle['mutationChecks'])),
 concreteTests=tests,verificationFileHashes=proof_inputs,claims=claim_results,confirmation=confirmation,
 confirmationImplementationChanges='HOST_RPC_RECEIPT_AND_EXACT_EVENTS',releaseRevision=profile['releaseRevision'],uiSourceRevision=release['uiSourceRevision'],sourceBuildCorrespondence=release['sourceBuildCorrespondence'],cidCorrespondence=release['cidCorrespondence'],releaseCorrespondence=release,
 endToEndUIProof=False,translatorSoundnessProof=False,continuation=continuation,
 majorOpenBoundaries=['Conditional SDK/crypto and Vue/source-correspondence premises documented in continuation report','Chain-RPC receipt and event evidence assumes A_CHAIN_RPC_REPORTING; no authenticated consensus or finality proof','Compiler/toolchain correctness and gateway delivery'])
(ROOT/'reports/summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(ROOT/'reports/result.json').write_text(json.dumps(result,indent=2)+'\n')
print('\nPASS_WITH_ASSUMPTIONS — basic direct withdrawal v1 (host-RPC receipt and event checks)')
for c in claim_results: print(f'  {c["id"]}: {c["title"]} [{c["evidenceKind"]}]')
print(f'{len(vp)+len(bp)} conditional SMT obligations UNSAT; {len(lp)} model properties; {result["implementationTests"]} implementation tests passed.')
print('Confirmation: host-RPC successful receipt and exact EntryPoint/pool events; actual inclusion assumes truthful chain-RPC reporting, without a finality proof.')
print('Release correspondence: SDK + UI byte-identical; expected CID MATCH; publisher-reported upload CID MATCH. Full UI proof: NOT CLAIMED.')
print('Machine-readable verdict: reports/result.json; evidence: reports/summary.json')
