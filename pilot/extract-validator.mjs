import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export const hash = data => createHash('sha256').update(data).digest('hex');

// Small, fail-closed translator for THIS straight-line validator. No evaluation
// of imports, generated code or unrecognised statements is permitted.
export function extractValidator(source) {
  const file = ts.createSourceFile('withdrawals.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  if (file.parseDiagnostics.length) throw new Error('TypeScript parse diagnostics');
  const fn = file.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'validateWithdrawal');
  if (!fn?.body || fn.parameters.map(p => p.name.getText(file)).join(',') !== 'note,recipient,withdrawal,settings') throw new Error('Unexpected validator signature');
  const fail = n => { throw new Error(`Unsupported ${ts.SyntaxKind[n.kind]}: ${n.getText(file)}`); };
  function expr(n) {
    if (ts.isParenthesizedExpression(n)) return expr(n.expression);
    if (ts.isIdentifier(n)) return n.text === 'undefined' ? ['undefined'] : ['var', n.text];
    if (ts.isStringLiteral(n)) return ['string', n.text];
    if (ts.isNumericLiteral(n)) return ['number', n.text];
    if (ts.isBigIntLiteral(n)) return ['bigint', n.text.slice(0, -1)];
    if (n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword) return ['boolean', n.kind === ts.SyntaxKind.TrueKeyword];
    if (ts.isPropertyAccessExpression(n)) return ['get', expr(n.expression), n.name.text, !!n.questionDotToken];
    if (ts.isElementAccessExpression(n)) return ['index', expr(n.expression), expr(n.argumentExpression)];
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.getText(file);
      if (!['===', '!==', '&&', '||', '<=', '>=', '<', '>', '-', '+'].includes(op)) return fail(n);
      return ['binary', op, expr(n.left), expr(n.right)];
    }
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) return ['not', expr(n.operand)];
    if (ts.isArrayLiteralExpression(n)) return ['array', ...n.elements.map(expr)];
    if (ts.isObjectLiteralExpression(n)) return ['object', ...n.properties.map(p => {
      if (ts.isShorthandPropertyAssignment(p)) return [p.name.text, ['var', p.name.text]];
      return fail(p);
    })];
    if (ts.isCallExpression(n)) {
      if (ts.isIdentifier(n.expression) && ['BigInt', 'Boolean', 'Number', 'decodeAbiParameters', 'parseAbiParameters'].includes(n.expression.text)) return ['call', n.expression.text, ...n.arguments.map(expr)];
      if (ts.isPropertyAccessExpression(n.expression) && ['toLowerCase', 'includes'].includes(n.expression.name.text)) return ['method', n.expression.name.text, expr(n.expression.expression), !!n.expression.questionDotToken, ...n.arguments.map(expr)];
      return fail(n);
    }
    return fail(n);
  }
  const statements = fn.body.statements.map(s => {
    const line = file.getLineAndCharacterOfPosition(s.getStart(file)).line + 1;
    if (ts.isVariableStatement(s) && s.declarationList.flags & ts.NodeFlags.Const && s.declarationList.declarations.length === 1) {
      const d = s.declarationList.declarations[0];
      let name;
      if (ts.isIdentifier(d.name)) name = d.name.text;
      else if (ts.isArrayBindingPattern(d.name) && d.name.elements.length === 1 && ts.isBindingElement(d.name.elements[0]) && ts.isIdentifier(d.name.elements[0].name)) name = [d.name.elements[0].name.text];
      else return fail(d);
      if (!d.initializer) return fail(d);
      return { kind: 'const', name, expr: expr(d.initializer), line };
    }
    if (ts.isIfStatement(s) && !s.elseStatement && ts.isThrowStatement(s.thenStatement)) {
      const e = s.thenStatement.expression;
      if (!ts.isNewExpression(e) || e.expression.getText(file) !== 'Error' || e.arguments?.length !== 1 || !ts.isStringLiteral(e.arguments[0])) return fail(e);
      return { kind: 'guard', rejectIf: expr(s.expression), message: e.arguments[0].text, line };
    }
    if (ts.isReturnStatement(s) && s.expression) return { kind: 'return', expr: expr(s.expression), line };
    return fail(s);
  });
  if (statements.filter(s => s.kind === 'return').length !== 1 || statements.at(-1).kind !== 'return') throw new Error('Expected one final return');
  return { schemaVersion: 1, sourceHash: hash(source), functionHash: hash(fn.getText(file)), firstLine: file.getLineAndCharacterOfPosition(fn.getStart(file)).line + 1,
    functionSource: fn.getText(file), statements };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = readFileSync(root + 'baseline/ui/src/core/withdrawals.ts', 'utf8');
  const manifest = JSON.parse(readFileSync(root + 'baseline/manifest.json'));
  const pinned = manifest.files.find(r => r.namespace === 'ui' && r.path === 'src/core/withdrawals.ts');
  if (hash(source) !== pinned.sha256) throw new Error('Frozen source no longer matches its manifest');
  const ir = extractValidator(source);
  mkdirSync(root + 'artifacts',{recursive:true});
  writeFileSync(root + 'artifacts/validator-ir.json', JSON.stringify(ir, null, 2) + '\n');
  console.log(`Extracted release validator: ${ir.statements.filter(s => s.kind === 'guard').length} rejection guards; SHA-256 ${ir.functionHash}`);
}
