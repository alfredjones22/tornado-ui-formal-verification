if not __debug__:
    raise RuntimeError("Verification requires Python assertions enabled; unset PYTHONOPTIMIZE.")
"""Finite lifecycle abstraction of ONE immutable basic-withdrawal quote.

Authored model, NOT extracted Vue/SDK code. Explicit-state exploration reaches a
fixpoint (no depth cutoff). External bundler claims and real inclusion are
independent. 'exposed' means at least one signed candidate left the client;
it deliberately cannot be undone. See docs/model.md for the correspondence gap.
"""
from dataclasses import dataclass, replace, asdict
from pathlib import Path
from collections import deque
import json

ROOT = Path(__file__).resolve().parents[1]
@dataclass(frozen=True)
class State:
    phase: str = 'draft'
    exposed: bool = False
    host_checked: bool = False
    started: bool = False
    sends: int = 0
    known_hash: bool = False
    included: bool = False

# Each item is a labelled edge in Next. Unlisted user actions have no effect.
def successors(s, mutant=None):
    out = []
    def edge(label, **changes): out.append((label, replace(s, **changes)))
    if s.phase == 'draft': edge('user starts preparation', phase='preparing')
    if s.phase == 'preparing':
        edge('SDK releases signed estimation candidate', exposed=True)
        edge('SDK returns candidate; host validator accepts', phase='review', exposed=True, host_checked=True)
        edge('SDK candidate rejected by host', phase='blocked', exposed=True)
        edge('frame errors or inactivity timeout; frame disposed', phase='aborted')
    if s.phase in ('aborted', 'blocked'):
        edge('late frame message ignored')
        if mutant == 'accept-late': edge('MUTANT accepts late frame message', phase='review', host_checked=True, exposed=True)
    if s.phase == 'review':
        edge('user confirms reviewed quote', phase='validating', started=True)
        if mutant == 'skip-validation': edge('MUTANT sends unchecked operation', phase='sending', sends=1, host_checked=False, started=True)
    if s.phase == 'validating':
        edge('quote expires or preflight validation fails', phase='blocked')
        edge('local checks and connections pass; invoke send once', phase='sending', sends=s.sends+1)
    if s.phase == 'sending':
        edge('send returns a hash', phase='pending', known_hash=True)
        edge('send rejects or response is lost', phase='unknown')
    if s.phase in ('pending', 'unknown'):
        edge('bundler pending response')
        edge('receipt error or polling timeout', phase='unknown')
        if s.known_hash: edge('bundler claims successful receipt', phase='confirmed')
        if mutant == 'retry' and s.sends < 2: edge('MUTANT automatically resends', phase='sending', sends=s.sends+1)
    if s.exposed:
        edge('some holder includes released candidate on chain', included=True)
    if mutant == 'forget-hash' and s.known_hash and s.phase == 'unknown':
        edge('MUTANT forgets known hash', known_hash=False)
    return out

STATE_PROPERTIES = {
    'L01_one_explicit_send_per_quote': lambda s: s.sends <= 1,
    'L02_send_requires_review_and_validation': lambda s: s.sends == 0 or (s.started and s.host_checked and s.exposed),
    'L03_confirmation_requires_known_submission': lambda s: s.phase != 'confirmed' or (s.known_hash and s.sends == 1),
}
EDGE_PROPERTIES = {
    'L04_no_automatic_resubmission': lambda a, label, b: a.sends == 0 or a.sends == b.sends,
    'L05_disposed_frame_cannot_restore_review': lambda a, label, b: a.phase not in ('aborted', 'blocked') or b.phase == a.phase,
    'L06_known_hash_is_retained': lambda a, label, b: not a.known_hash or b.known_hash,
    'L07_release_is_irreversible': lambda a, label, b: not a.exposed or b.exposed,
}
STRONG_PROPERTIES = {
    'G01_confirmation_implies_actual_inclusion': lambda s: s.phase != 'confirmed' or s.included,
    'G02_no_inclusion_before_final_confirm': lambda s: s.started or not s.included,
    'G03_aborting_preparation_prevents_execution': lambda s: s.phase != 'aborted' or not s.included,
}

def explore(mutant=None):
    start = State(); queue = deque([start]); parents = {start: None}; violations = {}; strong = {}; edges = 0
    def trace(state, last=None):
        result = []
        while parents[state] is not None:
            previous, label = parents[state]
            result.append(dict(event=label, state=asdict(state))); state = previous
        result.append(dict(event='initial state', state=asdict(state))); result.reverse()
        if last: result.append(dict(event=last[0], state=asdict(last[1])))
        return result
    while queue:
        a = queue.popleft()
        for name, prop in STATE_PROPERTIES.items():
            if not prop(a): violations.setdefault(name, trace(a))
        for name, prop in STRONG_PROPERTIES.items():
            if not prop(a): strong.setdefault(name, trace(a))
        for label, b in successors(a, mutant):
            edges += 1
            for name, prop in EDGE_PROPERTIES.items():
                if not prop(a, label, b): violations.setdefault(name, trace(a, (label, b)))
            if b not in parents: parents[b] = (a, label); queue.append(b)
    positive = next((s for s in parents if s.phase == 'confirmed' and s.included), None)
    return dict(states=len(parents), edges=edges, traversal='breadth-first to reachable-state fixpoint; no depth bound',
        properties=[dict(id=name, result='FAIL' if name in violations else 'PASS') for name in STATE_PROPERTIES | EDGE_PROPERTIES],
        violations=violations, strongerClaimCounterexamples=strong,
        usefulCompletionTrace=trace(positive) if positive else None)

if __name__ == '__main__':
    report = explore()
    assert not report['violations']
    assert report['usefulCompletionTrace']
    assert set(report['strongerClaimCounterexamples']) == set(STRONG_PROPERTIES)
    mutants = {}
    for name, expected in {'retry': 'L01_one_explicit_send_per_quote', 'forget-hash': 'L06_known_hash_is_retained',
            'accept-late': 'L05_disposed_frame_cannot_restore_review', 'skip-validation': 'L02_send_requires_review_and_validation'}.items():
        bad = explore(name)
        assert expected in bad['violations'], f'Mutation {name} was not detected'
        mutants[name] = dict(expectedViolation=expected, trace=bad['violations'][expected])
    report['mutationChecks'] = mutants
    (ROOT / 'reports/lifecycle.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'Lifecycle model: {report["states"]} states, {report["edges"]} edges; 7 properties PASS; 3 expected stronger-claim counterexamples; 4 mutants detected')
