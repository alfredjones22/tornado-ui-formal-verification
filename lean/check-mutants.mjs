import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const generation = JSON.parse(read('artifacts/lean-generation.json'));
const sourceHash = sha256(read('baseline/ui/src/core/withdrawals.ts'));
const runId = process.env.FV_RUN_ID;
assert(runId, 'FV_RUN_ID is required for fresh Lean mutant evidence');
assert(generation.schemaVersion === 1 && generation.sourceHash === sourceHash, 'Lean mutant source anchor mismatch');
assert(generation.generatedSHA256 === sha256(read('artifacts/ValidatorRelease.lean')), 'Generated Lean proof changed after source lowering');
assert(generation.templateSHA256 === sha256(read('lean/ValidatorProof.lean')), 'Lean proof template changed after generation');

const expected = new Map([
  ['recipient-guard', 'ValidatorRelease.recipient_matches'],
  ['execution-guard', 'ValidatorRelease.no_execution'],
  ['fee-positive', 'ValidatorRelease.fee_proceeds'],
  ['selected-nullifier', 'ValidatorRelease.selected_nullifier'],
  ['returned-fee', 'ValidatorRelease.returned_fee_matches_proof'],
  ['net-return', 'ValidatorRelease.fee_proceeds'],
]);
assert(Array.isArray(generation.mutants) && generation.mutants.length === expected.size, 'Incomplete Lean source-mutant inventory');
const toolchain = read('lean-toolchain').trim();
assert(/^leanprover\/lean4:v\d+\.\d+\.\d+$/.test(toolchain), 'Unpinned Lean toolchain');
assert(!process.env.LEAN_TOOLCHAIN || process.env.LEAN_TOOLCHAIN === toolchain, 'LEAN_TOOLCHAIN disagrees with lean-toolchain');
const cases = [];
for (const row of generation.mutants) {
  assert(expected.get(row.name) === row.target, `Unexpected Lean mutant or theorem mapping: ${row.name}`);
  assert(row.path === `artifacts/lean-mutants/${row.name}.lean`, `Unexpected Lean mutant path: ${row.path}`);
  assert(row.sourceHash !== sourceHash && row.functionHash !== generation.functionHash, `Inert Lean source mutant: ${row.name}`);
  const mutant = read(row.path);
  assert(row.generatedSHA256 === sha256(mutant), `Generated Lean source mutant changed: ${row.name}`);
  assert(!/\b(?:sorry|admit)\b/.test(mutant) && !/^\s*(?:axiom|unsafe)\b/m.test(mutant), `Untrusted shortcut in Lean mutant: ${row.name}`);
  const result = spawnSync('elan', ['run', toolchain, 'lean', '-t', '0', row.path], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const targetLine = `'${row.target}' depends on axioms: [sorryAx]`;
  assert(result.status !== 0 && output.split('\n').includes(targetLine),
    `Source mutant ${row.name} did not break its Lean theorem: ${output.slice(0, 700)}`);
  const diagnostic = output.split('\n').find(line => line.includes(': error:')) ?? 'Lean theorem rejected';
  cases.push({ name: row.name, target: row.target, result: 'REJECTED', reason: diagnostic });
}
assert(new Set(cases.map(row => row.name)).size === expected.size, 'Duplicate Lean source-mutant result');
const report = { schemaVersion: 1, runId, sourceHash, functionHash: generation.functionHash,
  status: 'PASS', toolchain, cases };
mkdirSync(resolve(root, 'reports'), { recursive: true });
writeFileSync(resolve(root, 'reports/lean-mutants.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Lean mutation check: ${cases.length} source changes rejected by their target theorems`);
