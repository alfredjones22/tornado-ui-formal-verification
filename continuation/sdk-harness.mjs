import {sdkLoader,capturedMethod,sdkViem as v,sdkAccounts,sdkAA,toolkit,pinned,loadedSources} from './source-loader.mjs';
import {TornadoPaymasterConfigs} from '../pilot/source-runtime.mjs';
import {readFileSync} from 'node:fs';
const {configureStore,unwrapResult}=toolkit;
export const gasFields=['callGasLimit','verificationGasLimit','preVerificationGas','paymasterVerificationGasLimit','paymasterPostOpGasLimit'];
export async function sdkHarness({chainId=1, token=false, scenario='stable', feePrice=1_000_000_000n, wrongChain=false, duplicateCommitment=false, spentWithDiscoveryPlaceholder=false}={}) {
  const transcript=[], captures=[], stateOverrides=[], proofs=[], events=[], keyCalls=[];
  const cfg=TornadoPaymasterConfigs[chainId];
  const pool=BigInt(cfg.supportedPools[token?cfg.supportedPools.length-1:0]);
  const asset=token?0x3333333333333333333333333333333333333333n:0n;
  const amount=token?100_000_000n:10n**18n, recipient='0x1111111111111111111111111111111111111111';
  const stateMerkleProofSelector=async (_state,p,c)=>{events.push('merkle'); return {root:123n,siblings:[9n],pathIndices:[0]}};
  let client;
  const transportedViem={...v, http:(_url,options)=>options};
  // Real request construction, gas-price parsing and estimate parsing; only
  // the transport/client endpoint is replaced with a deterministic local server.
  const createBundlerClient=()=> (client={request:async args=>{
    if(args.method==='pimlico_getUserOperationGasPrice') {
      transcript.push({kind:'gas-price',method:args.method});
      const tier={maxFeePerGas:v.toHex(feePrice),maxPriorityFeePerGas:feePrice===0n?'0x0':'0x1'}; return {slow:tier,standard:tier,fast:tier};
    }
    if(args.method!=='eth_estimateUserOperationGas')throw Error('Unexpected remote method '+args.method);
    const op=structuredClone(args.params[0]);captures.push(op);stateOverrides.push(structuredClone(args.params[2])); events.push('dummy-estimation');
    transcript.push({kind:'dummy-estimation',method:args.method,operation:op});
    const index=captures.length;
    if(scenario==='transport' || scenario==='retry-stable'&&index===1)throw new v.TimeoutError({});
    if(scenario==='validation')throw new v.RpcRequestError({body:{},error:{code:-32500,message:'AA33 validation revert'},url:'https://synthetic.invalid'});
    if(scenario==='inflated')return Object.fromEntries(gasFields.map(k=>[k,'0xffffffffffff']));
    const result=Object.fromEntries(gasFields.map(k=>[k,v.toHex(BigInt(op[k]))]));
    // Returning zero execution estimate is allowed; direct flow skips a search
    // limit on this field. Other values remain positive so validation succeeds.
    for(const k of gasFields)result[k]=k==='callGasLimit'?'0x100000':v.toHex(BigInt(op[k])*5n/6n);
    if(scenario==='refine'&&index===1)result.preVerificationGas='0x249f0';
    if(scenario==='unstable')result.preVerificationGas=v.toHex(BigInt(op.preVerificationGas)+10000n);
    return result;
  }});
  const load=sdkLoader({
    'viem':transportedViem, 'viem/account-abstraction':{...sdkAA,createBundlerClient},
    '@kohaku-eth/provider':{createTx:(to,data,value)=>({to,data,value})},
    'src/state/selectors/merkle.selector.ts':{stateMerkleProofSelector},
    'src/state/thunks/verifyRootsThunk.ts':{verifyRootsThunk:()=>async()=>({type:'roots/fulfilled',payload:undefined})},
  },{setTimeout:cb=>{queueMicrotask(cb); return 0}});
  const parse=load('src/account/legacyNote.ts').parseLegacyNote;
  const note=`tornado-${token?'dai':'eth'}-${token?'100':'1'}-${chainId}-0x${'ab'.repeat(62)}`;
  const parsed=parse(note);
  const secretManager=await load('src/account/keys.ts').SecretManager({host:{keystore:{deriveAt:async()=>{throw Error('No wallet derivation allowed')}}}});
  const rawDerive=secretManager.deriveLegacyEphemeralSigner;
  secretManager.deriveLegacyEphemeralSigner=async args=>{keyCalls.push(structuredClone(args)); return rawDerive(args)};
  // Actual output-argument mapping of the captured prover, with the expensive
  // circuit/MSM/Groth16 implementation abstracted as a prover contract.
  const prove=capturedMethod('src/utils/tornado-prover.ts','prove',{
    zkpWitness:{generateWitness:()=>inputs=>{proofs.push(structuredClone(inputs)); events.push('proof');return inputs}},
    circuit:{},groth:{createProof:async(_key,inputs)=>({synthetic:true})},pkey:{},
    toSolidityInput:()=> '0x'+'11'.repeat(256), viemToHex:v.toHex,
  });
  const serialized=load('src/state/utils/serialize.utils.ts');
  const legacyReducer=load('src/state/slices/legacySecretsSlice.ts').legacySecretsReducer;
  const deposit={pool,commitment:parsed.commitment,leafIndex:0,blockNumber:1n,transactionHash:'0x'+'aa'.repeat(32)};
  const original={
    instanceRegistryInfo:serialized.serialize({chainId:BigInt(wrongChain?(chainId===1?11155111:1):chainId),ensSubdomainKey:'synthetic',useExtendedEthPools:true}),
    pools:{poolsTuples:serialized.serialize([[pool,{address:pool,denomination:amount,asset,isERC20:token}]])},
    deposits:{depositsTuples:serialized.serialize([[pool,[[parsed.commitment,deposit]]],...(duplicateCommitment?[[pool+1n,[[parsed.commitment,{...deposit,pool:pool+1n}]]]]:[])])},
    withdrawals:{withdrawalsTuples:spentWithDiscoveryPlaceholder?serialized.serialize([[parsed.nullifierHash,{pool}]]):[]}, userSecrets:{byPool:spentWithDiscoveryPlaceholder?serialized.serialize([[pool,[{commitment:0n,nullifier:0n,salt:0n,nullifierHash:0n,depositIndex:0}]]]):[]},signatureSecrets:{byPool:[]},legacySecrets:{byPool:[]},
  };
  if(spentWithDiscoveryPlaceholder) original.deposits.depositsTuples[0][1].push(serialized.serialize([0n,{...deposit,commitment:0n,leafIndex:1}]));
  const store=configureStore({reducer:(state=original,action)=>({...state,legacySecrets:legacyReducer(state.legacySecrets,action)}),middleware:g=>g({serializableCheck:false,immutableCheck:false})});
  const imported=unwrapResult(await store.dispatch(load('src/state/thunks/importLegacyNotesThunk.ts').importLegacyNotesThunk({notes:[note]})));
  const selected=()=>load('src/state/selectors/withdrawals.selector.ts').getWithdrawableDepositsSelector(store.getState(),asset,amount);
  const verifier='0x4444444444444444444444444444444444444444';
  const provider={request:async({method,params})=>{
    events.push('host:'+method);
    if(method==='eth_feeHistory')return{baseFeePerGas:['0x3b9aca00','0x3b9aca00'],reward:[['0x1']]};
    if(method==='eth_getCode')return params?.[0]?.toLowerCase()===verifier?'0x6000':'0x'; if(method==='eth_getBalance'||method==='eth_getTransactionCount')return'0x0';
    if(method==='eth_call')return v.toHex(params?.[0]?.data===v.toFunctionSelector('verifier()')?BigInt(verifier):0n,{size:32}); throw Error('Unexpected host read '+method);
  }};
  const params={dataService:{getChainId:async()=>BigInt(chainId),quoteWeiInToken:async(_p,_a,fee)=>fee/10n**10n},assetAddress:asset,amount,
    recipient:BigInt(recipient),paymasterSettings:{[chainId]:cfg},secretManager,provider,proverFactory:async()=>({prove}),
    gasEstimationPolicy:'best-effort',maxGasLimits:{verificationGasLimit:250000n,paymasterVerificationGasLimit:2000000n}};
  return{note,parsed,pool,asset,amount,recipient,chainId,token,cfg,load,store,imported,selected,captures,stateOverrides,proofs,events,keyCalls,transcript,params,
    async prepare(){return unwrapResult(await store.dispatch(load('src/state/thunks/paymasterWithdrawThunk.ts').paymasterWithdrawThunk(params)))}};
}
