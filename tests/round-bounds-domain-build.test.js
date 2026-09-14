/* A regra de prazo nasce TypeScript, mas o app atual a recebe como script clássico.
 * Esta trava impede tanto a deriva do arquivo gerado quanto uma dependência acidental de
 * DOM/window dentro do domínio que também precisará servir futuros consumidores de servidor. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (condition, message) => { if (condition) pass += 1; else { fail += 1; console.error('  ✗', message); } };

console.log('──── domínio tipado de limites das rodadas ────');
try {
  execFileSync(process.execPath, ['scripts/build-domain.js', '--check'], { cwd: ROOT, stdio: 'pipe' });
  ok(true, '① JavaScript servido corresponde exatamente à fonte TypeScript');
} catch (error) {
  ok(false, '① JavaScript servido diverge da fonte TypeScript: ' + String(error.stderr || error.message));
}

const source = fs.readFileSync(path.join(ROOT, 'src/domain/round-bounds.ts'), 'utf8');
const implementation = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
ok(!/\bwindow\b|\bdocument\b|Firestore/.test(implementation),
  '② domínio não depende de browser, DOM ou Firestore');

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(index.indexOf('js/domain/round-bounds.js') < index.indexOf('js/views/round-bounds-core.js'),
  '③ domínio carrega antes da ponte legada no shell servido');

const domain = require(path.join(ROOT, 'js/domain/round-bounds.js'));
const start = domain.toMillis('2026-09-02T11:17');
const end = domain.toMillis('2026-11-12T23:00');
const equal = domain.equalBounds(start, end, 6);
ok(domain.normalise(equal, start, end, 6) && equal.length === 5,
  '④ contrato CommonJS usa a mesma regra de normalização da ponte do browser');
ok(domain.labelLanes([{ left: 0, right: 12 }, { left: 9, right: 20 }, { left: 25, right: 35 }]).join(',') === '0,1,0',
  '⑤ empilhamento de rótulos permanece puro e determinístico');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
