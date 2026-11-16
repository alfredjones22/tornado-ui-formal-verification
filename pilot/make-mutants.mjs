import { source, root } from './source-runtime.mjs';
import { extractValidator } from './extract-validator.mjs';
import { writeFileSync } from 'node:fs';
const changes = [
  ['recipient-guard', 'P01_direct_recipient', 'BigInt(withdrawal.proof.args[2]) !== BigInt(recipient)', 'false'],
  ['execution-guard', 'P02_no_execution_or_nonce', "op.callData !== '0x' || BigInt(op.callGasLimit) !== 0n || BigInt(op.nonce) !== 0n", 'false'],
  ['pool-guard', 'P03_transport_pool_asset', 'withdrawal.poolAddress !== BigInt(note.pool.address)', 'false'],
  ['refund-guard', 'P04_paymaster_refund_chain', 'BigInt(withdrawal.proof.args[5]) !== 0n', 'false'],
  ['fee-positive', 'P05_fee_proceeds', 'fee <= 0n', 'false'],
  ['sponsor-recipient', 'P06_sponsor_tuple', 'sponsor.recipient.toLowerCase() !== recipient.toLowerCase()', 'false'],
  ['estimation-guard', 'P07_estimation_policy', "estimation?.status !== 'estimated' && !(estimation?.status === 'fallback' &&\n    ['bundler-internal', 'transport-unavailable'].includes(estimation.reason))", 'false'],
  ['returned-fee', 'P08_returned_fee_matches_proof', 'const fee = BigInt(withdrawal.proof.args[4])', 'const fee = BigInt(withdrawal.proof.args[4]) + 1n'],
];
const mutations = changes.map(([name, target, from, to]) => {
  if (source.split(from).length !== 2) throw new Error(`Mutation ${name} not unique`);
  return { name, target, ir: extractValidator(source.replace(from, to)) };
});
writeFileSync(root + 'artifacts/validator-mutants.json', JSON.stringify(mutations, null, 2) + '\n');
console.log(`Generated ${mutations.length} deliberate source mutants; frozen source unchanged`);
