# Status and possible next pass

The [current report](release-verification-v1.md) and [continuation report](continuation-1-2.md) define the existing-method verification scope for the published alpha.38 UI release. This file proposes possible assurance work; it does not expand the current verdict.

## Completed continuation

1. **Selected note and exposure boundary:** the host validator checks that the supplied proof nullifier equals the selected note's locally derived identity, conditionally on that derivation. SDK gas estimates use non-executable dummy payloads; the final signed operation first leaves on explicit Submit. Source mappings, conditional proofs and runtime scenarios retain their primitive/correspondence premises.
2. **UI-to-adapter ownership and scheduling:** inventoried actual caller writes and controls, checked/lowered its guard skeleton, proved a conditional inductive protocol invariant and ran actual Vue schedules. This is not a full Vue/browser refinement proof.
3. **Confirmation evidence:** the basic route treats the bundler response as a transaction locator, then requires a successful host-RPC receipt with matching EntryPoint and pool events. `A_CHAIN_RPC_REPORTING` is still needed to interpret that unauthenticated RPC data as actual chain inclusion. Finality and consensus-authenticated receipt proofs remain outside scope.

## Future assurance work, separate from v1 completion

**Source, build and published CID correspondence:** the consumer runner rebuilds all 14 SDK artifacts and all 65 UI files byte for byte, then recomputes the expected CID. See [release-correspondence.md](release-correspondence.md). Gateway delivery and compiler correctness remain separate assumptions.

**Kernel-checked Lean proofs:** a useful next step is to translate the source-extracted validator IR into Lean and prove that any successful return has the direct recipient, zero execution calls, positive exact proceeds and selected-note nullifier equality. Require source-digest binding, no `sorry` and explicit trusted primitive contracts. A second Lean target could prove that no replacement signing occurs while an exposed operation's outcome is uncertain, with source-shape and Vue scheduling checks for the implementation link. A hand-written model without that link would add little release assurance. No Lean theorem is part of the current verdict.

**Independent review of trusted semantics:** review the narrow extractor, source-specific mappings, symbolic interpreter, model and assumed primitives. A proof of translator soundness or independently checked certificates would strengthen the result. Adding more custom JavaScript semantics is not automatically worthwhile.

**Expansion only with a new scope:** consider deposit backup/batch safety, smart-account note/call binding, recovery, history authenticity/completeness and secret-flow properties. Preserve separate labels for implementation proofs, model results, tests and assumptions. Full anonymity, arbitrary custom-contract semantics and whole-browser verification are separate efforts.

The release pins all 129 UI source files, including README, with no source exceptions. The publisher-reported CID is recorded in [the deployment record](../release/deployment.json).
