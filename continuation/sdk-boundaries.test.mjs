import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {sdkHarness,gasFields} from './sdk-harness.mjs';
import {sdkLoader,sdkViem as v,sdkAA,sdkAccounts,loadedSources,dependencyVersions,root} from './source-loader.mjs';
const runs=[];
const stringify=x=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?'0x'+v.toString(16):v,2)+'\n';
async function checkCandidate(h,op) {
  const [data]=v.decodeAbiParameters(v.parseAbiParameters('(address instance, bytes proof, bytes32 root, bytes32 nullifierHash, address recipient, uint256 fee)'),op.paymasterData);
  assert.equal(BigInt(data.instance),h.pool);
  assert.equal(data.recipient.toLowerCase(),h.recipient);
  assert.equal(BigInt(data.nullifierHash),h.parsed.nullifierHash);
  assert.equal(BigInt(op.eip7702Auth.chainId),BigInt(h.chainId));
  assert.equal(op.eip7702Auth.address.toLowerCase(),'0xe6cae83bde06e4c305530e199d7217f42808555b');
  assert.equal(op.callData,'0x'); assert.equal(BigInt(op.callGasLimit),0n); assert.equal(BigInt(op.nonce),0n);
  assert.equal(op.paymaster.toLowerCase(),h.cfg.paymasterAddress.toLowerCase());
  assert(data.fee>=0n&&data.fee<h.amount);
  const gas=Object.fromEntries(gasFields.map(k=>[k,BigInt(op[k])]));
  assert(gas.verificationGasLimit<=250000n&&gas.paymasterVerificationGasLimit<=2000000n&&gas.paymasterPostOpGasLimit<=100000n);
  const expected=h.load('src/paymaster/fee.ts').computeMinimumViableFee(gas,BigInt(op.maxFeePerGas));
  assert.equal(data.fee,h.token?expected/10n**10n:expected);
  const typed=sdkAA.getUserOperationTypedData({chainId:h.chainId,entryPointAddress:h.cfg.entryPointAddress,userOperation:{...op,
    ...Object.fromEntries(['nonce','maxFeePerGas','maxPriorityFeePerGas',...gasFields].map(k=>[k,BigInt(op[k])]))}});
  assert.equal((await v.recoverTypedDataAddress({...typed,signature:op.signature})).toLowerCase(),op.sender.toLowerCase());
  const {recoverAuthorizationAddress}=await import('sdk-viem/utils');
  assert.equal((await recoverAuthorizationAddress({authorization:{...op.eip7702Auth,chainId:Number(BigInt(op.eip7702Auth.chainId)),nonce:Number(BigInt(op.eip7702Auth.nonce)),yParity:Number(BigInt(op.eip7702Auth.yParity))}})).toLowerCase(),op.sender.toLowerCase());
  return data;
}
for(const chainId of [1,11155111])for(const token of [false,true])for(const scenario of ['stable','refine','retry-stable','transport','validation','inflated','unstable']) {
  test(`captured SDK candidate envelope ${chainId}/${token}/${scenario}`,async()=>{
    const h=await sdkHarness({chainId,token,scenario});
    assert.equal(h.imported[0].status,'imported');
    const selected=h.selected(); assert.equal(selected.length,1);
    assert.equal(selected[0].nullifier,h.parsed.nullifier);assert.equal(selected[0].salt,h.parsed.salt);assert.equal(selected[0].commitment,h.parsed.commitment);
    let result,error;
    try{result=await h.prepare()}catch(e){error=e}
    const fails=['validation','inflated','unstable'].includes(scenario);
    assert.equal(Boolean(error),fails,error?.message);
    assert(h.captures.length>0); for(const op of h.captures)await checkCandidate(h,op);
    for(const p of h.proofs){assert.equal(p.nullifier,h.parsed.nullifier);assert.equal(p.secret,h.parsed.salt);assert.equal(p.nullifierHash,h.parsed.nullifierHash);assert.equal(p.recipient,BigInt(h.recipient));assert.equal(p.relayer,BigInt(h.cfg.paymasterAddress));assert.equal(p.refund,0n)}
    assert(h.keyCalls.every(x=>x.nullifier===h.parsed.nullifier));
    assert(h.transcript.every(x=>x.method!=='eth_sendUserOperation'));
    if(scenario==='retry-stable'){assert.equal(h.captures.length,2);assert.deepEqual(h.captures[0],h.captures[1]);assert.equal(h.proofs.length,1)}
    if(scenario==='refine'){assert.equal(h.captures.length,2);assert.notEqual(h.captures[0].signature,h.captures[1].signature);assert.notEqual(h.captures[0].paymasterData,h.captures[1].paymasterData)}
    if(scenario==='transport'){assert.equal(h.captures.length,2);assert.deepEqual(h.captures[0],h.captures[1]);assert.equal(result[0].gasEstimation.status,'fallback');assert.equal(h.proofs.length,2);await checkCandidate(h,result[0].userOperation)}
    if(scenario==='inflated')assert.equal(h.proofs.length,1);
    if(scenario==='unstable')assert.equal(h.captures.length,3);
    runs.push({chainId,token,scenario,candidatesReleased:h.captures.length,proofsBuilt:h.proofs.length,result:result?.[0].gasEstimation??'stopped',
      hostFinalReviewNotReachedDuringCapture:true,events:h.events});
  });
}
test('wrong-chain import cannot add a secret',async()=>{const h=await sdkHarness({wrongChain:true});assert.equal(h.imported[0].status,'wrong-chain');assert.equal(h.store.getState().legacySecrets.byPool.length,0)});
test('ambiguous commitment in another pool is rejected by the frame pool-match gate',async()=>{
  const h=await sdkHarness();const {compileModule,pinned}=await import('./source-loader.mjs');
  const {assertImportedNotes}=compileModule(pinned('ui','src/core/pool-history.ts'),'pool-history.ts',{});
  assert.throws(()=>assertImportedNotes([{status:'imported',poolAddress:h.pool+1n}],[{pool:{address:v.toHex(h.pool,{size:20})}}]),/expected pool/);
});
test('zero fee may leave during estimation before the stricter host fee gate',async()=>{
  const h=await sdkHarness({feePrice:0n});const [w]=await h.prepare();assert(h.captures.length>0);
  const [data]=v.decodeAbiParameters(v.parseAbiParameters('(address instance, bytes proof, bytes32 root, bytes32 nullifierHash, address recipient, uint256 fee)'),h.captures[0].paymasterData);assert.equal(data.fee,0n);
  const {runtime}=await import('../pilot/source-runtime.mjs');
  assert.throws(()=>runtime().validateWithdrawal({pool:{address:v.toHex(h.pool,{size:20}),amount:h.amount,asset:{} }},h.recipient,w,{chainId:h.chainId,bundlerUrl:h.cfg.bundlerUrl}),/quoted fee/);
});
test('high fees below denomination are allowed on the paymaster path; no relayer 20% cap is implied',async()=>{
  const h=await sdkHarness({feePrice:1_000_000_000n});h.params.dataService.quoteWeiInToken=async()=>h.amount*9n/10n;
  // Token quote is an explicit dependency; use the token flow for this boundary.
  const t=await sdkHarness({token:true});t.params.dataService.quoteWeiInToken=async()=>t.amount*9n/10n;
  const result=await t.prepare(); const [data]=v.decodeAbiParameters(v.parseAbiParameters('(address instance, bytes proof, bytes32 root, bytes32 nullifierHash, address recipient, uint256 fee)'),result[0].userOperation.paymasterData);
  assert.equal(data.fee,t.amount*9n/10n);
});
test('a discovery placeholder cannot sign if the imported note is spent',async()=>{
  const h=await sdkHarness({spentWithDiscoveryPlaceholder:true});assert.equal(h.selected()[0].kind,'derived');
  await assert.rejects(h.prepare());assert.equal(h.captures.length,0);
});
test('the actual public history loader removes private identity slices from a reused cache',async()=>{
  const {compileModule,pinned}=await import('./source-loader.mjs');
  const manifest=JSON.parse(pinned('ui','src/core/history-manifest.json')),bootstrap=JSON.parse(pinned('ui','src/core/history-bootstrap.json'));
  const chain=manifest.chains['1'],state=structuredClone(bootstrap.chains['1']);
  const [addr,saved]=state.pools.poolsTuples[0],descriptor=chain.pools['0x'+BigInt(addr).toString(16).padStart(40,'0')];
  saved.lastSyncedBlock=descriptor.toBlock;state.deposits={depositsTuples:[]};state.withdrawals={withdrawalsTuples:[]};state.sync={lastSyncedBlock:descriptor.toBlock};
  state.legacySecrets={byPool:[['synthetic-private-record']]};state.userSecrets={byPool:[['synthetic-derived-record']]};state.signatureSecrets={byPool:[['synthetic-signature-record']]};
  const cache=compileModule(pinned('ui','src/core/history-cache.ts'),'history-cache.ts',{
    './history-manifest.json':{default:manifest},'./history-bootstrap.json':{default:bootstrap},
    './history-codec':{},'./app-assets':{appAssetUrl:x=>x},'./data-sources':{ARTIFACTS_URL:'https://synthetic.invalid/',sourceUrl:x=>x}});
  const output=await cache.loadCachedHistory(1,[{address:'0x'+BigInt(addr).toString(16).padStart(40,'0'),amount:BigInt(saved.denomination),asset:{...(BigInt(saved.asset)!==0n?{token:'0x'+BigInt(saved.asset).toString(16).padStart(40,'0')}:{})}}],{[chain.stateKey]:state},()=>{},async()=>{throw Error('Cache-only path must not fetch')});
  const result=output[chain.stateKey];assert(!('legacySecrets'in result));assert(!('userSecrets'in result));assert(!('signatureSecrets'in result));
});
after(()=>writeFileSync(root+'reports/continuation/sdk.json',stringify({runs,loadedSources:[...loadedSources].sort(),dependencyVersions,
  assurance:'Captured-source integration tests. Merkle/root verification and Groth16 generation are explicit contracts; not a circuit or bytecode proof.'})));
