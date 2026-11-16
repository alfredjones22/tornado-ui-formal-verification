# Basic withdrawal lifecycle model

`model/lifecycle.py` is the executable transition relation and checker. It uses an ordinary dataclass state, explicit labelled successor transitions, breadth-first search, and invariant predicates. The entire reachable finite graph is explored to a fixpoint; no maximum-step cutoff is used. This transparent checker was chosen for this small pilot so the run requires Python and Z3 rather than Java/Apalache installation. Porting the lifecycle to Quint/TLA+ remains possible; the current result must not be described as an Apalache result.

## Scope and state

One quote in one page lifetime. Phases cover draft, preparation, displayed review, submission checks, send, pending, unknown, confirmed, blocked, and terminated preparation. Flags record whether any signed candidate has been released, host review validation occurred, the caller started submission, a send was invoked, a hash is known, and actual inclusion occurred.

The release may create several estimation candidates; `exposed` abstracts zero versus one-or-more externally released candidates. It is monotonic. Their bytes, fees, individual hashes, and nonce competition are omitted, so no claim about all candidate contents or multiplicity follows from the model. Multiple quotes, other tabs, reloads, reorgs, deposit flows and smart-account flows are omitted.

External actual inclusion and bundler success are independent transitions. Inclusion can occur after authority release even if the user's final confirmation has not occurred, or the preparation frame has terminated. A bundler can claim success without actual inclusion. This avoids assuming away the most important environmental behaviours.

## Checked properties

- L01: no more than one explicit application send for this quote.
- L02: a send requires the model's review/host-validation/caller-started conditions.
- L03: the model can report confirmation only after a known submitted hash.
- L04: once a send was invoked, no transition automatically increments the send count.
- L05: a terminated/rejected frame cannot restore review.
- L06: known submission-hash information is not forgotten.
- L07: exposure of signed authority cannot be undone locally.

The checker reaches **25 states and 68 edges**, counting self-loop edges. All seven properties hold in this model. There is a reachable successful completion with actual inclusion, so the model is not safe merely because completion is forbidden.

## Counterexamples that must remain visible

`reports/lifecycle.json` contains shortest breadth-first witness traces for:

- G01: `confirmed` implies actual inclusion. False: a fabricated successful bundler receipt suffices.
- G02: no actual inclusion before the final confirm action. False: an estimator/other holder may include a released signed candidate.
- G03: terminating preparation prevents later execution. False: externally held signed authority persists.

These are expected failures of stronger claims, and the verification command checks that the counterexamples still exist. Four deliberately faulty models are also checked: automatic resend, forgetting a known hash, accepting late frame messages, and sending without host validation. Each must violate the intended property.

## Source correspondence

Frame lifecycle corresponds to `baseline/ui/src/core/withdrawals.ts:42–80`. Preparation returns through the host validator at `84–91`. Caller guarding corresponds to `baseline/ui/src/App.vue:147–152,260–268`. Submission, errors, receipt handling and retention correspond to `withdrawals.ts:94–125`. Signed preparation/estimation corresponds to `baseline/ui/src/sdk-frame.ts:105–112` and the captured SDK's builder/estimator path.

These links and concrete tests support correspondence, but do not constitute a formal refinement proof. In particular, L01 relies on the caller contract, and L02 abstracts mutation across an await. The standalone adapter does not enforce those assumptions. The finite model's exhaustive result cannot be promoted to an exhaustive JavaScript/Vue result.
