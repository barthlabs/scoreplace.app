#!/usr/bin/env node
/* Compila os domínios TypeScript que alimentam o browser legado.
 *
 * `--check` não escreve: ele garante que o JavaScript servido em js/domain/ foi gerado
 * exatamente da fonte tipada. Assim não existem duas verdades para uma mesma regra.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');
const entries = [{ source: 'src/domain/round-bounds.ts', output: 'js/domain/round-bounds.js' }];
let failures = 0;

function compile(entry) {
  const sourcePath = path.join(ROOT, entry.source);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    ignoreDeprecations: '6.0',
    strict: true,
    noEmitOnError: true,
    removeComments: false,
    newLine: ts.NewLineKind.LineFeed,
  };
  const host = ts.createCompilerHost(options);
  host.writeFile = () => {};
  const program = ts.createProgram([sourcePath], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    failures += 1;
    console.error('✗ ' + entry.source + ' não passa no TypeScript estrito:');
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
    return;
  }
  const emitted = ts.transpileModule(source, { compilerOptions: options, fileName: sourcePath }).outputText;
  const header = '/* GERADO de ' + entry.source + ' por scripts/build-domain.js. Não editar. */\n';
  const output = header + emitted;
  const outputPath = path.join(ROOT, entry.output);
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
  if (CHECK) {
    if (current !== output) {
      failures += 1;
      console.error('✗ ' + entry.output + ' diverge de ' + entry.source + '. Rode: node scripts/build-domain.js');
    } else console.log('✓ ' + entry.output + ' corresponde à fonte tipada');
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  console.log('✓ ' + entry.output + ' gerado de ' + entry.source);
}

entries.forEach(compile);
process.exit(failures ? 1 : 0);
