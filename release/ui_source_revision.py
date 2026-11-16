"""Exactly five non-runtime publication removals; no general source exemption."""
import hashlib,json
ALLOWED_REMOVALS={'PLAN.md','TORNADO_WITHDRAWAL_DESIGN.md','deployment/saga-proxy/worker.js','deployment/saga-proxy/wrangler.jsonc','tests/saga-proxy.test.js'}
def load_revision(root):
    profile=json.loads((root/'verification-profile.json').read_text())
    anchor=profile['uiSourceRevision']
    if anchor['manifest']!='release/ui-source-revision.json':
        raise RuntimeError('Unsupported UI source revision manifest')
    raw=(root/anchor['manifest']).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=anchor['sha256']:
        raise RuntimeError('UI source revision manifest changed')
    revision=json.loads(raw)
    baseline=json.loads((root/'baseline/manifest.json').read_text())
    if (revision['schemaVersion']!=1 or revision['classification']!='NON_RUNTIME_PUBLICATION_REMOVALS'
        or revision['namespace']!='ui' or revision['runtimeOrBuildChanged'] is not False
        or revision['baselineDigest']!=baseline['contentDigest'] or profile['baselineDigest']!=baseline['contentDigest']):
        raise RuntimeError('Unsupported UI source revision; runtime target must remain unchanged')
    removed=revision['removedFiles']
    if len(removed)!=5 or {r['path'] for r in removed}!=ALLOWED_REMOVALS:
        raise RuntimeError('Only the five recorded publication files may be removed')
    captured={r['path']:r for r in baseline['files'] if r['namespace']=='ui'}
    for row in removed:
        expected=captured[row['path']]
        if row!={k:expected[k] for k in ['path','bytes','sha256']}:
            raise RuntimeError('Removed file does not match captured metadata')
        data=(root/'baseline/ui'/row['path']).read_bytes()
        if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256']:
            raise RuntimeError('Frozen removed file changed')
    return revision
