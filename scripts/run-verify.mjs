// Consumer entry point. A prior PASS must never survive a failed new run.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const resultPath = resolve(root, 'reports/result.json');
const runId = randomUUID(), startedAtUTC = new Date().toISOString();
mkdirSync(resolve(root, 'reports'), { recursive: true });
const base = { schemaVersion: 1, runId, startedAtUTC };
function write(status, fields = {}) {
  writeFileSync(resultPath, JSON.stringify({ ...base, status, ...fields }, null, 2) + '\n');
}
write('RUNNING');
for (const p of ['reports/summary.json', 'reports/continuation/summary.json', 'reports/release-correspondence.json', 'reports/lean.json', 'reports/lean.log', 'reports/lean-mutants.json']) rmSync(resolve(root, p), { force: true });
try {
  for (const p of ['artifacts/continuation','reports/continuation']) mkdirSync(resolve(root,p),{recursive:true});
  const args = process.argv.slice(2);
  let uiDirectory;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--ui') throw Error('Usage: npm run verify [-- --ui /path/to/tornado-ui-new-era]');
    uiDirectory = resolve(args[1]);
  }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18)) throw Error('Use Node >=22.18.0 (recommended: nvm use).');
  if (!existsSync(resolve(root, '.venv/bin/python')) || !existsSync(resolve(root, 'node_modules/typescript/package.json')) || !existsSync(resolve(root,'release/sdk-toolchain/node_modules/tsup/package.json')) || !existsSync(resolve(root,'.release-work/ui/node_modules/vite/package.json'))) {
    throw Error('Dependencies missing. Run npm run setup first (Python 3.11+ required).');
  }
  if (uiDirectory) {
    const check = spawnSync(resolve(root, '.venv/bin/python'), ['scripts/check-baseline.py', '--ui', uiDirectory], { cwd: root, stdio: 'inherit' });
    if (check.error || check.status !== 0) throw Error('The supplied UI checkout does not match the frozen UI source: ' + (check.error?.message ?? check.status));
  }
  const child = spawnSync('sh', ['scripts/verify.sh'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, FV_RUN_ID: runId, FV_STARTED_AT: startedAtUTC, FV_CHECKED_UI: uiDirectory ?? '' }
  });
  if (child.error || child.status !== 0) throw Error('Verification did not complete successfully: ' + (child.error?.message ?? child.signal ?? child.status));
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  if (result.runId !== runId || result.status !== 'PASS_WITH_ASSUMPTIONS') throw Error('No fresh successful verification result was produced.');
} catch (error) {
  write('FAIL', { finishedAtUTC: new Date().toISOString(), error: error.message, scope: 'No successful result for this run.' });
  console.error('Verification failed: ' + error.message);
  console.error('See reports/result.json and the failing check above.');
  process.exitCode = 1;
}
