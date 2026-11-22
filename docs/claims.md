# Eight safety claims

Continuation evidence and narrowed SDK/caller premises are recorded in [continuation-1-2.md](continuation-1-2.md). The basic route implements host-RPC receipt and exact-event checks after the bundler locates a transaction. The executable register is [verification-profile.json](../verification-profile.json).

Target: the basic, single-note paymaster route in the frozen release. The recipient is the address supplied to the validator as the reviewed intent; correspondence to the rendered review and the human's intention is a separate obligation. Each local postcondition quantifies over all successful returns in the input domain in [assumptions.md](assumptions.md).

The evidence labels are deliberately separate: **conditional source-linked SMT proof**, **kernel-checked Lean theorem over a source-derived abstraction**, **model check**, **concrete test**, **source inspection**, and **open/refuted stronger claim**. [Lean certification](lean-certification.md) explains the five property theorems, one nonvacuity theorem, and their trusted source bridge.

<a id="c01"></a>

## C01 — Direct payout and no execution calls

If `validateWithdrawal` returns, the proof recipient equals the supplied reviewed recipient, calldata is `0x`, execution gas is zero, and the UserOperation nonce is zero.

- Evidence: conditional SMT obligations P01 and P02; Lean theorems `ValidatorRelease.recipient_matches` and `ValidatorRelease.no_execution`; concrete accepted/rejected inputs. The Lean theorems cover the selected guard abstraction, not actual on-chain payout.
- Release boundary: `baseline/ui/src/core/withdrawals.ts#validateWithdrawal`.
- Assumptions: normal input values and native conversion/address semantics. No claim that the recipient is nonzero at this boundary; `prepareWithdrawal` performs that upstream check, which is not symbolically verified here.
- Exclusions: actual transfer, signature authority, proof validity, subsequent recipient contract behaviour, gas-refund routing on chain, and displayed-review correspondence.

<a id="c02"></a>

## C02 — Matching transport, pool, asset, paymaster and authorization chain

On successful return, the transport is the configured paymaster route and bundler URL; EntryPoint and paymaster match the selected configuration; the pool and asset kind match the parsed note metadata; EIP-7702 authorization metadata names the selected chain. If `withdrawnValue` is present, it equals the note denomination.

- Evidence: conditional SMT obligations P03 and P04; concrete mutation checks on both chain IDs and native/token shapes.
- Release boundary: `withdrawals.ts#validateWithdrawal`.
- Assumptions: the configuration is authoritative; the symbolic proof works relative to that configuration, not hardcoded deployed code. Chain IDs are in the documented exact-number domain.
- Exclusions: actual endpoint identity, deployed contract code, EIP-7702 target/signature/sender correctness, and a guarantee inferred from a server's self-reported chain ID. Optional `withdrawnValue` remains optional.

<a id="c03"></a>

## C03 — Exact positive fee and proceeds arithmetic

On successful return, the returned fee equals the proof fee, `0 < fee < denomination`, and `net = denomination - fee`, with `0 < net < denomination`.

- Evidence: conditional SMT obligations P05 and P08; Lean theorems `ValidatorRelease.fee_proceeds` and `ValidatorRelease.returned_fee_matches_proof` certify the same stated bounds, net subtraction and returned-fee equality in the source-derived abstraction; concrete near-boundary and large-integer cases. The mathematical integer reasoning is conditional on the declared input/conversion domain.
- Release boundary: `withdrawals.ts#validateWithdrawal`.
- Exclusions: a 20% fee ceiling, market fairness, correct gas estimation, final gas refunds, and decimal formatting. The host validator enforces less than the whole note; stronger SDK fee limits are outside this proof.

<a id="c04"></a>

## C04 — Sponsor tuple agrees with the supplied proof fields

On successful ABI decoding and validator return, the sponsor tuple has the expected pool and recipient, and the same proof bytes, root, nullifier hash and fee as the supplied proof fields. The proof nullifier is also required to equal `noteIdentity(note).nullifierHash` for the selected note.

- Evidence: conditional SMT obligations P06 and P09_selected_note_nullifier; Lean theorem `ValidatorRelease.selected_nullifier` for the selected-note equality only; actual viem decoding and note identity in concrete and differential checks. The decoded sponsor-tuple relationships have no Lean theorem.
- Release boundary: `withdrawals.ts#validateWithdrawal`.
- Assumptions: viem's decoder faithfully maps raw ABI bytes to this tuple. The symbolic backend represents an arbitrary correctly typed decoded tuple rather than proving the decoder.
- Boundary limitation: the source-linked equality is conditional on the faithful implementation of `noteIdentity` and its Pedersen/nullifier derivation. A field-equality theorem is not a cryptographic proof that a deposit exists, belongs to the user, or remains unspent.
- Exclusions: cryptographic proof validity, Merkle membership, root authenticity, completeness of history, and the SDK's note-to-proof construction.

<a id="c05"></a>

## C05 — Restricted estimation metadata and fallback policy

On successful return, metadata is either `estimated`, or `fallback` with reason `bundler-internal` or `transport-unavailable`. C01's direct/no-execution restrictions still apply in either case.

- Evidence: P07 and the conjunction of P01–P09; concrete recognised and unrecognised status/reason inputs.
- Release boundary: `withdrawals.ts#validateWithdrawal`.
- Exclusions: truth of the metadata, accuracy of gas limits, provider acceptance, successful execution, or economic correctness. An arbitrary SDK object can label itself `estimated`; this proof only establishes the host's acceptance rule.

<a id="c06"></a>

## C06 — One explicit send per invocation; uncertainty preserves recovery information

The submission adapter's one invocation contains one explicit send call and does not retry it after send/receipt errors. It computes and records the expected UserOperation hash before the network send, retaining it through an uncertain outcome. At-most-one invocation for one quote additionally requires the UI caller's `busy`/`started` guard.

- Evidence: lifecycle L01, L02, L04, L06 and L08; concrete one-send, lost-response and retained-hash tests; source inspection of `App.vue#sendWithdrawal` and `withdrawals.ts#submitWithdrawal`.
- Status: **conditional caller-protocol proof + model checks + implementation tests**, not an end-to-end temporal implementation proof. The continuation adds inductive obligations U01–U03 and actual Vue scheduling tests; source-specific lowering, operational semantics and correspondence remain trusted.
- Assumptions: one immutable quote, one page lifetime, the UI caller contract, and immutable ownership across awaits. The adapter itself does not enforce single use; invoking it twice can send twice. The source revalidates after `await validateConnections`, but arbitrary hostile mutation and cross-tab ownership are not proved safe.
- Exclusions: exactly-once chain execution, cross-refresh deduplication, other tabs, external holders of the post-Submit signed operation, and a full Vue-to-model refinement proof.

<a id="c07"></a>

## C07 — Confirmation checks host-RPC receipt and exact events

The basic route computes the expected UserOperation hash locally and requires the bundler's send response to match it. The bundler's later response supplies only a transaction-hash locator. The selected chain-read client must return a successful transaction receipt containing a matching EntryPoint UserOperationEvent with success, sender, paymaster and nonce, and a matching pool Withdrawal event with recipient, nullifier, relayer and fee, before the UI reports `confirmed`.

- Status: **source inspection + implementation tests**; no implementation SMT proof is claimed for this async reconciler. Lifecycle L03 separately checks the authored model's retained-hash and chain-evidence condition.
- Evidence: captured-source conformance cases exercise hash mismatch, missing/reverted receipts, wrong or failed EntryPoint events, wrong pool events, and matching evidence. Lifecycle G01 preserves the dishonest-chain-RPC counterexample.
- Release boundary: `withdrawals.ts#basicWithdrawalHash`, `#reconcileBasicWithdrawal` and `#submitWithdrawal`; the UI recheck uses `#reconcileBasicWithdrawal`.
- **A_CHAIN_RPC_REPORTING:** interpreting the matching receipt and logs as actual chain inclusion assumes that the selected chain-read source truthfully reports the chosen chain. The receipt and logs come from the host's chain-read source rather than the bundler's success claim, but are not a cryptographically authenticated consensus proof.
- The source does not authenticate receipt inclusion against a trusted header or establish finality. It also does not prove every downstream balance/refund effect.
- Stronger excluded claim: `confirmed` guarantees inclusion despite a malicious selected chain RPC. This remains **REFUTED** by a fabricated-response model witness.

<a id="c08"></a>

## C08 — Frame termination does not restore stale review; exposure begins on Submit

In the frame/session abstraction, disposal prevents late frame messages from restoring a review. The basic route's gas estimation sends non-executable dummy payloads; the final signed operation remains local through review and first becomes externally available on the explicit Submit send. Once sent, local termination cannot revoke copies held elsewhere.

- Evidence: lifecycle L05, L07, L08 and L09; source-checked dummy-estimation/final-build order; concrete `prepareInFrame` timeout/ready cleanup and late-message tests.
- Release boundary: `withdrawals.ts#prepareInFrame`; `sdk-frame.ts`; SDK `paymasterWithdrawThunk`, `withdrawalsProofThunk`, `estimate`, `simulation` and `utils`.
- Assumptions: honest runtime and MessagePort/document semantics. The model's `aborted` means frame error/inactivity timeout, not a newly invented manual-cancel feature in the basic UI.
- Exclusions: secure erasure, hostile same-origin dependency isolation, whole-SDK/contract proof that every dummy estimate is non-executable, and revocation of the final signature after Submit.
