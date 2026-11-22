// These are implementation conformance/regression checks, not formal proofs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as viem from 'viem';
import { confirmationEvents, fixture, runtime, source } from './source-runtime.mjs';
import { extractValidator } from './extract-validator.mjs';
const validate = runtime().validateWithdrawal;
let accepted = 0, rejected = 0;
for (const chain of [1, 11155111]) for (const token of [false, true]) {
  test(`valid and mutated concrete inputs: chain ${chain}, token ${token}`, () => {
    for (const amount of [2n, 10n**6n, 10n**18n, (1n << 255n)]) for (const fee of [1n, amount/2n, amount-1n]) {
      const f = fixture(chain, token, amount, fee);
      for (const status of [{ status: 'estimated' }, { status: 'fallback', reason: 'bundler-internal' }, { status: 'fallback', reason: 'transport-unavailable' }]) {
        f.withdrawal.gasEstimation = status;
        assert.deepEqual(validate(f.note, f.recipient, f.withdrawal, f.settings), { fee, net: amount-fee }); accepted++;
      }
    }
    const changes = [
      f => { f.withdrawal.proof.args[2] = '0x4444444444444444444444444444444444444444' },
      f => { f.note.preimage = 'cd'.repeat(62); f.note.raw = f.note.raw.replace('ab'.repeat(62), f.note.preimage) },
      f => { f.withdrawal.userOperation.callData = '0x1234' }, f => { f.withdrawal.userOperation.callGasLimit = '0x1' },
      f => { f.withdrawal.userOperation.nonce = '0x1' }, f => { f.withdrawal.poolAddress = 0n },
      f => { f.withdrawal.isERC20 = !token }, f => { f.withdrawal.withdrawnValue++ },
      f => { f.withdrawal.userOperation.paymaster = f.recipient }, f => { delete f.withdrawal.userOperation.paymaster },
      f => { f.withdrawal.entryPointAddress = f.recipient }, f => { f.withdrawal.bundlerUrl += 'other' },
      f => { f.withdrawal.mode = 'relayer' }, f => { f.withdrawal.proof.args[3] = f.recipient },
      f => { f.withdrawal.proof.args[5] = '0x1' }, f => { delete f.withdrawal.userOperation.eip7702Auth },
      f => { f.withdrawal.userOperation.eip7702Auth.chainId = '0x2' }, f => { f.withdrawal.proof.args[4] = '0x0' },
      f => { f.withdrawal.proof.args[4] = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' },
      f => { delete f.withdrawal.gasEstimation }, f => { f.withdrawal.gasEstimation = { status: 'fallback', reason: 'validation-error' } },
      f => { delete f.withdrawal.userOperation.paymasterData }, f => { f.withdrawal.userOperation.paymasterData = '0x1234' },
      f => { f.withdrawal.proof.args[0] = '0x00' }, f => { f.withdrawal.proof.args[1] = '0x00' },
      f => { f.withdrawal.proof.proof = '0x5678' }, f => { f.withdrawal.proof.args[4] = '0x2' },
    ];
    for (const mutate of changes) {
      const f = fixture(chain, token); mutate(f);
      assert.throws(() => validate(f.note, f.recipient, f.withdrawal, f.settings)); rejected++;
    }
  });
}
test('optional withdrawnValue and checksum-address spellings remain accepted', () => {
  const f = fixture(); delete f.withdrawal.withdrawnValue;
  f.withdrawal.entryPointAddress = f.withdrawal.entryPointAddress.toUpperCase().replace('0X', '0x');
  assert.doesNotThrow(() => validate(f.note, f.recipient, f.withdrawal, f.settings));
});
test('extractor refuses unsupported control flow and effectful expressions', () => {
  assert.throws(() => extractValidator(source.replace('const net = note.pool.amount - fee', 'const net = Math.random()')));
  assert.throws(() => extractValidator(source.replace('return { fee, net }', 'while (true) {}\nreturn { fee, net }')));
});
const hash = '0x' + 'aa'.repeat(32), tx = '0x' + 'bb'.repeat(32);
function chainReceipt(f, { operation = true, withdrawal = true, operationSuccess = true, operationHash = hash, status = 'success' } = {}) {
  const operationLog = { address: f.withdrawal.entryPointAddress, removed: false,
    topics: viem.encodeEventTopics({ abi: confirmationEvents, eventName: 'UserOperationEvent', args: {
      userOpHash: operationHash, sender: f.withdrawal.userOperation.sender, paymaster: f.withdrawal.paymasterAddress } }),
    data: viem.encodeAbiParameters(viem.parseAbiParameters('uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed'),
      [0n, operationSuccess, 0n, 0n]) };
  const withdrawalLog = { address: f.note.pool.address, removed: false,
    topics: viem.encodeEventTopics({ abi: confirmationEvents, eventName: 'Withdrawal', args: { relayer: f.withdrawal.paymasterAddress } }),
    data: viem.encodeAbiParameters(viem.parseAbiParameters('address to, bytes32 nullifierHash, uint256 fee'),
      [f.recipient, f.withdrawal.proof.args[1], f.quote.fee]) };
  return { status, logs: [operation && operationLog, withdrawal && withdrawalLog].filter(Boolean) };
}
function submissionHarness(f, rpc, connections = async () => {}, receipt = chainReceipt(f)) {
  const updates = [], calls = [], chainReads = [];
  const api = runtime({ parseNote: () => f.note, validateConnections: connections,
    isHash: s => /^0x[0-9a-f]{64}$/i.test(s), pause: async () => {},
    publicClientFor: () => ({ getTransactionReceipt: async ({ hash }) => { chainReads.push(hash); return receipt } }),
    jsonRpc: async (...args) => { calls.push(args); return rpc(...args) } });
  return { ...api, calls, chainReads, updates, update: (_id, patch) => updates.push(patch) };
}
test('basic confirmation requires exact chain events, even when the bundler reports success or failure', async () => {
  for (const success of [true, false]) {
    const f = fixture();
    const h = submissionHarness(f, async (_url, method) => method === 'eth_sendUserOperation' ? hash : { success, receipt: { transactionHash: tx } });
    await h.submitWithdrawal(f.quote, f.settings, h.update);
    assert.equal(h.updates.at(-1).status, 'confirmed');
    assert.equal(h.updates.at(-1).transactionHash, tx);
    assert.deepEqual(h.chainReads, [tx]);
    assert.equal(h.calls.filter(c => c[1] === 'eth_sendUserOperation').length, 1);
    assert.deepEqual(h.calls.map(c => c[1]), ['eth_sendUserOperation', 'eth_getUserOperationReceipt']);
  }
});
test('missing or mismatched chain events block confirmation despite bundler success', async () => {
  for (const changes of [{ withdrawal: false }, { operation: false }, { operationHash: '0x' + 'cc'.repeat(32) },
    { operationSuccess: false }, { status: 'reverted' }]) {
    const f = fixture();
    const h = submissionHarness(f, async (_url, method) => method === 'eth_sendUserOperation' ? hash : { success: true, receipt: { transactionHash: tx } },
      async () => {}, chainReceipt(f, changes));
    await assert.rejects(h.submitWithdrawal(f.quote, f.settings, h.update));
    assert.equal(h.updates.at(-1).status, 'unknown');
    assert.deepEqual(h.chainReads, [tx]);
    assert.equal(h.calls.filter(c => c[1] === 'eth_sendUserOperation').length, 1);
  }
});
test('send timeout never retries and records unknown', async () => {
  const f = fixture(); const h = submissionHarness(f, async () => { throw new Error('synthetic transport loss') });
  await assert.rejects(h.submitWithdrawal(f.quote, f.settings, h.update));
  assert.equal(h.calls.length, 1); assert.equal(h.updates.at(-1).status, 'unknown');
});
test('receipt loss retains the known hash and never resends', async () => {
  const f = fixture(); const h = submissionHarness(f, async (_url, method) => { if (method === 'eth_sendUserOperation') return hash; throw new Error('lost receipt') });
  await assert.rejects(h.submitWithdrawal(f.quote, f.settings, h.update));
  assert.equal(h.calls.filter(c => c[1] === 'eth_sendUserOperation').length, 1);
  assert(h.updates.some(p => p.hash === hash)); assert.equal(h.updates.at(-1).status, 'unknown');
});
test('expired quote and changed net stop before any send', async () => {
  for (const change of [f => { f.quote.quotedAt -= 360001 }, f => { f.quote.net++ }]) {
    const f = fixture(); change(f); const h = submissionHarness(f, async () => { throw new Error('must not call') });
    await assert.rejects(h.submitWithdrawal(f.quote, f.settings, h.update)); assert.equal(h.calls.length, 0);
  }
});
test('selected-note identity is bound to the proof nullifier', () => {
  const f = fixture(); f.note.preimage = 'cd'.repeat(62); f.note.raw = f.note.raw.replace('ab'.repeat(62), f.note.preimage);
  assert.throws(() => validate(f.note, f.recipient, f.withdrawal, f.settings), /proof nullifier does not match/);
});
test('adapter alone permits two invocations: duplicate exclusion requires the UI caller contract', async () => {
  const f = fixture(); const h = submissionHarness(f, async (_url, method) => method === 'eth_sendUserOperation' ? hash : { success: true, receipt: { transactionHash: tx } });
  await h.submitWithdrawal(f.quote, f.settings, h.update); await h.submitWithdrawal(f.quote, f.settings, h.update);
  assert.equal(h.calls.filter(c => c[1] === 'eth_sendUserOperation').length, 2);
});
test('post-validation mutation across await shows why immutable quote ownership is an assumption', async () => {
  const f = fixture(); const h = submissionHarness(f, async (_url, method) => method === 'eth_sendUserOperation' ? hash : { success: true, receipt: { transactionHash: tx } },
    async () => { f.withdrawal.userOperation.callData = '0x1234' });
  await h.submitWithdrawal(f.quote, f.settings, h.update);
  assert.equal(h.calls[0][2][0].callData, '0x1234');
});
test('concrete validator coverage counts', () => {
  assert.equal(accepted, 144); assert.equal(rejected, 108);
});

function frameHarness() {
  let frame, channel, timeout, removed = 0, disposed = 0;
  class Port { closed = false; onmessage; postMessage() {} close() { this.closed = true } }
  class Channel { constructor() { this.port1 = new Port(); this.port2 = new Port(); channel = this } }
  const api = runtime({
    document: { createElement: () => (frame = { contentWindow: { postMessage() {} }, remove() { removed++ } }), body: { append() {} } },
    MessageChannel: Channel, location: { origin: 'https://synthetic.invalid' }, appAssetUrl: p => p,
    walletRpcBridge: () => ({ enabled: false, dispose() { disposed++ } }),
    setTimeout: callback => { timeout = callback; return 1 }, clearTimeout() {},
  });
  return { api, get frame() { return frame }, get channel() { return channel }, get timeout() { return timeout },
    counts: () => ({ removed, disposed }) };
}
test('disposed proof frame ignores a late ready response after timeout', async () => {
  const f = fixture(), h = frameHarness();
  const p = h.api.prepareInFrame(f.note, f.recipient, f.settings, () => {});
  const rejection = assert.rejects(p, /No withdrawal was submitted/);
  const late = h.channel.port1.onmessage;
  h.frame.onload(); h.timeout();
  late({ data: { status: 'ready', withdrawal: f.withdrawal } });
  await rejection;
  assert.deepEqual(h.counts(), { removed: 1, disposed: 1 });
  assert(h.channel.port1.closed && h.channel.port2.closed);
});
test('ready proof frame cleans up once and ignores later errors', async () => {
  const f = fixture(), h = frameHarness();
  const p = h.api.prepareInFrame(f.note, f.recipient, f.settings, () => {});
  const late = h.channel.port1.onmessage;
  late({ data: { status: 'ready', withdrawal: f.withdrawal } });
  late({ data: { status: 'error', message: 'late error' } });
  assert.equal((await p).withdrawal, f.withdrawal);
  assert.deepEqual(h.counts(), { removed: 1, disposed: 1 });
});
