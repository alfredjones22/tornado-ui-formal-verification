import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as viem from 'viem';
import { Point, pedersenHash } from 'micro-zk-proofs/pedersen.js';
export const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(root + 'baseline/manifest.json'));
export function pinned(namespace, path) {
  const data = readFileSync(`${root}baseline/${namespace}/${path}`, 'utf8');
  const expected = manifest.files.find(f => f.namespace === namespace && f.path === path)?.sha256;
  if (createHash('sha256').update(data).digest('hex') !== expected) throw new Error(`Unpinned input ${namespace}/${path}`);
  return data;
}
export const source = pinned('ui', 'src/core/withdrawals.ts');
export function functionText(text, names) {
  const f = ts.createSourceFile('f.ts', text, ts.ScriptTarget.ESNext, true);
  const picked = f.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  if (picked.length !== names.length) throw new Error('Missing requested function');
  return picked.map(n => n.getText(f).replace(/^export\s+/, '')).join('\n');
}
function variableText(text, name) {
  const file = ts.createSourceFile('variables.ts', text, ts.ScriptTarget.ESNext, true);
  const picked = file.statements.find(statement => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name));
  if (!picked) throw new Error(`Missing requested variable ${name}`);
  return picked.getText(file).replace(/^export\s+/, '');
}
function compile(text, names, bindings) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true });
  if (js.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error('Transpile diagnostics');
  return new Function(...Object.keys(bindings), '"use strict";\n' + js.outputText + '\nreturn {' + names.join(',') + '};')(...Object.values(bindings));
}
// Load only the captured SDK configuration, never import live SDK source.
const configSource = pinned('sdk', 'src/config.ts');
const cfgFile = ts.createSourceFile('config.ts', configSource, ts.ScriptTarget.ESNext, true);
const cfgStatement = cfgFile.statements.find(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(cfgFile) === 'TornadoPaymasterConfigs'));
if (!cfgStatement) throw new Error('Missing pinned SDK config');
export const { TornadoPaymasterConfigs } = compile(cfgStatement.getText(cfgFile).replace(/^export\s+/, ''), ['TornadoPaymasterConfigs'], {});
const batchPolicy = pinned('ui', 'src/core/batch-policy.ts');
export const { noteIdentity } = compile(functionText(batchPolicy, ['noteIdentity']), ['noteIdentity'], { ...viem, Point, pedersenHash });
export const { confirmationEvents } = compile(variableText(source, 'confirmationEvents'), ['confirmationEvents'], viem);
export function runtime(overrides = {}) {
  const names = ['validateWithdrawal', 'prepareInFrame', 'reconcileBasicWithdrawal', 'submitWithdrawal'];
  const bindings = { ...viem, TornadoPaymasterConfigs, noteIdentity, confirmationEvents,
    basicWithdrawalHash: () => '0x' + 'aa'.repeat(32), publicHistory: new Map(), ...overrides };
  return compile(functionText(source, names), names, bindings);
}
export function fixture(chainId = 1, token = false, amount = 10n**18n, fee = 1000n) {
  const cfg = TornadoPaymasterConfigs[chainId];
  const recipient = '0x1111111111111111111111111111111111111111';
  const poolAddress = cfg.supportedPools[token ? cfg.supportedPools.length-1 : 0];
  const preimage = 'ab'.repeat(62), symbol = token ? (chainId === 1 ? 'WBTC' : 'DAI') : 'ETH';
  const note = { raw: `tornado-${symbol.toLowerCase()}-1-${chainId}-0x${preimage}`, preimage,
    pool: { address: poolAddress, amount, chainId, denomination: '1', asset: { symbol, ...(token ? { token: '0x3333333333333333333333333333333333333333' } : {}) } } };
  const proof = { proof: '0x1234', args: [viem.toHex(1n, { size: 32 }), viem.toHex(noteIdentity(note).nullifierHash, { size: 32 }), recipient, cfg.paymasterAddress, viem.toHex(fee), '0x0'] };
  const withdrawal = { mode: 'paymaster', proof, poolAddress: BigInt(poolAddress), isERC20: token,
    paymasterAddress: cfg.paymasterAddress, entryPointAddress: cfg.entryPointAddress, bundlerUrl: 'https://bundler.invalid/',
    withdrawnValue: amount, gasEstimation: { status: 'estimated' }, userOperation: {
      sender: '0x2222222222222222222222222222222222222222', nonce: '0x0', callData: '0x', callGasLimit: '0x0',
      eip7702Auth: { chainId: viem.toHex(chainId) }, signature: '0x1234', paymaster: cfg.paymasterAddress,
      paymasterData: viem.encodeAbiParameters(viem.parseAbiParameters('(address instance, bytes proof, bytes32 root, bytes32 nullifierHash, address recipient, uint256 fee)'),
        [{ instance: poolAddress, proof: proof.proof, root: proof.args[0], nullifierHash: proof.args[1], recipient, fee }]) } };
  const settings = { chainId, rpcUrl: 'https://rpc.invalid/', bundler: 'custom', bundlerUrl: withdrawal.bundlerUrl };
  return { note, recipient, withdrawal, settings, quote: { id: 'synthetic-public-fixture', note, recipient, withdrawal, fee, net: amount-fee, quotedAt: Date.now() } };
}
