// Independently instantiate the symbolic inputs from real viem ABI decoding,
// then compare symbolic acceptance to executing the captured TypeScript.
import { writeFileSync } from 'node:fs';
import { decodeAbiParameters, parseAbiParameters } from 'viem';
import { fixture, runtime, root, TornadoPaymasterConfigs } from './source-runtime.mjs';
const validator = runtime().validateWithdrawal;
const schema = parseAbiParameters('(address instance, bytes proof, bytes32 root, bytes32 nullifierHash, address recipient, uint256 fee)');
function assignment(f) {
  const w = f.withdrawal, op = w.userOperation, p = w.proof, cfg = TornadoPaymasterConfigs[f.settings.chainId];
  const [sponsor] = decodeAbiParameters(schema, op.paymasterData);
  const n = x => BigInt(x ?? 0).toString();
  return {
    'cfg.entryPoint': n(cfg.entryPointAddress), 'cfg.paymaster': n(cfg.paymasterAddress),
    'sponsor.instance': n(sponsor.instance), 'sponsor.proof': sponsor.proof, 'sponsor.root': sponsor.root,
    'sponsor.nullifier': sponsor.nullifierHash, 'sponsor.recipient': n(sponsor.recipient), 'sponsor.fee': n(sponsor.fee),
    'recipient': n(f.recipient), 'note.pool.address': n(f.note.pool.address), 'note.amount': n(f.note.pool.amount),
    'note.token': n(f.note.pool.asset.token), 'note.token.present': f.note.pool.asset.token !== undefined,
    'settings.chainId': n(f.settings.chainId), 'settings.bundlerUrl': f.settings.bundlerUrl,
    'withdrawal.mode': w.mode, 'withdrawal.bundlerUrl': w.bundlerUrl, 'withdrawal.entryPoint': n(w.entryPointAddress),
    'withdrawal.pool': n(w.poolAddress), 'withdrawal.isERC20': w.isERC20, 'withdrawal.value': n(w.withdrawnValue), 'withdrawal.value.present': w.withdrawnValue !== undefined,
    'proof.bytes': p.proof, 'proof.root': p.args[0], 'proof.nullifier': p.args[1], 'proof.recipient': n(p.args[2]),
    'proof.paymaster': n(p.args[3]), 'proof.fee': n(p.args[4]), 'proof.refund': n(p.args[5]),
    'estimation.status': w.gasEstimation?.status ?? '', 'estimation.reason': w.gasEstimation?.reason ?? '', 'estimation.present': w.gasEstimation !== undefined,
    'op.paymaster': n(op.paymaster), 'op.paymaster.present': op.paymaster !== undefined,
    'op.callData': op.callData, 'op.callGas': n(op.callGasLimit), 'op.nonce': n(op.nonce),
    'auth.chainId': n(op.eip7702Auth?.chainId), 'auth.present': op.eip7702Auth !== undefined,
    'op.paymasterData': op.paymasterData, 'op.paymasterData.present': true,
  };
}
const variants = [
  ['estimated', () => {}], ['fallback-internal', f => { f.withdrawal.gasEstimation = { status: 'fallback', reason: 'bundler-internal' } }],
  ['fallback-transport', f => { f.withdrawal.gasEstimation = { status: 'fallback', reason: 'transport-unavailable' } }],
  ['missing-value', f => { delete f.withdrawal.withdrawnValue }],
  ['recipient', f => { f.withdrawal.proof.args[2] = '0x4444444444444444444444444444444444444444' }],
  ['calldata', f => { f.withdrawal.userOperation.callData = '0x1234' }],
  ['call-gas', f => { f.withdrawal.userOperation.callGasLimit = '0x1' }], ['nonce', f => { f.withdrawal.userOperation.nonce = '0x1' }],
  ['pool', f => { f.withdrawal.poolAddress = 0n }], ['asset', f => { f.withdrawal.isERC20 = !f.withdrawal.isERC20 }],
  ['value', f => { f.withdrawal.withdrawnValue-- }], ['paymaster', f => { f.withdrawal.userOperation.paymaster = f.recipient }],
  ['missing-paymaster', f => { delete f.withdrawal.userOperation.paymaster }], ['entrypoint', f => { f.withdrawal.entryPointAddress = f.recipient }],
  ['bundler', f => { f.withdrawal.bundlerUrl += 'changed' }], ['mode', f => { f.withdrawal.mode = 'relayer' }],
  ['proof-paymaster', f => { f.withdrawal.proof.args[3] = f.recipient }], ['refund', f => { f.withdrawal.proof.args[5] = '0x1' }],
  ['auth-missing', f => { delete f.withdrawal.userOperation.eip7702Auth }], ['auth-chain', f => { f.withdrawal.userOperation.eip7702Auth.chainId = '0x2' }],
  ['fee-zero', f => { f.withdrawal.proof.args[4] = '0x0' }], ['fee-equals-amount', f => { f.withdrawal.proof.args[4] = '0x'+f.note.pool.amount.toString(16) }],
  ['estimation-missing', f => { delete f.withdrawal.gasEstimation }], ['estimation-unclassified', f => { f.withdrawal.gasEstimation = { status: 'fallback', reason: 'unknown' } }],
  ['root', f => { f.withdrawal.proof.args[0] = '0x00' }], ['nullifier', f => { f.withdrawal.proof.args[1] = '0x00' }],
  ['proof-bytes', f => { f.withdrawal.proof.proof = '0x5678' }], ['case-insensitive-address', f => { f.withdrawal.userOperation.paymaster = f.withdrawal.userOperation.paymaster.toUpperCase().replace('0X','0x') }],
];
const cases = [];
for (const chain of [1,11155111]) for (const token of [false,true]) for (const amount of [2n, 10n**6n, 10n**18n, 1n<<255n]) {
  for (const [name, change] of variants) {
    const f = fixture(chain, token, amount, 1n); change(f);
    let accepted;
    try { validator(f.note, f.recipient, f.withdrawal, f.settings); accepted = true } catch { accepted = false }
    cases.push({ name: `${chain}/${token}/${amount}/${name}`, accepted, assignment: assignment(f) });
  }
}
writeFileSync(root+'artifacts/concrete-corpus.json', JSON.stringify(cases, null, 2)+'\n');
console.log(`Generated ${cases.length} concrete/symbolic correspondence cases (${cases.filter(c=>c.accepted).length} accepted)`);
