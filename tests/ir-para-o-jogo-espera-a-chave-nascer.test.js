'use strict';
/* ⛔ "AINDA NÃO EXISTE" NÃO É "DESISTIR".
 * Relato do dono (12/set/2026, pela terceira vez): _"ao clicar no ir para o torneio tem que ir
 * para o jogo na chave que está referenciado… e não simplesmente abrir a chave e ficar no topo"_.
 * O id do jogo viajava (2.2.71), a busca montava a chave sob demanda (2.2.77) — e mesmo assim
 * caía no topo. A causa estava no LAÇO que corrige a posição: `if (!_el) return;` matava o laço
 * na PRIMEIRA volta. Ele começa 220ms depois da rota, e a chave de um torneio DIVIDIDO ainda
 * está baixando as partes nesse instante: o card do jogo pedido não existe, o laço morria, e
 * ninguém mais rolava. Na segunda visita (tudo em cache) funcionava — o "às vezes vai".
 * [[project_lancar_placar_nao_move_a_chave]] · [[feedback_montagem_preguicosa_mata_o_clique]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const BRK = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const ini = BRK.indexOf('    var _reafirmar = function () {');
const fim = BRK.indexOf('      setTimeout(_tick, 220);', ini);
assert.ok(ini > 0 && fim > ini, 'âncoras do laço de reafirmação');
const laco = BRK.slice(ini, fim);
/* ⛔ comparar CÓDIGO, não comentário: o próprio comentário CITA o padrão antigo pra explicar
 * o defeito, e isso faria a trava acusar a explicação em vez do código. */
const codigo = laco.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① o laço ESPERA o alvo nascer ───────────────────────────────────────────
must(!/if \(!_el\) return;/.test(codigo),
  '① ⛔ o `if (!_el) return;` — que matava o laço na primeira volta — não existe mais');
must(/if \(!_el\) \{[\s\S]{0,600}setTimeout\(_tick, 100\)/.test(codigo),
  '① ⭐ alvo ausente REAGENDA: o pedido sobrevive até o card aparecer');

// ── ② esperar e corrigir têm contadores SEPARADOS ───────────────────────────
must(/_voltas = 0, _esperas = 0/.test(codigo), '② há dois contadores: um de espera, outro de correção');
must(/_esperas < 60/.test(codigo), '② a espera tem ~6s de paciência (torneio dividido baixa as partes)');
must(/_voltas--;/.test(codigo),
  '② ⛔ e a volta gasta esperando NÃO conta como correção — senão a espera comeria o orçamento de posicionar');
must(/_voltas < 30/.test(codigo), '② a correção segue com o teto de ~3s de sempre');

// ── ③ a chave de sessão só sai no FIM — e sai ───────────────────────────────
const saidas = (laco.match(/removeItem\('sp_scrollToGroup'\)/g) || []).length;
must(saidas === 2, '③ o pedido é consumido nos DOIS fins: quando posiciona e quando a paciência acaba (' + saidas + ')');
must(laco.indexOf("removeItem('sp_scrollToMatch')") > 0, '③ e o jogo pedido sai junto do grupo');

// ── ④ o resto da corrente continua de pé ────────────────────────────────────
must(/window\._travaRolagemDaChave/.test(laco),
  '④ ⛔ lançar placar continua parando o laço na hora — a rolagem de entrada nunca briga com o dedo');
const _aIni = BRK.indexOf('function _alvoDeEntrada() {');
const alvo = BRK.slice(_aIni, BRK.indexOf('\n  var _p = null;', _aIni));
must(/_chaveMontaTudo\(document\)/.test(alvo), '④ e a chave segue sendo montada sob demanda pra achar o card pedido');
must(/getElementById\('card-' \+ String\(_pm\)\)/.test(alvo), '④ pelo id que o card carrega (`card-<id do jogo>`)');

console.log('✅ ' + ok + ' asserções — o laço espera a chave nascer antes de desistir do jogo pedido');
