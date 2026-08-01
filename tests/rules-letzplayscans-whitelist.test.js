/* O cliente não pode gravar campo que as regras não conhecem — node tests/rules-letzplayscans-whitelist.test.js
 *
 * INCIDENTE 31/jul/2026 (v1.6.64→66): o parcial passou a gravar `lzCursorParcial` e
 * `totaisLetzplay`. A whitelist do firestore.rules não foi junto. Resultado: TODA escrita
 * em letzplayScans virou permission-denied (31 eventos no Sentry) e — pior — a barra
 * continuou subindo, porque o progresso vem da extensão e não da confirmação da escrita.
 * "está dando falha ao gravar histórico e mentindo que está avançando."
 *
 * Este teste lê os campos que o app REALMENTE grava e exige que as regras os aceitem.
 */
const path = require('path'), fs = require('fs');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');

const bloco = rules.slice(rules.lastIndexOf('match /letzplayScans/{scanUid}'));
const lista = (bloco.match(/hasOnly\(\[([^\]]+)\]\)/) || [])[1] || '';
const permitidos = lista.split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
ok(permitidos.length > 0, 'achei a whitelist das regras (' + permitidos.length + ' campos)');

// tudo que o app escreve no doc: `doc.<campo> =` e as chaves do literal inicial
const escritos = new Set();
(app.match(/\bdoc\.([a-zA-Z][a-zA-Z0-9_]*)\s*=/g) || []).forEach(m => escritos.add(m.slice(4).split(/\s*=/)[0]));
const lit = app.slice(app.indexOf('var doc = {'), app.indexOf('var doc = {') + 700);
(lit.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*:/gm) || []).forEach(m => escritos.add(m.trim().replace(':', '')));

console.log('\n── todo campo escrito precisa estar na whitelist ──');
[...escritos].sort().forEach(c => {
  ok(permitidos.indexOf(c) >= 0, 'regras aceitam `' + c + '`');
});
ok(escritos.has('lzCursorParcial') && escritos.has('totaisLetzplay'),
   'os dois campos do incidente estão de fato entre os escritos (o teste não passa por vacuidade)');

console.log('\n── e a tela não pode dizer que avançou quando a escrita falhou ──');
ok(/_lzGravouOk = false/.test(app), 'uma escrita rejeitada marca que NÃO gravou');
ok(/nada foi gravado/.test(app), 'e a tela diz isso com todas as letras');

console.log((fail ? '✗' : '✓') + ' rules-letzplayscans-whitelist: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
