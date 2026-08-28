/* QUEM GRAVA REPINTA — O ECO NÃO É A ÚNICA PONTE
 * node tests/gravou-repinta-a-tela.test.js
 *
 * RELATO DO DONO (28/ago/2026), lançando a final do torneio de teste: "tive que lançar de
 * novo" e depois "só não desenhou o pódium".
 *
 * ⭐ O DADO ESTAVA CERTO — medido no banco na hora: torneio `finished`, `finishedAt`
 * gravado, as duas cópias do jogo concordando. E o `renderBracket`, rodado no harness
 * contra esse mesmo dado, PRODUZ o pódio (🥇🥈🥉 no HTML). Ou seja: o estado chegou e a
 * TELA não redesenhou.
 *
 * A CAUSA: `applyMatchResult` recebia o torneio de volta da CF, copiava por cima do local
 * — e confiava no eco do `onSnapshot` pra repintar. O eco atravessa DOIS portões:
 *   1. `_suppressSoftRefresh` (ligado por outros caminhos, com timeout);
 *   2. o gate de assinatura (`_tdetailSig`).
 * Qualquer um que engula o eco deixa a tela no estado de ANTES do placar. E o gate é o
 * mais traiçoeiro: a cópia do servidor JÁ adiantou o objeto local, então o gate compara o
 * estado novo com ele mesmo e conclui "nada mudou".
 *
 * ⚠️ POR QUE A FINAL É O PIOR CASO: o placar do próprio jogo ainda aparece pela mutação
 * in-place do card. Mas `status: finished` é mudança ESTRUTURAL — o pódio só nasce num
 * render inteiro. Sem repintura, ele nunca aparece, por mais que se espere.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const i = src.indexOf('Sincroniza o local com o que o servidor gravou');
ok(i > 0, 'achei o ponto em que a resposta da CF é aplicada no local');
const bloco = _R.ateSairDoBloco(src, i);

console.log('\n① Gravou ⇒ repinta, sem depender do eco');
ok(/_softRefreshView\(\)/.test(bloco),
   '⛔ o caminho de sucesso REPINTA — antes só copiava e esperava o onSnapshot');
ok(/window\._suppressSoftRefresh = false/.test(bloco),
   'e solta a trava de supressão: ela cala eco ALHEIO, não a minha própria gravação');
ok(/window\._tdetailSig = null/.test(bloco),
   '⛔ e zera a assinatura — senão o gate compara o estado novo com ele mesmo (a cópia já o adiantou)');

console.log('\n② Só repinta a tela DAQUELE torneio');
ok(/#tournaments\/' \+ String\(tournamentId\)/.test(bloco),
   'confere o hash antes: lançar placar de um torneio não redesenha a tela de outro');

console.log('\n③ A repintura nunca derruba o placar já gravado');
ok(/catch \(_eR\)/.test(bloco), 'o bloco é best-effort — falhar ao repintar não desfaz a gravação');
ok(bloco.indexOf('_saveToCache') < bloco.indexOf('_softRefreshView'),
   'e ela vem DEPOIS de persistir o cache, não antes');

console.log(falhas === 0
  ? '\n✅ quem grava repinta — o eco virou redundância, não a única ponte\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
