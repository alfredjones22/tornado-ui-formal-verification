"""Conditional proofs of checked field-routing / caller protocol abstractions.
The source-facts mapper and operational abstractions are trusted, not verified
compiler/refinement proofs. See docs/continuation-1-2.md before quoting results.
"""
if not __debug__: raise RuntimeError('Assertions must be enabled')
from pathlib import Path
import json
import z3 as z
ROOT=Path(__file__).resolve().parents[1]
facts=json.loads((ROOT/'artifacts/continuation/source-facts.json').read_text())
p=facts['symbolicParameters']; results=[]
caller={item['id']:item['value'] for item in facts['callerFacts']}
assert caller['caller.run']['instructions']==['if_busy_return','clear_error','set_busy','invoke_work_and_suspend','redact_error','finally_clear_busy','finally_clear_status']
assert caller['caller.send']['instructions']==['if_started_throw','if_no_quote_throw','capture_quote','initialize_progress','mark_started','set_status','dispatch_one_adapter_and_suspend']
assert caller['caller.run']['lockBeforeWork'] and caller['caller.run']['unlockInFinally']
assert caller['caller.send']['startedGuardBeforeAdapter'] and caller['caller.send']['captureQuoteBeforeAwait'] and caller['caller.send']['markStartedBeforeAdapter']

def prove(name,premises,property):
    s=z.Solver();s.set(timeout=30000);s.add(*premises,z.Not(property))
    verdict=s.check();assert verdict==z.unsat,(name,verdict)
    (ROOT/f'artifacts/continuation/{name}.smt2').write_text(s.to_smt2())
    results.append({'id':name,'result':'UNSAT'})

# Byte-vector interpretation is little endian, matching bytesToNumberLE.
length=p['saltBytes'][1]*8
pre=z.BitVec('note.preimage',length)
lo,hi=p['nullifierBytes'];n=z.Extract(hi*8-1,lo*8,pre)
lo,hi=p['saltBytes'];salt=z.Extract(hi*8-1,lo*8,pre)
prove('S01_note_byte_partition',[],z.Concat(salt,n)==pre)
# A fresh private state is populated with this import; unrelated public history
# remains arbitrary. Nonlegacy discovery identities may exist but cannot obtain a signer from
# this frame. The ownership array below represents signable LEGACY identities.
commit=z.Int('parsed.commitment'); chosen=z.Int('selected.commitment')
nh=z.Int('parsed.nullifierHash');nullifier=z.Int('parsed.nullifier');secret=z.Int('parsed.salt')
owns=z.Store(z.K(z.IntSort(),z.BoolVal(False)),commit,z.BoolVal(True))
ns=z.Store(z.K(z.IntSort(),z.IntVal(0)),commit,nullifier)
ss=z.Store(z.K(z.IntSort(),z.IntVal(0)),commit,secret)
hs=z.Store(z.K(z.IntSort(),z.IntVal(0)),commit,nh)
selected=[z.Select(owns,chosen)]
prove('S02_single_import_selection',selected,z.And(chosen==commit,z.Select(ns,chosen)==nullifier,z.Select(ss,chosen)==secret,z.Select(hs,chosen)==nh))
recipient,pm,root,fee=z.Ints('intent.recipient intent.paymaster merkle.root fee')
inputs={'root':root,'nullifierHash':z.Select(hs,chosen),'recipient':recipient,'relayer':pm,'fee':fee,'refund':z.IntVal(0)}
args=[inputs[name] for name in p['publicArgs']]
# Decoder/encoder numeric round trip is a primitive contract. The proof concerns
# the values routed into that contract, not raw ABI correctness or Groth16.
encoded={'nullifierHash':args[1],'recipient':args[2],'fee':args[4]}
prove('S03_selected_note_public_inputs',selected,z.And(encoded['nullifierHash']==nh,encoded['recipient']==recipient,args[3]==pm,args[5]==0,encoded['fee']==fee))
G,P=z.Ints('requiredGas maxFeePerGas');eth=(G*P*p['feeNumerator'])/p['feeDenominator']
prove('S04_fee_prefund_rounding',[G>=0,P>=0],z.And(eth>=G*P,eth*10<=G*P*12,(eth+1)*10>G*P*12))
vg,pg,pvg,post,B,base,tip=z.Ints('verificationGas paymasterGas preVerificationGas postOpGas variableBytes referenceBaseFee boundedTip')
Gsum=vg+pg+pvg+post
cap=p['gasCaps']['verificationGasLimit']+p['gasCaps']['paymasterVerificationGasLimit']+100000+700000+80*B
prove('S05_direct_native_fee_envelope',[vg>=0,pg>=0,pvg>=0,post>=0,B>=0,P>=0,base>=0,tip>=0,
    vg<=p['gasCaps']['verificationGasLimit'],pg<=p['gasCaps']['paymasterVerificationGasLimit'],post<=100000,pvg<=700000+80*B,P<=base*3+tip],
    (Gsum*P*12)/10<=(cap*(base*3+tip)*12)/10)
# Each direct refinement round has at most one bounded transport retry. This is
# a count abstraction of the checked estimator/retry source, not a proof of a
# particular third-party transport stack.
rounds,retries=z.Ints('refinementRounds retriesPerRound')
prove('S06_direct_estimation_release_count',[rounds>=0,rounds<=3,retries>=0,retries<=1],rounds*(1+retries)<=6)

# Arbitrary-length inductive protocol proof for one captured quote. Every
# continuation has a program counter; normal Promise settlement is single-use.
B0,S0=z.Bools('caller.busy caller.started');pc,c=z.Ints('caller.pc caller.sends')
B1,S1=z.Bools('next.busy next.started');pn,cn=z.Ints('next.pc next.sends')
def inv(B,S,k,count):return z.And(k>=0,k<=2,count>=0,count<=1,z.Implies(k>0,z.And(B,S)),z.Implies(k==1,count==0),z.Implies(k==2,count==1),z.Implies(count>0,S))
I=inv(B0,S0,pc,c)
initial=z.And(z.Not(B0),z.Not(S0),pc==0,c==0)
prove('U01_caller_initial_state',[initial],I)
def relation(b,s,k,count):return z.And(B1==b,S1==s,pn==k,cn==count)
transitions={
 'begin_send':z.And(z.Not(B0),z.Not(S0),relation(True,True,1,c)),
 'send_effect':z.And(pc==1,relation(B0,S0,2,c+1)),
 'settle_or_preflight_error':z.And(pc>0,relation(False,S0,0,c)),
 'other_work_begin':z.And(pc==0,z.Not(B0),relation(True,S0,pc,c)),
 'other_work_end':z.And(pc==0,relation(False,S0,pc,c)),
 'blocked_click_or_background_event':relation(B0,S0,pc,c),
}
for name,step in transitions.items():prove('U02_'+name,[I,step],inv(B1,S1,pn,cn))
# The invariant implies the useful safety property independently of scheduler.
prove('U03_at_most_one_send',[I],c<=1)
mutants={
 'missing_started_guard':z.And(z.Not(B0),relation(True,True,1,c)),
 'missing_busy_guard':z.And(z.Not(S0),relation(True,True,1,c)),
 'early_unlock':z.And(pc==1,relation(False,S0,pc,c)),
 'clear_started_on_settle':z.And(pc==2,relation(False,False,0,c)),
 'repeat_send_continuation':z.And(pc==2,relation(B0,S0,pc,c+1)),
}
# The missing-busy mutant does not necessarily violate at-most-once with the
# started guard intact; it violates exclusive ownership if another job owns the
# lock. Check that distinction explicitly instead of manufacturing a failure.
mutation_results=[]
for name,step in mutants.items():
    sol=z.Solver();sol.add(I,step,z.Not(inv(B1,S1,pn,cn)))
    if name=='missing_busy_guard':
        sol=z.Solver();sol.add(I,B0,z.Not(S0),pc==0,step)
    assert sol.check()==z.sat,name
    mutation_results.append({'name':name,'result':'SAT','witness':str(sol.model())})
# A valid send/completion is reachable: don't accept an always-rejecting model.
trace=[(False,False,0,0),(True,True,1,0),(True,True,2,1),(False,True,0,1)]
def grounded(formula,before,after=None):
    pairs=[(var,z.BoolVal(value) if isinstance(value,bool) else z.IntVal(value)) for var,value in zip([B0,S0,pc,c],before)]
    if after is not None:pairs += [(var,z.BoolVal(value) if isinstance(value,bool) else z.IntVal(value)) for var,value in zip([B1,S1,pn,cn],after)]
    return z.substitute(formula,*pairs)
positive=z.Solver();positive.add(grounded(initial,trace[0]))
for i,name in enumerate(['begin_send','send_effect','settle_or_preflight_error']):positive.add(grounded(transitions[name],trace[i],trace[i+1]))
assert positive.check()==z.sat
query_replays=0
for path in sorted((ROOT/'artifacts/continuation').glob('*.smt2')):
    solver=z.Solver();solver.set(timeout=30000);solver.from_file(str(path));assert solver.check()==z.unsat,path.name;query_replays+=1
report={'assurance':'Conditional proofs of source-checked dataflow and caller protocol abstractions; not whole-source semantic/refinement proofs.',
 'obligations':results,'sourceMappedFacts':len(facts['sdkFacts'])+len(facts['callerFacts']),'inductiveCallerProtocol':True,
 'retainedPremises':['Fresh legacy-secret slice contains exactly the imported note; nonlegacy discovery signers are disabled',
 'Faithful Pedersen/serialization/ABI/Groth16/signer contracts; Merkle and root validity',
 'Gas/price-checker contracts and captured source-specific mapping of their bounds',
 'Normal event-loop/Promise semantics and checked caller source correspondence',
 'No hostile same-origin code or mutation of the private quote graph'],
 'nonVacuousCallerTrace':trace,'mutants':mutation_results,'savedQueryReplays':query_replays,'fullSDKProof':False,'fullVueRefinementProof':False}
(ROOT/'reports/continuation/obligations.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'Continuation: {len(results)} conditional obligations UNSAT; inductive caller protocol; {len(mutation_results)} mutants SAT; {query_replays} saved queries replayed')
