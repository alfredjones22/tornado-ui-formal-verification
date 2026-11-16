# Tornado UI formal verification

**Version 1 verifies the frozen basic single-note ERC-4337/paymaster withdrawal under explicit assumptions.** The current target uses the published @kohaku-eth/tornado-cash 0.1.0-alpha.37 package. Option A remains selected: interpreting confirmation as an actual chain outcome trusts truthful, correctly associated bundler reporting. The consumer command reruns the scoped proofs, model checks, tests, exact build comparison and expected CID calculation.

Expected release CID:

    bafybeifsqylni6qcznv2b27gymbymruqhmhp6kjy2sp6hafz3iqq3ezmha

The publisher independently uploaded the build and reported exactly this CID, matching the captured output hashes and byte-identical rebuild. The report is pinned in [release/deployment.json](release/deployment.json); gateway delivery is not checked. See [release correspondence](docs/release-correspondence.md) and [the registry-release update](docs/release-upgrade-alpha37.md).

Start with [the final v1 report](docs/release-verification-v1.md), [the eight claims](docs/claims.md), and [the assumptions](docs/assumptions.md). The [continuation report](docs/continuation-1-2.md) covers SDK/caller boundaries; [the decision record](docs/confirmation-decision.md) explains option A.

## Run as a consumer

Requires Node >=22.18.0 (recommended version in .nvmrc), Python 3.11+ with venv/pip, and a POSIX shell. No separate UI checkout, SDK checkout, wallet, browser or service credentials are needed.

```sh
nvm use
npm run setup
npm run verify
```

Setup downloads pinned npm/Python tools and isolated rebuild dependencies into this directory. Verification then uses local frozen snapshots, public synthetic fixtures and mocked transports. It does not request live RPC/bundler/relayer data, execute proof workers, or submit Ethereum transactions. No network is needed after setup. A supported z3-solver wheel is required; the tested environment is recorded in [consumer-check.json](reports/consumer-check.json).

A successful run ends with:

```text
PASS_WITH_ASSUMPTIONS — basic direct withdrawal v1 (option A)
22 conditional SMT obligations UNSAT; 7 model properties; 71 implementation tests passed.
Confirmation: bundler-reported success; actual inclusion assumes truthful, correctly associated receipts.
Release correspondence: SDK + UI byte-identical; expected CID MATCH; publisher-reported upload CID MATCH. Full UI proof: NOT CLAIMED.
```

C01–C05 have conditional source-linked SMT proofs. C06 adds a conditional caller-protocol proof, C07 is source-inspected/tested, and C08 is model-checked/tested. A passing command does not turn all eight into implementation theorems.

- Exit 0 means every required check in [verification-profile.json](verification-profile.json) passed under its scope and assumptions.
- A nonzero exit means failure or incomplete verification. Missing tools, changed target bytes, unsupported extraction, inconclusive solver results, model violations and failed tests stop the run.
- [reports/result.json](reports/result.json) contains the fresh verdict, target digest, expected CID, deployment status, per-claim evidence kinds and exclusions. Starting a run replaces prior success with RUNNING; failure writes FAIL.
- [reports/release-correspondence.json](reports/release-correspondence.json) records the source-built SDK artifacts, exact registry-package comparison, all 65 UI files and the computed CID.
- [reports/summary.json](reports/summary.json) records tool versions, counts, verification-file hashes and detailed evidence. Proof artifacts, reports and logs are generated locally and ignored by Git. Report links resolve after running verification; no precomputed PASS is needed.

The fake-success, earlier-authority and nonrevocation counterexamples must remain reproducible. They check excluded stronger claims, rather than being failed obligations ignored by a passing verdict.

## Compare a UI checkout

```sh
npm run verify -- --ui ../tornado-ui-new-era
```

This additionally requires Git and checks the complete Git-visible source inventory under the recorded environment/private-path exclusions. All 127 remaining UI files must match, including the exact README. The five recorded deletions (two planning documents, two unused proxy-deployment files and their orphaned test) are pinned in [ui-source-revision.json](release/ui-source-revision.json) and must be absent. Changed, additional or otherwise missing included files cause failure; there is no general Markdown exemption. A later commit with identical included bytes is acceptable; Git HEAD alone does not identify the captured dirty working tree.

This comparison concerns that checkout's source. The separate required release stage verifies the registry SDK installed in the isolated rebuild workspace, rebuilds the UI, compares every output byte and checks the expected CID.

The standalone baseline check is npm run baseline:check. The optional --live maintainer mode also checks the original historical SDK source checkout and is expected to detect its independent drift. It is not needed by consumers. The verify:continuation and verify:release commands check subsets; only npm run verify emits the final v1 verdict.

## Frozen target and honest limits

The immutable manifest records **388 files / 63,309,993 bytes** before the five recorded non-runtime removals. This is the logical target inventory, not the committed directory size. UI/SDK source, root metadata and exact offline asset inputs are retained. The 31 SDK artifact/package entries come from the integrity-locked npm install; the 23 generated UI-output entries are checked against their original hashes after rebuilding. Environment files are excluded. Target digest:

    8640d00237f117f233719d30047ef876e40e7894fae1ef6ed49fc7f3404b9f31

All 14 retained SDK build artifacts reproduce byte for byte and match the published SDK package. This covers every JavaScript file in that package. The npm package also contains one extra declaration, dist/merkle-tree.node.d.ts, plus package metadata and README; these are integrity-pinned package inputs without a source-rebuild claim. The UI builds with the actual registry-installed package, and all 65 output files reproduce exactly to the expected CID. See [release correspondence](docs/release-correspondence.md) for the complete import/build contract.

The [publication-cleanup record](docs/publication-cleanup.md) records the five removed files without changing the frozen digest, application source, build or CID. Rebuilds remove these exact files before compiling, and the release report includes the pinned revision.

The current registry-SDK baseline deliberately supersedes the initial local-SDK release. Its compact provenance is in [release-history.md](docs/release-history.md); the unused previous-verifier archive is not needed by consumers.

This is a conditional source-linked pilot plus conditional dataflow/protocol proofs, finite model checks and implementation tests. Translators, mappings, primitive contracts, compilers and normal runtime semantics remain trusted. It is not an end-to-end UI, SDK, Vue/browser, cryptographic-circuit or whole-deployed-UI semantic proof. A_CONFIRMATION_REPORTING applies specifically to confirmation's chain meaning. [The assumptions](docs/assumptions.md) and [remaining work](docs/next-steps.md) are part of the result. Hashes are integrity anchors, not authenticated publisher signatures.

## Repository footprint

Only the current verifier is distributed. The unused previous-verifier archive and vendored library copies were removed. All external library code is installed through integrity-locked npm packages; two small original package.json files preserve the exact workspace metadata used by the SDK rebuild. The original relative dependency layout and content-digest checks remain required.

The large retained input is about 49 MiB of exact compressed proving/history/relayer assets. These are not npm dependencies, and recompression can change the CID. Keeping them avoids depending on an IPFS gateway during setup; gateway probes were rate-limited during cleanup. Everything verifies offline after the pinned tool/dependency installation. See [repository-cleanup.md](docs/repository-cleanup.md).

## Evidence layout

- baseline/: frozen source, exact offline asset inputs and immutable target/output-hash manifest.
- verification-profile.json: selected target, expected CID, option A and claim/evidence register.
- docs/: reports, claims, assumptions and decisions.
- pilot/, model/, continuation/: source-linked extraction, symbolic checks, lifecycle model, captured-source harnesses and mutants.
- scripts/: setup, consumer runner, integrity checks, replay and summaries.
- release/: rebuild/CID checks, locked SDK build tools, runtime layout, two original package-metadata files and release records.
- artifacts/, reports/: regenerated, Git-ignored IR, SMT-LIB, synthetic corpus, verdicts and traces.
