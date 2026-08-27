/* A BUSCA ABRE O "MOSTRAR MAIS", E O "IR PARA O TORNEIO" TAMBÉM  (2.1.4)
 * node tests/busca-abre-o-mostrar-mais.test.js
 *
 * Ordem do dono (26/ago/2026): _"quando clicarmos no ir para o torneio no novidades deve ir
 * para o torneio com o mostrar mais aberto parando direto no topo do grupo onde clicamos.
 * a mesma coisa deve acontecer quando filtrarmos uma informação: deve aparecer a informacao
 * sem precisarmos clicar no mostrar mais."_
 *
 * ⛔ O QUE ESTAVA ERRADO: o filtro já REVELAVA o `<details>` (tirava o `display:none` do
 * container), mas ele seguia FECHADO. O resultado existia, o contador dizia "(1)" — e não
 * se via nada. **Achar sem mostrar é não achar** (mesma lição da 2.0.91). E quem chegava
 * pelo "Ir para o torneio" parava no topo de uma seção fechada: meia resposta.
 *
 * ⚠️ POR QUE A DECISÃO VIROU FUNÇÃO PURA: não há DOM de verdade nos testes deste repo
 * (sem jsdom). Fabricar um DOM falso grande o bastante pra rodar `_bracketApplyFilter`
 * inteiro daria um teste VERDE que não exercita quase nada — o erro clássico de fixture no
 * formato que o código já sabe ler. Então o que pode errar de verdade — a CONTABILIDADE de
 * quem foi aberto pela busca — foi extraído em `_fbSyncDetalhe`, que é testável de verdade;
 * a fiação fica coberta por asserção de fonte. É uma escolha, e está declarada.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── a busca abre o mostrar mais ────');

const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');

/* ── ① a decisão, exercitada de verdade ───────────────────────────────────── */
const ini = src.indexOf('window._fbSyncDetalhe = function');
ok('⭐ `_fbSyncDetalhe` existe', ini > 0);
global.window = {};
// eslint-disable-next-line no-eval
eval(src.slice(ini, src.indexOf('\n};', ini) + 3));
const sync = global.window._fbSyncDetalhe;

const det = (aberto, auto) => ({ open: aberto, dataset: auto ? { fbAutoOpen: '1' } : {} });

let d = det(false, false);
sync(d, 2, true);
ok('⭐⭐ buscando e com resultado dentro → ABRE', d.open === true);
ok('  → e marca que foi a busca que abriu', d.dataset.fbAutoOpen === '1');

d = det(false, false);
sync(d, 0, true);
ok('⛔ buscando e SEM resultado dentro → continua fechado', d.open === false);
ok('  → e não marca nada', d.dataset.fbAutoOpen === undefined);

d = det(true, false);            // a PESSOA abriu com a própria mão
sync(d, 3, true);
ok('⛔ já estava aberto pela pessoa → não se apropria dele', d.dataset.fbAutoOpen === undefined);
sync(d, 0, false);
ok('⭐⭐ busca limpa NÃO fecha o que a pessoa abriu', d.open === true);

d = det(false, false);
sync(d, 2, true);
sync(d, 0, false);
ok('⭐⭐ busca limpa fecha o que a BUSCA abriu', d.open === false);
ok('  → e limpa a marca (senão fecharia de novo na próxima)', d.dataset.fbAutoOpen === undefined);

ok('⛔ elemento nulo não explode', (function () { try { sync(null, 1, true); return true; } catch (e) { return false; } })());

/* ── ② a fiação: os dois pontos usam o helper ─────────────────────────────── */
const usos = (src.match(/_fbSyncDetalhe\(/g) || []).length;
ok('⭐ o helper é USADO (definição + os dois pontos do filtro)', usos >= 2,
  'achei ' + usos + ' uso(s) — se for 0, a decisão está duplicada solta de novo');

/* ── ③ "Ir para o torneio" abre a seção do grupo alvo ─────────────────────── */
const iAlvo = src.indexOf("sessionStorage.getItem('sp_scrollToGroup')");
ok('⭐ achei o consumo do `sp_scrollToGroup`', iAlvo > 0);
const bloco = src.slice(iAlvo, src.indexOf('// 2) O SEU GRUPO', iAlvo));
ok('⭐⭐ ao achar o grupo pedido, o `<details>` dele é ABERTO',
  /querySelectorAll\('details'\)/.test(bloco) && /\.open = true/.test(bloco),
  'sem isto a pessoa para no topo de uma seção fechada — meia resposta');

console.log(falhas === 0 ? '\n✅ busca-abre-o-mostrar-mais: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
