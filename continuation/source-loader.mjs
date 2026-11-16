import ts from 'typescript';
import { createRequire } from 'node:module';
import {readFileSync} from 'node:fs';
import { posix } from 'node:path';
import { pinned, root } from '../pilot/source-runtime.mjs';
import * as sdkViem from 'sdk-viem';
import * as sdkAccounts from 'sdk-viem/accounts';
import * as sdkAA from 'sdk-viem/account-abstraction';
import * as sdkUtils from 'sdk-viem/utils';
import * as toolkit from '@reduxjs/toolkit';
import * as curveUtils from '@noble/curves/utils.js';
import * as sha3 from '@noble/hashes/sha3.js';
import * as pedersen from 'micro-zk-proofs/pedersen.js';
const require = createRequire(import.meta.url);
const native = {'viem':sdkViem,'viem/accounts':sdkAccounts,'viem/account-abstraction':sdkAA,'viem/utils':sdkUtils,
  '@reduxjs/toolkit':toolkit,'@noble/curves/utils.js':curveUtils,'@noble/hashes/sha3.js':sha3,'micro-zk-proofs/pedersen.js':pedersen};
export const loadedSources = new Set();
export function compileModule(source, filename, dependencies, globals={}) {
  const js = ts.transpileModule(source, { fileName:filename, compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true });
  if(js.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error)) throw Error('Transpile failed: '+filename);
  const module={exports:{}};
  const req = name => { if(!Object.hasOwn(dependencies,name)) throw Error(`Unmodelled import ${name} in ${filename}`); return dependencies[name] };
  new Function('require','module','exports',...Object.keys(globals),js.outputText)(req,module,module.exports,...Object.values(globals));
  return module.exports;
}
export function sdkLoader(overrides={},globals={}) {
  const cache=new Map();
  function load(path) {
    path=path.replace(/\.ts$/,'')+'.ts';
    if(Object.hasOwn(overrides,path)) return overrides[path];
    if(cache.has(path)) return cache.get(path);
    const source=pinned('sdk',path); loadedSources.add('sdk/'+path);
    const file=ts.createSourceFile(path,source,ts.ScriptTarget.ESNext,true);
    // Ask the pinned TS transpiler which runtime imports survive type erasure.
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const names=[...js.matchAll(/require\("([^"\n]+)"\)/g)].map(m=>m[1]);
    const deps={};
    for(const name of names) {
      if(Object.hasOwn(overrides,name)) deps[name]=overrides[name];
      else if(native[name]) deps[name]=native[name];
      else if(name.startsWith('.')) deps[name]=load(posix.normalize(posix.join(posix.dirname(path),name)));
      else throw Error('Unmodelled SDK dependency: '+name+' from '+path);
    }
    const result=compileModule(source,path,deps,globals); cache.set(path,result); return result;
  }
  return load;
}
export function capturedMethod(path, name, bindings) {
  const source=pinned('sdk',path), file=ts.createSourceFile(path,source,ts.ScriptTarget.ESNext,true);
  const found=[]; const visit=n=>{if(ts.isMethodDeclaration(n)&&n.name?.getText(file)===name)found.push(n); ts.forEachChild(n,visit)}; visit(file);
  if(found.length!==1)throw Error('Expected one captured method '+name);
  const text=found[0].getText(file).replace(/^async\s+/, 'async function ');
  const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  loadedSources.add('sdk/'+path+'#'+name);
  return new Function(...Object.keys(bindings),js+`; return ${name};`)(...Object.values(bindings));
}
export const dependencyVersions=Object.fromEntries(['typescript','viem','sdk-viem','vue','@vue/compiler-sfc','@reduxjs/toolkit','micro-zk-proofs','@noble/curves','@noble/hashes'].map(name=>[name,JSON.parse(readFileSync(root+'node_modules/'+name+'/package.json')).version]));
export {root, pinned, sdkViem, sdkAccounts, sdkAA, toolkit, ts};
