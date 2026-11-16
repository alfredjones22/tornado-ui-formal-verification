# Decision #3 — what should “confirmed” mean?

Status: **decided — option A, current release unchanged**, on 16 November 2026. The user chose to retain the current release and complete v1 with an explicit confirmation-reporting assumption. Steps #1/#2 are complete as scoped analysis and conditional verification; step #3 is complete as a scope decision. B/C below remain possible future product work, with no implementation authorized by this report.

The selected assumption is **A_CONFIRMATION_REPORTING**: only the interpretation of `confirmed` as an actual successful withdrawal assumes a well-formed, truthful bundler receipt associated with the intended operation, transaction and chain. This does not assume that all bundler inputs are honest, and it does not add a finality claim. The executable regression keeps the fabricated-success counterexample as an expected limit, not a passing proof of chain inclusion.

## The fact we need to decide around

The frozen basic route asks the bundler for a UserOperation receipt, accepts `success: true`, and shows `confirmed` using the supplied transaction hash. It does not independently establish the operation's inclusion. The fabricated-response counterexample is preserved in milestone 1. Checks in another route do not strengthen this route automatically.

There are three different questions: what the bundler reports, whether the intended pool withdrawal actually appears in a canonical chain receipt, and whether that inclusion is finalized. A fourth question—whether every downstream balance/refund effect matched expectations—needs additional contract/asset semantics. One status word should not silently claim all four.

## Option A — retain this exact release and narrow the claim

Keep the source and CID target unchanged. State that confirmation reflects the configured bundler's successful response. Actual inclusion requires the bundler to be honest about operation identity, success and transaction identity.

This permits completion of a useful conditional verification report for the current release. It does not support a claim that the UI withstands a malicious bundler's confirmation lies. An independent manual or external verifier can supplement the evidence, but cannot retroactively change what the existing UI label proves.

Change cost: no release change. Assurance cost: an explicit strong honest-bundler assumption for confirmation. The other local transaction-binding proofs remain useful.

## Option B — independent chain evidence in a deliberately revised release

Treat the bundler as a transport and transaction-location hint. Before reporting chain inclusion, independently validate receipt evidence through the selected chain-data client. If it uses the wallet provider/fallback RPC, document that choice. A distinct code path does not guarantee a distinct operator; honesty/authenticity of that chain source remains an assumption.

A concrete proposed acceptance contract would require:

1. Compute/preserve the intended operation identity locally using the exact EntryPoint v0.8 and EIP-7702/initCode rules for this payload. Compare returned identifiers rather than accepting arbitrary hashes. Test against the pinned contract implementation, not just current latest library documentation.
2. Validate the transaction hash and obtain a successful receipt on the selected chain. Check its block hash against the chain source's canonical block at that height.
3. Match the intended EntryPoint event by operation identity, sender, paymaster and nonce; inspect the per-operation success flag. A successful outer transaction alone can contain a failed operation.
4. Match the Tornado pool Withdrawal event for the selected nullifier, recipient, relayer/paymaster and fee. For this direct flow, this gives more precise payout evidence than the outer transaction result alone. Keep operation execution outcome and observed pool withdrawal separate if they disagree; sponsoring validation effects and delegation changes can outlive execution failure.
5. Retain pending/unknown states on missing or inconsistent evidence, preserve known identifiers, and never automatically rebroadcast as a result of a polling timeout.

This is a proposed contract, not an implemented validator. The pinned [EntryPoint v0.8 interface](https://raw.githubusercontent.com/eth-infinitism/account-abstraction/v0.8.0/contracts/interfaces/IEntryPoint.sol) defines the per-operation event fields. Its [EntryPoint implementation](https://raw.githubusercontent.com/eth-infinitism/account-abstraction/v0.8.0/contracts/core/EntryPoint.sol) and [EIP-7702 support](https://raw.githubusercontent.com/eth-infinitism/account-abstraction/v0.8.0/contracts/core/Eip7702Support.sol) are the appropriate identity references for this release family.

This closes the **bundler-only confirmation** gap under an honest/authenticated chain-source assumption. It does not make arbitrary RPC responses trustworthy or prove refund amounts and recipient-contract side effects. It adds chain reads, so endpoint availability and correlation/privacy implications must be documented.

Change cost: a focused UI/adapter revision, a new named baseline, new verification obligations and later source/build/CID checks. The current frozen release remains available as the reference target.

## Option C — authenticate chain evidence locally

Verify receipt inclusion against execution headers authenticated by a consensus light client, a user-run validating node, or another explicitly specified trusted anchor. A user-run full node can be the selected source for B; embedding client-side consensus/header/receipt-proof verification is the larger C variant.

The proof chain would include the correct operation/log, its receipt, receipt-root inclusion, an authenticated execution header, and the chosen chain/finality anchor. Downloading receipts from multiple RPCs without authenticating an anchor is corroboration, not this proof. A light client still has bootstrap/consensus assumptions, and receipt proofs must actually be supplied or constructed and checked. [Ethereum light-client overview](https://ethereum.org/developers/docs/nodes-and-clients/light-clients/)

Change cost: materially larger networking, cryptography, sync, browser-resource, privacy and verification scope. This is appropriate if the goal explicitly includes resistance to malicious chain RPCs. It is not necessary merely to stop trusting a bundler's success boolean.

## Inclusion versus finality is a separate choice

If B or C is chosen, my proposed status policy is:

- **Submitted / awaiting evidence:** operation released/submitted, without verified inclusion.
- **Included:** the chosen evidence checks pass at a specific block/hash.
- **Finalized:** the inclusion block remains canonical and is covered by the selected source's finalized chain view, or by the locally verified consensus anchor.

An immediate included state plus a later finalized state avoids hiding useful progress while overstating finality. A block number comparison alone is insufficient: the receipt's block hash must still belong to the chosen canonical chain. The JSON-RPC API exposes `safe` and `finalized` block tags; using those tags still trusts the responding node unless its evidence is independently authenticated. [Ethereum JSON-RPC block parameters](https://ethereum.org/developers/docs/apis/json-rpc/#block-parameter)

If the product keeps one final success label, we must decide whether it means observed inclusion or finalized inclusion, and accept the corresponding latency and evidence assumptions. I recommend keeping those stages distinct.

## Selected decision and rationale

**A is the selected v1 profile**, regardless of whether making another UI release would be easy. The product benefit of automated independent confirmation has not been shown to justify adding chain reads, evidence matching, provider-error paths and finality policy merely to strengthen an FV claim. The existing basic route's false success response changes completion reporting; it does not itself change the signed payout recipient/fee, trigger an automatic extra transaction, or delete the original note.

Misleading completion can still cause users to stop investigating, assume funds arrived, or discard a backup. Manual checking can detect the discrepancy if it establishes the actual withdrawal/recipient outcome; merely opening a bundler-supplied transaction link is insufficient. This detection path is not an automatic UI guarantee.

B can be reconsidered if independent completion evidence becomes a product requirement, confirmation triggers consequential automatic actions, or experience shows meaningful user harm. C requires a separate malicious-chain-source goal. No new included/finalized states, chain checker, baseline or deployment are part of option A. The later user-requested isolated reproducible rebuild checks do not change the UI release.

This decision does not resolve earlier signed-candidate release during estimation. Improved final confirmation could not move that earlier authorization boundary; stronger final-click authorization would be a separate design decision.

## Registry-release update

The later user-authorized migration to the published SDK creates a new release baseline and CID without changing confirmation implementation or choosing B/C. The original option A decision and its assumptions still apply. See [the release update](release-upgrade-alpha37.md).
