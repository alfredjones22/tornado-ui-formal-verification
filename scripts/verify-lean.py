"""Kernel-check source-generated Lean theorems without fetching a toolchain."""
if not __debug__:
    raise RuntimeError('Verification requires Python assertions enabled')

from pathlib import Path
import hashlib
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/lean.json'
REPORT.unlink(missing_ok=True)


def read_json(path):
    return json.loads((ROOT / path).read_text())


def sha256(data):
    return hashlib.sha256(data).hexdigest()


toolchain = (ROOT / 'lean-toolchain').read_text().strip()
if toolchain != 'leanprover/lean4:v4.29.1':
    raise RuntimeError('Unsupported Lean toolchain pin')
run_id = os.environ.get('FV_RUN_ID')
if not run_id:
    raise RuntimeError('Run the consumer entry point: npm run verify')

metadata_path = ROOT / 'artifacts/lean-generation.json'
lean_path = ROOT / 'artifacts/ValidatorRelease.lean'
metadata_bytes = metadata_path.read_bytes()
metadata = json.loads(metadata_bytes)
lean_bytes = lean_path.read_bytes()
ir = read_json('artifacts/validator-ir.json')
manifest = read_json('baseline/manifest.json')
source = ROOT / 'baseline/ui/src/core/withdrawals.ts'
source_hash = sha256(source.read_bytes())
source_row = next(row for row in manifest['files'] if row['namespace'] == 'ui' and row['path'] == 'src/core/withdrawals.ts')
if not (source_hash == source_row['sha256'] == ir['sourceHash'] == metadata['sourceHash']):
    raise RuntimeError('Lean proof does not target the captured validator source')
if ir['functionHash'] != metadata['functionHash']:
    raise RuntimeError('Lean proof does not target the extracted validator function')

theorems = metadata['theorems']
if not isinstance(theorems, list) or not theorems or len(set(theorems)) != len(theorems):
    raise RuntimeError('Missing or duplicate Lean theorems')
if not all(isinstance(name, str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.]*', name) for name in theorems):
    raise RuntimeError('Unsupported Lean theorem name')
lean_source = lean_bytes.decode('utf-8')
if re.search(r'\b(?:sorry|admit)\b|(?m:^\s*(?:axiom|opaque|#eval)\b)', lean_source):
    raise RuntimeError('Lean proof contains an untrusted proof escape')
actual_prints = re.findall(r'^\s*#print axioms ([A-Za-z_][A-Za-z0-9_.]*)\s*$', lean_source, re.M)
if actual_prints != theorems:
    raise RuntimeError('Lean axiom inspection does not cover every declared theorem')

version = subprocess.run(['elan', 'run', toolchain, 'lean', '--version'], cwd=ROOT, capture_output=True, text=True, timeout=30)
lean_version = version.stdout.strip()
if version.returncode or version.stderr.strip() or not (
    lean_version.startswith('Lean (version 4.29.1,')
    and 'commit f72c35b3f637c8c6571d353742168ab66cc22c00,' in lean_version
):
    raise RuntimeError('Pinned Lean release is missing or differs from the expected commit')

command = ['elan', 'run', toolchain, 'lean', '-t', '0', str(lean_path)]
checked = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=180)
output = checked.stdout + checked.stderr
log = ROOT / 'reports/lean.log'
log.parent.mkdir(parents=True, exist_ok=True)
log.write_text(output)
expected = [f"'{name}' does not depend on any axioms" for name in theorems]
if checked.returncode or checked.stderr.strip() or checked.stdout.splitlines() != expected:
    raise RuntimeError(f'Lean kernel or axiom check failed; see {log.relative_to(ROOT)}')

report = {
    'schemaVersion': 1,
    'runId': run_id,
    'status': 'PASS',
    'baselineDigest': manifest['contentDigest'],
    'sourceHash': source_hash,
    'functionHash': ir['functionHash'],
    'leanToolchain': toolchain,
    'leanVersion': lean_version,
    'generatedLeanSHA256': sha256(lean_bytes),
    'generationManifestSHA256': sha256(metadata_bytes),
    'theorems': theorems,
    'axiomFree': True,
    'axioms': [],
    'outputSHA256': sha256(log.read_bytes()),
}
REPORT.write_text(json.dumps(report, indent=2) + '\n')
print(f'Lean kernel: {len(theorems)} source-generated theorems checked without axioms or warnings')
