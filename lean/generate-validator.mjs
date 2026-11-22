import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractValidator } from '../pilot/extract-validator.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const source = read('baseline/ui/src/core/withdrawals.ts');
const manifest = JSON.parse(read('baseline/manifest.json'));
const pinned = manifest.files.find(row => row.namespace === 'ui' && row.path === 'src/core/withdrawals.ts');
assert(pinned && sha256(source) === pinned.sha256, 'Lean target source differs from baseline manifest');

const ir = JSON.parse(read('artifacts/validator-ir.json'));
const fresh = extractValidator(source);
assert(ir.schemaVersion === 1 && JSON.stringify(ir) === JSON.stringify(fresh), 'Lean target IR differs from fresh source extraction');
assert(ir.sourceHash === pinned.sha256 && ir.functionHash === sha256(ir.functionSource), 'Lean target source/function hash mismatch');

const theoremNames = [
  'ValidatorRelease.recipient_matches',
  'ValidatorRelease.no_execution',
  'ValidatorRelease.fee_proceeds',
  'ValidatorRelease.returned_fee_matches_proof',
  'ValidatorRelease.selected_nullifier',
  'ValidatorRelease.selected_path_inhabited',
];
const guardMessages = {
  nullifier: 'The proof nullifier does not match the selected note.',
  recipient: 'The proof recipient does not match the reviewed recipient and quote.',
  execution: 'Single-note withdrawals must pay the recipient directly with zero execution gas and no forwarding calls.',
  fee: 'The quoted fee cannot be covered by this note.',
};

function pathOf(e) {
  assert(Array.isArray(e), 'Expected source IR expression');
  if (e[0] === 'var') return e[1];
  if (e[0] === 'get') {
    assert(e.length === 4 && e[3] === false, 'Optional/unknown field access in Lean-selected path');
    return `${pathOf(e[1])}.${e[2]}`;
  }
  if (e[0] === 'index') {
    assert(e[2]?.[0] === 'number' && /^\d+$/.test(e[2][1]), 'Unsupported dynamic index in Lean-selected path');
    return `${pathOf(e[1])}[${e[2][1]}]`;
  }
  if (e[0] === 'call' && e[1] === 'noteIdentity') {
    assert(e.length === 3 && JSON.stringify(e[2]) === '["var","note"]', 'Only the selected noteIdentity(note) is modelled');
    return 'noteIdentity(note)';
  }
  throw new Error(`Unsupported source value path: ${JSON.stringify(e)}`);
}

const atoms = new Map([
  ['withdrawal.proof.args[1]', ['i.proofNullifier', 'Nat']],
  ['withdrawal.proof.args[2]', ['i.proofRecipient', 'Nat']],
  ['withdrawal.proof.args[4]', ['i.proofFee', 'Nat']],
  ['recipient', ['i.recipient', 'Nat']],
  ['noteIdentity(note).nullifierHash', ['i.derivedNullifier', 'Nat']],
  ['op.callData', ['i.callData', 'String']],
  ['op.callGasLimit', ['i.callGas', 'Nat']],
  ['op.nonce', ['i.nonce', 'Nat']],
  ['note.pool.amount', ['i.amount', 'Nat']],
  ['fee', ['sourceFee i', 'Nat']],
]);

// This intentionally tiny lowering handles only the selected straight-line
// fragment. Any new expression kind or source field must be reviewed first.
function lower(e, { allowFee = true } = {}) {
  assert(Array.isArray(e), 'Expected source IR expression');
  const [tag, ...a] = e;
  if (tag === 'boolean') return { text: a[0] ? 'True' : 'False', kind: 'Prop' };
  if (tag === 'number' || tag === 'bigint') {
    assert(/^\d+$/.test(a[0]), 'Only nonnegative integer literals are modelled');
    return { text: `(${a[0]} : Nat)`, kind: 'Nat' };
  }
  if (tag === 'string') return { text: JSON.stringify(a[0]), kind: 'String' };
  if (tag === 'call') {
    assert(a[0] === 'BigInt' && a.length === 2, `Unsupported source call in Lean-selected path: ${a[0]}`);
    const value = lower(a[1], { allowFee });
    assert(value.kind === 'Nat', 'BigInt input outside modelled uint256 domain');
    return value; // Abstracted parsing of a nonnegative uint256-like value.
  }
  if (tag === 'binary') {
    const [op, left, right] = a;
    const x = lower(left, { allowFee }), y = lower(right, { allowFee });
    if (op === '&&' || op === '||') {
      assert(x.kind === 'Prop' && y.kind === 'Prop', 'Non-proposition logical operand');
      return { text: `(${x.text} ${op === '&&' ? '∧' : '∨'} ${y.text})`, kind: 'Prop' };
    }
    if (op === '+' || op === '-') {
      assert(x.kind === 'Nat' && y.kind === 'Nat', 'Non-Nat arithmetic operand');
      return { text: `(${x.text} ${op} ${y.text})`, kind: 'Nat' };
    }
    if (op === '===' || op === '!==') {
      assert(x.kind === y.kind && ['Nat', 'String'].includes(x.kind), 'Unsupported equality operand');
      return { text: `(${x.text} ${op === '===' ? '=' : '≠'} ${y.text})`, kind: 'Prop' };
    }
    assert(['<', '<=', '>', '>='].includes(op) && x.kind === 'Nat' && y.kind === 'Nat', 'Unsupported comparison');
    return { text: `(${x.text} ${op} ${y.text})`, kind: 'Prop' };
  }
  const path = pathOf(e);
  assert(allowFee || path !== 'fee', 'Fee source binding is self-referential');
  const atom = atoms.get(path);
  assert(atom, `Unmodelled source field in Lean-selected path: ${path}`);
  return { text: atom[0], kind: atom[1] };
}

function unique(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `Expected exactly one ${label}; found ${matches.length}`);
  return matches[0];
}

const template = read('lean/ValidatorProof.lean');
const marker = '-- @SOURCE_DERIVED_DEFINITIONS@';
assert(template.split(marker).length === 2, 'Lean proof template must have exactly one source definition marker');

function render(candidate) {
  assert(candidate.schemaVersion === 1 && candidate.statements.at(-1)?.kind === 'return', 'Unsupported validator IR shape');
  const guards = candidate.statements.filter(stmt => stmt.kind === 'guard');
  assert(guards.length === 13, 'Unexpected number of validator guards');
  const selected = Object.fromEntries(Object.entries(guardMessages).map(([name, message]) =>
    [name, unique(guards, guard => guard.message === message, `${name} source guard`)]));
  const fee = unique(candidate.statements, stmt => stmt.kind === 'const' && stmt.name === 'fee', 'fee binding');
  const net = unique(candidate.statements, stmt => stmt.kind === 'const' && stmt.name === 'net', 'net binding');
  assert(candidate.statements.indexOf(fee) < candidate.statements.indexOf(net), 'Fee/net source order changed');
  const returned = candidate.statements.at(-1).expr;
  assert(JSON.stringify(returned) === JSON.stringify(['object', ['fee', ['var', 'fee']], ['net', ['var', 'net']]]),
    'Validator return is not the source fee/net pair');
  const feeExpr = lower(fee.expr, { allowFee: false });
  const netExpr = lower(net.expr);
  assert(feeExpr.kind === 'Nat' && netExpr.kind === 'Nat', 'Fee/net bindings left Nat domain');
  const reject = Object.fromEntries(Object.entries(selected).map(([name, guard]) => {
    const expression = lower(guard.rejectIf);
    assert(expression.kind === 'Prop', `${name} guard is not a proposition`);
    return [name, expression.text];
  }));
  const definitions = [
    `def capturedSourceSHA256 : String := ${JSON.stringify(candidate.sourceHash)}`,
    `def capturedFunctionSHA256 : String := ${JSON.stringify(candidate.functionHash)}`,
    `def sourceFee (i : Input) : Nat := ${feeExpr.text}`,
    `def sourceNet (i : Input) : Nat := ${netExpr.text}`,
    `def rejectNullifier (i : Input) : Prop := ${reject.nullifier}`,
    `def rejectRecipient (i : Input) : Prop := ${reject.recipient}`,
    `def rejectExecution (i : Input) : Prop := ${reject.execution}`,
    `def rejectFee (i : Input) : Prop := ${reject.fee}`,
  ].join('\n');
  return {
    lean: template.replace(marker, definitions),
    selected: Object.fromEntries(Object.entries(selected).map(([name, guard]) =>
      [name, { line: guard.line, message: guard.message, rejectIf: guard.rejectIf }])),
  };
}

const main = render(ir);
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
writeFileSync(resolve(root, 'artifacts/ValidatorRelease.lean'), main.lean);
const mutantDir = resolve(root, 'artifacts/lean-mutants');
rmSync(mutantDir, { recursive: true, force: true });
mkdirSync(mutantDir, { recursive: true });

const mutations = [
  { name: 'recipient-guard', target: 'ValidatorRelease.recipient_matches',
    from: 'BigInt(withdrawal.proof.args[2]) !== BigInt(recipient)', to: 'false' },
  { name: 'execution-guard', target: 'ValidatorRelease.no_execution',
    from: "op.callData !== '0x' || BigInt(op.callGasLimit) !== 0n || BigInt(op.nonce) !== 0n", to: 'false' },
  { name: 'fee-positive', target: 'ValidatorRelease.fee_proceeds', from: 'fee <= 0n', to: 'false' },
  { name: 'selected-nullifier', target: 'ValidatorRelease.selected_nullifier',
    from: 'BigInt(withdrawal.proof.args[1]) !== noteIdentity(note).nullifierHash', to: 'false' },
  { name: 'returned-fee', target: 'ValidatorRelease.returned_fee_matches_proof',
    from: 'const fee = BigInt(withdrawal.proof.args[4])', to: 'const fee = BigInt(withdrawal.proof.args[4]) + 1n' },
  { name: 'net-return', target: 'ValidatorRelease.fee_proceeds',
    from: 'const net = note.pool.amount - fee', to: 'const net = note.pool.amount + fee' },
];
const mutantRows = mutations.map(mutation => {
  assert(source.split(mutation.from).length === 2, `Source mutation is not unique: ${mutation.name}`);
  const mutated = extractValidator(source.replace(mutation.from, mutation.to));
  assert(mutated.functionHash !== ir.functionHash && mutated.sourceHash !== ir.sourceHash, `Ineffective source mutation: ${mutation.name}`);
  const path = `artifacts/lean-mutants/${mutation.name}.lean`;
  const proof = render(mutated).lean;
  writeFileSync(resolve(root, path), proof);
  return { name: mutation.name, target: mutation.target, path,
    sourceHash: mutated.sourceHash, functionHash: mutated.functionHash,
    generatedSHA256: sha256(proof) };
});
const generation = {
  schemaVersion: 1,
  sourceHash: ir.sourceHash,
  functionHash: ir.functionHash,
  templateSHA256: sha256(template),
  generatedSHA256: sha256(main.lean),
  theorems: theoremNames,
  scope: 'Conditional consequences of four selected source-extracted guards and the fee/net bindings; Nat models nonnegative uint256-like values.',
  selectedGuards: main.selected,
  mutants: mutantRows,
};
writeFileSync(resolve(root, 'artifacts/lean-generation.json'), JSON.stringify(generation, null, 2) + '\n');
console.log(`Generated source-linked Lean certificate for ${theoremNames.length} theorems and ${mutantRows.length} source mutants`);
