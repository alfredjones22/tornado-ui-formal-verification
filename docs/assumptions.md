# Assumptions and trusted base

This document describes the current basic-route proof scope. [Continuation #1/#2](continuation-1-2.md) reduces the SDK/caller assumptions to named paths, checked mappings and retained premises. The current validator additionally checks that the supplied proof nullifier agrees with `noteIdentity(note)`.

## What the pilot proves

The pilot reads the captured TypeScript declaration, parses it with TypeScript 5.9.3, translates every statement in `validateWithdrawal` into a small intermediate representation, symbolically executes that representation, and asks Z3 whether successful return and a violated postcondition can coexist. Nine such queries are UNSAT. An accepted execution is SAT, ruling out an always-rejecting/vacuous result. A separate source-derived Lean representation of selected guards and the fee/net return yields five kernel-checked property theorems for parts of C01, C03 and C04, plus one selected-path nonvacuity theorem; see [Lean certification](lean-certification.md).

This is a **conditional source-linked implementation proof**. It is not a verified JavaScript engine, a proof of the translators, or a proof of the complete application. The author-written TypeScript extraction, Z3 semantics and Lean lowering are part of the trusted base. The 464-case differential corpus and source mutations give useful finite validation evidence for that base; they do not prove its soundness. Lean independently checks proof terms for the propositions it receives, not the TypeScript-to-Lean correspondence.

## Symbolic input domain

- Plain stable data objects, with no getters, setters, proxies, prototype tampering, hostile callbacks, monkey-patched intrinsics, or concurrent mutation during synchronous validation.
- Addresses are valid 20-byte hexadecimal strings. The symbolic representation is their numeric value; `toLowerCase` equality is represented by equality of that value. This relies on the canonical case-insensitive address interpretation for valid strings.
- Quantities represent parseable, nonnegative hexadecimal integers below 2^256. Amounts and optional withdrawn values are bigint integers in that range. BigInt conversions are exact. The proof does not cover arbitrary JavaScript types or values outside these domains.
- The selected chain is 1 or 11155111. Authorization chain metadata is between 0 and 2^53−1, so `Number(BigInt(chainId))` is exact. Broadening this range needs a justified Number-conversion model.
- Token addresses, paymaster, EIP-7702 authorization, estimation metadata and `withdrawnValue` have explicitly modelled presence flags. Token presence means a nonempty address string, even for the zero-address spelling; Boolean conversion is not confused with numeric address value zero.
- Relevant metadata strings and supplied proof fields are symbolic. The selected note's derived nullifier hash is a modeled value; its equality with the proof input is checked, but the Pedersen derivation and note parsing are trusted. Optional estimation reason absence is represented by a non-allowlisted string; this preserves the successful-return policy but does not model every JavaScript value.
- A successful viem ABI decode returns the stated typed sponsor tuple. Decode failure has no successful return and is outside the symbolic success-path claim. The symbolic tuple is independent of raw bytes, an over-approximation for the local field-agreement obligations. Raw-bytes-to-tuple faithfulness is trusted and separately exercised with the real decoder.
- The configuration mapping is trusted. Symbolic configuration addresses are arbitrary valid addresses shared consistently by checks and postconditions. The concrete corpus loads actual constants from the captured SDK config. Neither establishes deployment authenticity.

## Supported source semantics

The extractor permits const bindings, a single-element destructuring binding for the decoded tuple, straight-line `if (...) throw new Error(...)` guards, and one final object return. Expression support is restricted to the literals, property/index reads, boolean guards with short-circuit exception conditions, strict comparisons, integer comparisons/arithmetic, membership in a fixed literal array, address lowercasing, and the named conversion/ABI primitives used by the release.

Unknown statements, calls, operators, fields, operand types, schemas, or return shapes fail the run. There is no permissive fallback that treats unknown code as safe. This deliberately prevents claiming support for async code, loops, general objects, arbitrary coercions, or general TypeScript.

The proof only reasons about successful return. Source throws and primitive/access exceptions remove an execution from the accepted path. Ordinary string and numeric domains are unbounded symbolically except for the explicitly declared numeric input ranges. It is not a small random enumeration of amounts.

## Outside the local validator

The lifecycle model assumes one immutable reviewed quote and a caller that prevents concurrent/repeated submission for that quote. Those assumptions correspond to intended `App.vue` guards, but Vue-to-model refinement has not been proved. The concrete test showing mutation across the adapter's await is an explicit boundary limitation, not a demonstration that ordinary UI controls permit it.

SDK selection of notes, the correctness of `noteIdentity`'s cryptographic derivation, proof construction, EIP-7702 authorization, signatures and gas ceilings remain outside the implementation proof. Source facts and concrete tests check that alpha.40 estimation uses dummy proofs/signatures and that final signing occurs after estimation, but do not prove whole-SDK or on-chain non-executability. The host validator cannot contain malicious JavaScript executing with the site's privileges. The hidden same-origin iframe is a lifecycle mechanism, not a security sandbox against hostile dependencies.

The browser, JavaScript intrinsics, TypeScript parser/transpiler, pinned viem decoder used by concrete checks, Python, the custom translators/checkers, Z3 and native runtime are trusted. The SMT results remain solver-backed and are not themselves kernel certificates. Six separate Lean propositions are checked by the pinned Lean kernel, conditional on their generated model and the source bridge. Queries and generated Lean source are saved so their exact formulas can be audited and rerun.

**A_CHAIN_RPC_REPORTING (current basic route):** interpreting the basic reconciler's `confirmed` label as actual chain inclusion assumes the selected chain-read client truthfully reports a successful receipt and the exact EntryPoint and pool events on the intended chain. The bundler supplies only a transaction-hash locator; it cannot alone cause confirmation. The chain client may use a connected wallet provider or configured RPC fallback, and neither source is authenticated by a local consensus proof. There is no finality claim. Contract/asset and cryptographic assumptions remain separate.

No privacy/noninterference theorem, human comprehension theorem, circuit proof, contract audit, live funded validation, compiler correctness proof, or gateway delivery proof is claimed here.

## Rebuild and content-address correspondence

The [exact SDK/UI rebuild and CID match](release-correspondence.md) connects the captured source to the locally computed expected release content address, using pinned supplemental build inputs. This is byte-identity evidence under compiler/toolchain and hash assumptions, not a proof of compiler correctness or gateway delivery. The matching independently uploaded CID is a recorded publisher report in release/deployment.json, not an authenticated external attestation; gateway delivery remains unchecked.
