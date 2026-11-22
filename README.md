# Tornado UI formal verification

> **Important:** This is best-effort formal verification of selected properties under explicit assumptions. It does **not** provide a 100% guarantee that the UI is bug-free or that funds cannot be lost.

**Version 1 checks selected properties of the frozen basic single-note ERC-4337/paymaster withdrawal under explicit assumptions.** The current target is clean `tornado-ui-new-era` main commit `186059918186fb1e047586b45da41aab41268d78` with the published `@kohaku-eth/tornado-cash@0.1.0-alpha.38` package. Basic confirmation checks a host-RPC transaction receipt and matching EntryPoint and pool events; interpreting that RPC data as actual chain inclusion still trusts the selected chain source. The consumer command reruns scoped proofs, model checks, tests, exact build comparison and CID calculation.

Expected release CID:

    bafybeihy3fhqgfsvkeaeocmm3oxhsqxlz3bba57al4pu2pf22u33fmmppq

The publisher reported exactly this CID after publication, and the clean main `dist/` directory computed to it with the pinned UnixFS settings. The report is pinned in [release/deployment.json](release/deployment.json); gateway delivery is not checked. See [release correspondence](docs/release-correspondence.md).

Start with [the v1 report](docs/release-verification-v1.md), [the eight claims](docs/claims.md), and [the assumptions](docs/assumptions.md). The [continuation report](docs/continuation-1-2.md) covers SDK/caller boundaries.

## Run as a consumer

Requires Node >=22.18.0 (recommended version in .nvmrc), Python 3.11+ with venv/pip, and a POSIX shell. No separate UI checkout, SDK checkout, wallet, browser or service credentials are needed.

```sh
nvm use
npm run setup
npm run verify
```

Setup downloads pinned npm/Python tools and isolated rebuild dependencies into this directory. Verification then uses local frozen snapshots, public synthetic fixtures and mocked transports. It does not request live RPC/bundler/relayer data, execute proof workers, or submit Ethereum transactions. No network is needed after setup. A supported z3-solver wheel is required; the tested environment is recorded in [consumer-check.json](reports/consumer-check.json).

A successful run ends with a fresh, conditional verdict such as:

```text
PASS_WITH_ASSUMPTIONS — basic direct withdrawal v1 (host-RPC receipt and event checks)
23 conditional SMT obligations UNSAT; 9 model properties; implementation tests passed.
Confirmation: host-RPC successful receipt and exact EntryPoint/pool events; actual inclusion assumes truthful chain-RPC reporting, without a finality proof.
Release correspondence: SDK + UI byte-identical; expected CID MATCH; publisher-reported upload CID MATCH. Full UI proof: NOT CLAIMED.
```

C01–C05 have conditional source-linked SMT proofs. C06 adds a conditional caller-protocol proof, C07 is source-inspected/tested, and C08 is model-checked/tested. A passing command does not turn all eight into implementation theorems.

- Exit 0 means every required check in [verification-profile.json](verification-profile.json) passed under its scope and assumptions.
- A nonzero exit means failure or incomplete verification. Missing tools, changed target bytes, unsupported extraction, inconclusive solver results, model violations and failed tests stop the run.
- [reports/result.json](reports/result.json) contains the fresh verdict, target digest, expected CID, deployment status, per-claim evidence kinds and exclusions. Starting a run replaces prior success with RUNNING; failure writes FAIL.
- [reports/release-correspondence.json](reports/release-correspondence.json) records the source-built SDK artifacts, exact registry-package comparison, all 65 UI files and the computed CID.
- [reports/summary.json](reports/summary.json) records tool versions, counts, verification-file hashes and detailed evidence. Proof artifacts, reports and logs are generated locally and ignored by Git. Report links resolve after running verification; no precomputed PASS is needed.

The dishonest-chain-RPC and post-Submit nonrevocation counterexamples remain explicit limits. They are excluded stronger claims, not failed obligations ignored by a passing verdict.

## Compare a UI checkout

```sh
npm run verify -- --ui ../tornado-ui-new-era
```

This additionally requires Git and checks the complete Git-visible source inventory under the recorded environment/private-path exclusions. All 129 captured UI files must match, including the exact README; no source-file removal is allowed by [ui-source-revision.json](release/ui-source-revision.json). Changed, additional or missing included files cause failure; there is no general Markdown exemption. The captured bytes are from the clean main commit above, and a later commit with identical included bytes would also pass.

This comparison concerns that checkout's source. The separate required release stage verifies the registry SDK installed in the isolated rebuild workspace, rebuilds the UI, compares every output byte and checks the expected CID.

The standalone baseline check is npm run baseline:check. The optional --live maintainer mode also checks the original SDK source checkout and is expected to detect its independent drift. It is not needed by consumers. The verify:continuation and verify:release commands check subsets; only npm run verify emits the final v1 verdict.

## Frozen target and honest limits

The immutable manifest records **412 entries / 63,820,762 bytes**. This is the logical target inventory, not the committed directory size. UI/SDK source, root metadata and exact offline asset inputs are retained. The 30 SDK artifact/package entries come from the integrity-locked npm install; the 23 generated UI-output entries are checked against captured hashes after rebuilding. Environment files are excluded. Target digest:

    059463d625adac900d3c1a73ebb39cd7c441b607870620642cffe06727dff2e8

All 14 retained SDK build artifacts must reproduce byte for byte and match the published SDK package. They cover every published `dist/` file. Package metadata and README are integrity-pinned inputs without a source-rebuild claim. The UI builds with the actual registry-installed package, and all 65 output files must reproduce exactly to the expected CID. See [release correspondence](docs/release-correspondence.md) for the complete import/build contract.

The clean-main snapshot permits no source-file exceptions.

This is a conditional source-linked pilot plus conditional dataflow/protocol proofs, finite model checks and implementation tests. Translators, mappings, primitive contracts, compilers and normal runtime semantics remain trusted. It is not an end-to-end UI, SDK, Vue/browser, cryptographic-circuit or whole-deployed-UI semantic proof. `A_CHAIN_RPC_REPORTING` applies specifically to confirmation's chain meaning. [The assumptions](docs/assumptions.md) and [remaining work](docs/next-steps.md) are part of the result. Hashes are integrity anchors, not authenticated publisher signatures. No Lean proof is part of this first pass.

## Repository footprint

The verifier retains auditable UI and SDK source snapshots. External library code is installed through integrity-locked npm packages; two small original package.json files preserve the exact workspace metadata used by the SDK rebuild. The original relative dependency layout and content-digest checks remain required.

The large retained input is about 49 MiB of exact compressed proving/history/relayer assets. These are not npm dependencies, and recompression can change the CID. Keeping them avoids depending on an IPFS gateway during setup; gateway probes were rate-limited during cleanup. Everything verifies offline after the pinned tool/dependency installation. See [repository-cleanup.md](docs/repository-cleanup.md).

## Evidence layout

- baseline/: frozen source, exact offline asset inputs and immutable target/output-hash manifest.
- verification-profile.json: selected target, expected CID, host-RPC confirmation assumption and claim/evidence register.
- docs/: reports, claims, assumptions and decisions.
- pilot/, model/, continuation/: source-linked extraction, symbolic checks, lifecycle model, captured-source harnesses and mutants.
- scripts/: setup, consumer runner, integrity checks, replay and summaries.
- release/: rebuild/CID checks, locked SDK build tools, runtime layout, two original package-metadata files and release records.
- artifacts/, reports/: regenerated, Git-ignored IR, SMT-LIB, synthetic corpus, verdicts and traces.
