"""Check exact UI source capture and rejection of source/anchor tampering."""
if not __debug__: raise RuntimeError('Assertions required')
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, shutil, subprocess, sys, tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'release'))
from ui_source_revision import load_revision

output = ROOT/'reports/source-capture-check.json'
output.unlink(missing_ok=True)
revision = load_revision(ROOT)
captured_ui_files = sum(row['namespace'] == 'ui' for row in json.loads((ROOT/'baseline/manifest.json').read_text())['files'])
checks = {}
with tempfile.TemporaryDirectory(prefix='tornado-fv-source-capture-') as temp:
    work = Path(temp)
    ui = work/'ui'
    shutil.copytree(ROOT/'baseline/ui', ui)
    subprocess.run(['git', 'init', '-q', str(ui)], check=True)

    def check_ui(label, expected, diagnostic=''):
        result = subprocess.run([sys.executable, str(ROOT/'scripts/check-baseline.py'), '--ui', str(ui)], capture_output=True, text=True)
        text = result.stdout + result.stderr
        assert (result.returncode == 0) == expected, (label, text)
        if diagnostic: assert diagnostic in text, (label, text)
        checks[label] = {'exitCode': result.returncode, 'result': 'ACCEPTED' if expected else 'REJECTED', 'diagnostic': diagnostic or None}

    check_ui(f'exact-{captured_ui_files}-file-checkout', True)
    for name in ['README.md', 'src/core/withdrawals.ts']:
        target = ui/name
        original = target.read_bytes()
        target.write_bytes(original + b'\n')
        try: check_ui('edited-' + name, False, 'UI source changed: ' + name)
        finally: target.write_bytes(original)
    target = ui/'README.md'
    original = target.read_bytes()
    target.unlink()
    try: check_ui('unapproved-document-deletion', False, 'UI source file-set mismatch')
    finally: target.write_bytes(original)
    target = ui/'unexpected-fv-source.ts'
    target.write_text('export const unexpected=true;\n')
    try: check_ui('additional-source-file', False, 'UI source file-set mismatch')
    finally: target.unlink()

    meta = work/'anchors'
    for name in ['verification-profile.json', 'baseline/manifest.json', 'release/ui-source-revision.json']:
        dest = meta/name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT/name, dest)
    assert load_revision(meta) == revision
    checks['exact-pinned-metadata'] = {'result': 'ACCEPTED'}
    original_profile = (meta/'verification-profile.json').read_bytes()
    original_revision = (meta/'release/ui-source-revision.json').read_bytes()

    def check_metadata(label, changed, update_anchor, diagnostic):
        data = (json.dumps(changed, indent=2) + '\n').encode()
        (meta/'release/ui-source-revision.json').write_bytes(data)
        profile = json.loads(original_profile)
        if update_anchor: profile['uiSourceRevision']['sha256'] = hashlib.sha256(data).hexdigest()
        (meta/'verification-profile.json').write_text(json.dumps(profile))
        try: load_revision(meta)
        except RuntimeError as error:
            assert diagnostic in str(error), (label, str(error))
            checks[label] = {'result': 'REJECTED', 'diagnostic': str(error)}
        else: raise AssertionError('Accepted invalid metadata: ' + label)
        finally:
            (meta/'verification-profile.json').write_bytes(original_profile)
            (meta/'release/ui-source-revision.json').write_bytes(original_revision)

    changed = json.loads(original_revision); changed['reason'] = 'unrecorded edit'
    check_metadata('unrecorded-revision-edit', changed, False, 'revision manifest changed')
    changed = json.loads(original_revision); changed['removedFiles'] = [{'path': 'src/App.vue'}]
    check_metadata('source-removal-even-with-updated-anchor', changed, True, 'No source removal is permitted')
    changed = json.loads(original_revision); changed['sourceCommit'] = '0' * 40
    check_metadata('wrong-source-commit', changed, True, 'UI source revision commit mismatch')
    changed = json.loads(original_revision); changed['runtimeOrBuildChanged'] = True
    check_metadata('runtime-edit-exception', changed, True, 'Unsupported exact UI source capture')

report = {'schemaVersion': 1, 'finishedAtUTC': datetime.now(timezone.utc).isoformat(),
          'status': 'PASS', 'baselineDigest': revision['baselineDigest'],
          'uiSourceRevision': revision, 'remainingUIFiles': captured_ui_files, 'checks': checks,
          'rebuildEvidence': 'reports/release-correspondence.json',
          'scope': 'Exact clean-main source and metadata integrity; no claim expansion.'}
output.write_text(json.dumps(report, indent=2) + '\n')
print(f'Exact UI source capture: {sum(row["result"] == "ACCEPTED" for row in checks.values())} positive and {sum(row["result"] == "REJECTED" for row in checks.values())} negative checks passed')
