/* O HISTÓRICO NÃO PERDE EVENTO QUANDO A POSIÇÃO COLIDE
 * node tests/historico-remonta-pelo-tempo.test.js
 *
 * ⛔ ESTE É O PRÉ-REQUISITO PRO `history` SAIR DO DOCUMENTO. Estava escrito como "o
 * próximo passo" em functions-autodraw/index.js: _"`history` NÃO pode entrar em
 * `_semPesados` enquanto o leitor (`_montaDeSubcolecoes` → `remontar`) ainda ordenar por
 * `_idx`"_.
 *
 * POR QUE, em uma frase: `_idx` é a POSIÇÃO do evento no array do documento, e a PODA
 * muda posição. A poda está LIGADA (`TETO_HIST = 120 → ALVO_HIST = 80`) e o Confra estava
 * em 105 eventos, ao vivo — 15 da primeira poda. Depois dela o documento volta a 80 e os
 * eventos seguintes nascem com `_idx` que o espelho JÁ USOU; `a[Number(x._idx)]` grava um
 * por cima do outro e o log perde linhas SEM ERRO NENHUM.
 *
 * ⛔ A PRIMEIRA TENTATIVA FOI ORDENAR POR `date`, E ELA FOI REPROVADA AQUI.
 * Parecia óbvia (a própria `chaveDoEvento` deriva de `date`) e a medição do dia apoiava:
 * 0 eventos fora de ordem na base atual. Mas a fixture do Confra tem **3 eventos fora de
 * ordem cronológica** e **2 sem `date`** — o log é um append de vários caminhos, não um
 * relógio. Ordenar por tempo os reordenava, e reordenar um log de auditoria é tão ruim
 * quanto perdê-lo.
 * ⚠️ A LIÇÃO: _"a base de hoje não tem essa anomalia"_ ≠ _"essa anomalia não existe"_.
 * A fixture guardava o contra-exemplo, e é por isso que a suíte roda contra ela.
 *
 * ⭐ A REGRA QUE FICOU: preservar a ordem GRAVADA (`_idx` crescente) e emitir DENSO.
 * Colisão de índice vira ADJACÊNCIA em vez de sobrescrita — nenhum evento é engolido, e
 * pra log não podado o resultado é o array original byte a byte.
 * ⛔ O que ela NÃO resolve, dito na cara: depois de MUITAS podas a ordem ENTRE levas pode
 * não ser perfeitamente cronológica. Ordem imperfeita se recupera olhando a data do
 * evento; evento comido não se recupera. A correção definitiva é o espelho gravar uma
 * SEQUÊNCIA monotônica em vez da posição — é mudança de ESCRITA, e vem depois.
 *
 * CONTROLE (o que fica vermelho na regra antiga): com `a[_idx]`, o cenário pós-poda de 4
 * eventos devolve 2 — metade do log, engolida em silêncio. É a asserção ⑤.
 */
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));

let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (obtido: ' + JSON.stringify(a) + ')'); }

console.log('\n① A ida e volta continua idêntica — com as anomalias REAIS da base');
// ⛔ inclui evento FORA DE ORDEM cronológica: a fixture do Confra tem 3 deles, e foi esse
// contra-exemplo que reprovou a primeira tentativa (ordenar por `date`).
const t = { id: 'T', name: 'X', rounds: [], history: [
  { date: '2026-08-01T10:00:00Z', message: 'a' },
  { message: 'sem data no meio' },
  { date: '2026-08-01T12:00:00Z', message: 'c' },
  { date: '2026-08-01T12:00:00Z', message: 'd — data repetida' },
  { message: 'outro sem data' },
  { date: '2026-08-01T13:00:00Z', message: 'f' },
  { date: '2026-05-01T09:00:00Z', message: 'g — FORA de ordem, data antiga no fim' }
] };
const p = S.dividir(JSON.parse(JSON.stringify(t)), ['history']);
const volta = S.remontar({ config: p.config, history: p.history });
eq(volta.history, t.history, 'remontar(dividir(t)).history === t.history');
eq(volta.history.map((h) => h.message),
   ['a', 'sem data no meio', 'c', 'd — data repetida', 'outro sem data', 'f',
    'g — FORA de ordem, data antiga no fim'],
   'e a ORDEM GRAVADA é preservada — nem o sem-data nem o fora-de-ordem se movem');

console.log('\n② Evento sem data no PRIMEIRO lugar não quebra');
const t2 = { id: 'T', rounds: [], history: [
  { message: 'sem data logo no início' },
  { date: '2026-08-01T10:00:00Z', message: 'b' }
] };
const p2 = S.dividir(JSON.parse(JSON.stringify(t2)), ['history']);
eq(S.remontar({ config: p2.config, history: p2.history }).history, t2.history,
   'ida e volta idêntica mesmo sem nenhuma data anterior pra herdar');

console.log('\n③ O CENÁRIO DA PODA: `_idx` repetido não come evento');
// Depois da poda o documento reinicia as posições; o espelho (que só cresce) acumula as
// duas levas com `_idx` colidindo. É este o caso que perdia log.
const espelho = [
  { _idx: 0, item: { date: '2026-08-01T10:00:00Z', message: 'antigo-0' } },
  { _idx: 1, item: { date: '2026-08-01T11:00:00Z', message: 'antigo-1' } },
  { _idx: 0, item: { date: '2026-08-02T10:00:00Z', message: 'pos-poda-0' } },
  { _idx: 1, item: { date: '2026-08-02T11:00:00Z', message: 'pos-poda-1' } }
];
const r = S.remontar({ config: { id: 'T', rounds: [] }, history: espelho });
eq(r.history.length, 4, 'os QUATRO eventos sobrevivem (nenhum sobrescrito)');
eq(r.history.map((h) => h.message).sort(), ['antigo-0', 'antigo-1', 'pos-poda-0', 'pos-poda-1'].sort(),
   'e nenhum sumiu — colisão de índice virou adjacência, não sobrescrita');

console.log('\n④ O array sai DENSO — buraco viraria undefined no meio do log');
const esparso = [
  { _idx: 0, item: { date: '2026-08-01T10:00:00Z', message: 'p' } },
  { _idx: 7, item: { date: '2026-08-01T11:00:00Z', message: 'q' } }
];
const r4 = S.remontar({ config: { id: 'T', rounds: [] }, history: esparso });
eq(r4.history.length, 2, 'dois eventos viram um array de DOIS, não de oito');
ok(r4.history.every((h) => h && h.message), 'e nenhum item é undefined');

console.log('\n⑤ CONTROLE: a regra antiga (posicional) perdia metade do log');
const antiga = [];
espelho.forEach((x) => { antiga[Number(x._idx)] = x.item; });
ok(antiga.length === 2,
   'a[_idx] devolve 2 de 4 — é a perda silenciosa que esta suíte existe pra impedir');
ok(r.history.length > antiga.length,
   'e a regra nova preserva estritamente mais que ela');

console.log(falhas === 0
  ? '\n✅ a poda não come mais log — colisão de índice não sobrescreve evento\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
