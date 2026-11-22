import { describe, expect, it } from 'vitest'
import { encodeFunctionData, parseAbi, type Hex } from 'viem'
import { reviewContractAction } from '../src/core/action-review'

const token = '0x1111111111111111111111111111111111111111' as const
const recipient = '0x2222222222222222222222222222222222222222' as const
const spender = '0x3333333333333333333333333333333333333333' as const
const abi = parseAbi([
  'function transfer(address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
])
const call = (data: Hex, value = 0n) => ({ to: token, value, data })

describe('contract action signing review', () => {
  it('shows the exact recipient and base-unit amount for a standard transfer', () => {
    const data = encodeFunctionData({ abi, functionName: 'transfer', args: [recipient, 1_500_000n] })
    expect(reviewContractAction(call(data))).toMatchObject({ title: 'ERC-20 transfer', opaque: false, recipient, amount: 1_500_000n })
  })

  it('identifies an unlimited approval and its spender', () => {
    const max = 2n ** 256n - 1n
    const data = encodeFunctionData({ abi, functionName: 'approve', args: [spender, max] })
    expect(reviewContractAction(call(data))).toMatchObject({ title: 'ERC-20 approval', opaque: false, spender, amount: max, unlimited: true })
  })

  it('shows both accounts for transferFrom', () => {
    const data = encodeFunctionData({ abi, functionName: 'transferFrom', args: [spender, recipient, 7n] })
    expect(reviewContractAction(call(data))).toMatchObject({ title: 'ERC-20 transferFrom', opaque: false, owner: spender, recipient, amount: 7n })
  })

  it('requires opaque review for unknown, extended, or noncanonical calldata', () => {
    const data = encodeFunctionData({ abi, functionName: 'transfer', args: [recipient, 1n] })
    for (const value of ['0x12345678', `${data}00`, `0xa9059cbb${'f'.repeat(24)}${recipient.slice(2)}${'0'.repeat(63)}1`] as Hex[]) {
      expect(reviewContractAction(call(value)).opaque).toBe(true)
    }
    expect(reviewContractAction(call('0x', 1n))).toMatchObject({ title: 'Send ETH', opaque: false })
    expect(reviewContractAction(call('0x'))).toMatchObject({ title: 'Opaque contract call', opaque: true })
  })
})
