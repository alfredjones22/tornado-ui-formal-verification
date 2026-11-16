from pathlib import Path
from datetime import datetime,timezone
import json,re,hashlib,os
ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text())
def tests(name,count):
    text=(ROOT/f'reports/continuation/{name}.tap').read_text()
    assert re.search(rf'^# pass {count}$',text,re.M) and re.search(r'^# fail 0$',text,re.M),name
    return {'passed':count,'failed':0}
if not __debug__:raise RuntimeError('Assertions required')
facts=read('artifacts/continuation/source-facts.json');sdk=read('reports/continuation/sdk.json');ui=read('reports/continuation/ui-scheduling.json');proof=read('reports/continuation/obligations.json')
files=[p for parent in ['continuation','scripts','docs'] for p in (ROOT/parent).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
files += [ROOT/'package.json',ROOT/'package-lock.json',ROOT/'README.md',ROOT/'verification-profile.json']
summary={'finishedAtUTC':datetime.now(timezone.utc).isoformat(),'baselineDigest':read('baseline/manifest.json')['contentDigest'],'runId':os.environ.get('FV_RUN_ID'),
 'step1':'COMPLETE_AS_SCOPED_ANALYSIS_AND_CONDITIONAL_VERIFICATION','step2':'COMPLETE_AS_SCOPED_ANALYSIS_AND_CONDITIONAL_VERIFICATION',
 'step3':'COMPLETE_OPTION_A_CURRENT_RELEASE','confirmationImplementationChanges':'NONE','releaseRevision':read('verification-profile.json')['releaseRevision'],'confirmationOption':'A','confirmationAssumption':'A_CONFIRMATION_REPORTING',
 'sdkTests':tests('sdk',34),'uiTests':tests('ui-scheduling',21),'sdkScenarioRuns':len(sdk['runs']),'uiScheduleRuns':len(ui['schedules']),
 'conditionalObligations':len(proof['obligations']),'inductiveCallerProtocol':True,'mutantsDetected':len(proof['mutants']),
 'sourceFacts':len(facts['sdkFacts'])+len(facts['callerFacts']),'callerWrites':len(facts['writers']),'disabledIntentControls':len(facts['disabledControls']),
 'dependencyVersions':sdk['dependencyVersions'],'evidenceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)},
 'retainedAssumptions':proof['retainedPremises'],'sourceBuildCIDCorrespondence':'REQUIRED_IN_FULL_VERIFY_SEPARATE_STAGE',
 'fullSDKProof':False,'fullVueRefinementProof':False,'confirmationImplementationChanged':False}
(ROOT/'reports/continuation/summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print('Continuation #1/#2 checks complete; #3 option A selected; withdrawal/confirmation source unchanged; registry release checked separately')
