# Status after v1

The first scoped verification version is complete. The [final report](release-verification-v1.md) and [continuation report](continuation-1-2.md) define its result. The release remains frozen; this file does not authorize changes or publication.

## Completed continuation

1. **Selected note and pre-review authority:** traced the captured SDK, identified estimation as the first executable-authority release, defined each candidate's binding and fee envelope, and added checked source mappings, conditional proofs and runtime scenarios. Primitive/correspondence premises remain explicit.
2. **UI-to-adapter ownership and scheduling:** inventoried actual caller writes and controls, checked/lowered its guard skeleton, proved a conditional inductive protocol invariant and ran actual Vue schedules. This is not a full Vue/browser refinement proof.
3. **Confirmation decision:** the user selected **A** for the current release. The claim is bundler-reported success; actual chain-outcome interpretation requires A_CONFIRMATION_REPORTING. B/C are optional future product work, not requirements to close v1.

## Future assurance work, separate from v1 completion

**Source, build and published CID correspondence is also complete:** the user subsequently requested this extension. The consumer runner now rebuilds all 14 SDK artifacts and all 65 UI files byte for byte, then recomputes the expected CID. See [release-correspondence.md](release-correspondence.md). Gateway delivery and compiler correctness remain separate assumptions, not unfinished rebuild checks.

**Independent review of trusted semantics:** review the narrow extractor, source-specific mappings, symbolic interpreter, model and assumed primitives. A proof of translator soundness or independently checked certificates would strengthen the result. Adding more custom JavaScript semantics is not automatically worthwhile.

**Expansion only with a new scope:** consider deposit backup/batch safety, smart-account note/call binding, recovery, history authenticity/completeness and secret-flow properties. Preserve separate labels for implementation proofs, model results, tests and assumptions. Full anonymity, arbitrary custom-contract semantics and whole-browser verification are separate efforts.

The current registry release pins UI source and README in its immutable baseline, with exactly five later non-runtime publication removals recorded in release/ui-source-revision.json. The previous baseline digest and CID remain recorded as provenance. The publisher reported a matching independently uploaded CID, recorded in release/deployment.json; see [the release update](release-upgrade-alpha37.md).
