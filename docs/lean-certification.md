# Lean certification of selected validator properties

The verifier generates Lean 4 definitions from the frozen `validateWithdrawal` source and checks six authored theorems against those definitions: five selected postconditions and one nonvacuity witness. This adds independently checked proof terms for a narrow part of the basic single-note withdrawal validator. The overall verdict remains **PASS_WITH_ASSUMPTIONS**: the theorem statements describe an abstraction of successful TypeScript execution, not the entire UI or an Ethereum execution.

## Source-to-certificate path

1. The baseline manifest pins `baseline/ui/src/core/withdrawals.ts`. The TypeScript extractor rejects unsupported statements and emits `artifacts/validator-ir.json` with source and function hashes.
2. The Lean generator reads that IR. It lowers four selected top-level rejection guards, the `fee` and `net` bindings, and the final `{ fee, net }` return into typed definitions inserted into the tracked proof template `lean/ValidatorProof.lean`. The other guards can further restrict successful return; they do not weaken the selected postconditions. Unexpected relevant source shapes fail rather than receiving a default interpretation.
3. The verifier generates `artifacts/ValidatorRelease.lean` from those definitions and the authored theorem proofs, then checks it with pinned `leanprover/lean4:v4.29.1`. The theorems contain no `sorry` or new axioms. `reports/lean.json` records the source binding and checked theorem names; `reports/lean-mutants.json` records sensitivity to changed source guards or return expressions. These files are generated on each run and are not precomputed release evidence.

The required theorems are:

- `ValidatorRelease.recipient_matches`: the proof's recipient equals the recipient passed to the validator.
- `ValidatorRelease.no_execution`: UserOperation calldata is `0x`, call gas is zero, and nonce is zero.
- `ValidatorRelease.fee_proceeds`: the fee is positive and below the note amount; returned net equals amount minus fee and lies strictly between zero and the note amount.
- `ValidatorRelease.returned_fee_matches_proof`: the returned fee equals the proof's fee input.
- `ValidatorRelease.selected_nullifier`: the proof nullifier equals the modeled output of `noteIdentity(note)` for the selected note.
- `ValidatorRelease.selected_path_inhabited`: there exists an abstract input satisfying the four selected guards. This witnesses the selected predicate's satisfiability; it does not witness all thirteen validator guards or a real withdrawal.

These strengthen [C01](claims.md#c01), [C03](claims.md#c03), and the selected-nullifier part of [C04](claims.md#c04). They do not certify C04's separate decoded sponsor tuple, C02's configuration relationships, C05's estimation status, or the asynchronous C06–C08 behavior; those retain their stated evidence kinds.

## What the kernel does and does not check

Lean checks proof terms for the generated propositions. It does not establish that TypeScript, JavaScript, or the browser implements the generated Lean model. The TypeScript parser, source extractor, Lean generator, source-to-field mapping, and normal runtime semantics remain trusted. Address and BigInt conversion assumptions, `noteIdentity` and its Pedersen derivation, ABI decoding, SDK proof/signature construction, contract behavior, chain data, and compiler correctness remain outside these theorems. The nullifier theorem establishes equality with an **opaque derived value**; it does not prove that the note exists, belongs to the user, or is unspent.

The existing Z3 obligations, concrete differential corpus, source mutations, finite lifecycle model, implementation tests, byte-identical SDK/UI rebuild, and CID check remain required. A Lean kernel certificate narrows trust in the proof search for these six abstract propositions; it does not turn the whole application into a proved program. See [assumptions](assumptions.md), [the release report](release-verification-v1.md), and [next steps](next-steps.md).
