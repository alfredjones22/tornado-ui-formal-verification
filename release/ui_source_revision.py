"""Bind the release to the exact captured UI main source; allow no source exceptions."""
import hashlib,json
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
    if (revision['schemaVersion']!=1 or revision['classification']!='EXACT_UI_MAIN_CAPTURE'
        or revision['namespace']!='ui' or revision['runtimeOrBuildChanged'] is not False
        or revision['baselineDigest']!=baseline['contentDigest'] or profile['baselineDigest']!=baseline['contentDigest']):
        raise RuntimeError('Unsupported exact UI source capture')
    if revision['sourceCommit']!=baseline['ui']['commit']:
        raise RuntimeError('UI source revision commit mismatch')
    if revision['removedFiles']!=[]:
        raise RuntimeError('No source removal is permitted')
    return revision
