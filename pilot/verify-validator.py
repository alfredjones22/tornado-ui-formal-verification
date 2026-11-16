if not __debug__:
    raise RuntimeError("Verification requires Python assertions enabled; unset PYTHONOPTIMIZE.")
"""Conditional symbolic execution of the extracted release validator, using Z3.
This translator is in the trusted base; it is NOT a verified JS interpreter.
"""
from pathlib import Path
from dataclasses import dataclass, replace
import hashlib, json
import z3 as z
ROOT = Path(__file__).resolve().parents[1]
IR = json.loads((ROOT / 'artifacts/validator-ir.json').read_text())
assert hashlib.sha256((ROOT / 'baseline/ui/src/core/withdrawals.ts').read_bytes()).hexdigest() == IR['sourceHash']
T, F = z.BoolVal(True), z.BoolVal(False)
@dataclass
class V:
    kind: str
    term: object = None
    present: object = T

class Execution:
    def __init__(self, ir=IR):
        self.domains, self.symbols = [], {}
        self.cfg = self.obj(entryPointAddress=self.sym('cfg.entryPoint', 'addr'), paymasterAddress=self.sym('cfg.paymaster', 'addr'))
        self.sponsor = self.obj(instance=self.sym('sponsor.instance', 'addr'), proof=self.sym('sponsor.proof', 'str'),
            root=self.sym('sponsor.root', 'str'), nullifierHash=self.sym('sponsor.nullifier', 'str'),
            recipient=self.sym('sponsor.recipient', 'addr'), fee=self.sym('sponsor.fee', 'big'))
        self.env = {
            'TornadoPaymasterConfigs': V('config'),
            'recipient': self.sym('recipient', 'addr'),
            'note': self.obj(pool=self.obj(address=self.sym('note.pool.address', 'addr'), amount=self.sym('note.amount', 'big'),
                asset=self.obj(token=self.sym('note.token', 'addr', optional=True)))),
            'settings': self.obj(chainId=self.sym('settings.chainId', 'num'), bundlerUrl=self.sym('settings.bundlerUrl', 'str')),
            'withdrawal': self.obj(mode=self.sym('withdrawal.mode', 'str'), bundlerUrl=self.sym('withdrawal.bundlerUrl', 'str'),
                entryPointAddress=self.sym('withdrawal.entryPoint', 'addr'), poolAddress=self.sym('withdrawal.pool', 'big'),
                isERC20=self.sym('withdrawal.isERC20', 'bool'), withdrawnValue=self.sym('withdrawal.value', 'big', optional=True),
                proof=self.obj(proof=self.sym('proof.bytes', 'str'), args=V('array', [self.sym('proof.root', 'str'), self.sym('proof.nullifier', 'str'),
                    self.sym('proof.recipient', 'qty'), self.sym('proof.paymaster', 'qty'), self.sym('proof.fee', 'qty'), self.sym('proof.refund', 'qty')])),
                gasEstimation=self.obj(status=self.sym('estimation.status', 'str'), reason=self.sym('estimation.reason', 'str'), optional='estimation'),
                userOperation=self.obj(paymaster=self.sym('op.paymaster', 'addr', optional=True),
                    callData=self.sym('op.callData', 'str'), callGasLimit=self.sym('op.callGas', 'qty'), nonce=self.sym('op.nonce', 'qty'),
                    eip7702Auth=self.obj(chainId=self.sym('auth.chainId', 'qty'), optional='auth'),
                    paymasterData=self.sym('op.paymasterData', 'str', optional=True))) }
        chain = self.env['settings'].term['chainId'].term
        self.domains += [z.Or(chain == 1, chain == 11155111), self.symbols['auth.chainId'] <= 2**53 - 1]
        self.path, self.guards = [], []
        for stmt in ir['statements']:
            value, ok = self.eval(stmt.get('expr', stmt.get('rejectIf')))
            self.path.append(ok)
            if stmt['kind'] == 'const':
                if isinstance(stmt['name'], list):
                    assert value.kind == 'array' and len(value.term) == 1
                    self.env[stmt['name'][0]] = value.term[0]
                else: self.env[stmt['name']] = value
            elif stmt['kind'] == 'guard':
                guard = z.Not(self.truth(value))
                self.path.append(guard)
                self.guards.append(dict(line=stmt['line'], message=stmt['message'], predicate=str(guard)))
            elif stmt['kind'] == 'return': self.result = value
            else: raise RuntimeError('Unknown statement')
        self.accepted = z.And(*self.path)
    def sym(self, name, kind, optional=False):
        term = z.Bool(name) if kind == 'bool' else z.String(name) if kind == 'str' else z.Int(name)
        self.symbols[name] = term
        if kind in ('addr', 'qty', 'big'): self.domains += [term >= 0, term < 2**(160 if kind == 'addr' else 256)]
        present = z.Bool(name + '.present') if optional else T
        if optional: self.symbols[name + '.present'] = present
        return V(kind, term, present)
    def obj(self, optional=None, **fields):
        present = z.Bool(optional + '.present') if optional else T
        if optional: self.symbols[optional + '.present'] = present
        return V('obj', fields, present)
    def truth(self, v):
        if v.kind == 'undef': return F
        if v.kind == 'bool': return z.And(v.present, v.term)
        if v.kind == 'str': return z.And(v.present, z.Length(v.term) != 0)
        # addr and qty represent nonempty JS hex strings, including zero addresses/quantities.
        if v.kind in ('addr', 'qty', 'obj', 'array'): return v.present
        if v.kind in ('big', 'num'): return z.And(v.present, v.term != 0)
        raise RuntimeError(f'No truthiness semantics for {v.kind}')
    def eq(self, a, b):
        if a.kind == 'undef': return z.Not(b.present)
        if b.kind == 'undef': return z.Not(a.present)
        if a.kind != b.kind: raise RuntimeError(f'Unsupported strict equality {a.kind}/{b.kind}')
        return z.Or(z.And(z.Not(a.present), z.Not(b.present)), z.And(a.present, b.present, a.term == b.term))
    def eval(self, e):
        tag, *a = e
        if tag == 'var': return self.env[a[0]], T
        if tag == 'undefined': return V('undef', None, F), T
        if tag == 'string': return V('str', z.StringVal(a[0])), T
        if tag in ('number', 'bigint'): return V('num' if tag == 'number' else 'big', z.IntVal(a[0])), T
        if tag == 'boolean': return V('bool', z.BoolVal(a[0])), T
        if tag == 'get':
            parent, ok = self.eval(a[0]); field, optional = a[1:]
            if parent.kind != 'obj' or field not in parent.term: raise RuntimeError(f'Unknown field {field}')
            child = parent.term[field]
            return replace(child, present=z.And(parent.present, child.present)), z.And(ok, T if optional else parent.present)
        if tag == 'index':
            parent, ok = self.eval(a[0]); index, iok = self.eval(a[1])
            if parent.kind == 'config': return self.cfg, z.And(ok, iok)
            if parent.kind != 'array' or not z.is_int_value(index.term): raise RuntimeError('Unsupported index')
            return parent.term[index.term.as_long()], z.And(ok, iok, parent.present)
        if tag in ('array', 'object'):
            values = [self.eval(pair[1] if tag == 'object' else pair) for pair in a]
            data = dict((pair[0], value[0]) for pair, value in zip(a, values)) if tag == 'object' else [v[0] for v in values]
            return V('obj' if tag == 'object' else 'array', data), z.And(*[v[1] for v in values])
        if tag == 'not':
            v, ok = self.eval(a[0]); return V('bool', z.Not(self.truth(v))), ok
        if tag == 'binary':
            op, left, right = a; x, xok = self.eval(left); y, yok = self.eval(right)
            if op in ('&&', '||'):
                if x.kind != 'bool' or y.kind != 'bool': raise RuntimeError('Logical operands must be boolean in this subset')
                needed = self.truth(x) if op == '&&' else z.Not(self.truth(x))
                return V('bool', z.And(self.truth(x), self.truth(y)) if op == '&&' else z.Or(self.truth(x), self.truth(y))), z.And(xok, z.Implies(needed, yok))
            ok = z.And(xok, yok)
            if op in ('===', '!=='):
                eq = self.eq(x, y); return V('bool', eq if op == '===' else z.Not(eq)), ok
            if x.kind != y.kind or x.kind not in ('big', 'num'): raise RuntimeError('Unsupported numeric operands')
            ok = z.And(ok, x.present, y.present)
            if op in ('+', '-'): return V(x.kind, x.term + y.term if op == '+' else x.term - y.term), ok
            return V('bool', {'<': lambda: x.term < y.term, '>': lambda: x.term > y.term,
                '<=': lambda: x.term <= y.term, '>=': lambda: x.term >= y.term}[op]()), ok
        if tag == 'method':
            method, receiver, optional, *args = a; v, ok = self.eval(receiver)
            if method == 'toLowerCase':
                if v.kind != 'addr' or args: raise RuntimeError('Only canonical address lowercasing is modelled')
                return v, z.And(ok, T if optional else v.present)
            if method == 'includes':
                if v.kind != 'array' or optional or len(args) != 1: raise RuntimeError('Only fixed array membership is supported')
                item, iok = self.eval(args[0])
                return V('bool', z.Or(*[self.eq(item, el) for el in v.term])), z.And(ok, iok)
            raise RuntimeError('Unknown method')
        if tag == 'call':
            method, *args = a
            values = [self.eval(arg) for arg in args]; ok = z.And(*[v[1] for v in values]); vs = [v[0] for v in values]
            if method == 'Boolean' and len(vs) == 1: return V('bool', self.truth(vs[0])), ok
            if method in ('BigInt', 'Number') and len(vs) == 1:
                v = vs[0]
                if v.kind not in ('addr', 'qty', 'big', 'num'): raise RuntimeError(f'Unsupported conversion: {v.kind}')
                return V('big' if method == 'BigInt' else 'num', v.term), z.And(ok, v.present)
            if method == 'parseAbiParameters':
                schema = '(address instance, bytes proof, bytes32 root, bytes32 nullifierHash, address recipient, uint256 fee)'
                assert len(vs) == 1 and z.is_string_value(vs[0].term) and vs[0].term.as_string() == schema
                return V('abi-schema', schema), ok
            if method == 'decodeAbiParameters':
                assert len(vs) == 2 and vs[0].kind == 'abi-schema' and vs[1].kind == 'str'
                # Successful decoding yields an arbitrary correctly typed tuple.
                # Faithfulness to raw ABI bytes is a trusted viem contract.
                return V('array', [self.sponsor]), z.And(ok, self.truth(vs[1]))
            raise RuntimeError(f'Unsupported call {method}')
        raise RuntimeError(f'Unknown expression {tag}')

def obligations_for(E):
    s = E.symbols
    op = E.env['withdrawal'].term['userOperation'].term
    proof = E.env['withdrawal'].term['proof'].term
    sponsor = E.sponsor.term
    amount = s['note.amount']; fee = E.result.term['fee'].term; net = E.result.term['net'].term
    return {
        'P01_direct_recipient': s['proof.recipient'] == s['recipient'],
        'P02_no_execution_or_nonce': z.And(s['op.callData'] == '0x', s['op.callGas'] == 0, s['op.nonce'] == 0),
        'P03_transport_pool_asset': z.And(s['withdrawal.mode'] == 'paymaster', s['withdrawal.bundlerUrl'] == s['settings.bundlerUrl'],
            s['withdrawal.entryPoint'] == s['cfg.entryPoint'], s['withdrawal.pool'] == s['note.pool.address'],
            s['withdrawal.isERC20'] == s['note.token.present'], z.Implies(s['withdrawal.value.present'], s['withdrawal.value'] == amount)),
        'P04_paymaster_refund_chain': z.And(s['op.paymaster.present'], s['op.paymaster'] == s['cfg.paymaster'],
            s['proof.paymaster'] == s['cfg.paymaster'], s['proof.refund'] == 0, s['auth.present'], s['auth.chainId'] == s['settings.chainId']),
        'P05_fee_proceeds': z.And(fee > 0, fee < amount, net == amount - fee, net > 0, net < amount),
        'P06_sponsor_tuple': z.And(s['op.paymasterData.present'], s['sponsor.instance'] == s['note.pool.address'],
            s['sponsor.proof'] == s['proof.bytes'], s['sponsor.root'] == s['proof.root'], s['sponsor.nullifier'] == s['proof.nullifier'],
            s['sponsor.recipient'] == s['recipient'], s['sponsor.fee'] == fee),
        'P07_estimation_policy': z.And(s['estimation.present'], z.Or(s['estimation.status'] == 'estimated',
            z.And(s['estimation.status'] == 'fallback', z.Or(s['estimation.reason'] == 'bundler-internal', s['estimation.reason'] == 'transport-unavailable')))),
        'P08_returned_fee_matches_proof': fee == s['proof.fee'],
    }

E = Execution()
s = E.symbols
obligations = obligations_for(E)

def solver(extra):
    sol = z.Solver(); sol.set(timeout=30000); sol.add(*E.domains, E.accepted, extra); return sol

def witness(model):
    return {k: str(model.eval(v, model_completion=True)) for k, v in sorted(s.items())}

positive = solver(T)
assert positive.check() == z.sat, 'Vacuous validator: no accepted input'
results = []
for name, property in obligations.items():
    sol = solver(z.Not(property)); verdict = sol.check()
    (ROOT / f'artifacts/{name}.smt2').write_text(sol.to_smt2())
    assert verdict == z.unsat, f'{name}: {verdict}'
    results.append(dict(id=name, result='UNSAT', meaning='No successful return violates this postcondition under the documented abstraction.'))
# Deliberately stronger claim: the proof spends this particular note. No term
# derived from the note secret occurs in the validator, so this must NOT prove.
expected_nullifier = z.String('note.derivedNullifier')
gap = solver(s['proof.nullifier'] != expected_nullifier)
assert gap.check() == z.sat
(ROOT / 'artifacts/selected-note-gap.smt2').write_text(gap.to_smt2())
report = dict(sourceHash=IR['sourceHash'], functionHash=IR['functionHash'], z3Version=z.get_version_string(),
    assurance='Conditional SMT proof of source-extracted straight-line validator; custom translator and primitive contracts are trusted.',
    obligations=results, nonVacuity={'result': 'SAT', 'witness': witness(positive.model())},
    selectedNoteIdentity={'result': 'SAT', 'status': 'NOT_ESTABLISHED_AT_THIS_BOUNDARY', 'witness': witness(gap.model())}, guards=E.guards)
(ROOT / 'reports/validator.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Validator: {len(results)} conditional SMT obligations UNSAT; successful path SAT; selected-note boundary gap SAT')

mutation_results = []
for mutant in json.loads((ROOT / 'artifacts/validator-mutants.json').read_text()):
    candidate = Execution(mutant['ir'])
    sol = z.Solver(); sol.set(timeout=30000)
    sol.add(*candidate.domains, candidate.accepted, z.Not(obligations_for(candidate)[mutant['target']]))
    assert sol.check() == z.sat, f"Undetected source mutant: {mutant['name']}"
    mutation_results.append(dict(name=mutant['name'], target=mutant['target'], result='SAT', witness=witness(sol.model())))
(ROOT / 'reports/validator-mutations.json').write_text(json.dumps(mutation_results, indent=2)+'\n')
print(f'Validator mutation checks: {len(mutation_results)} altered source functions produce counterexamples')

# Validation evidence for the trusted translator, not a proof of its soundness.
corpus = json.loads((ROOT / 'artifacts/concrete-corpus.json').read_text())
for case in corpus:
    assert set(case['assignment']) == set(s), f'Incomplete symbolic assignment: {case["name"]}'
    sol = z.Solver(); sol.set(timeout=30000); sol.add(*E.domains)
    for key, value in case['assignment'].items():
        term = s[key]
        constant = z.BoolVal(value) if z.is_bool(term) else z.StringVal(value) if term.sort() == z.StringSort() else z.IntVal(value)
        sol.add(term == constant)
    assert sol.check() == z.sat, f'Corpus case outside the documented abstraction: {case["name"]}'
    sol.add(E.accepted)
    verdict = sol.check()
    assert verdict != z.unknown and (verdict == z.sat) == case['accepted'], f'Concrete/symbolic mismatch: {case["name"]}'
(ROOT / 'reports/correspondence.json').write_text(json.dumps(dict(cases=len(corpus), mismatches=0,
    accepted=sum(c['accepted'] for c in corpus), result='PASS', assurance='Finite differential testing of translator against release execution, not a semantic soundness proof.'), indent=2)+'\n')
print(f'Concrete/symbolic differential checks: {len(corpus)} cases agree')
