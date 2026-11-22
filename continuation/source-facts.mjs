// Auditable, source-specific structural obligations. These are NOT a general
// JavaScript semantics proof. The symbolic protocol/dataflow below explicitly
// trusts these checked mappings plus the primitive contracts in the report.
import {ts,pinned,root} from './source-loader.mjs';
import {baseParse} from '@vue/compiler-dom';
import {parse as parseSFC} from '@vue/compiler-sfc';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const facts=[],used=new Map();
const compact=s=>s.replace(/\s+/g,'');
function file(ns,path){const s=pinned(ns,path);used.set(ns+'/'+path,createHash('sha256').update(s).digest('hex'));return ts.createSourceFile(path,s,ts.ScriptTarget.ESNext,true)}
function all(f,pred){const a=[];function walk(n){if(pred(n))a.push(n);ts.forEachChild(n,walk)}walk(f);return a}
function one(f,pred,label){const a=all(f,pred);assert.equal(a.length,1,label);return a[0]}
function text(n,f){return n.getText(f)}
function record(f,n,id,value){facts.push({id,file:f.fileName,line:f.getLineAndCharacterOfPosition(n.getStart(f)).line+1,source:n.getText(f),value});return value}
function obj(n,f){assert(ts.isObjectLiteralExpression(n));return Object.fromEntries(n.properties.map(p=>{assert(ts.isPropertyAssignment(p)||ts.isShorthandPropertyAssignment(p));return[p.name.getText(f),ts.isShorthandPropertyAssignment(p)?p.name:p.initializer]}))}
function eq(n,f,expected){assert.equal(compact(text(n,f)),compact(expected))}
function unwrap(n){while(ts.isAsExpression(n)||ts.isSatisfiesExpression(n)||ts.isParenthesizedExpression(n))n=n.expression;return n}
const legacy=file('sdk','src/account/legacyNote.ts');
const slices={};for(const name of ['nullifierBytes','saltBytes']){const d=one(legacy,n=>ts.isVariableDeclaration(n)&&n.name.getText(legacy)===name,name);const e=d.initializer;assert(ts.isCallExpression(e));eq(e.expression,legacy,'preimageBytes.subarray');slices[name]=e.arguments.map(x=>Number(x.getText(legacy)));record(legacy,d,'note.'+name,slices[name])}
assert.deepEqual(slices,{nullifierBytes:[0,31],saltBytes:[31,62]});
const imp=file('sdk','src/state/thunks/importLegacyNotesThunk.ts');
const call=one(imp,n=>ts.isCallExpression(n)&&n.expression.getText(imp)==='addLegacyUserSecret','import record');
const rec=obj(obj(call.arguments[0],imp).record,imp);for(const k of ['commitment','nullifierHash','nullifier','salt'])eq(rec[k],imp,'parsed.'+k);
record(imp,call,'import.record',Object.fromEntries(Object.entries(rec).map(([k,v])=>[k,v.getText(imp)])));
const wt=file('sdk','src/state/thunks/withdrawalsProofThunk.ts');
const pc=one(wt,n=>ts.isCallExpression(n)&&n.expression.getText(wt)==='prover.prove','prover inputs');
const inputs=obj(pc.arguments[0],wt);for(const [k,v]of Object.entries({nullifier:'nullifier',secret:'salt',nullifierHash:'nullifierHash',recipient:'BigInt(recipient)',relayer:'BigInt(relayerAddress)',fee:'fee',refund:'0n'}))eq(inputs[k],wt,v);
record(wt,pc,'prover.inputs',Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.getText(wt)])));
const simulation=one(wt,n=>ts.isIfStatement(n)&&n.expression.getText(wt)==='simulation','dummy proof branch');
const dummyReturn=one(simulation.thenStatement,n=>ts.isReturnStatement(n),'dummy proof return');
const dummy=obj(dummyReturn.expression,wt);eq(dummy.proof,wt,'DUMMY_PROOF');
assert(ts.isArrayLiteralExpression(dummy.args));eq(dummy.args.elements[1],wt,'toHex(randomFieldElement(), { size: 32 })');
record(wt,dummyReturn,'estimation.dummyProof',{constant:'DUMMY_PROOF',randomizedNullifier:true,realProverSkipped:true});
const prover=file('sdk','src/utils/tornado-prover.ts');
const method=one(prover,n=>ts.isMethodDeclaration(n)&&n.name.getText(prover)==='prove','prove method');
const ret=one(method,n=>ts.isReturnStatement(n),'prove return');const args=obj(ret.expression,prover).args;assert(ts.isArrayLiteralExpression(args));
const names=['root','nullifierHash','recipient','relayer','fee','refund'];const output=[];
for(let i=0;i<args.elements.length;i++){const e=args.elements[i];assert(ts.isCallExpression(e));eq(e.expression,prover,'viemToHex');eq(e.arguments[0],prover,'inputs.'+names[i]);output.push(names[i])}assert.equal(output.length,6);record(prover,args,'prover.outputArgs',output);
const cfg=file('sdk','src/paymaster/config.ts');const encoder=one(cfg,n=>ts.isFunctionDeclaration(n)&&n.name.text==='encodePoolPaymasterData','encoder');
const destruct=one(encoder,n=>ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name),'proof destructuring');
eq(destruct.initializer,cfg,'proof.args');assert.deepEqual(destruct.name.elements.map(x=>x.getText(cfg)),['root','nullifierHash','recipient','','fee']);record(cfg,destruct,'encoder.args',destruct.name.elements.map(x=>x.getText(cfg)));
const utils=file('sdk','src/paymaster/utils.ts');const estimator=one(utils,n=>ts.isFunctionDeclaration(n)&&n.name.text==='estimateUserOperationGas','estimator');
const request=one(estimator,n=>ts.isCallExpression(n)&&n.expression.getText(utils)==='client.request','estimator request');const rq=obj(request.arguments[0].expression??request.arguments[0],utils);
eq(rq.method,utils,"'eth_estimateUserOperationGas'");eq(rq.params,utils,'stateOverrides ? [op, entryPoint, stateOverrides] : [op, entryPoint]');
record(utils,request,'estimation.request',{method:'eth_estimateUserOperationGas',operation:'op',overrides:'conditional third parameter'});
const thunk=file('sdk','src/state/thunks/paymasterWithdrawThunk.ts');
for(const [name,expected]of Object.entries({validationOnly:'deposits.length === 1 && tailCalls == null',sponsoringDeposit:'deposits[0]!'})){const d=one(thunk,n=>ts.isVariableDeclaration(n)&&n.name.getText(thunk)===name,name);eq(d.initializer,thunk,expected);record(thunk,d,'sdk.'+name,expected)}
const build=one(thunk,n=>ts.isVariableDeclaration(n)&&n.name.getText(thunk)==='buildOp','buildOp');
assert(ts.isArrowFunction(build.initializer)&&ts.isBlock(build.initializer.body));
const opDecl=one(build.initializer.body,n=>ts.isVariableDeclaration(n)&&n.name.getText(thunk)==='userOperation','buildOp userOperation');
assert(ts.isAwaitExpression(opDecl.initializer)&&ts.isCallExpression(opDecl.initializer.expression));
const buildCall=opDecl.initializer.expression;
eq(buildCall.expression,thunk,'(simulation ? buildSimulationTornadoUserOp : buildSignedTornadoUserOp)');
const bo=obj(buildCall.arguments[0],thunk);eq(bo.tailCalls,thunk,'validationOnly ? undefined : composeTailCalls(fee, directCalls)');
const estimated=one(thunk,n=>ts.isCallExpression(n)&&n.expression.getText(thunk)==='buildEstimatedTornadoUserOp','estimated build');
eq(estimated.arguments[1],thunk,'async (gas) => (await buildOp(gas, true)).userOperation');
eq(estimated.arguments[2],thunk,'(gas) => buildOp(gas, false)');
eq(estimated.arguments[3],thunk,'(op) => estimateUserOperationGas(bundlerClient, op, entryPointAddress, stateOverrides)');
record(thunk,build,'sdk.directBuild',{noTailCallsForDirect:true,dummyEstimateOnly:true,realBuildAfterEstimate:true});
const est=file('sdk','src/paymaster/estimate.ts');const loop=one(est,n=>ts.isForStatement(n)&&n.initializer?.getText(est).includes('attempt = 0'),'estimate rounds');
const stmts=loop.statement.statements;eq(stmts[0].expression,est,'options.validateGas?.(gas, previousOperation)');
eq(stmts[1],est,'const operation = await simulate(gas);');eq(stmts[2].expression,est,'options.validateGas?.(gas, operation)');
const finalBuild=one(est,n=>ts.isCallExpression(n)&&n.expression.getText(est)==='build'&&n.arguments[0]?.getText(est)==='gas','final build');
record(est,stmts[2],'estimation.dummyValidationBeforeEstimate',{rounds:3,transportRetries:1,directExecutionRetries:0});
record(est,finalBuild,'sdk.finalBuildAfterEstimation',{calledAfterNoChange:true});
const opts=file('ui','src/core/withdrawal-options.ts');const direct=one(opts,n=>ts.isIfStatement(n)&&n.expression.getText(opts)==='!scope','basic options');
const basic=obj(direct.thenStatement.expression,opts),caps=obj(basic.maxGasLimits,opts);
const gasCaps=Object.fromEntries(Object.entries(caps).map(([k,n])=>[k,Number(n.getText(opts).replace(/[n_]/g,''))]));assert.deepEqual(gasCaps,{verificationGasLimit:250000,paymasterVerificationGasLimit:2000000});record(opts,direct,'ui.basicGasCaps',gasCaps);
const fee=file('sdk','src/paymaster/fee.ts');const mult=one(fee,n=>ts.isVariableDeclaration(n)&&n.name.getText(fee)==='baseFeeMultiplier','fee multiplier');assert.equal(Number(mult.initializer.getText(fee)),1.2);record(fee,mult,'fee.multiplier',{numerator:12,denominator:10,rounding:'floor'});
const frame=file('ui','src/sdk-frame.ts');
const manager=one(frame,n=>ts.isVariableDeclaration(n)&&n.name.getText(frame)==='manager','frame secret manager');const managerFields=obj(manager.initializer,frame);
eq(managerFields.deriveEphemeralSigner,frame,'noWallet');eq(managerFields.deriveSignatureEphemeralSigner,frame,'noWallet');
record(frame,manager,'frame.onlyImportedLegacySigner',{otherSignerFamiliesDisabled:true});
const cache=file('ui','src/core/history-cache.ts');const poolState=one(cache,n=>ts.isFunctionDeclaration(n)&&n.name.text==='poolState','public pool cache projection');
const cacheReturn=one(poolState,n=>ts.isReturnStatement(n),'public projection return');const publicFields=Object.keys(obj(unwrap(cacheReturn.expression),cache));
assert(!publicFields.some(x=>['legacySecrets','userSecrets','signatureSecrets'].includes(x)));record(cache,cacheReturn,'frame.publicCacheProjection',publicFields);
const appSrc=pinned('ui','src/App.vue');used.set('ui/src/App.vue',createHash('sha256').update(appSrc).digest('hex'));
const script=parseSFC(appSrc).descriptor.scriptSetup.content;const app=ts.createSourceFile('App.vue/script',script,ts.ScriptTarget.ESNext,true);
const fn=name=>one(app,n=>ts.isFunctionDeclaration(n)&&n.name.text===name,name);
const run=fn('run'),ss=run.body.statements;assert.equal(ss.length,4);assert(ts.isIfStatement(ss[0])&&ts.isReturnStatement(ss[0].thenStatement));eq(ss[0].expression,app,'busy.value');eq(ss[2].expression,app,'busy.value = true');const tr=ss[3];assert(ts.isTryStatement(tr));assert.equal(tr.tryBlock.statements.length,1);assert.equal(tr.catchClause.block.statements.length,1);assert.equal(tr.finallyBlock.statements.length,2);eq(tr.tryBlock.statements[0].expression,app,'await work()');eq(tr.finallyBlock.statements[0].expression,app,'busy.value = false');
record(app,run,'caller.run',{guard:'busy',lockBeforeWork:true,unlockInFinally:true,instructions:['if_busy_return','clear_error','set_busy','invoke_work_and_suspend','redact_error','finally_clear_busy','finally_clear_status']});
const send=fn('sendWithdrawal');assert.equal(send.body.statements.length,1);assert(ts.isAwaitExpression(send.body.statements[0].expression));eq(send.body.statements[0].expression.expression.expression,app,'run');const cb=one(send,n=>ts.isArrowFunction(n),'send callback');const bs=cb.body.statements;assert.equal(bs.length,7);
assert(ts.isIfStatement(bs[0])&&ts.isThrowStatement(bs[0].thenStatement));eq(bs[0].expression,app,'started.value');assert(ts.isIfStatement(bs[1]));eq(bs[1].expression,app,'!quote.value');eq(bs[2],app,'const q = quote.value');eq(bs[4].expression,app,'started.value = true');
eq(bs[3].expression.left,app,'progress.value');assert(ts.isArrayLiteralExpression(bs[3].expression.right));eq(bs[5].expression.left,app,'status.value');assert(ts.isStringLiteral(bs[5].expression.right));assert(ts.isIfStatement(bs[6]));eq(bs[6].expression,app,"'relayer' in q");eq(bs[6].thenStatement.expression,app,'await submitRelayerWithdrawal(q, sessionSettings.value!, update)');eq(bs[6].elseStatement.expression,app,'await submitWithdrawal(q, sessionSettings.value!, update)');
record(app,send,'caller.send',{startedGuardBeforeAdapter:true,captureQuoteBeforeAwait:true,markStartedBeforeAdapter:true,instructions:['if_started_throw','if_no_quote_throw','capture_quote','initialize_progress','mark_started','set_status','dispatch_one_adapter_and_suspend']});
const writes=[];for(const n of all(app,n=>ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken)){
 const lhs=n.left.getText(app);if(!['quote.value','sessionSettings.value','started.value'].some(x=>lhs.startsWith(x)))continue;
 let owner=n.parent;while(owner&&!ts.isFunctionDeclaration(owner))owner=owner.parent;
 writes.push({target:lhs,owner:owner?.name?.text??'module',line:app.getLineAndCharacterOfPosition(n.getStart(app)).line+1,source:n.getText(app)});
}
assert.deepEqual(writes.filter(x=>x.target.startsWith('quote.value')).map(x=>x.owner),['startNewDepositSession','reviewWithdrawal','switchTo4337']);
assert(!writes.some(x=>x.target.startsWith('quote.value.')));assert(!writes.some(x=>x.target.startsWith('sessionSettings.value.')));
const sensitive=new Set(['chainId','noteInput','recipient','withdrawalRoute','bundler','endpoint','rpcUrl','useSaga','sagaUrls[chainId]','useRemoteArtifacts','artifactsUrl']);
const controls=[];function walkTemplate(n){if(n.type===1){const model=n.props.find(p=>p.type===7&&p.name==='model');if(model&&sensitive.has(model.exp.content)){const dis=n.props.find(p=>p.type===7&&p.name==='bind'&&p.arg?.content==='disabled');assert(dis?.exp?.content.split(/\s*\|\|\s*/).includes('busy'));controls.push({tag:n.tag,model:model.exp.content,disabled:dis.exp.content,line:n.loc.start.line})}}for(const c of n.children??[])walkTemplate(c)}walkTemplate(baseParse(parseSFC(appSrc).descriptor.template.content));
for(const m of sensitive)assert(controls.some(x=>x.model===m),'Missing disabled input '+m);
const settings=one(app,n=>ts.isVariableDeclaration(n)&&n.name.getText(app)==='settings','settings');const settingsReturn=one(settings,n=>ts.isReturnStatement(n),'settings return');assert(ts.isObjectLiteralExpression(settingsReturn.expression));record(app,settingsReturn,'caller.settingsFreshObject',true);
const report={schemaVersion:1,assurance:'Source-specific AST shape checks and manually audited correspondence; not a verified translator for arbitrary async code.',sourceHashes:Object.fromEntries(used),sdkFacts:facts.filter(x=>!x.id.startsWith('caller.')),callerFacts:facts.filter(x=>x.id.startsWith('caller.')),writers:writes,disabledControls:controls,
 symbolicParameters:{nullifierBytes:slices.nullifierBytes,saltBytes:slices.saltBytes,publicArgs:output,gasCaps,feeNumerator:12,feeDenominator:10}};
writeFileSync(root+'artifacts/continuation/source-facts.json',JSON.stringify(report,null,2)+'\n');
console.log(`Source facts: ${facts.length} checked mappings, ${writes.length} caller writes, ${controls.length} disabled intent controls`);
