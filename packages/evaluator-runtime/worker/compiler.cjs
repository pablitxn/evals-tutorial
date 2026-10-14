'use strict';
const ts = require('/opt/typescript/lib/typescript.js');
const fs = require('node:fs');
const path = require('node:path');
const sdk = fs.readFileSync('/opt/worker/sdk.d.ts', 'utf8');
const allowed = new Set(['@evals-tutorial/contracts', '@evals-tutorial/contracts/services']);

exports.compile = function compile(source) {
  const original = ts.createSourceFile('/evaluator.ts', source, ts.ScriptTarget.ES2022, true);
  const diagnostics = [];
  const evaluator = original.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'evaluate');
  function diagnostic(pos, code, message) {
    const mapped = pos >= source.length && evaluator?.name ? evaluator.name.getStart(original) : Math.min(pos, source.length);
    const location = original.getLineAndCharacterOfPosition(mapped);
    diagnostics.push({ file: 'evaluator.ts', line: location.line + 1, column: location.character + 1, code: String(code), severity: 'error', message: message.slice(0, 4000) });
  }
  function inspect(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typesOnly = clause?.isTypeOnly || (named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every(item => item.isTypeOnly) && !clause.name);
      if (!typesOnly || !allowed.has(node.moduleSpecifier.text)) diagnostic(node.getStart(original), 'import_forbidden', 'Only type imports from the two tutorial SDK entries are allowed.');
    }
    if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal) || !allowed.has(node.argument.literal.text)) diagnostic(node.getStart(original), 'import_forbidden', 'Type queries must use the tutorial SDK.');
    }
    if (ts.isImportEqualsDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')))) diagnostic(node.getStart(original), 'import_forbidden', 'Runtime module loading and re-exports are unavailable.');
    if (ts.isIdentifier(node) && ['process', 'fetch', 'WebSocket', 'Deno', 'Bun', 'require'].includes(node.text)) diagnostic(node.getStart(original), 'global_forbidden', 'Host and networking APIs are unavailable.');
    ts.forEachChild(node, inspect);
  }
  inspect(original);
  if (original.typeReferenceDirectives.length || original.referencedFiles.length || original.libReferenceDirectives.length) diagnostic(0, 'reference_forbidden', 'Compiler reference directives are unavailable.');
  const suffix = '\nconst __tutorial_evaluate_check: import("@evals-tutorial/contracts/services").Evaluator = evaluate;\n';
  const virtual = new Map([['/evaluator.ts', source + suffix], ['/sdk.d.ts', sdk]]);
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, strict: true, noUncheckedIndexedAccess: true, types: [], lib: ['lib.es2022.d.ts'], skipLibCheck: false, noEmitOnError: true };
  const host = ts.createCompilerHost(options);
  const libRoot = '/opt/typescript/lib/';
  const read = file => virtual.get(file) ?? (file.startsWith(libRoot) && /^lib\.[a-z0-9.]+\.d\.ts$/.test(path.basename(file)) ? fs.readFileSync(file, 'utf8') : undefined);
  host.readFile = read;
  host.fileExists = file => virtual.has(file) || (file.startsWith(libRoot) && /^lib\.[a-z0-9.]+\.d\.ts$/.test(path.basename(file)) && fs.existsSync(file));
  host.getSourceFile = (file, version) => { const text = read(file); return text === undefined ? undefined : ts.createSourceFile(file, text, version, true); };
  host.resolveModuleNames = names => names.map(name => allowed.has(name) ? { resolvedFileName: '/sdk.d.ts', extension: ts.Extension.Dts } : undefined);
  host.getCurrentDirectory = () => '/';
  let javascript;
  host.writeFile = (name, text) => { if (name.endsWith('evaluator.js')) javascript = text; };
  const program = ts.createProgram(['/evaluator.ts', '/sdk.d.ts'], options, host);
  for (const item of ts.getPreEmitDiagnostics(program)) {
    if (item.file && item.file.fileName !== '/evaluator.ts') continue;
    diagnostic(Math.min(item.start ?? 0, source.length), item.code, ts.flattenDiagnosticMessageText(item.messageText, '\n'));
  }
  const file = program.getSourceFile('/evaluator.ts');
  const symbol = file && program.getTypeChecker().getSymbolAtLocation(file);
  if (!symbol || !program.getTypeChecker().getExportsOfModule(symbol).some(item => item.name === 'evaluate')) diagnostic(0, 'missing_evaluate', 'Export an evaluate(row, ctx) function returning Promise<EvalResult>.');
  if (!diagnostics.length) program.emit();
  return { valid: diagnostics.length === 0 && typeof javascript === 'string', diagnostics: diagnostics.slice(0, 100), ...(diagnostics.length ? {} : { javascript }) };
};
