import { getAddress, type Address } from 'viem'
import type { ContractCall } from './transaction-builder'

export interface ActionReview {
  title: string
  opaque: boolean
  recipient?: Address
  spender?: Address
  owner?: Address
  amount?: bigint
  unlimited?: boolean
}

const MAX_UINT256 = 2n ** 256n - 1n

/** Decode only canonical, fixed-length ERC-20 calls. Anything else needs an explicit opaque-call review. */
export function reviewContractAction(call: ContractCall): ActionReview {
  const data = call.data.toLowerCase()
  if (data === '0x' && call.value > 0n) return { title: 'Send ETH', opaque: false }
  const selector = data.slice(0, 10)
  const args = selector === '0x23b872dd' ? 3 : selector === '0xa9059cbb' || selector === '0x095ea7b3' ? 2 : 0
  if (!args || data.length !== 10 + args * 64) return { title: 'Opaque contract call', opaque: true }
  const words = Array.from({ length: args }, (_, i) => data.slice(10 + i * 64, 74 + i * 64))
  const address = (word: string) => {
    if (!/^0{24}/.test(word)) throw new Error('Noncanonical address argument')
    return getAddress(`0x${word.slice(24)}`)
  }
  try {
    if (selector === '0xa9059cbb') return { title: 'ERC-20 transfer', opaque: false,
      recipient: address(words[0]!), amount: BigInt(`0x${words[1]}`) }
    if (selector === '0x095ea7b3') {
      const amount = BigInt(`0x${words[1]}`)
      return { title: 'ERC-20 approval', opaque: false,
        spender: address(words[0]!), amount, unlimited: amount === MAX_UINT256 }
    }
    return { title: 'ERC-20 transferFrom', opaque: false,
      owner: address(words[0]!), recipient: address(words[1]!), amount: BigInt(`0x${words[2]}`) }
  } catch {
    return { title: 'Opaque contract call', opaque: true }
  }
}
