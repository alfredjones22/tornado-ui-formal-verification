import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {uiHarness,deferred,flush} from './ui-harness.mjs';
import {root} from './source-loader.mjs';
const results=[];
const snapshot=x=>JSON.parse(JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v));
const actions=async h=>{
  await Promise.all([h.state.sendWithdrawal(),h.state.sendWithdrawal(),h.state.reviewWithdrawal(),h.state.recheck(),h.state.importFile({target:{files:[]}})]);
  h.state.closeDialog();h.state.switchTo4337();h.state.changePage('multi');await flush();
};
for(const stage of ['prepare','connections','send','receipt'])for(const burst of [1,2,5,12]) {
  test(`actual Vue caller delayed ${stage}; ${burst} event bursts`,async()=>{
    const gate=deferred(),opts={[stage==='prepare'?'prepareGate':stage==='connections'?'connectionGate':stage==='send'?'sendGate':'receiptGate']:gate};
    const h=await uiHarness(opts);
    try{
      if(stage!=='prepare')await h.review();
      const active=stage==='prepare'?h.state.reviewWithdrawal():h.state.sendWithdrawal();await flush();
      assert.equal(h.state.busy,true);
      const quoted=stage==='prepare'?null:snapshot(h.state.quote),frozen=snapshot(h.state.sessionSettings);
      for(const id of ['note','recipient','bundler']){const node=h.input(id);assert(node?.props.disabled,'form '+id+' must be disabled')}
      const network=h.host.descendants(h.element).find(n=>n.props['aria-label']==='Network');assert(network.props.disabled);
      for(let i=0;i<burst;i++){
        await actions(h);
        // External wallet events are allowed during awaits. Basic withdrawal
        // authority is note-derived; the connected wallet is only a read source.
        h.walletState.value={wallet:{id:'synthetic',name:'Synthetic',provider:{request:async()=> '0xaa36a7'}},account:'0x5555555555555555555555555555555555555555',chainId:11155111,revision:i+1};await flush();
      }
      assert.equal(h.prepared.length,1);assert.equal(h.state.page,'basic');
      if(quoted){assert.deepEqual(snapshot(h.state.quote),quoted);assert.deepEqual(snapshot(h.state.sessionSettings),frozen)}
      gate.resolve();await active;await flush();
      if(stage==='prepare'){assert.equal(h.sent.length,0);assert.equal(h.state.dialog,'withdraw');await h.state.sendWithdrawal()}
      assert.equal(h.sent.length,1);assert.equal(h.state.progress[0].status,'confirmed');
      await h.state.sendWithdrawal();await h.state.sendWithdrawal();assert.equal(h.sent.length,1);
      results.push({stage,burst,sends:h.sent.length,quoteRetained:true,result:'PASS'});
    }finally{gate.resolve();await h.dispose()}
  });
}
test('edits after review do not mutate the displayed quote or its saved settings',async()=>{
  const h=await uiHarness();try{
    await h.review();const reviewed=snapshot(h.state.quote),saved=snapshot(h.state.sessionSettings);
    h.state.recipient='0x6666666666666666666666666666666666666666';h.state.noteInput='tornado-eth-1-11155111-0x'+'cd'.repeat(62);
    h.state.chainId=11155111;h.state.endpoint='https://other-bundler.invalid/';h.state.rpcUrl='https://other-rpc.invalid/';await flush();
    assert.deepEqual(snapshot(h.state.quote),reviewed);assert.deepEqual(snapshot(h.state.sessionSettings),saved);
    const text=h.host.content(h.element);assert(text.includes(reviewed.recipient));
    await h.state.sendWithdrawal();assert.equal(h.sent.length,1);assert.equal(h.sent[0].url,saved.bundlerUrl);
    assert.deepEqual(h.sent[0].params[0],reviewed.withdrawal.userOperation);
  }finally{await h.dispose()}
});
test('unknown receipt keeps the original quote/hash and blocks a fresh preparation',async()=>{
  const gate=deferred(),h=await uiHarness({receiptGate:gate,receiptError:'synthetic lost receipt'});
  try{await h.review();const q=h.state.quote,p=h.state.sendWithdrawal();await flush();assert.equal(h.sent.length,1);gate.resolve();await p;await flush();
    assert.equal(h.state.progress[0].status,'unknown');assert.equal(h.state.progress[0].hash,'0x'+'aa'.repeat(32));assert.equal(h.state.pending,true);
    await h.state.reviewWithdrawal();await h.state.sendWithdrawal();assert.equal(h.prepared.length,1);assert.equal(h.sent.length,1);assert.equal(h.state.quote,q);
    h.state.rpcUrl='https://edited-rpc.invalid/';assert.notEqual(h.state.sessionSettings.rpcUrl,h.state.rpcUrl);
  }finally{gate.resolve();await h.dispose()}
});
test('send rejection is unknown and the actual caller does not resend',async()=>{
  const h=await uiHarness({sendError:'synthetic lost response'});try{await h.review();await h.state.sendWithdrawal();assert.equal(h.sent.length,1);assert.equal(h.state.progress[0].status,'unknown');await h.state.sendWithdrawal();await h.state.reviewWithdrawal();assert.equal(h.sent.length,1);assert.equal(h.prepared.length,1)}finally{await h.dispose()}
});
test('freshness is checked before the connection await, not again at the send effect',async()=>{
  const gate=deferred(),h=await uiHarness({connectionGate:gate}),old=Date.now;
  try{await h.review();const start=old();Date.now=()=>start;const p=h.state.sendWithdrawal();await flush();Date.now=()=>start+360001;gate.resolve();await p;
    assert.equal(h.sent.length,1);assert.equal(h.state.progress[0].status,'confirmed');
  }finally{Date.now=old;gate.resolve();await h.dispose()}
});
test('a later explicit review creates a new quote after a completed operation',async()=>{
  const h=await uiHarness();try{await h.review();const old=h.state.quote;await h.state.sendWithdrawal();await h.review();assert.notEqual(h.state.quote,old);assert.equal(h.state.started,false);await h.state.sendWithdrawal();assert.equal(h.sent.length,2)}finally{await h.dispose()}
});
after(()=>writeFileSync(root+'reports/continuation/ui-scheduling.json',JSON.stringify({schedules:results,scope:'Captured full App.vue compiled and rendered with real Vue; external services and child components mocked. Finite scheduling evidence, not a whole-browser proof.',
 retainedBoundary:'Quote age can cross five minutes during the preflight await; validity is checked at preflight start.',formalCallerProtocol:'See caller-facts.json and obligations.json.'},null,2)+'\n'));
