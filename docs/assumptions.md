# Assumptions and trusted base

This document describes milestone 1. [Continuation #1/#2](continuation-1-2.md) reduces the SDK/caller assumptions to named paths, checked mappings and retained premises; it does not alter the original local-validator theorem.

## What the pilot proves

The pilot reads the captured TypeScript declaration, parses it with TypeScript 5.9.3, translates every statement in `validateWithdrawal` into a small intermediate representation, symbolically executes that representation, and asks Z3 whether successful return and a violated postcondition can coexist. Eight such queries are UNSAT. An accepted execution is SAT, ruling out an always-rejecting/vacuous result.

This is a **conditional source-linked implementation proof**. It is not a verified JavaScript engine, a proof of the translator, or a proof of the complete application. The author-written extraction and symbolic semantics are part of the trusted base. The 448-case differential corpus and eight source mutations give useful finite validation evidence for that base; they do not prove its soundness.

## Symbolic input domain

- Plain stable data objects, with no getters, setters, proxies, prototype tampering, hostile callbacks, monkey-patched intrinsics, or concurrent mutation during synchronous validation.
- Addresses are valid 20-byte hexadecimal strings. The symbolic representation is their numeric value; `toLowerCase` equality is represented by equality of that value. This relies on the canonical case-insensitive address interpretation for valid strings.
- Quantities represent parseable, nonnegative hexadecimal integers below 2^256. Amounts and optional withdrawn values are bigint integers in that range. BigInt conversions are exact. The proof does not cover arbitrary JavaScript types or values outside these domains.
- The selected chain is 1 or 11155111. Authorization chain metadata is between 0 and 2^53−1, so `Number(BigInt(chainId))` is exact. Broadening this range needs a justified Number-conversion model.
- Token addresses, paymaster, EIP-7702 authorization, estimation metadata and `withdrawnValue` have explicitly modelled presence flags. Token presence means a nonempty address string, even for the zero-address spelling; Boolean conversion is not confused with numeric address value zero.
- Relevant metadata strings and supplied proof fields are symbolic. Optional estimation reason absence is represented by a non-allowlisted string; this preserves the successful-return policy but does not model every JavaScript value.
- A successful viem ABI decode returns the stated typed sponsor tuple. Decode failure has no successful return and is outside the symbolic success-path claim. The symbolic tuple is independent of raw bytes, an over-approximation for the local field-agreement obligations. Raw-bytes-to-tuple faithfulness is trusted and separately exercised with the real decoder.
- The configuration mapping is trusted. Symbolic configuration addresses are arbitrary valid addresses shared consistently by checks and postconditions. The concrete corpus loads actual constants from the captured SDK config. Neither establishes deployment authenticity.

## Supported source semantics

The extractor permits const bindings, a single-element destructuring binding for the decoded tuple, straight-line `if (...) throw new Error(...)` guards, and one final object return. Expression support is restricted to the literals, property/index reads, boolean guards with short-circuit exception conditions, strict comparisons, integer comparisons/arithmetic, membership in a fixed literal array, address lowercasing, and the named conversion/ABI primitives used by the release.

Unknown statements, calls, operators, fields, operand types, schemas, or return shapes fail the run. There is no permissive fallback that treats unknown code as safe. This deliberately prevents claiming support for async code, loops, general objects, arbitrary coercions, or general TypeScript.

The proof only reasons about successful return. Source throws and primitive/access exceptions remove an execution from the accepted path. Ordinary string and numeric domains are unbounded symbolically except for the explicitly declared numeric input ranges. It is not a small random enumeration of amounts.

## Outside the local validator

The lifecycle model assumes one immutable reviewed quote and a caller that prevents concurrent/repeated submission for that quote. Those assumptions correspond to intended `App.vue` guards, but Vue-to-model refinement has not been proved. The concrete test showing mutation across the adapter's await is an explicit boundary limitation, not a demonstration that ordinary UI controls permit it.

SDK selection of notes, nullifier derivation, proof construction, EIP-7702 authorization, signatures, gas ceilings and signed-candidate release remain outside the implementation proof. The host validator can tolerate arbitrary field values within its schema for the proved postconditions; it cannot contain malicious JavaScript executing with the site's privileges. The hidden same-origin iframe is a lifecycle mechanism, not a security sandbox against hostile dependencies.

The browser, JavaScript intrinsics, TypeScript parser/transpiler, pinned viem decoder used by concrete checks, Python, the custom translators/checkers, Z3 and native runtime are trusted. The SMT results are solver-backed, not proof-assistant kernel certificates. Queries are saved so the formulas can be audited and rerun.

**A_CONFIRMATION_REPORTING (selected option A):** interpreting the basic reconciler's `confirmed` label as an actual successful withdrawal assumes a well-formed, truthful bundler receipt associated with the intended operation, transaction and chain. This is a narrow confirmation assumption, not blanket honesty for every bundler input. The reconciler uses truthiness rather than a strict boolean schema and performs no independent chain-receipt matching. There is no finality claim. Contract/asset and cryptographic assumptions remain separate. Self-reported chain IDs or file checksums do not authenticate chain outcomes.

No privacy/noninterference theorem, human comprehension theorem, circuit proof, contract audit, live funded validation, compiler correctness proof, or gateway delivery proof is claimed here.

## Rebuild and content-address correspondence

The later [exact SDK/UI rebuild and CID match](release-correspondence.md) connects the captured source to the locally computed expected release content address, using pinned supplemental build inputs. This is byte-identity evidence under compiler/toolchain and hash assumptions, not a proof of compiler correctness or gateway delivery. The previous capture is archived unchanged; the active registry-release capture and its exact package/runtime correspondence are described in [the release update](release-upgrade-alpha37.md). The matching independently uploaded CID is a recorded publisher report in release/deployment.json, not an authenticated external attestation; gateway delivery remains unchecked.
