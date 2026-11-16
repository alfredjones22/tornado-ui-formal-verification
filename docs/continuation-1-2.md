# Continuation report — v1 complete with option A

The active registry-release baseline has digest 8640d00237f117f233719d30047ef876e40e7894fae1ef6ed49fc7f3404b9f31. Application withdrawal/confirmation source is unchanged from the original continuation target. [The registry-release update](release-upgrade-alpha37.md) records the dependency/configuration changes and source/package/build correspondence. This work completes the trace, boundary definition, source checks and conditional verification planned in steps #1/#2. It does not claim a proof of Groth16, a general JavaScript compiler, or full Vue/browser refinement. [Decision #3 selects A](confirmation-decision.md): preserve the current release and scope confirmation to the configured bundler's report. This completes the requested continuation; independent confirmation is an excluded stronger claim.

## Evidence

- 18 checked source mappings, including note byte slices, import/prover/ABI field mappings, release request arguments, gas-check order, caller lock order and fresh settings construction.
- 14 new conditional SMT obligations, saved and independently replayed as SMT-LIB. These concern the checked dataflow/protocol abstractions. They are a different evidence type from milestone 1's source-extracted straight-line validator proof.
- An inductive caller-protocol invariant, covering arbitrary numbers of protocol transitions under its operational assumptions. Five faulty variants yield counterexamples, including a distinct exclusive-ownership counterexample for a missing busy guard.
- 34 captured-source SDK integration tests. Twenty-eight scenario runs cover two chains × native/token flows × seven estimator behaviours. Additional checks cover cache secret removal, wrong-chain/wrong-pool rejection, discovery-placeholder rejection, zero pre-review fee, and a fee above 20%.
- 21 actual App.vue/Vue scheduling tests. Sixteen schedules vary the delayed stage and event burst size; further tests cover form/settings ownership, uncertain submissions, later explicit reviews, and the freshness boundary.

`reports/continuation/summary.json`, `sdk.json`, `ui-scheduling.json` and the TAP files contain the records. The SDK harness executes captured TypeScript with pinned dependencies and locally generated/recovered real signatures; Merkle/root verification and expensive witness/Groth16 generation are explicit contracts. The captured prover's public-output mapping is executed with a stub cryptographic backend. The Vue harness compiles the complete captured script and template using Vue/compiler-sfc 3.5.44, mounts with Vue's renderer, executes the captured submission adapter, and mocks external services and child components.

## #1: selected note to externally released authority

### Trace through the frozen source

1. `ui/src/core/notes.ts:33` parses exactly one 62-byte note on the selected chain. `sdk-frame.ts:51` reparses the raw note inside the preparation document.
2. `ui/src/core/history-cache.ts:29,48` projects reusable history onto public slices and selected pools. The real loader was tested with injected private slices: legacy, derived and signature secret slices do not survive. The frame creates fresh MemoryStorage. Empty-storage semantics and the worker/store initialization contract remain trusted.
3. `sdk/src/account/legacyNote.ts:26` splits the note into 31-byte little-endian nullifier and salt, computes the full-preimage commitment and nullifier hash using Pedersen, and returns them. Real Pedersen code is exercised; its cryptographic correctness is not proved here.
4. `sdk/src/state/thunks/importLegacyNotesThunk.ts:24` checks chain, finds a deposit by commitment, and stores the parsed nullifier, salt and hashes in the legacy secret slice. `ui/src/core/pool-history.ts:59` requires the returned pool to match the selected pool. A commitment appearing under another pool is not silently accepted by that gate.
5. `sdk/src/state/selectors/deposits.selector.ts` and `withdrawals.selector.ts` join public deposits to private records by commitment, remove spent entries, select the requested asset/amount, and carry the record into preparation. In a fresh legacy-secret slice, the only imported legacy identity is the selected note. Other discovery placeholders may exist, but the frame disables derived/signature signer methods; a test confirms such a placeholder stops before estimation. The formal selection theorem is conditional on this fresh-legacy-slice / signer-boundary contract, not a proof of all sync/discovery algorithms.
6. `sdk/src/state/thunks/withdrawalsProofThunk.ts:29` supplies the selected deposit's nullifier, salt and nullifier hash to the prover, with the Merkle path, intended recipient, paymaster as relayer, fee and zero refund. The captured prover's `prove` method maps those public inputs directly into its returned argument tuple.
7. `paymasterWithdrawThunk.ts:240,316` picks the sponsoring deposit, computes the fee, refuses a fee consuming the denomination, rebuilds the proof, and encodes the pool/sponsor tuple using `paymaster/config.ts:20`.
8. For the basic route, the frame omits delegation and tail calls. The SDK chooses the imported note's legacy nullifier-derived local signer (`account/keys.ts:162`), checks its current state using the configured provider, and uses the pinned Simple7702 implementation. No connected wallet signature is needed for this route.
9. `paymaster/utils.ts:231` builds and signs the operation. For one note without tails, calldata and execution gas stay zero, nonce stays zero, and the proof pays the intended recipient. The typed-data signature and EIP-7702 authorization were independently recovered in every tested released candidate.
10. **The first release of executable authority is `paymaster/utils.ts:208`, the `eth_estimateUserOperationGas` request.** It carries the signed UserOperation and EIP-7702 authorization. The host's final `validateWithdrawal` and review dialog occur later. This point is independently represented in the lifecycle model and concrete SDK transcript.
11. `paymaster/estimate.ts` rebuilds fee/proof/signature together for refinements. Its one transport retry repeats the same candidate. A fallback rebuild produces a new local candidate that is returned for host review; that fallback rebuild itself is not an additional estimation request. Validation failures and inflated estimates stop preparation, while earlier released candidates remain externally held.

### What each released basic candidate is bound to

Under the source-mapped contracts, a candidate uses the selected imported legacy note's nullifier hash and pool; the intended chain/EntryPoint/paymaster; the intended direct recipient; empty execution calldata; and zero execution gas/EntryPoint nonce. Its signature covers the built public operation. Prover, ABI, hash, signing, configuration and contract semantics remain explicit primitive assumptions.

The fee envelope is **not identical to the final host-validator rule**:

- Before release, successfully ABI-encoded fees are nonnegative and below the note's denomination. Zero can be released when quoted gas prices are zero, although the later host validator rejects zero. A concrete test preserves this distinction.
- Native fee is `floor(12 × requiredGas × maxFeePerGas / 10)`, where required gas sums the five gas budgets. The corresponding rounding and monotonic upper-bound inequalities are proved in the algebraic abstraction.
- The basic UI supplies 250,000 account-verification and 2,000,000 paymaster-verification ceilings. Direct execution remains zero. The current default postOp ceiling is 100,000; the pre-verification ceiling is `700,000 + 80 × variable payload bytes`. The upper-bound theorem assumes the checked gas-validator contract.
- Gas price is bounded relative to the host's reported base fee and tip reference: max fee at most `3 × reference base fee + bounded tip`, where the tip ceiling is three times the reference tip clamped between 2 and 20 gwei. These are relative bounds, not proof that RPC data or market pricing is truthful.
- Token fees are the paymaster-quote result for that native fee, checked below the denomination and bound into the proof. Oracle correctness is outside this proof. A 90% synthetic token quote is accepted by the SDK, demonstrating that the Classic relayer's 20% cap must not be attributed to this path.
- The direct estimator has three refinement rounds and one transport retry per round: at most six estimation transmissions, up to three distinct estimated candidates. A fallback can build another local candidate. This count is conditional on the checked retry/transport contract and excludes explicit later submission, other tabs and other preparations.

### Two capabilities leave, not just a simulation description

The request contains both a signed operation and a reusable-by-a-holder EIP-7702 authorization until its nonce/state conditions cease to permit use. A third party may process the authorization separately from the exact UserOperation. EIP-7702 also specifies that processed delegation changes survive failure of the outer transaction execution. The local inactivity timer, closing a frame, final review rejection, or five-minute quote limit do not cryptographically revoke these artifacts. [EIP-7702 specification](https://eips.ethereum.org/EIPS/eip-7702)

Therefore, neither “nothing can execute until Confirm withdrawal” nor “a rejected/timed-out preparation released no authority” is an available claim for this frozen design. This is a precisely located boundary, not an assertion that a tested RPC actually broadcast anything. All integration transports here were local mocks.

## #2: actual UI caller ownership and scheduling

### Ownership established at the source boundary

`App.vue` stores editable form refs separately from the returned quote and a newly constructed settings object. Preparation arguments are primitive snapshots evaluated before awaiting preparation. The MessagePort handoff supplies a structured clone; after the frame is disposed the UI owns its returned graph. The review renders the quote's recipient, amount and fee, and the sender uses that quote and saved session settings.

The source inventory finds eleven writes to `quote.value`, `sessionSettings.value`, or `started.value`. Quote replacement/clearing is confined to a new review, the guarded completed-deposit reset, and route switching; there are no direct nested quote/settings writes in the captured App script. This is a source-specific inventory plus manual alias/consumer review, not a sound general alias analysis. Thirteen sensitive v-model controls include the `busy` disabling condition. The full rendered template tests observe these conditions during each delayed stage.

Changing form fields or connection settings after review changes the form, not the displayed quote or its saved settings. Tests explicitly exercise that separation. Wallet account/network changes also do not replace the basic withdrawal's note-derived signer or approved quote; the connected wallet is a possible read source, not the owner signing this route. Authentic chain-read behaviour remains a separate provider contract.

### Single-use invocation and async ownership

`run` checks and sets `busy` synchronously before invoking its callback. `sendWithdrawal` checks `started`, captures the quote and sets `started = true` before invoking the adapter. Normal JavaScript execution runs this prefix before yielding. A second click is blocked by the immediate guard even before Vue patches the DOM's disabled attribute.

The source-specific lowering checks the complete control skeleton of `run` and `sendWithdrawal`, emits ordered instructions, and rejects extra statements or changed dispatch order. That lowering and its abstraction remain trusted. The source-checked protocol abstraction models caller locking, one preflight continuation, the send effect, settling/errors and background work. Its invariant is established initially and preserved by every transition; it implies at most one explicit send for that captured quote over any number of protocol steps. Normal single-settlement Promise semantics and source correspondence are premises. The proof does not model the entire Vue runtime or every browser event implementation.

Concrete schedules delay preparation, connection checks, send response, and receipt response, then inject 1/2/5/12 bursts of duplicate submit/review/recheck/import calls, navigation/close attempts, and external wallet updates. The same quote/settings survive while busy, one send occurs, and subsequent calls do not resend it. Unknown send/receipt outcomes retain recovery state and prevent a new preparation. A later explicit review after completion may produce a new quote; a per-quote guarantee does not forbid another explicit withdrawal attempt.

### Limits explicitly retained

- Directly invoking `submitWithdrawal` twice still sends twice. It is an adapter; the actual UI caller supplies single-use exclusion.
- Hostile code with access to the private quote graph could mutate it during an await. That is outside the normal UI/event threat model. Source ownership checks and tests substantially narrow this assumption, but there is no theorem about arbitrary extensions, compromised dependencies or devtools mutation.
- **Quote freshness is checked at preflight start, not again at the network send effect.** A concrete delayed-preflight test advances time beyond five minutes and still sends. Accordingly, “fresh when checked” is supported; “less than five minutes old when transmitted” is not. This is independent of cryptographic candidate revocation, which the five-minute timer never provided.
- History/root authenticity, proof-generation correctness, faithful serialization/ABI/signatures, normal MessagePort cloning, fresh empty frame storage and the documented caller/source mapping remain trusted. The subsequently requested [release correspondence](release-correspondence.md) now establishes an exact SDK/UI rebuild and CID match; compiler and gateway assumptions remain separate.

## What changed in assurance

The initial broad “trust the SDK” and “assume the caller owns the quote” statements have been reduced to named source paths, checked mappings, actual runtime schedules, primitive contracts and retained limitations. The original local validator proof and its assumptions remain intact. The new obligations are conditional dataflow/protocol results; they must not be relabelled as full SDK or Vue implementation proofs.

No critical funds-loss exploit was established by this scoped work. Earlier authority release and the timing limits do block stronger product claims. No release fix was silently made to make those claims pass.

## Completed decision #3 and consumer result

```sh
nvm use
npm run verify:continuation
```

`npm run verify` runs milestone 1 and this continuation, checks the selected [v1 profile](../verification-profile.json), and emits `reports/result.json` plus the detailed `reports/summary.json`. The successful overall verdict is **PASS_WITH_ASSUMPTIONS**. It preserves separate evidence kinds for each claim; C07 is source-inspected and tested, C08 is model-checked and tested, and neither is promoted to a source implementation proof.

A_CONFIRMATION_REPORTING applies only when interpreting the bundler-reported label as an actual successful withdrawal. It is not a blanket honest-bundler premise. Expected counterexamples remain required checks, including fabricated success without independent inclusion, earlier execution authority, and lack of signature revocation.

All outputs stay in this directory. The [v1 release report](release-verification-v1.md) is the final consumer-facing account. The subsequently requested release stage also reproduces the SDK/UI artifacts and expected CID. A complete SDK/Vue refinement remains unestablished; byte matching does not promote the scoped results to a whole-UI proof. No confirmation implementation change was made. The later registry upgrade deliberately creates a new baseline and reruns this evidence; no commit, publication or deployment was performed. Rebuilds occur only in the isolated FV workspace.
