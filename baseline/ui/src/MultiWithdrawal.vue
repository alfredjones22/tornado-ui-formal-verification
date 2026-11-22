<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import AddressPrivacyWarnings from './AddressPrivacyWarnings.vue'
import TransactionBuilder from './TransactionBuilder.vue'
import ActionBudget from './ActionBudget.vue'
import SimulationReview from './WithdrawalSimulation.vue'
import { isAddress, type Address, type Hex } from 'viem'
import { NETWORKS, shorten, units, type ChainId } from './core/catalog'
import { downloadText, extractNoteStrings, parseBatchNotes } from './core/notes'
import { safeError, type ConnectionSettings } from './core/rpc'
import { loadSmartAccount, UnsupportedControllerError, type SmartWithdrawalAccount } from './core/smart-account'
import { prepareSmartWithdrawal, reconcileSmartWithdrawal, submitSmartWithdrawal, type SmartWithdrawalQuote } from './core/smart-withdrawal'
import type { SigningReview, WithdrawalWallet } from './core/wallet-signer'
import type { Progress } from './core/wallet'
import { smartRecipient } from './core/smart-withdrawal-policy'
import { loadAddressPrivacy, withdrawalPrivacyChecks, type AddressPrivacyState } from './core/address-privacy'
import { callEth, callSummary, callsHash, canonicalCalls, type BuilderAction } from './core/transaction-builder'
import { canSubmitSimulation, retainSimulationFailure, simulationMatches, simulateSmartWithdrawal, type WithdrawalSimulation } from './core/withdrawal-simulation'
import { loadActionBalances, unknownActionBalances } from './core/action-budget'
import { reviewContractAction } from './core/action-review'

const props = defineProps<{ active: boolean; wallet: WithdrawalWallet | null; chainId: ChainId; walletRevision: number; connectionKey: string; getSettings: () => ConnectionSettings }>()
const emit = defineEmits<{ back: []; manage: []; connect: []; settings: []; activity: [busy: boolean, pending: boolean]; 'reject-controller': [wallet: WithdrawalWallet] }>()
const input = ref(''), payout = ref<'account' | 'custom'>('account'), error = ref(''), status = ref(''), busy = ref(false), loading = ref(false)
const customRecipient = ref(props.wallet?.account ?? '')
const validRecipient = computed(() => payout.value !== 'custom' || isAddress(customRecipient.value) && BigInt(customRecipient.value) !== 0n)
const account = ref<SmartWithdrawalAccount | null>(null), quote = ref<SmartWithdrawalQuote | null>(null), frozen = ref<ConnectionSettings | null>(null)
const rows = ref<Progress[]>([]), submitted = ref(false)
const operationExposed = ref(false)
const previousAttempts = ref<{ chainId: ChainId; userOperationHash: Hex; progress: Progress[] }[]>([])
const signing = ref<SigningReview | null>(null), fileInput = ref<HTMLInputElement | null>(null)
const notesField = ref<HTMLTextAreaElement | null>(null)
const builderOpen = ref(false), actions = ref<BuilderAction[]>([]), simulationRpc = ref(''), simulation = ref<WithdrawalSimulation>()
const acknowledgedOpaqueHash = ref<Hex>()
const reviewedActions = computed(() => actions.value.map(action => ({ action, ...reviewContractAction(action) })))
const hasOpaqueActions = computed(() => reviewedActions.value.some(review => review.opaque))
const actionReviewHash = computed(() => actions.value.length ? callsHash(actions.value) : undefined)
const opaqueActionsAcknowledged = computed(() => !hasOpaqueActions.value || acknowledgedOpaqueHash.value === actionReviewHash.value)
function acknowledgeOpaque(event: Event) {
  acknowledgedOpaqueHash.value = (event.target as HTMLInputElement).checked ? actionReviewHash.value : undefined
}
function actionAmount(action: BuilderAction, amount: bigint) {
  const current = asset.value
  return current?.token?.toLowerCase() === action.to.toLowerCase()
    ? `${units(amount, current)} ${current.symbol} (${amount} base units)`
    : `${amount} token base units (decimals unknown)`
}
const simulating = ref(false), reviewClock = ref(Date.now())
let reviewTimer: ReturnType<typeof setTimeout> | undefined
const reviewExpired = computed(() => !!quote.value && reviewClock.value - quote.value.quotedAt >= 5 * 60_000)
const simulationCurrent = computed(() => simulationMatches(simulation.value, quote.value, reviewClock.value))
const canSubmitReview = computed(() => !!quote.value && !reviewExpired.value && simulation.value?.status !== 'failed' && opaqueActionsAcknowledged.value)
watch([quote, simulation], () => {
  clearTimeout(reviewTimer); reviewClock.value = Date.now()
  if (!quote.value) return
  const expires = Math.min(quote.value.quotedAt, simulation.value?.checkedAt ?? Infinity) + 5 * 60_000
  if (expires > reviewClock.value) reviewTimer = setTimeout(() => { reviewClock.value = Date.now() }, expires - reviewClock.value + 1)
})
const resetNotice = ref(''), balances = ref(unknownActionBalances()), balancesLoading = ref(false)
const callsContext = ref('')
const simulationHistory = new Map<string, WithdrawalSimulation>()
let balanceRequest = 0
const actionStatus = computed(() => !simulationCurrent.value || reviewExpired.value ? 'Draft' : simulation.value?.status === 'passed'
  ? 'Simulation passed ✓' : simulation.value?.status === 'failed' ? 'Simulation failed' : 'Bundler estimated; detailed preview unavailable')
let controller: AbortController | undefined, accountRequest = 0
let preparedContext: { provider: WithdrawalWallet['provider']; revision: number; connectionKey: string } | undefined
const privacyStates = ref<ReadonlyMap<string, AddressPrivacyState>>(new Map()), privacyLoading = ref(false)
const privacyRecipient = computed(() => payout.value === 'custom' && validRecipient.value ? customRecipient.value as Address : undefined)
const privacyChecks = computed(() => account.value && props.wallet?.account.toLowerCase() === account.value.owner.toLowerCase()
  ? withdrawalPrivacyChecks(account.value, privacyRecipient.value, privacyStates.value) : [])
let privacyRequest = 0, privacyTimer: ReturnType<typeof setTimeout> | undefined
function refreshPrivacy(delay = 0) {
  const request = ++privacyRequest
  clearTimeout(privacyTimer); privacyStates.value = new Map(); privacyLoading.value = false
  const current = account.value, recipient = privacyRecipient.value
  if (!props.active || submitted.value || !current || props.wallet?.account.toLowerCase() !== current.owner.toLowerCase()) return
  privacyLoading.value = true
  privacyTimer = setTimeout(async () => {
    try {
      const states = await loadAddressPrivacy([current.address, current.owner, ...(recipient ? [recipient] : [])], props.getSettings())
      if (request === privacyRequest) privacyStates.value = states
    } catch { /* Missing results produce an explicit incomplete-check warning. */ }
    finally { if (request === privacyRequest) privacyLoading.value = false }
  }, delay)
}
const parsed = computed(() => {
  if (!input.value.trim()) return { notes: [], error: '' }
  try { return { notes: parseBatchNotes(input.value, props.chainId, 1), error: '' } }
  catch (error) { return { notes: [], error: safeError(error) } }
})
// Semantic identity: formatting and note ordering do not change the withdrawal.
const notesContext = computed(() => parsed.value.notes.length ? parsed.value.notes.map(note => `${note.pool.chainId}:${note.pool.address.toLowerCase()}:${note.preimage}`).sort().join('|')
  : `invalid:${input.value.split(/\s+/).filter(Boolean).join('')}`)
const contractsAvailable = computed(() => props.active && !submitted.value && payout.value === 'account' && parsed.value.notes.length > 0 &&
  !!props.wallet && !!account.value && props.wallet.account.toLowerCase() === account.value.owner.toLowerCase())
const withdrawalContext = computed(() => contractsAvailable.value ? `${props.chainId}:${account.value!.address.toLowerCase()}:${props.wallet!.account.toLowerCase()}:${notesContext.value}` : '')
function resetContractCalls() {
  if (submitted.value) return
  if (actions.value.length || builderOpen.value) resetNotice.value = 'Contract calls were cleared because the withdrawal notes, payout or wallet context changed.'
  actions.value = []; acknowledgedOpaqueHash.value = undefined; builderOpen.value = false; simulation.value = undefined; callsContext.value = ''
}
function openBuilder() {
  if (busy.value || loading.value || !contractsAvailable.value) return
  callsContext.value = withdrawalContext.value; builderOpen.value = true
}
function recordSimulation(q: SmartWithdrawalQuote, next: WithdrawalSimulation) {
  const result = retainSimulationFailure(simulationHistory.get(q.signedHash) ?? q.simulation, next)
  if (simulationHistory.size >= 32 && !simulationHistory.has(q.signedHash)) simulationHistory.delete(simulationHistory.keys().next().value!)
  simulationHistory.set(q.signedHash, result); q.simulation = result; simulation.value = result
}
async function refreshBalances() {
  const request = ++balanceRequest, current = account.value, selectedAsset = parsed.value.notes[0]?.pool.asset
  balances.value = unknownActionBalances(); balancesLoading.value = false
  if (!contractsAvailable.value || !current || !selectedAsset) return
  balancesLoading.value = true
  try {
    const value = await loadActionBalances(current.address, selectedAsset, props.getSettings())
    if (request === balanceRequest) balances.value = value
  } catch { /* The budget shows unavailable balances rather than assuming zero. */ }
  finally { if (request === balanceRequest) balancesLoading.value = false }
}
const pending = computed(() => rows.value.some(row => ['submitted', 'unknown', 'awaiting-wallet'].includes(row.status)))
const canReturnToReview = computed(() => submitted.value && !operationExposed.value && !!quote.value && rows.value.length > 0 &&
  rows.value.every(row => ['ready', 'rejected'].includes(row.status) && !row.transactionHash))
const asset = computed(() => quote.value?.notes[0]?.pool.asset ?? parsed.value.notes[0]?.pool.asset)
const total = computed(() => parsed.value.notes.reduce((sum, note) => sum + note.pool.amount, 0n))
const directPayout = computed(() => parsed.value.notes.length === 1 && actions.value.length === 0)
const directQuote = computed(() => quote.value?.notes.length === 1 && !quote.value.scope.calls?.length)
const update = (id: string, patch: Partial<Progress>) => { const row = rows.value.find(row => row.id === id); if (row) Object.assign(row, patch) }
watch([busy, pending], () => emit('activity', busy.value, pending.value), { immediate: true })

async function run(work: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await work() } catch (e) { error.value = safeError(e) }
  finally { busy.value = false; status.value = ''; signing.value = null }
}
async function refreshAccount() {
  const request = ++accountRequest, wallet = props.wallet
  if (!wallet) { account.value = null; loading.value = false; return }
  loading.value = true
  try {
    const settings = props.getSettings(), current = await loadSmartAccount(wallet.account, settings)
    if (request === accountRequest) account.value = current
  } catch (e) { if (request === accountRequest) {
    account.value = null; error.value = safeError(e)
    if (props.active && e instanceof UnsupportedControllerError) emit('reject-controller', wallet)
  } }
  finally { if (request === accountRequest) loading.value = false }
}
// Compare each context value, not a new array/wallet wrapper on every parent render.
watch([() => props.wallet?.provider, () => props.wallet?.account?.toLowerCase(), () => props.walletRevision, () => props.connectionKey], () => {
  controller?.abort(new Error('The wallet or connection settings changed. Prepare a new batch.'))
  if (quote.value && !submitted.value) { quote.value = null; error.value = 'The wallet or connection settings changed. Prepare a new batch.' }
  resetContractCalls()
  account.value = null
  builderOpen.value = false; simulation.value = undefined
  if (props.active) void refreshAccount()
}, { immediate: true })
watch(() => props.active, active => { if (active) void refreshAccount() })
watch(() => props.wallet?.account?.toLowerCase(), (_owner, previous) => {
  // Follow the controller while using its default address; preserve an edited destination.
  if (!customRecipient.value || customRecipient.value.toLowerCase() === previous) customRecipient.value = props.wallet?.account ?? ''
})
watch([notesContext, payout], resetContractCalls)
watch(() => account.value?.address.toLowerCase(), (next, previous) => { if (next && previous && next !== previous) resetContractCalls() })
watch(withdrawalContext, context => { if (context && callsContext.value && context !== callsContext.value) resetContractCalls() })
watch([notesContext, payout, customRecipient, actions, simulationRpc], () => { if (!submitted.value) { quote.value = null; simulation.value = undefined } })
watch([contractsAvailable, notesContext, () => account.value?.address, () => props.connectionKey], () => { void refreshBalances() }, { immediate: true })
watch([() => props.active, () => props.walletRevision, () => props.connectionKey, () => account.value?.address,
  () => account.value?.owner, () => account.value?.deployed, () => account.value?.nonce, privacyRecipient, submitted],
  () => refreshPrivacy(250), { immediate: true })

async function prepare() {
  await run(async () => {
    if (!props.wallet || pending.value || submitted.value || operationExposed.value) throw new Error('Connect the owner wallet and check the current session before preparing another batch.')
    if (!validRecipient.value) throw new Error('Enter a valid nonzero recipient address.')
    if (!opaqueActionsAcknowledged.value) throw new Error('Review and acknowledge opaque contract calls before signing.')
    const wallet = props.wallet, settings = { ...props.getSettings() }
    const context = { provider: wallet.provider, revision: props.walletRevision, connectionKey: props.connectionKey }
    controller = new AbortController()
    try {
      const current = await loadSmartAccount(wallet.account, settings)
      controller.signal.throwIfAborted()
      account.value = current; frozen.value = settings; rows.value = []
      const calls = canonicalCalls(actions.value, current.address)
      const prepared = await prepareSmartWithdrawal(input.value, wallet, { account: current, payout: payout.value,
        ...(calls.length ? { calls, callsHash: callsHash(calls) } : {}),
        ...(payout.value === 'custom' ? { recipient: customRecipient.value as Address } : {}) }, settings,
        message => { status.value = message; signing.value = null }, async review => { signing.value = review }, controller.signal)
      controller.signal.throwIfAborted()
      quote.value = prepared
      // Re-preparing the same signed hash must not silently discard a known
      // failed check when the user has not added custom calls.
      simulation.value = simulationHistory.get(prepared.signedHash) ?? prepared.simulation
      if (simulation.value) prepared.simulation = simulation.value
      preparedContext = context
      if (calls.length) await refreshBalances()
    } finally { controller = undefined }
  })
}
function stop() { controller?.abort(new Error('Batch preparation was cancelled.')) }
function markOperationExposed(q: SmartWithdrawalQuote, source: 'simulation RPC' | 'bundler') {
  if (operationExposed.value) return
  operationExposed.value = true
  submitted.value = true
  rows.value = [{ id: q.id, label: `${q.notes.length} note${q.notes.length === 1 ? '' : 's'} · one UserOperation`,
    status: 'unknown', hash: q.signedHash,
    message: `The signed operation was sent to the ${source} and may still land. Preserve the notes and check its on-chain status before signing another operation.` }]
}
async function submit() {
  await run(async () => {
    if (!quote.value || !frozen.value || !props.wallet || submitted.value) throw new Error('Prepare a new review first.')
    const q = quote.value, settings = frozen.value, wallet = props.wallet
    const revision = props.walletRevision, connectionKey = props.connectionKey
    const contextCurrent = () => quote.value === q && frozen.value === settings && props.wallet?.provider === wallet.provider &&
      props.wallet?.account.toLowerCase() === wallet.account.toLowerCase() && props.walletRevision === revision &&
      props.connectionKey === connectionKey && props.chainId === settings.chainId
    if (!contextCurrent()) throw new Error('The withdrawal context changed after signing. Prepare a new review.')
    if (!canSubmitReview.value) throw new Error(reviewExpired.value ? 'This review expired. Recalculate fee & gas before submitting.' : 'Resolve the failed simulation or unreviewed contract calls before submitting.')
    // The signed operation first leaves this page at this explicit authorization
    // point. A simulation RPC could relay it even if the preview later fails.
    status.value = 'Simulating the signed withdrawal…'
    await simulatePrepared(q, settings, () => {
      if (!contextCurrent()) {
        throw new Error('The withdrawal context changed before the signed operation was sent to the simulation RPC.')
      }
      markOperationExposed(q, 'simulation RPC')
    })
    if (!contextCurrent()) {
      throw new Error('The withdrawal context changed during simulation. The simulation RPC received the signed operation; check the chain before retrying.')
    }
    if (!canSubmitSimulation(q.simulation, q)) throw new Error('The signed withdrawal did not pass simulation. The app did not broadcast it; if the simulation RPC received the signed operation, it may still land. Preserve the notes and check the chain before retrying.')
    markOperationExposed(q, 'bundler')
    status.value = 'Submitting the signed batch…'
    await submitSmartWithdrawal(q, settings, wallet, update)
    await refreshAccount()
  })
}
async function check() {
  await run(async () => {
    const settings = frozen.value ?? props.getSettings()
    if (quote.value && rows.value.some(row => row.id === quote.value!.id && ['submitted', 'unknown'].includes(row.status))) {
      await reconcileSmartWithdrawal(quote.value, settings, update, 10_000)
    }
    await refreshAccount()
  })
}
async function importFile(event: Event) {
  await run(async () => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      if (file.size > 64_000) throw new Error('Choose a note file up to 64 KB.')
      input.value = extractNoteStrings(await file.text()).join('\n')
    } finally { if (fileInput.value) fileInput.value.value = '' }
  })
}
function exportSession() {
  const q = quote.value
  downloadText(`tornado-multi-withdrawal-${Date.now()}.json`, JSON.stringify({ version: 1, network: frozen.value?.chainId ?? props.chainId,
    account: q?.scope.account ?? account.value, payout: q?.scope.payout ?? payout.value,
    recipient: q ? smartRecipient(q.scope) : payout.value === 'custom' ? customRecipient.value : account.value?.address,
    notes: q?.notes.map(note => note.raw) ?? extractNoteStrings(input.value),
    calls: q?.scope.calls ?? actions.value.map(({ to, value, data }) => ({ to, value, data })),
    userOperationHash: q?.signedHash, previousAttempts: previousAttempts.value, progress: rows.value }, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2))
}
async function returnToReview() {
  if (busy.value || operationExposed.value || !canReturnToReview.value || !quote.value || !frozen.value) return
  const q = quote.value
  const sameContext = props.chainId === frozen.value.chainId && props.wallet?.account.toLowerCase() === q.scope.account.owner.toLowerCase() &&
    props.wallet?.provider === preparedContext?.provider && props.walletRevision === preparedContext?.revision && props.connectionKey === preparedContext?.connectionKey
  previousAttempts.value.push({ chainId: frozen.value.chainId, userOperationHash: q.signedHash, progress: rows.value.map(row => ({ ...row })) })
  submitted.value = false; operationExposed.value = false; quote.value = null; frozen.value = null; rows.value = []; error.value = ''; status.value = ''; signing.value = null; simulation.value = undefined
  input.value = q.notes.map(note => note.raw).join('\n')
  payout.value = q.scope.payout === 'account' ? 'account' : 'custom'
  if (payout.value === 'custom') customRecipient.value = smartRecipient(q.scope)
  if (!sameContext) resetContractCalls()
  await nextTick()
  notesField.value?.focus()
  await refreshAccount() // Review will also recheck the nonce and note spend status.
}
async function startNewWithdrawal() {
  if (busy.value || pending.value) return
  quote.value = null; rows.value = []; submitted.value = false; operationExposed.value = false; input.value = ''; error.value = ''
  frozen.value = null; signing.value = null; status.value = ''; payout.value = 'account'; customRecipient.value = props.wallet?.account ?? ''
  actions.value = []; acknowledgedOpaqueHash.value = undefined; simulation.value = undefined; builderOpen.value = false
  previousAttempts.value = []; preparedContext = undefined
  resetNotice.value = ''
  await nextTick()
  notesField.value?.focus()
}
async function saveActions(next: BuilderAction[], simulate: boolean, rpc: string) {
  if (!contractsAvailable.value || callsContext.value !== withdrawalContext.value) { resetContractCalls(); return }
  resetNotice.value = simulate ? 'Review each action below before signing.' : ''
  actions.value = next; acknowledgedOpaqueHash.value = undefined; simulationRpc.value = rpc; builderOpen.value = false
  await nextTick()
}
async function simulatePrepared(q: SmartWithdrawalQuote, settings: ConnectionSettings, onExposure: () => void) {
  simulating.value = true
  try {
    const result = await simulateSmartWithdrawal(q, settings, simulationRpc.value, onExposure)
    if (quote.value === q) recordSimulation(q, result)
  } catch (error) {
    if (quote.value === q) recordSimulation(q, { status: 'failed', hash: q.signedHash, checkedAt: Date.now(),
      failureKind: 'inconclusive', message: `Simulation could not be completed. ${safeError(error)}` })
    throw error
  } finally { simulating.value = false }
}
async function recalculate() {
  if (busy.value || submitted.value || operationExposed.value) return
  quote.value = null; simulation.value = undefined
  await prepare()
}
onUnmounted(() => { stop(); accountRequest++; balanceRequest++; privacyRequest++; clearTimeout(privacyTimer); clearTimeout(reviewTimer); emit('activity', false, false) })
</script>

<template>
  <section class="transaction-panel" :class="{ 'builder-open': builderOpen }" aria-label="Smart account withdrawal">
    <TransactionBuilder v-if="builderOpen && contractsAvailable && asset" :actions="actions" :chain-id="chainId" :account="account!.address" :owner="wallet!.account" :deployed="account!.deployed" :note-count="parsed.notes.length" :can-prepare="contractsAvailable" :simulation-rpc="simulationRpc" :asset="asset" :total="total" :balances="balances" :balances-loading="balancesLoading" @close="builderOpen = false" @save="saveActions" />
    <template v-else>
    <div class="multi-heading"><div><div class="feature-labels"><span class="feature-label feature-label-new">NEW!</span><span class="feature-label feature-label-advanced">ADVANCED</span></div><h2>Smart account withdrawal</h2></div><button class="text-button" :disabled="busy || pending" @click="emit('back')">Single-note flow <Icon name="arrow" :size="13" /></button></div>
    <div class="panel-body">
      <p class="modal-description">Withdraw 1–12 notes of one asset in one UserOperation. Your connected EOA controls a smart account and signs typed data.</p>
      <template v-if="!submitted">
        <div class="field-heading"><label for="multi-notes">Withdrawal notes</label><button class="text-button" :disabled="busy" @click="fileInput?.click()"><Icon name="file" :size="14" />Import .txt</button></div>
        <input ref="fileInput" type="file" accept=".txt,text/plain" hidden @change="importFile" />
        <textarea id="multi-notes" ref="notesField" v-model="input" :disabled="busy" rows="7" placeholder="Paste one Tornado note per line" spellcheck="false" autocomplete="off" />
        <p v-if="parsed.error" class="field-error" role="alert">{{ parsed.error }}</p>
        <p v-else-if="parsed.notes.length && asset" class="input-hint">{{ parsed.notes.length }} notes · {{ units(total, asset) }} {{ asset.symbol }}</p>
        <div v-if="parsed.notes.length > 1" class="privacy-warning quantum-privacy-warning" role="status"><Icon name="info" :size="17" /><div><b>Multiple-note privacy</b><p>Withdrawing multiple notes to the same smart account can increase the risk of retroactive deanonymization if post-quantum cryptanalysis becomes practical. <a href="https://zknox.eth.limo/posts/2026/11/05/quantum-privacy.html" target="_blank" rel="noopener noreferrer">Read the privacy analysis</a>.</p></div></div>
        <div class="field-heading amount-heading"><span>Where should the proceeds go?</span></div>
        <div class="withdrawal-routes">
          <label :class="{ selected: payout === 'account' }"><input v-model="payout" type="radio" value="account" :disabled="busy" /><span><b>Keep in smart account (Recommended)</b><small>Keep the withdrawal and gas refund in the smart account controlled by your connected wallet.</small></span></label>
          <label :class="{ selected: payout === 'custom' }"><input v-model="payout" type="radio" value="custom" :disabled="busy" /><span><b>Forward withdrawal to address</b><small>Defaults to your connected wallet; you can enter another address. <template v-if="directPayout">This note and any gas refund go directly to that address.</template><template v-else><strong>A small gas refund may still land in the smart account</strong> and can be recovered from Manage smart account.</template></small></span></label>
        </div>
        <p v-if="actions.length" class="input-hint">Changing the notes, wallet, network or payout clears your contract calls.</p>
        <template v-if="payout === 'custom'"><div class="field-heading recipient-heading"><label for="multi-recipient">Recipient address</label></div><input id="multi-recipient" v-model.trim="customRecipient" class="text-input address-input" :disabled="busy" placeholder="0x…" spellcheck="false" autocomplete="off" /><p v-if="customRecipient && !validRecipient" class="field-error" role="alert">Enter a valid nonzero recipient address.</p></template>
        <div v-if="contractsAvailable" class="after-withdrawal"><span class="feature-label feature-label-new after-withdrawal-new">NEW</span><div><b>After withdrawal <small>Optional</small></b><span v-if="actions.length" :class="{ 'actions-passed': actionStatus === 'Simulation passed ✓' }">{{ actions.length }} custom action{{ actions.length === 1 ? '' : 's' }} · {{ actionStatus }}</span><span v-else>Run contract calls from your smart account.</span></div><button class="text-button" :disabled="busy || loading" @click="openBuilder">{{ actions.length ? 'Edit actions' : 'Add contract calls' }} <Icon name="arrow" :size="13" /></button><button v-if="actions.length" class="text-button" :disabled="busy" @click="actions = []">Remove</button></div>
        <p v-if="resetNotice" class="input-hint" role="status">{{ resetNotice }}</p>
        <section v-if="reviewedActions.length" class="action-signing-review" aria-label="Contract actions before signing">
          <b>Review actions before signing</b>
          <p>These calls run in order after withdrawal.</p>
          <ol><li v-for="(review, i) in reviewedActions" :key="i">
            <b>{{ i + 1 }}. {{ review.title }}</b>
            <p>Contract target <code>{{ review.action.to }}</code></p>
            <p v-if="review.owner">Token owner <code>{{ review.owner }}</code></p>
            <p v-if="review.recipient">Recipient <code>{{ review.recipient }}</code></p>
            <p v-if="review.spender">Spender <code>{{ review.spender }}</code></p>
            <p v-if="review.amount !== undefined">{{ review.spender ? 'Allowance' : 'Token amount' }} <strong v-if="review.unlimited">Unlimited (max uint256)</strong><strong v-else>{{ actionAmount(review.action, review.amount) }}</strong></p>
            <p v-if="review.action.value > 0n">Also sends {{ callEth(review.action) }} ETH to the target.</p>
            <p v-if="review.opaque" class="opaque-call-warning">Calldata is not decoded. This call could transfer assets or grant permissions.</p>
            <details><summary>Raw calldata</summary><code>{{ review.action.data }}</code></details>
          </li></ol>
          <label v-if="hasOpaqueActions" class="opaque-call-acknowledgment"><input id="opaque-actions-ack" type="checkbox" :checked="opaqueActionsAcknowledged" @change="acknowledgeOpaque" /><span>I reviewed the target and raw calldata for every opaque action and accept its effects.</span></label>
        </section>
      </template>
      <button v-if="!wallet" class="button full" :disabled="busy" @click="emit('connect')"><Icon name="wallet" />Connect controller wallet</button>
      <div v-if="account" class="smart-account-card">
        <span>Your smart account</span><a :href="`${NETWORKS[chainId].explorer}/address/${account.address}`" target="_blank" rel="noopener noreferrer"><code>{{ account.address }}</code><Icon name="arrow" :size="12" /></a>
        <small>{{ account.deployed ? 'Already deployed' : 'Deployed with your first withdrawal; deployment is included in the fee' }}. Reconnect the same EOA to find this account again.</small>
        <button class="text-button account-settings" :disabled="busy || pending" @click="emit('manage')">Manage smart account <Icon name="arrow" :size="13" /></button>
      </div>
      <p v-if="loading" class="input-hint" role="status">Checking smart account…</p>
      <div class="field-heading amount-heading"><span>Bundler &amp; RPC</span><button class="text-button" :disabled="busy || pending" @click="emit('settings')">Configure <Icon name="settings" :size="13" /></button></div>
      <div v-if="signing && asset" class="smart-signing-review" role="status"><b>Confirm signature {{ signing.sequence }} in your wallet</b><p>Maximum paymaster fee: {{ units(signing.fee!, asset) }} {{ asset.symbol }}</p><p>Net withdrawal: {{ units(signing.net!, asset) }} {{ asset.symbol }}</p><p v-if="actions.length">This signature authorizes {{ actions.length }} reviewed custom actions after the withdrawals.</p><p class="input-hint">Gas is estimated before this wallet signature. The signed operation reaches the bundler only when you click Submit.</p></div>
      <template v-else-if="quote && !submitted && asset"><div class="recipient-review"><span>Withdrawal recipient</span><code>{{ smartRecipient(quote.scope) }}</code></div><div class="quote-card"><div><span>Notes</span><b>{{ quote.notes.length }}</b></div><div><span>Maximum paymaster fee</span><b>{{ units(quote.fee, asset) }} {{ asset.symbol }}</b></div><div class="net-row"><span>{{ actions.length ? 'Available before custom actions' : quote.scope.payout === 'account' ? 'Kept in smart account' : directQuote ? 'Paid directly to recipient' : 'Forwarded to recipient' }}</span><b>{{ units(quote.net, asset) }} {{ asset.symbol }}</b></div><p class="input-hint">{{ directQuote ? 'This note and any unused-gas refund go directly to the withdrawal recipient.' : 'Any unused-gas refund goes to your smart account after execution.' }}</p></div></template>
      <details v-if="quote && actions.length && !submitted" class="reviewed-actions"><summary>Review {{ actions.length }} custom actions</summary><ol><li v-for="(call, i) in actions" :key="i"><b>{{ callSummary(call) }}</b><code>{{ call.to }}</code><span>{{ callEth(call) }} ETH</span><code>{{ call.data }}</code></li></ol></details>
      <ActionBudget v-if="quote && actions.length && !submitted && asset" :asset="asset" :total="total" :balances="balances" :loading="balancesLoading" :fee="quote.fee" :eth-sent="actions.reduce((sum, call) => sum + call.value, 0n)" />
      <AddressPrivacyWarnings v-if="!submitted" :checks="privacyChecks" :loading="privacyLoading" :disabled="busy" :chain-id="chainId" @recheck="refreshPrivacy()" />
      <template v-if="!submitted">
        <SimulationReview v-if="quote" :quote="quote" :result="simulation" :running="simulating" :disabled="busy || loading" :current="simulationCurrent" :expired="reviewExpired" :custom-rpc="!!simulationRpc.trim()" @recalculate="recalculate" />
        <button v-if="quote" class="button primary full" :disabled="busy || loading || privacyLoading || !canSubmitReview" @click="submit">Submit signed withdrawal <Icon name="arrow" /></button>
        <button v-else-if="!signing" class="button primary full" :disabled="busy || loading || privacyLoading || !wallet || !account || !parsed.notes.length || !validRecipient || !opaqueActionsAcknowledged" @click="prepare">{{ busy ? 'Preparing batch…' : 'Review & sign withdrawal' }}<Icon name="arrow" /></button>
        <button v-if="busy && controller" class="button full" @click="stop">Stop preparation</button>
      </template>
      <div v-if="busy && !signing" class="modal-status" role="status"><span class="spinner"></span>{{ status || 'Working…' }}</div>
      <div v-if="rows.length" class="progress-list"><div v-for="row in rows" :key="row.id" class="progress-item"><div><b>{{ row.label }}</b><span class="progress-state" :class="row.status">{{ row.status }}</span></div>
        <div v-if="row.hash" class="operation-hash"><span>UserOperation hash</span><code>{{ row.hash }}</code></div>
        <small v-if="['submitted', 'unknown'].includes(row.status)" class="input-hint">(awaiting on-chain confirmation)</small>
        <a v-if="row.transactionHash" class="transaction-link" :href="`${NETWORKS[frozen!.chainId].explorer}/tx/${row.transactionHash}`" target="_blank" rel="noopener noreferrer">Transaction <code>{{ shorten(row.transactionHash) }}</code><Icon name="arrow" :size="12" /></a><p v-if="row.message">{{ row.message }}</p>
      </div></div>
      <button v-if="pending" class="button full" :disabled="busy" @click="check">Check submitted operation</button>
      <template v-if="canReturnToReview"><button class="button primary full" :disabled="busy" @click="returnToReview">Back to review <Icon name="back" /></button><p class="input-hint">Your notes and recipient are preserved. Contract calls are preserved when the wallet and network are unchanged. Review again to refresh fees, proofs and signatures. The hash may change; earlier attempts stay in the session download.</p></template>
      <button v-if="submitted && !pending" class="button full" :class="{ primary: !canReturnToReview }" :disabled="busy" @click="startNewWithdrawal">Start new withdrawal <Icon name="arrow" /></button>
      <button v-if="quote || rows.length || previousAttempts.length" class="button full" :disabled="busy" @click="exportSession"><Icon name="download" />Download session &amp; notes</button>
      <button v-if="!account" class="text-button account-settings" :disabled="busy || pending" @click="emit('manage')">Manage smart account <Icon name="arrow" :size="13" /></button>
      <div v-if="error" class="error-banner" role="alert"><Icon name="info" />{{ error }}</div>
    </div>
    </template>
  </section>
</template>
