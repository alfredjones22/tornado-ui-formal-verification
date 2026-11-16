# Milestone 1: eight safety claims

Continuation evidence and narrowed SDK/caller premises are recorded in [continuation-1-2.md](continuation-1-2.md). [Option A is selected](confirmation-decision.md): the release is unchanged, and C07 is the narrower bundler-reporting claim. The executable register is [verification-profile.json](../verification-profile.json).

Target: the basic, single-note paymaster route in the frozen release. The recipient is the address supplied to the validator as the reviewed intent; correspondence to the rendered review and the human's intention is a separate obligation. Each local postcondition quantifies over all successful returns in the input domain in [assumptions.md](assumptions.md).

The evidence labels are deliberately separate: **conditional implementation proof**, **model check**, **concrete test**, **source inspection**, and **open/refuted stronger claim**.

<a id="c01"></a>

## C01 — Direct payout and no execution calls

If `validateWithdrawal` returns, the proof recipient equals the supplied reviewed recipient, calldata is `0x`, execution gas is zero, and the UserOperation nonce is zero.

- Evidence: conditional SMT obligations P01 and P02; concrete accepted/rejected inputs.
- Release boundary: `baseline/ui/src/core/withdrawals.ts:24–26`.
- Assumptions: normal input values and native conversion/address semantics. No claim that the recipient is nonzero at this boundary; `prepareWithdrawal:86` performs that upstream check, which is not symbolically verified here.
- Exclusions: actual transfer, signature authority, proof validity, subsequent recipient contract behaviour, gas-refund routing on chain, and displayed-review correspondence.

<a id="c02"></a>

## C02 — Matching transport, pool, asset, paymaster and authorization chain

On successful return, the transport is the configured paymaster route and bundler URL; EntryPoint and paymaster match the selected configuration; the pool and asset kind match the parsed note metadata; EIP-7702 authorization metadata names the selected chain. If `withdrawnValue` is present, it equals the note denomination.

- Evidence: conditional SMT obligations P03 and P04; concrete mutation checks on both chain IDs and native/token shapes.
- Release boundary: `withdrawals.ts:18–27`.
- Assumptions: the configuration is authoritative; the symbolic proof works relative to that configuration, not hardcoded deployed code. Chain IDs are in the documented exact-number domain.
- Exclusions: actual endpoint identity, deployed contract code, EIP-7702 target/signature/sender correctness, and a guarantee inferred from a server's self-reported chain ID. Optional `withdrawnValue` remains optional.

<a id="c03"></a>

## C03 — Exact positive fee and proceeds arithmetic

On successful return, the returned fee equals the proof fee, `0 < fee < denomination`, and `net = denomination - fee`, with `0 < net < denomination`.

- Evidence: P05 and P08, including arbitrary mathematical integer reasoning within the declared uint256 input ranges; concrete near-boundary and large-integer cases.
- Release boundary: `withdrawals.ts:28–29,38–39`.
- Exclusions: a 20% fee ceiling, market fairness, correct gas estimation, final gas refunds, and decimal formatting. The host validator enforces less than the whole note; stronger SDK fee limits are outside this proof.

<a id="c04"></a>

## C04 — Sponsor tuple agrees with the supplied proof fields

On successful ABI decoding and validator return, the sponsor tuple has the expected pool and recipient, and the same proof bytes, root, nullifier hash and fee as the supplied proof fields.

- Evidence: P06; actual viem decoding in concrete and differential checks.
- Release boundary: `withdrawals.ts:33–37`.
- Assumptions: viem's decoder faithfully maps raw ABI bytes to this tuple. The symbolic backend represents an arbitrary correctly typed decoded tuple rather than proving the decoder.
- Critical boundary limitation: equality between supplied fields is not proof that the nullifier belongs to the selected note. The source does not derive the note identity here. The stronger selected-note claim is **not established at this boundary**, with a SAT witness and a concrete accepted changed-note example.
- Exclusions: cryptographic proof validity, Merkle membership, root authenticity, completeness of history, and the SDK's note-to-proof construction.

<a id="c05"></a>

## C05 — Restricted estimation metadata and fallback policy

On successful return, metadata is either `estimated`, or `fallback` with reason `bundler-internal` or `transport-unavailable`. C01's direct/no-execution restrictions still apply in either case.

- Evidence: P07 and the conjunction of P01–P08; concrete recognised and unrecognised status/reason inputs.
- Release boundary: `withdrawals.ts:30–32`.
- Exclusions: truth of the metadata, accuracy of gas limits, provider acceptance, successful execution, or economic correctness. An arbitrary SDK object can label itself `estimated`; this proof only establishes the host's acceptance rule.

<a id="c06"></a>

## C06 — One explicit send per invocation; uncertainty preserves recovery information

The submission adapter's one invocation contains one explicit send call and does not retry it after send/receipt errors. A known hash remains available in the UI update stream. At-most-one invocation for one quote additionally requires the UI caller's `busy`/`started` guard.

- Evidence: lifecycle L01, L02, L04 and L06; concrete one-send, lost-response and retained-hash tests; source inspection of `App.vue:147–152,260–268` and `withdrawals.ts:107–125`.
- Status: **conditional caller-protocol proof + model checks + implementation tests**, not an end-to-end temporal implementation proof. The continuation adds inductive obligations U01–U03 and actual Vue scheduling tests; source-specific lowering, operational semantics and correspondence remain trusted.
- Assumptions: one immutable quote, one page lifetime, the UI caller contract, and immutable ownership across awaits. The adapter itself does not enforce single use; invoking it twice sends twice. Changing the operation during `await validateConnections` can bypass the earlier check at the standalone adapter boundary. Both limitations have concrete demonstrations; neither establishes a reachable ordinary-user UI exploit.
- Exclusions: exactly-once chain execution, cross-refresh deduplication, other tabs, external holders of signed candidates, automatic SDK estimation candidates, and a full Vue-to-model refinement proof.

<a id="c07"></a>

## C07 — Confirmation reports the configured bundler response (option A)

The basic route reports `confirmed` after its configured bundler reconciler returns a transaction hash. That reconciler returns only after a non-null receipt response with a truthy `success` field; false/absent success rejects. This is a reporting contract, not independently checked chain inclusion.

- Status: **source inspection + implementation tests**; no implementation SMT proof is claimed for this async reconciler. Lifecycle L03 separately checks the authored model's known-submission requirement.
- Evidence: captured-source conformance cases cover successful, false/absent and malformed truthy success values, and confirm there is no chain-receipt call. Lifecycle G01 and the fabricated-success test preserve the stronger claim's counterexample.
- Release boundary: `withdrawals.ts:94–104,120–121`; recheck in `App.vue:284–292` uses the same reconciler.
- **A_CONFIRMATION_REPORTING:** interpreting this label as an actual successful withdrawal assumes a well-formed, truthful bundler receipt associated with the intended operation, transaction and chain. This assumption applies to confirmation meaning, not to all transaction construction or every bundler input.
- The source tests truthiness rather than validating a strict boolean schema. Transaction-hash shape, operation/receipt matching, canonical inclusion and finality are not independently established here.
- Stronger excluded claim: `confirmed` guarantees the intended operation's actual inclusion despite a malicious bundler. This is **REFUTED**, not silently assumed proved. The existing UI remains unchanged; manual checking supplements the user workflow without changing the automated guarantee.

<a id="c08"></a>

## C08 — Frame termination does not restore stale review or revoke released authority

In the frame/session abstraction, disposal prevents late frame messages from restoring a review. Releasing a signed candidate is an irreversible external capability: terminating local preparation cannot remove copies already held elsewhere.

- Evidence: lifecycle L05 and L07, expected G02/G03 counterexamples, and concrete release `prepareInFrame` timeout/ready cleanup and late-message tests.
- Release boundary: `withdrawals.ts:42–80`; `sdk-frame.ts:105–112`; SDK `src/state/thunks/paymasterWithdrawThunk.ts:316–330` and its signed-operation builder/estimator dependencies.
- Assumptions: honest runtime and MessagePort/document semantics. The model's `aborted` means frame error/inactivity timeout, not a newly invented manual-cancel feature in the basic UI.
- Exclusions: secure erasure, hostile same-origin dependency isolation, proof that every SDK estimation candidate meets user intent, and revocation of signatures already sent to an estimator.
