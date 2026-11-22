# Basic withdrawal lifecycle model

`model/lifecycle.py` is the executable transition relation and checker. It uses an ordinary dataclass state, explicit labelled successor transitions, breadth-first search, and invariant predicates. The entire reachable finite graph is explored to a fixpoint; no maximum-step cutoff is used. This transparent checker was chosen for this small pilot so the run requires Python and Z3 rather than Java/Apalache installation. Porting the lifecycle to Quint/TLA+ remains possible; the current result must not be described as an Apalache result.

## Scope and state

One basic-route quote in one page lifetime. Phases cover draft, preparation, displayed review, submission checks, send, pending, unknown, confirmed, blocked, and terminated preparation. Flags record exposure of the final signed operation, host review validation, explicit Submit, an application send, retention of the locally computed hash, matching chain-RPC evidence, and actual inclusion.

Gas estimation sends non-executable dummy proofs/signatures and verifier state overrides. In this model `exposed` begins only when the final signed operation is sent after explicit Submit; it is monotonic. The model assumes the SDK's dummy payload is non-executable, a premise checked by source facts and concrete tests but not proved against contracts or the EVM. Multiple quotes, other tabs, reloads, reorgs, deposit flows and the separate smart-account route are omitted.

External actual inclusion and a host-RPC response containing a successful transaction receipt plus matching EntryPoint UserOperationEvent and pool Withdrawal event are independent transitions. The basic route uses a bundler response only to locate a transaction, then checks the receipt and both events through its selected chain RPC. A dishonest RPC can still fabricate that evidence; there is no authenticated consensus or finality proof. Inclusion can occur after an uncertain Submit even if the application reports an error. The smart-account route's simulation RPC can independently relay an operation after Submit; that route is outside this model.

## Checked properties

- L01: no more than one explicit application send for this quote.
- L02: a send requires the model's review/host-validation/caller-started conditions.
- L03: the model can report confirmation only after a retained submitted hash and matching chain-RPC evidence.
- L04: once a send was invoked, no transition automatically increments the send count.
- L05: a terminated/rejected frame cannot restore review.
- L06: known submission-hash information is not forgotten.
- L07: exposure of signed authority cannot be undone locally.
- L08: exposure requires explicit Submit and an application send.
- L09: terminated preparation cannot expose the final operation or cause its inclusion.

The checker reaches **15 states and 35 edges**, counting self-loop edges. All nine properties hold in this model. There is a reachable successful completion with actual inclusion, so the model is not safe merely because completion is forbidden.

## Counterexamples that must remain visible

`reports/lifecycle.json` contains the shortest breadth-first witness trace for G01: `confirmed` implies actual inclusion. It is false if the selected chain RPC fabricates a successful receipt and both matching events. Dummy estimation is modeled as non-executable, and L08/L09 assert the corresponding restricted properties within this model.

These are expected failures of stronger claims, and the verification command checks that the counterexamples still exist. Four deliberately faulty models are also checked: automatic resend, forgetting a known hash, accepting late frame messages, and sending without host validation. Each must violate the intended property.

## Source correspondence

Frame lifecycle and preparation correspond to `baseline/ui/src/core/withdrawals.ts` and `baseline/ui/src/sdk-frame.ts`. Caller guarding is source-checked in `baseline/ui/src/App.vue`. Hash retention, submission, independent chain-RPC receipt retrieval and matching event checks correspond to `submitWithdrawal` and `reconcileBasicWithdrawal` in the captured `withdrawals.ts`. Dummy estimation and final signing are checked against the captured SDK's `paymasterWithdrawThunk`, `withdrawalsProofThunk`, `estimate`, and `simulation` modules.

These links and concrete tests support correspondence, but do not constitute a formal refinement proof. L01 relies on the caller contract, L02 abstracts mutation across an await, and L09 relies on the SDK dummy-operation premise. The standalone adapter does not enforce the caller assumptions. The finite model's exhaustive result cannot be promoted to an exhaustive JavaScript/Vue, EVM, or chain result.
