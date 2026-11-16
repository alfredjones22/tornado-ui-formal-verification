# Milestone 1 report — 16 November 2026

The subsequent [continuation report](continuation-1-2.md) and [v1 release report](release-verification-v1.md) complete the first version with option A. This document preserves the initial pilot findings; the continuation narrows some of its originally open SDK/caller premises.

## Result

The first milestone is complete as a deliberately narrow verification pilot: one frozen direct-withdrawal flow, eight defined safety claims, an executable lifecycle model, a source-linked conditional SMT proof, concrete correspondence checks, and an explicit account of stronger claims that remain open or fail.

The release UI and SDK were not edited. All verification files and local tool installations are in `tornado-ui-formal-verify`. No wallet connection, real note, proof generation, external RPC call, broadcast, funded transaction or UI deployment was required.

## Release target

The target is the captured local working tree, not merely its Git HEAD. The initial capture recorded the UI commit, dirty status, clean SDK repository commit, file inventory, sizes and SHA-256 values; [release-history.md](release-history.md) preserves the earlier target identity. It includes 371 files / 61,085,810 bytes. Runtime source/artifact content is captured independently of the package version string. Environment files are omitted and their names recorded.

The target digest is `afc59995802a90139224447a88b234fa19eeb3d186a0bd2d2524cca4ca41570b`.

At the original pilot stage, the public CID was recorded without source/build/CID equivalence. The later [release-correspondence stage](release-correspondence.md) now reproduces all SDK/UI artifact bytes and the exact supplied CID. The original target identity remains recorded in release-history.md; its superseded verifier archive is not an active input. The active baseline is now the registry release, with the same withdrawal implementation and rerun evidence; see [the release update](release-upgrade-alpha37.md).

## Evidence obtained

1. **Conditional implementation proof.** Twelve rejection guards and the return computation in the release's `validateWithdrawal` are extracted from its TypeScript AST. Eight postcondition-negation queries are UNSAT under the declared abstraction. They establish C01–C05's local acceptance and arithmetic properties. The accepted path is SAT.
2. **Sensitivity to bugs.** Eight deliberately altered source functions each yield a SAT counterexample to the relevant obligation. Unknown source syntax fails extraction. These are validation checks for the proof tooling, not additional theorems about the UI.
3. **Concrete/symbolic correspondence testing.** 448 complete symbolic assignments are built from concrete fixtures and actual viem ABI decoding. Symbolic acceptance agrees with executing the captured TypeScript in all cases, including 80 accepted cases. No out-of-domain case is counted as a successful rejection match.
4. **Lifecycle model checking.** Breadth-first exploration reaches a fixpoint with 25 states and 68 edges. Seven model properties pass, a useful completed path exists, three stronger claims have explicit counterexamples, and four faulty model variants are detected.
5. **Implementation tests.** Sixteen tests pass against functions compiled directly from captured source. They cover valid/rejected payloads, timeout/receipt uncertainty, no retry within an invocation, frame disposal/late messages, and deliberate demonstrations of the remaining adapter boundaries. The basic validator matrix includes 144 valid and 104 altered input executions in addition to the differential corpus.
6. **Replay and integrity.** The frozen file set and hashes are checked. All eight saved SMT-LIB obligations replay as UNSAT; the selected-note boundary query replays as SAT. Tool versions and verification-source hashes are in `reports/summary.json`.

## Findings that constrain the claims

### Confirmation trusts the bundler

The frozen basic reconciler accepts `success: true` and a transaction hash from the bundler. A concrete fake response produces `confirmed` without a chain-receipt lookup. Independent on-chain confirmation is therefore refuted for this route under an adversarial bundler. An honest-bundler assumption permits a weaker claim. There is no finality proof.

### Supplied proof fields agreeing is weaker than selected-note binding

The host validator does not derive the selected note's nullifier. A changed same-pool note can be supplied alongside unchanged mutually consistent proof fields and still pass this validator. This is a boundary gap: the SDK's note-to-proof construction must be trusted or verified. It is not evidence that an ordinary user can spend another person's note or that the ZK circuit is unsound.

### Signing/estimation is an earlier authority boundary

Signed candidates can leave during preparation, before the final submit click and before this host validator accepts the completed quote. Terminating the frame cannot revoke those candidates. The current proof says what the final host validator accepts, not that every earlier candidate satisfies user intent.

### Single use and immutable ownership are caller obligations

Two direct invocations of the submission adapter cause two sends. Mutating calldata during its connection-validation await allows that mutation to reach the mocked send. The normal UI caller has guards and disabled controls, but their complete ownership/scheduling contract is not proved. These demonstrations are at the adapter boundary; a normal-user exploit path has not been established.

None of these observations establishes a critical funds-loss exploit requiring an automatic release change. They do block particular stronger claims. The release remains frozen, with those claims narrowed or open.

## Practical cost and maintenance conclusion

The local validator is tractable because it is synchronous, short, mostly guard logic, and uses explicit bigint arithmetic. It can be analysed without rewriting the release or modelling Vue. The source-to-formula bridge, native/ABI contracts, async ownership and earlier SDK authority release are the expensive assurance obligations.

The present custom translator is intentionally narrow and fails on unsupported syntax. That is useful for a pilot, but scaling it into a general JavaScript verifier would introduce substantial trusted semantics. The next milestone should reduce the SDK/UI correspondence assumptions before expanding the number of locally proved checks. A third party can audit the saved source, translation, formulas, assumptions and counterexamples; they cannot honestly describe this result as a proof of the complete deployed UI.

## Re-run

From the verification directory, with dependencies installed and Node >=22.18.0:

```sh
npm run verify
```

Use `docs/claims.md` for exact claim scopes, `docs/assumptions.md` for the trusted base, `docs/model.md` for model boundaries and traces, and `docs/next-steps.md` for the proposed continuation.

## Method references

- [Z3 programming guide](https://microsoft.github.io/z3guide/programming/Z3%20Python/Introduction/) — satisfiability and UNSAT-based verification.
- [Programming Z3](https://z3prover.github.io/papers/programmingz3.html) — solver interfaces and logical reasoning background.
- [Apalache verification modes](https://apalache-mc.org/docs/apalache/running.html) — the distinction between bounded checking and inductive invariants, relevant to a possible future model port. Apalache was not run for this milestone.
- [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) — the parser/transpiler interface used by this source-linked pilot. Parsing/transpilation is not itself a correctness proof.
