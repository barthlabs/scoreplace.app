/* A PREVISÃO CONTA TIMES — E O JOGO DE 3º LUGAR
 * node tests/previsao-conta-times-e-o-terceiro-lugar.test.js
 *
 * RELATO DO DONO (28/ago/2026), com print da caixa "Estimativa de duração":
 *   _"e de onde 8 part / 4 duplas daria 7 jogos caralho? dá 4 jogos porra"_
 * e, em seguida, o que isso estraga de verdade:
 *   _"o que está errado é a estimativa de TEMPO considerando o número errado de jogos"_.
 *
 * ⭐ MEDIDO no torneio dele (tour_1787954731771): `teamSize:2`, `format:'Eliminatórias
 * Simples'`, `elimThirdPlace:true`, 8 inscritos individuais. A caixa dizia 7 jogos — a
 * conta de uma chave de OITO competidores.
 *
 * DUAS CAUSAS, somadas:
 *  ① A unidade competitiva caía no fallback "nº de ENTRADAS". `_diagnoseAll` conta as
 *     duplas JÁ FORMADAS, e antes do sorteio não há nenhuma — então 8 pessoas viravam 8
 *     competidores em vez de 4 times. Num torneio individual entrada = competidor e estava
 *     certo; num de duplas, não.
 *  ② `calcMatches` devolvia `n-1` com o comentário "(sem 3o lugar)". Com a disputa de 3º
 *     ligada — o padrão do dono — a chave de 4 tem QUATRO jogos, não três. O jogo existe,
 *     ocupa quadra e entra no tempo total.
 *
 * ⛔ E o estrago não é o rótulo: `estimateDuration` recebe a MESMA unidade. Errar o número
 * de competidores erra a previsão do dia inteiro — que é para o que a caixa serve.
 * [[project_previsao_conta_o_torneio_inteiro]]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-categories.js'), 'utf8');

// ── ① a fórmula de jogos, extraída e EXECUTADA (não varredura de texto) ───────────
const i = src.indexOf('function calcMatches(n, fmt) {');
const fim = src.indexOf('\n  }', src.indexOf("return n - 1; // fallback", i)) + 4;
ok(i > 0 && fim > i, 'achei calcMatches no fonte');
const corpo = src.slice(i, fim);
const mk = new Function('t', 'window', corpo + ' return calcMatches;');

console.log('\n① Eliminatória de 4 times COM disputa de 3º (o caso do print)');
const com3 = mk({ elimThirdPlace: true }, {});
ok(com3(4, 'Eliminatórias Simples') === 4,
   '⛔ 4 times → 4 jogos (2 semis + final + 3º) — got ' + com3(4, 'Eliminatórias Simples'));
ok(com3(8, 'Eliminatórias Simples') === 8, '8 times → 8 jogos — got ' + com3(8, 'Eliminatórias Simples'));

console.log('\n② A disputa de 3º NÃO depende de flag nenhuma');
/* Ordem do dono: _"não existe razão motivo ou circunstância para a disputa do 3º lugar ser
 * ignorada"_. O código concorda — create-tournament.js: "elimThirdPlace is always true — no
 * toggle needed". Ler a flag só criava um jeito de o jogo sumir da conta: torneio antigo sem
 * o campo gravado perderia o 3º em silêncio. Aqui o torneio vem SEM o campo, de propósito. */
const sem3 = mk({}, {});
ok(sem3(4, 'Eliminatórias Simples') === 4,
   '⛔ torneio sem o campo gravado TAMBÉM conta o 3º — got ' + sem3(4, 'Eliminatórias Simples'));
ok(com3(3, 'Eliminatórias Simples') === 2,
   '⛔ com 3 competidores não há 3º lugar (faltam dois perdedores de semi) — got ' + com3(3, 'Eliminatórias Simples'));
ok(com3(2, 'Eliminatórias Simples') === 1, 'e com 2 é só a final — got ' + com3(2, 'Eliminatórias Simples'));

// ── ③ a UNIDADE: 8 pessoas num torneio de duplas são 4 times ─────────────────────
console.log('\n③ A unidade competitiva respeita o teamSize');
const j = src.indexOf('var _ts = Math.max(1, Number(t.teamSize) || 1);');
ok(j > 0, 'a queda passa a olhar o teamSize');
const bloco = src.slice(j, src.indexOf('var realCount = 0;', j));
const unidade = new Function('t', 'parts', 'var unitCount = parts.length;' + bloco + ' return unitCount;');
ok(unidade({ teamSize: 2 }, new Array(8).fill({ name: 'x' })) === 4,
   '⛔ 8 inscritos individuais em torneio de duplas → 4 times — got ' +
   unidade({ teamSize: 2 }, new Array(8).fill({ name: 'x' })));
ok(unidade({ teamSize: 1 }, new Array(8).fill({ name: 'x' })) === 8,
   'e num torneio INDIVIDUAL continuam 8 — a queda antiga estava certa lá');
const mistos = [{ p1Name: 'a', p2Name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }];
ok(unidade({ teamSize: 2 }, mistos) === 2,
   'dupla já formada conta 1, e o resto se agrupa de 2 em 2 → 1+1 = 2 — got ' + unidade({ teamSize: 2 }, mistos));

console.log(falhas === 0
  ? '\n✅ a previsão conta COMPETIDORES e todos os jogos que serão jogados\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
