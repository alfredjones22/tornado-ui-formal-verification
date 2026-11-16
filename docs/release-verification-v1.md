# Release verification v1 — 16 November 2026

**Complete within the declared scope, with option A and the published registry SDK.** This is a reproducible, conditional verification package for the frozen basic single-note ERC-4337/paymaster withdrawal. It combines source-linked SMT proofs, conditional dataflow/protocol proofs, an exhaustively checked finite lifecycle model, and captured-source implementation tests. It includes exact SDK-runtime/package/UI correspondence and an expected-CID match; the publisher reported a matching independently uploaded CID; it is not a proof of the entire UI's semantics.

## Target and result

The target is the recorded working tree, including uncommitted release files, plus captured SDK source/artifacts. The current registry-release baseline has 388 files / 63,309,993 bytes and digest 8640d00237f117f233719d30047ef876e40e7894fae1ef6ed49fc7f3404b9f31. [The release update](release-upgrade-alpha37.md) records the four changed UI files and preserves the previous target. The original Git HEAD alone does not identify these bytes. The [manifest](../baseline/manifest.json) inventories them; [the profile](../verification-profile.json) binds the selected scope and claims to this digest.

The consumer command is `npm run verify`, after `npm run setup` on Node >=22.18.0 and Python 3.11+. It regenerates and checks evidence before emitting **PASS_WITH_ASSUMPTIONS**. Exit zero means the required proof obligations, model properties, implementation tests, integrity checks and expected counterexamples passed for this profile. It does not certify every claim with the same technique or establish assumptions experimentally. A failed check, unsupported extraction, inconclusive solver result, wrong target or missing tool produces a nonzero exit and a fresh FAIL verdict.

The run checks:

- Eight conditional source-linked validator obligations, with a satisfiable accepted execution.
- Fourteen conditional source-mapped dataflow/protocol obligations, including an inductive caller invariant and nonvacuous completion trace. All 22 saved obligations replay as UNSAT under their documented semantics.
- Seven properties over the complete 25-state / 68-edge reachable lifecycle graph.
- Eight source mutants, four lifecycle mutants and five protocol mutants detected.
- 448 concrete/symbolic comparisons, with zero mismatches.
- All 14 retained SDK artifacts reproduced byte for byte and matched to the actual registry SDK, covering every published JavaScript file; all 17 package files checked; all 65 UI output files reproduced, with the rebuilt directory computing to the expected CID.
- 71 captured-source implementation tests: 16 host-function tests, 34 SDK tests and 21 Vue caller tests. SDK scenarios and Vue event schedules are finite evidence, not exhaustive execution proofs.

## Eight claims and their evidence

[Claims C01–C05](claims.md#c01) have conditional source-linked validator proofs: recipient/direct-call restrictions, configuration/pool/asset agreement, positive fee/proceeds arithmetic, sponsor tuple agreement and allowed estimation metadata. These quantify over successful returns in the stated input domain.

[C06](claims.md#c06) combines a conditional caller-protocol proof, model checks and runtime tests for per-quote explicit-send exclusion and recovery information. It does not establish exactly-once chain execution, cross-tab deduplication, or prohibition of an external holder using a previously released estimation candidate.

[C07](claims.md#c07) is the selected option A reporting contract, supported by source inspection and implementation tests. The UI trusts the configured bundler's success response. **A_CONFIRMATION_REPORTING** is needed only to interpret that response as the intended withdrawal's actual successful chain outcome. It assumes a well-formed, truthful receipt associated with the correct operation, transaction and chain. It does not grant blanket trust to bundler inputs. Independent inclusion, receipt authentication and finality are excluded; fabricated success remains an expected counterexample.

[C08](claims.md#c08) is model-checked and implementation-tested: disposed preparation cannot restore a stale review, while authority already released externally is not revoked by termination. There is no source-level temporal implementation proof or secure-erasure claim.

## Deliberately retained limits

The custom translator and source mappings, symbolic/operational abstractions, runtime and compiler behaviour, ABI/serialization/signing/Pedersen/Groth16 contracts, selected configuration, and history/root assumptions are part of the trusted base. [Assumptions](assumptions.md) and [the continuation](continuation-1-2.md) provide the precise boundaries.

The host validator compares supplied note/proof metadata; it does not independently derive the selected note's nullifier. The continuation narrows this gap through captured SDK routing and conditional selection/proof-input obligations, not a full SDK proof. Executable signed candidates leave during gas estimation, before final review; closing preparation or rejecting a quote cannot revoke them. Quote age is checked before the connection-validation await, not at the eventual send effect.

The locally computed expected CID is bafybeifsqylni6qcznv2b27gymbymruqhmhp6kjy2sp6hafz3iqq3ezmha. Source-to-SDK-runtime/package-to-UI-build and build-to-CID correspondence are checked by exact byte comparisons. The extra package declaration, metadata and README are integrity-pinned inputs without a source-rebuild claim. [The correspondence report](release-correspondence.md) defines the complete chain, pinned inputs and import parameters. Redundant archive, dependency and generated-output copies were removed; the exact source/output hashes and all required checks remain. The publisher reported the exact expected CID after independently uploading the build; [release/deployment.json](../release/deployment.json) records that comparison. It is a publisher report, not an authenticated external attestation. Compiler/toolchain correctness remains trusted; this does not authenticate a gateway or prove all deployed semantics. No live/funded transaction, circuit proof, full contract audit, privacy theorem or end-to-end browser proof is included.

## Consumer interpretation and publication wording

Use [the README](../README.md) for installation, rerunning and optional UI-checkout comparison. The concise machine-readable verdict is [reports/result.json](../reports/result.json), with per-claim evidence kinds; [reports/summary.json](../reports/summary.json) records counts, versions, hashes and links to detailed evidence. Recorded reports are examples of prior runs; consumers should rerun the command. These files are local results, not authenticated publisher attestations. A repository contributor able to change both checks and target anchors can change what is being checked.

An accurate publication statement is: **“The captured release's basic direct-withdrawal flow has a reproducible scoped verification package: conditional source-linked proofs, lifecycle model checks and implementation tests, with an explicit bundler-reporting assumption for confirmation.”** The package also reproduces the exact build and locally computed expected CID. Avoid “the entire UI is formally verified” or attributing full semantic correctness to a CID merely because its bytes reproduce.

The dependency/configuration changes create a deliberately new release. Application withdrawal/confirmation source, claim scope and assumptions are unchanged. No commit, publication or deployment was performed by this effort. Optional future work is in [next-steps.md](next-steps.md).

## Consumer validation

[reports/consumer-check.json](../reports/consumer-check.json) records fresh-export setup and verification, tested environment, and negative checks for changed target bytes or missing tools. Generated evidence belongs to its recorded target digest/run; proof artifacts/reports/logs are ignored by Git and created on demand. The active verifier clears stale success before work begins and fails closed on incomplete evidence.

The external UI check requires all 127 remaining captured files, including the exact README, and the absence of exactly the five non-runtime files pinned in release/ui-source-revision.json. Registry SDK content is checked separately inside the isolated workspace; tests of package tampering must fail. The original developer SDK checkout can advance independently because consumers use retained source plus the frozen registry package and pinned inputs. Maintainers can reproduce the fresh-install and negative checks with `python3 scripts/validate-consumer.py` on the supported toolchain; this separate validation downloads dependencies into a temporary export.

## Current README and prior release

The current UI README is frozen directly in baseline/ui/README.md. The five later publication-cleanup deletions are pinned in release/ui-source-revision.json and applied before each rebuild; arbitrary documentation edits or other deletions are not ignored. See [the cleanup record](publication-cleanup.md). The previous release is summarized in [release-history.md](release-history.md); its unused duplicate verifier archive was removed. The root consumer command verifies only the current registry target.
