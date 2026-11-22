import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, parseAbi, parseAbiParameters, toHex, type Address, type Hex } from 'viem'
import { TornadoPaymasterConfigs } from '@kohaku-eth/tornado-cash'
import { poolFor } from '../src/core/catalog'
import { noteIdentity } from '../src/core/batch-policy'
import { basicWithdrawalHash, prepareWithdrawal, validateWithdrawal, submitWithdrawal, type Withdrawal, type WithdrawalQuote } from '../src/core/withdrawals'
import { jsonRpc, validateConnections, type ConnectionSettings } from '../src/core/rpc'
import type { Progress } from '../src/core/wallet'

const { getTransactionReceipt } = vi.hoisted(() => ({ getTransactionReceipt: vi.fn() }))
vi.mock('../src/core/rpc', () => ({ jsonRpc: vi.fn(), validateConnections: vi.fn(), publicClientFor: () => ({ getTransactionReceipt }) }))
const settings: ConnectionSettings = { chainId: 1, rpcUrl: 'https://example.com', bundler: 'pimlico', bundlerUrl: 'https://example.com' }
const recipient: Address = '0x1111111111111111111111111111111111111111'
const sender: Address = '0x2222222222222222222222222222222222222222'
const cfg = TornadoPaymasterConfigs[1]
const events = parseAbi([
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
  'event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee)',
])
function fixture(symbol = 'ETH') {
  const pool = poolFor(1, symbol === 'ETH' ? '1' : '100', symbol)!
  const preimage = 'ab'.repeat(62)
  const note = { pool, raw: `tornado-${symbol.toLowerCase()}-${pool.denomination}-1-0x${preimage}`, preimage }
  const fee = 1000n, net = pool.amount - fee
  const root = toHex(1n, { size: 32 }), nullifier = toHex(noteIdentity(note).nullifierHash, { size: 32 })
  const proof: Withdrawal['proof'] = { proof: '0x1234', args: [root, nullifier, recipient, cfg.paymasterAddress, toHex(fee), '0x0'] }
  const withdrawal: Withdrawal = { mode: 'paymaster', proof, poolAddress: BigInt(pool.address) as Withdrawal['poolAddress'], isERC20: Boolean(pool.asset.token),
    paymasterAddress: cfg.paymasterAddress, entryPointAddress: cfg.entryPointAddress, bundlerUrl: settings.bundlerUrl,
    gasEstimation: { status: 'estimated' }, fee, withdrawnValue: pool.amount,
    userOperation: { sender, nonce: '0x0', callData: '0x',
      callGasLimit: '0x0', verificationGasLimit: '0x100000', preVerificationGas: '0x100000', maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x1',
      paymaster: cfg.paymasterAddress, paymasterData: encodeAbiParameters(parseAbiParameters('(address instance, bytes proof, bytes32 root, bytes32 nullifierHash, address recipient, uint256 fee)'),
        [{ instance: pool.address, proof: proof.proof, root, nullifierHash: nullifier, recipient, fee }]), signature: '0x1234',
      eip7702Auth: { chainId: '0x1', address: sender, nonce: '0x0', r: root, s: nullifier, yParity: '0x0' },
    },
  }
  const quote: WithdrawalQuote = { id: 'a', note, withdrawal, fee, net, recipient, quotedAt: Date.now() }
  return { note, withdrawal, fee, net, quote }
}
function confirmationLogs(quote: WithdrawalQuote) {
  const hash = basicWithdrawalHash(quote, settings)
  return [
    { address: cfg.entryPointAddress,
      topics: encodeEventTopics({ abi: events, eventName: 'UserOperationEvent', args: {
        userOpHash: hash, sender: quote.withdrawal.userOperation.sender, paymaster: cfg.paymasterAddress,
      } }), data: encodeAbiParameters(parseAbiParameters('uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed'), [0n, true, 1n, 1n]) },
    { address: quote.note.pool.address,
      topics: encodeEventTopics({ abi: events, eventName: 'Withdrawal', args: { relayer: cfg.paymasterAddress } }),
      data: encodeAbiParameters(parseAbiParameters('address to, bytes32 nullifierHash, uint256 fee'), [quote.recipient, quote.withdrawal.proof.args[1], quote.fee]) },
  ]
}
beforeEach(() => vi.resetAllMocks())
describe('reviewed withdrawal payload validation', () => {
  it.each(['ETH', 'USDC', 'USDT', 'DAI'])('checks full-note %s proceeds paid directly to the recipient', symbol => {
    const { note, withdrawal, fee, net } = fixture(symbol)
    expect(validateWithdrawal(note, recipient, withdrawal, settings)).toEqual({ fee, net })
  })
  it('rejects a proof paying another recipient', () => {
    const { note, withdrawal } = fixture()
    expect(() => validateWithdrawal(note, sender, withdrawal, settings)).toThrow('recipient and quote')
  })
  it.each(['bundler-internal', 'transport-unavailable'] as const)('accepts SDK %s fallback only with direct recipient payout', reason => {
    for (const symbol of ['ETH', 'USDC']) {
      const { note, withdrawal, fee, net } = fixture(symbol)
      withdrawal.gasEstimation = { status: 'fallback', reason, message: 'Estimation unavailable' }
      expect(validateWithdrawal(note, recipient, withdrawal, settings)).toEqual({ fee, net })
      withdrawal.userOperation.callGasLimit = '0x1'
      expect(() => validateWithdrawal(note, recipient, withdrawal, settings)).toThrow('zero execution gas')
    }
  })
  it('rejects missing or unrecognized gas-estimation metadata', () => {
    const { note, withdrawal } = fixture()
    delete withdrawal.gasEstimation
    expect(() => validateWithdrawal(note, recipient, withdrawal, settings)).toThrow('gas estimate or SDK fallback')
    withdrawal.gasEstimation = { status: 'fallback', reason: 'unclassified', message: '' } as unknown as Withdrawal['gasEstimation']
    expect(() => validateWithdrawal(note, recipient, withdrawal, settings)).toThrow('gas estimate or SDK fallback')
  })
  it('rejects pool mismatches and proof data mismatches', () => {
    const b = fixture(); b.withdrawal.poolAddress = 1n as Withdrawal['poolAddress']
    expect(() => validateWithdrawal(b.note, recipient, b.withdrawal, settings)).toThrow('note pool')
    const c = fixture(); c.withdrawal.proof.args[4] = '0x7d0'
    expect(() => validateWithdrawal(c.note, recipient, c.withdrawal, settings)).toThrow('paymaster data')
    const d = fixture(); d.withdrawal.proof.args[1] = toHex(5n, { size: 32 })
    expect(() => validateWithdrawal(d.note, recipient, d.withdrawal, settings)).toThrow('selected note')
  })
  it('rejects an SDK hash inconsistent with the reviewed signed operation', () => {
    const quote = fixture().quote
    quote.withdrawal.userOpHash = toHex(7n, { size: 32 })
    expect(() => basicWithdrawalHash(quote, settings)).toThrow('SDK UserOperation hash')
  })
  it.each(['execution', 'calldata', 'nonce', 'executor-payout', 'refund'] as const)('rejects an unexpected %s before review or submission', reason => {
    const { note, withdrawal } = fixture()
    if (reason === 'execution') withdrawal.userOperation.callGasLimit = '0x1'
    if (reason === 'calldata') withdrawal.userOperation.callData = '0x1234'
    if (reason === 'nonce') withdrawal.userOperation.nonce = '0x1'
    if (reason === 'executor-payout') withdrawal.proof.args[2] = sender
    if (reason === 'refund') withdrawal.proof.args[5] = '0x1'
    expect(() => validateWithdrawal(note, recipient, withdrawal, settings)).toThrow()
  })
  it('rejects another paymaster, a wrong chain authorization, or a changed bundler', () => {
    const a = fixture(); a.withdrawal.userOperation.paymaster = recipient
    expect(() => validateWithdrawal(a.note, recipient, a.withdrawal, settings)).toThrow('paymaster')
    const b = fixture(); b.withdrawal.userOperation.eip7702Auth!.chainId = '0xaa36a7'
    expect(() => validateWithdrawal(b.note, recipient, b.withdrawal, settings)).toThrow('different network')
    const c = fixture()
    expect(() => validateWithdrawal(c.note, recipient, c.withdrawal, { ...settings, bundlerUrl: 'https://changed.com' })).toThrow('transport')
  })
})
describe('one-note, one-UserOperation withdrawals', () => {
  it('rejects multiple notes before any connection check or proof preparation', async () => {
    const input = `${fixture().note.raw}\n${fixture('DAI').note.raw}`
    await expect(prepareWithdrawal(input, recipient, settings, vi.fn())).rejects.toThrow('one note at a time')
    expect(validateConnections).not.toHaveBeenCalled()
    expect(jsonRpc).not.toHaveBeenCalled()
  })
  it('submits exactly one reviewed operation and records its confirmation', async () => {
    const { quote } = fixture()
    const hash = basicWithdrawalHash(quote, settings)
    const transactionHash: Hex = `0x${'cd'.repeat(32)}`
    vi.mocked(jsonRpc).mockResolvedValueOnce(hash).mockResolvedValueOnce({ success: true, receipt: { transactionHash } })
    getTransactionReceipt.mockResolvedValueOnce({ status: 'success', logs: confirmationLogs(quote) })
    let row: Partial<Progress> = {}
    await submitWithdrawal(quote, settings, (id, patch) => { expect(id).toBe(quote.id); row = { ...row, ...patch } })
    expect(row.status).toBe('confirmed'); expect(row.hash).toBe(hash)
    expect(row.transactionHash).toBe(transactionHash)
    expect(vi.mocked(jsonRpc).mock.calls.filter(([, method]) => method === 'eth_sendUserOperation')).toEqual([
      [settings.bundlerUrl, 'eth_sendUserOperation', [quote.withdrawal.userOperation, cfg.entryPointAddress]],
    ])
  })
  it('retains the hash on an ambiguous receipt and never resubmits', async () => {
    const quote = fixture().quote, hash = basicWithdrawalHash(quote, settings)
    vi.mocked(jsonRpc).mockResolvedValueOnce(hash).mockRejectedValueOnce(new Error('Disconnected'))
    let row: Partial<Progress> = {}
    await expect(submitWithdrawal(quote, settings, (_id, patch) => { row = { ...row, ...patch } })).rejects.toThrow('Disconnected')
    expect(row.status).toBe('unknown'); expect(row.hash).toBe(hash)
    expect(vi.mocked(jsonRpc).mock.calls.filter(([, method]) => method === 'eth_sendUserOperation')).toHaveLength(1)
  })
  it('does not retry an ambiguous send response', async () => {
    vi.mocked(jsonRpc).mockRejectedValueOnce(new Error('Disconnected'))
    const update = vi.fn()
    const quote = fixture().quote, expected = basicWithdrawalHash(quote, settings)
    await expect(submitWithdrawal(quote, settings, update)).rejects.toThrow('Disconnected')
    expect(update).toHaveBeenCalledWith('a', expect.objectContaining({ status: 'submitted', hash: expected }))
    expect(update).toHaveBeenLastCalledWith('a', expect.objectContaining({ status: 'unknown' }))
    expect(jsonRpc).toHaveBeenCalledTimes(1)
  })
  it('rejects a bundler hash that differs from the locally signed operation', async () => {
    const quote = fixture().quote, update = vi.fn()
    vi.mocked(jsonRpc).mockResolvedValueOnce(toHex(3n, { size: 32 }))
    await expect(submitWithdrawal(quote, settings, update)).rejects.toThrow('unexpected UserOperation hash')
    expect(getTransactionReceipt).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(quote.id, expect.objectContaining({ status: 'unknown' }))
  })
  it('does not confirm a bundler receipt without the matching pool withdrawal', async () => {
    const quote = fixture().quote, hash = basicWithdrawalHash(quote, settings), update = vi.fn()
    vi.mocked(jsonRpc).mockResolvedValueOnce(hash).mockResolvedValueOnce({ success: true, receipt: { transactionHash: toHex(4n, { size: 32 }) } })
    getTransactionReceipt.mockResolvedValueOnce({ status: 'success', logs: confirmationLogs(quote).slice(0, 1) })
    await expect(submitWithdrawal(quote, settings, update)).rejects.toThrow('does not confirm this withdrawal')
    expect(update).not.toHaveBeenCalledWith(quote.id, expect.objectContaining({ status: 'confirmed' }))
  })
  it('rejects a queue or multi-note quote at the submission boundary', async () => {
    const { quote } = fixture()
    // Exercise legacy callers at runtime as well as the single-quote TS API.
    await expect(submitWithdrawal([quote] as unknown as WithdrawalQuote, settings, vi.fn())).rejects.toThrow('one note at a time')
    const multiple = { ...quote, note: { ...quote.note, raw: `${quote.note.raw}\n${quote.note.raw}` } }
    await expect(submitWithdrawal(multiple, settings, vi.fn())).rejects.toThrow('one note at a time')
    expect(validateConnections).not.toHaveBeenCalled()
    expect(jsonRpc).not.toHaveBeenCalled()
  })
  it('requires a fresh quote before any broadcast', async () => {
    const quote = fixture().quote; quote.quotedAt -= 6 * 60_000
    await expect(submitWithdrawal(quote, settings, vi.fn())).rejects.toThrow('expired')
    expect(jsonRpc).not.toHaveBeenCalled()
  })
  it('rejects a changed fee or proceeds before any broadcast', async () => {
    const quote = fixture().quote; quote.net += 1n
    await expect(submitWithdrawal(quote, settings, vi.fn())).rejects.toThrow('reviewed fee and proceeds')
    expect(jsonRpc).not.toHaveBeenCalled()
  })
})
