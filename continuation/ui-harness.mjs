import * as Vue from 'vue';
import * as viem from 'viem';
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';
import {compileModule,pinned,root} from './source-loader.mjs';
import {fixture,runtime} from '../pilot/source-runtime.mjs';
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
export const flush=async()=>{for(let i=0;i<8;i++){await Promise.resolve();await Vue.nextTick()}};
const no=()=>{}, fail=()=>{throw Error('Outside direct-withdrawal harness scope')};
export async function uiHarness({prepareGate,connectionGate,sendGate,receiptGate,sendError,receiptError,now}={}) {
  const f=fixture(), log=[], prepared=[], sent=[], receipts=[];
  f.note.pool.asset.decimals=18;
  const browser=new EventTarget();
  const doc=Object.assign(new EventTarget(),{activeElement:null,visibilityState:'visible',querySelector:()=>null,getElementById:()=>null});
  // Vue runtime-dom directives use these types even with a custom renderer.
  globalThis.Document=class{}; globalThis.ShadowRoot=class{};
  globalThis.window=browser;globalThis.document=doc;
  globalThis.location=new URL('https://synthetic.invalid/');globalThis.history={pushState:no,replaceState:no};
  const oldSetTimeout=globalThis.setTimeout;
  globalThis.setTimeout=(cb,ms,...args)=>{if(ms===0){queueMicrotask(()=>cb(...args));return 0}return oldSetTimeout(cb,ms,...args)};
  const walletState=Vue.shallowRef({wallet:null,account:null,chainId:null,revision:0});
  const wallet={state:walletState,startWatching:no,dispose:no,disconnect:()=>{walletState.value={wallet:null,account:null,chainId:null,revision:walletState.value.revision+1}},connect:async()=>{}};
  const parseNote=(raw,chain)=>{if(raw.split('\n').filter(Boolean).length!==1||!raw.startsWith('tornado-'))throw Error('one note');return{...f.note,raw,pool:{...f.note.pool,chainId:chain}}};
  const connections=async()=>{log.push('connections:start');if(connectionGate)await connectionGate.promise;log.push('connections:end')};
  const api=runtime({parseNote,validateConnections:connections,isHash:x=>/^0x[0-9a-f]{64}$/i.test(x),pause:async()=>{},jsonRpc:async(url,method,params)=>{
    if(method==='eth_sendUserOperation'){log.push('send');sent.push(JSON.parse(JSON.stringify({url,params})));if(sendGate)await sendGate.promise;if(sendError)throw Error(sendError);return'0x'+'aa'.repeat(32)}
    if(method==='eth_getUserOperationReceipt'){log.push('receipt');receipts.push(params);if(receiptGate)await receiptGate.promise;if(receiptError)throw Error(receiptError);return{success:true,receipt:{transactionHash:'0x'+'bb'.repeat(32)}}}
    throw Error('Unmodelled method '+method);
  }});
  const prepareWithdrawal=async(input,recipient,settings,progress)=>{
    log.push('prepare:start');prepared.push({input,recipient,settings:structuredClone(settings)});
    if(prepareGate)await prepareGate.promise;
    const q=structuredClone(f.quote);q.recipient=recipient;q.note.raw=input;q.withdrawal.bundlerUrl=settings.bundlerUrl;q.quotedAt=Date.now();
    // The prepared synthetic fixture uses the default reviewed recipient. Tests
    // editing the form after preparation deliberately do not edit this clone.
    log.push('prepare:end');return q;
  };
  const asset=f.note.pool.asset;
  const catalog={DENOMINATIONS:['0.01','1'],NETWORKS:{1:{rpc:'https://rpc.invalid/',name:'Ethereum',explorer:'https://etherscan.io'},11155111:{rpc:'https://sep.invalid/',name:'Sepolia',explorer:'https://sepolia.etherscan.io'}},
    assetsFor:()=>[asset],poolsFor:chain=>[{...f.note.pool,chainId:chain}],poolFor:(chain,d)=>['1','0.01'].includes(d)?{...f.note.pool,chainId:chain}:undefined,
    depositBatchLimit:()=>12,depositCart:()=>[],expandSelection:()=>[],shorten:x=>x.slice(0,6)+'…'+x.slice(-4),supportsClassicRelayer:()=>true,units:viem.formatUnits?((x,a)=>viem.formatUnits(x,a.decimals)):String};
  const child=Vue.defineComponent({inheritAttrs:false,setup:()=>()=>Vue.h('span')});
  const deps={vue:Vue,viem,'./core/catalog':catalog,'./core/app-assets':{appAssetUrl:x=>x},'./core/routes':{currentPage:()=> 'basic',pageUrl:x=>x},
    './core/notes':{parseNote,downloadText:no,extractNoteStrings:x=>x.split('\n'),generateNote:fail,poolAbi:[]},
    './core/wallet':{assertWallet:async()=>{},atomicBatchAvailable:async()=>false,discoverWallets:()=>({request:no,dispose:no})},
    './core/deposit-session':{depositBatches:()=>[],executeDepositSession:fail,reconcileDepositSession:fail},
    './core/rpc':{checkedUrl:x=>new URL(x).href,checkedSourceUrl:x=>new URL(x).href,publicClientFor:()=>({readContract:async()=>0}),safeError:e=>e.message??String(e),validateConnections:connections},
    './core/data-sources':{ARTIFACTS_URL:'https://artifacts.invalid/',SAGA_URLS:{1:'https://history.invalid/',11155111:'https://history.invalid/sep/'}},
    './core/withdrawals':{...api,prepareWithdrawal},'./core/relayers':{prepareRelayerWithdrawal:fail,reconcileRelayerWithdrawal:fail,submitRelayerWithdrawal:fail},
    './core/wallet-connection':{createWalletConnection:()=>wallet},'./core/wallet-rpc':{setWalletRpcSource:no},
    './core/seed-bundle':{formatDepositBackup:no,generateSeededDepositBundle:fail,SEED_BUNDLE_RECOVERY:{}},
  };
  for(const name of ['Icon','MultiWithdrawal','ManageSmartAccount','RecipientPrivacy','DepositBalances','Compliance'])deps['./'+name+'.vue']={default:child};
  const src=pinned('ui','src/App.vue'), {descriptor,errors}=parse(src);if(errors.length)throw errors[0];
  const script=compileScript(descriptor,{id:'fv-release'});
  const component=compileModule(script.content,'App.ts',deps).default;
  const template=compileTemplate({source:descriptor.template.content,filename:'App.vue',id:'fv-release',compilerOptions:{bindingMetadata:script.bindings}});
  if(template.errors.length)throw template.errors[0];
  component.render=compileModule(template.code,'template.ts',{vue:Vue}).render;
  const host=compileModule(pinned('ui','tests/fixtures/vue-renderer.ts'),'renderer.ts',{vue:Vue});
  const app=host.renderer.createApp(component), element=new host.Element('root');app.mount(element);await flush();
  const state=app._instance.setupState;state.noteInput=f.note.raw;state.recipient=f.recipient;state.tab='withdraw';await flush();
  const input=id=>host.descendants(element).find(x=>x.props.id===id);
  const click=async label=>{const button=host.button(element,label);if(!button)throw Error('No button: '+label);if(button.props.disabled)return false;await button.props.onClick();await flush();return true};
  return{f,log,prepared,sent,receipts,state,element,host,walletState,input,click,flush,
    async review(){await state.reviewWithdrawal();await flush()},
    async dispose(){app.unmount();await flush();globalThis.setTimeout=oldSetTimeout}};
}
