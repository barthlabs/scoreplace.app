/* O NOME DO CACHE DO SERVICE WORKER ACOMPANHA A VERSÃO  (2.0.126)
 * node tests/sw-cache-name-acompanha-a-versao.test.js
 *
 * ⛔ MEDIDO em 26/ago/2026: `CACHE_NAME` estava em 'scoreplace-v2.0.92' com o app na 2.0.125.
 * `git log -S "CACHE_NAME = 'scoreplace"` devolvia UM commit — o que criou o arquivo. Nunca
 * foi bumpado, não havia script que o bumpasse e não havia trava que conferisse — apesar de o
 * próprio sw.js comentar, como premissa, que ele "muda a cada versão".
 *
 * ⭐ O ESTRAGO É ESPECÍFICO DO PWA, e foi assim que apareceu: o dono abriu o Confra no PWA do
 * Safari e viu "0 INSCRITOS" e "você não está inscrito" — sendo ele o organizador — enquanto
 * no desktop estava tudo normal. O banco estava CERTO (resumo com 148, documento coerente).
 * A causa: `/index.html` é o ÚNICO arquivo servido sem `?v=`, então casa EXATO no cache e vem
 * do velho — trazendo junto os `?v=` antigos de TODOS os scripts. O aparelho fica preso numa
 * versão anterior à do desktop, e a diferença aparece como DADO ERRADO na tela.
 *
 * ⚠️ Não é o `?v=` que falha: ele funciona justamente por ser comparado com a query. É o
 * index.html, que não tem query nenhuma, que escapa — e é ele que decide todos os outros.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── o cache do SW acompanha a versão ────');

const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ver = (store.match(/SCOREPLACE_VERSION\s*=\s*'([^']+)'/) || [])[1];
const cache = (sw.match(/var CACHE_NAME = 'scoreplace-v([^']+)';/) || [])[1];

ok('a versão do app é legível', !!ver, 'sem ela nada aqui vale');
ok('o CACHE_NAME é legível', !!cache);
ok('⛔ CACHE_NAME == versão do app',
  ver && cache && ver === cache,
  'app=' + ver + '  cache=' + cache + '\n      ' +
  'index.html é o único arquivo sem `?v=`: cache velho ⇒ o PWA carrega o index ANTIGO e, ' +
  'com ele, os `?v=` antigos de todos os scripts. O aparelho fica atrás do desktop.');

// ── e quem faz o bump é o prerender, que roda em TODO deploy ──────────────────
const pre = fs.readFileSync(path.join(ROOT, 'tools/prerender-landing.js'), 'utf8');
ok('⭐ o prerender sincroniza o CACHE_NAME (à mão já falhou por 33 versões)',
  /CACHE_NAME = 'scoreplace-v/.test(pre) && /sw\.js/.test(pre));
ok('  → no MESMO ponto em que gera o version.txt (o passo que nunca fica stale)',
  pre.indexOf("version.txt") < pre.indexOf("CACHE_NAME = 'scoreplace-v"));

// ── o version.txt segue sendo o árbitro, e nunca vem do cache ────────────────
ok('⛔ o SW NUNCA serve version.txt do cache (senão o app diz "estou atualizado" com a cópia velha)',
  /version\.txt/.test(sw) && /if \(url\.indexOf\('\/version\.txt'\) !== -1\) return;/.test(sw));

console.log(falhas === 0 ? '\n✅ sw-cache-name-acompanha-a-versao: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
