# Release verification v1 — 22 November 2026

**Best-effort verification within the declared basic single-note scope, with explicit assumptions.** This is a reproducible, conditional verification package for the frozen ERC-4337/paymaster withdrawal. It combines source-linked SMT proofs, conditional dataflow/protocol proofs, an exhaustively checked finite lifecycle model, and captured-source implementation tests. It checks exact SDK-runtime/package/UI correspondence and the expected CID; the publisher reported that CID after publication. It does not guarantee bug-free code or prove the entire UI's semantics.

## Target and result

The target is clean `tornado-ui-new-era` main commit `186059918186fb1e047586b45da41aab41268d78`, plus published `@kohaku-eth/tornado-cash@0.1.0-alpha.38` and retained matching SDK source from Kohaku commit `1852494e902db7166ecd2eb48e2702cc09102f9b`. The baseline has 412 entries / 63,820,762 bytes and digest `059463d625adac900d3c1a73ebb39cd7c441b607870620642cffe06727dff2e8`. It contains 129 exact UI source files, 186 retained SDK source files and the exact compressed offline build inputs. The [manifest](../baseline/manifest.json) inventories source and output hashes; the [profile](../verification-profile.json) binds selected claims and assumptions to that digest.

The consumer command is `npm run verify`, after `npm run setup` on Node >=22.18.0 and Python 3.11+. It regenerates and checks evidence before emitting **PASS_WITH_ASSUMPTIONS**. Exit zero means the required proof obligations, model properties, implementation tests, integrity checks and expected counterexamples passed for this profile. It does not certify every claim with the same technique or establish assumptions experimentally. A failed check, unsupported extraction, inconclusive solver result, wrong target or missing tool produces a nonzero exit and a fresh FAIL verdict.

The run checks:

- Nine conditional source-linked validator obligations, including the selected-note nullifier equality guard, with a satisfiable accepted execution.
- Fourteen conditional source-mapped dataflow/protocol obligations, including an inductive caller invariant and nonvacuous completion trace. All 23 saved obligations must replay as UNSAT under their documented semantics.
- Nine properties over the reachable lifecycle graph; the model checks that estimation does not expose an executable operation and that exposure follows explicit Submit.
- Source, lifecycle and protocol mutation checks, plus 464 concrete/symbolic comparisons with zero mismatches.
- All 14 retained SDK artifacts must reproduce byte for byte and match the actual registry SDK, covering every published JavaScript file; all 16 package files and 65 UI output files are checked, with the rebuilt directory computing to the expected CID.
- Captured-source implementation tests exercise host functions, SDK boundaries and Vue caller schedules. Their finite cases are not exhaustive execution proofs; generated reports contain the exact run counts.

## Eight claims and their evidence

[Claims C01–C05](claims.md#c01) have conditional source-linked validator proofs: recipient/direct-call restrictions, configuration/pool/asset agreement, positive fee/proceeds arithmetic, sponsor tuple agreement and allowed estimation metadata. These quantify over successful returns in the stated input domain.

[C06](claims.md#c06) combines a conditional caller-protocol proof, model checks and runtime tests for per-quote explicit-send exclusion and recovery information. It does not establish exactly-once chain execution, cross-tab deduplication, or prohibition of an external holder using the signed operation after Submit.

[C07](claims.md#c07) now describes host-RPC confirmation evidence, supported by source inspection and implementation tests. The bundler's response supplies a transaction locator; the basic route requires a successful selected-chain transaction receipt plus matching EntryPoint UserOperationEvent and pool Withdrawal event before reporting `confirmed`. **A_CHAIN_RPC_REPORTING** is needed to interpret that unauthenticated RPC data as actual chain inclusion. This is independent of the bundler's success report, but it is not a consensus-authenticated receipt proof or finality check. A dishonest-chain-RPC counterexample remains expected.

[C08](claims.md#c08) is model-checked and implementation-tested: disposed preparation cannot restore a stale review; estimation uses dummy payloads; a signed operation exposed on Submit is not revoked by local termination. There is no source-level temporal implementation proof or secure-erasure claim.

## Deliberately retained limits

The custom translator and source mappings, symbolic/operational abstractions, runtime and compiler behaviour, ABI/serialization/signing/Pedersen/Groth16 contracts, selected configuration, and history/root assumptions are part of the trusted base. [Assumptions](assumptions.md) and [the continuation](continuation-1-2.md) provide the precise boundaries.

The host validator now compares the proof nullifier with `noteIdentity(note)`. That is a source-linked conditional check, not a proof that the underlying Pedersen/ABI derivation is correct. The continuation checks captured SDK routing and proof-input boundaries, not full SDK semantics. Alpha.38 gas estimation uses non-executable dummy proofs/signatures; the final signed operation first reaches an external service on explicit Submit. Local cancellation or termination after exposure cannot revoke it. Quote age is checked before the connection-validation await, not at the eventual network send effect.

The locally computed expected CID is `bafybeihy3fhqgfsvkeaeocmm3oxhsqxlz3bba57al4pu2pf22u33fmmppq`. Source-to-SDK-runtime/package-to-UI-build and build-to-CID correspondence are checked by exact byte comparisons. Package metadata and README are integrity-pinned inputs without a source-rebuild claim. [The correspondence report](release-correspondence.md) defines the complete chain, pinned inputs and import parameters. The publisher reported the expected CID after publication; [release/deployment.json](../release/deployment.json) records that comparison. It is a publisher report, not an authenticated external attestation. Compiler/toolchain correctness remains trusted; this does not authenticate a gateway or prove all deployed semantics. No live/funded transaction, circuit proof, full contract audit, privacy theorem, Lean proof or end-to-end browser proof is included.

## Consumer interpretation and publication wording

Use [the README](../README.md) for installation, rerunning and optional UI-checkout comparison. The concise machine-readable verdict is [reports/result.json](../reports/result.json), with per-claim evidence kinds; [reports/summary.json](../reports/summary.json) records counts, versions, hashes and links to detailed evidence. Recorded reports are examples of prior runs; consumers should rerun the command. These files are local results, not authenticated publisher attestations. A repository contributor able to change both checks and target anchors can change what is being checked.

An accurate publication statement is: **“The captured release's basic direct-withdrawal flow has a reproducible scoped verification package: conditional source-linked proofs, lifecycle model checks and implementation tests, with an explicit host-RPC authenticity assumption for confirmation.”** The package also reproduces the exact build and locally computed expected CID. Avoid “the entire UI is formally verified” or attributing full semantic correctness to a CID merely because its bytes reproduce.

This report applies only to the exact target described above. The UI was published before this verifier was prepared; this repository does not publish code. Optional future work is in [next steps](next-steps.md).

## Consumer validation

[reports/consumer-check.json](../reports/consumer-check.json) records fresh-export setup and verification, tested environment, and negative checks for changed target bytes or missing tools. Generated evidence belongs to its recorded target digest/run; proof artifacts/reports/logs are ignored by Git and created on demand. The active verifier clears stale success before work begins and fails closed on incomplete evidence.

The external UI check requires all 129 captured files, including the exact README, with no source-file exceptions. Registry SDK content is checked separately inside the isolated workspace; package tampering must fail. The original developer SDK checkout can advance independently because consumers use retained source plus the frozen registry package and pinned inputs. Maintainers can reproduce fresh-install and negative checks with `python3 scripts/validate-consumer.py` on the supported toolchain; this separate validation downloads dependencies into a temporary export.

## Source capture

The UI README is frozen directly in baseline/ui/README.md. The [source revision](../release/ui-source-revision.json) allows no deletion or arbitrary documentation edit. The root consumer command verifies only this target.
