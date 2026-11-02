/* As TRÊS LEIS de um jogo — node tests/jogo-so-com-placar.test.js
 *
 * REPRODUZ O BUG REAL de 01/ago/2026. O dono abriu a ficha da Lucia Helena Silva Cerri na
 * Análise de Inscritos e viu "🎾 Jogos 10" — com cards sem placar, cards com "—" no lugar
 * do adversário, um card em que ELA era a própria adversária, e jogos de SANDBOX:
 *   _"apenas os jogos com placar foram efetivamente jogados… para todos os atletas. sempre."_
 *   _"tem jogos dela sem parceiros ou sem adversários. isso não pode ocorrer… é da NOSSA base."_
 *   _"SB não pode gerar estatística. para ninguém."_
 *
 * OS DOCS ABAIXO SÃO DE PRODUÇÃO, copiados do banco em 01/ago/2026 via
 *   collectionGroup('results').where('playerUids','array-contains','ZPkdce6t1Eh5eGIFC0iTMjkU1ph1')
 * São exatamente os 10 que a tela contou. Só 2 são jogo.
 *
 * O QUE O CÓDIGO ANTIGO FAZIA (e este teste proíbe):
 *   • `p1Uids`/`p2Uids` NUNCA existiram no doc de placar (o subdoc guarda o resultado; a
 *     estrutura mora no torneio), então o lado caía sempre no `meu = 0` — a Lucia aparecia
 *     como adversária dela mesma e um 6×1 dela virava derrota.
 *   • doc sem placar entrava na lista: `seedMatchResultDocs` cria um doc por jogo LOGO APÓS
 *     O SORTEIO. Jogo sorteado não é jogo jogado.
 *   • sandbox entrava: apagar o doc do torneio NÃO apaga a subcoleção `results`, então o
 *     placar do SB sobrevive ÓRFÃO e responde à consulta por uid. 6 dos 10 eram assim.
 *
 * Ver project_game_counts_only_with_score_partner_opponent, project_sandbox_tournament.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { window, load, sandbox } = require('./headless.js');

// `_isSandboxRef` é o cinto contra SB e mora em js/store.js (fonte única, compartilhada com
// as notificações). store.js inteiro não roda no harness, então injetamos A FUNÇÃO REAL,
// extraída do arquivo — nada de reescrever uma segunda cópia aqui (que é o bug que a
// canonização mata).
const _storeSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const _m = _storeSrc.match(/window\._isSandboxRef = function[\s\S]*?\n};/);
if (!_m) { console.error('✗ não achei window._isSandboxRef em js/store.js'); process.exit(1); }
vm.runInContext(_m[0], sandbox, { filename: 'store._isSandboxRef.js' });
const _logicSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-logic.js'), 'utf8');
const _slotFn = _logicSrc.match(/function _slotUids\(m, side\) \{[\s\S]*?\n\}/);
if (!_slotFn) { console.error('✗ não achei _slotUids em bracket-logic.js'); process.exit(1); }
vm.runInContext('window._slotUids = ' + _slotFn[0] + ';', sandbox, { filename: 'bracket-logic._slotUids.js' });
const _posFn = _logicSrc.match(/function _slotUidsPositional\(m, side, t\) \{[\s\S]*?\n\}/);
if (!_posFn) { console.error('✗ não achei _slotUidsPositional em bracket-logic.js'); process.exit(1); }
vm.runInContext('window._slotUidsPositional = ' + _posFn[0] + ';', sandbox,
  { filename: 'bracket-logic._slotUidsPositional.js' });

load('bracket-model.js');
load('tournaments-enrollment-report.js');
const item = window._lzItemDeResult;

const UID = 'ZPkdce6t1Eh5eGIFC0iTMjkU1ph1';
const EU = 'Lucia Helena Silva Cerri';

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

// ── OS 10 DOCS REAIS ──────────────────────────────────────────────────────────
const PROD = [
  // 1) JOGO DE VERDADE — ela é p1 (com o Fernando), perdeu de 5×6.
  { matchId: 'upper-r2-1-1784985078281', tournamentId: 'tour_1781996342871',
    tournamentName: 'Torneio de Férias só Casais', roundLabel: 'Rodada 2',
    p1: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri', p2: 'Gabriela Ferreira / Luiz Felipe Abreu',
    scoreP1: 5, scoreP2: 6, winner: 'Gabriela Ferreira / Luiz Felipe Abreu', draw: false, playerUids: [UID] },
  // 2) JOGO DE VERDADE — ela é p1 (com o Adriano), perdeu de 5×6.
  { matchId: 'p0-1784380503882-3', tournamentId: 'tour_1783511910924',
    tournamentName: 'Duplas Mistas Sorteadas',
    p1: 'Lucia Helena Silva Cerri / Adriano', p2: 'Carolina Moresco / Leila',
    scoreP1: 5, scoreP2: 6, winner: 'Carolina Moresco / Leila', draw: false, playerUids: [UID] },
  // 3-10) SANDBOX (torneios `_sb`, todos JÁ APAGADOS — os results ficaram órfãos).
  { matchId: 'p0-1784661662814-0', tournamentId: 'tour_1784660138198_sb', tournamentName: '(SB) Confra BT',
    p1: 'Arnaldo / Luciana Marinho', p2: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri',
    scoreP1: 6, scoreP2: 5, winner: 'Arnaldo / Luciana Marinho', playerUids: [UID] },
  { matchId: 'p0-1784731782589-rep2', tournamentId: 'tour_1784727218055_sb',
    scoreP1: 6, scoreP2: 3, winner: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri', playerUids: [UID] },
  { matchId: 'p0-1784731782589-upper-1-1784731782595', tournamentId: 'tour_1784727218055_sb', tournamentName: '(SB) x',
    p1: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri', p2: 'Catia Cavedon / Max Mano', playerUids: [UID] },
  { matchId: 'p0-1784734390796-rep4', tournamentId: 'tour_1784727218055_sb',
    scoreP1: 6, scoreP2: 1, winner: 'Eduardo Mange / Ciça Mange', playerUids: [UID] },
  { matchId: 'p0-lj-1784734422489-lower-r1-9-1784734422489', tournamentId: 'tour_1784727218055_sb', tournamentName: '(SB) x',
    p1: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri', p2: 'Mari Telles / Marcos Telles', playerUids: [UID] },
  { matchId: 'p0-1784835551183-repsat', tournamentId: 'tour_1784833628631_sb', tournamentName: '(SB) Torneio de Férias só Casais',
    p1: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri', p2: 'Betsy Emma Betsabe Blasco / Adriano',
    scoreP1: 6, scoreP2: 2, winner: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri', playerUids: [UID] },
  { matchId: 'p0-1784835551183-upper-2-1784835551191', tournamentId: 'tour_1784833628631_sb', tournamentName: '(SB) Torneio de Férias só Casais',
    p1: 'MARCIA TERZI / Luiza Ruic', p2: 'FERNANDO CARLOS CERRI / Lucia Helena Silva Cerri', playerUids: [UID] },
  { matchId: 'ph-tour_1785146858717_sb-1-gold-VC-R1-P4', tournamentId: 'tour_1785146858717_sb', tournamentName: '(SB) Hellen Open',
    p1: 'Daniela / Monica Rossi', p2: 'Paulinha / Lucia Helena Silva Cerri',
    scoreP1: 6, scoreP2: 4, winner: 'Daniela / Monica Rossi', playerUids: [UID] },
];

console.log('\n▸ A ficha da Lucia: resultados legados sem UID de lado não atribuem V/D');
eq(PROD.map(function (r) { return item(r, UID, EU); }).filter(Boolean).length, 0,
  'os 10 espelhos antigos não provam o lado pelo nome');
const fisicos = PROD.map(function (r, i) {
  return i < 2 ? Object.assign({}, r, {
    team1Uids: i === 0 ? ['parceiro-0', UID] : [UID, 'parceiro-1'],
    team2Uids: ['adversaria-' + i, 'adversario-' + i]
  }) : r;
});
const itens = fisicos.map(function (r) { return item(r, UID, EU); }).filter(Boolean);
eq(itens.length, 2, 'os dois jogos físicos com UID dos lados entram; os sandboxes ficam fora');
eq(itens[0].partner, 'FERNANDO CARLOS CERRI', 'jogo 1: parceiro resolvido (era sempre null)');
eq(itens[0].opponent, 'Gabriela Ferreira / Luiz Felipe Abreu', 'jogo 1: adversário (era "—")');
eq(itens[0].result, 'D', 'jogo 1: derrota (5×6)');
eq(itens[0].scoreA + 'x' + itens[0].scoreB, '5x6', 'jogo 1: placar do lado dela primeiro');
eq(itens[1].partner, 'Adriano', 'jogo 2: parceiro resolvido');
eq(itens[1].opponent, 'Carolina Moresco / Leila', 'jogo 2: adversário');
ok(itens.every(function (i) { return !/_sb$/.test(String(i.tournamentId)); }), 'nenhum item veio de sandbox');

console.log('▸ LEI 1 — sem placar não aconteceu');
// mesmo doc de estrutura, agora num torneio NORMAL: continua fora (a lei não é sobre SB).
eq(item({ matchId: 'm1', tournamentId: 'tour_normal', tournamentName: 'Confra',
  p1: 'Lucia Helena Silva Cerri / X', p2: 'A / B', playerUids: [UID] }, UID, EU), null,
  'jogo sorteado e não jogado (sem scoreP1/scoreP2) não entra');
eq(item({ matchId: 'm2', tournamentId: 'tour_normal', p1: 'Lucia Helena Silva Cerri / X', p2: 'A / B',
  scoreP1: 6, scoreP2: null, playerUids: [UID] }, UID, EU), null,
  'placar de um lado só não é placar');
ok(item({ matchId: 'm3', tournamentId: 'tour_normal', p1: 'Lucia Helena Silva Cerri / X', p2: 'A / B',
  scoreP1: 0, scoreP2: 6, winner: 'A / B', playerUids: [UID],
  team1Uids: [UID, 'x'], team2Uids: ['a', 'b'] }, UID, EU) != null,
  'zero É placar (0×6 é jogo jogado, não é ausência de dado)');

console.log('▸ LEI 2 — sempre parceiro e adversário');
eq(item({ matchId: 'm4', tournamentId: 'tour_normal', scoreP1: 6, scoreP2: 1,
  winner: 'Eduardo / Ciça', playerUids: [UID] }, UID, EU), null,
  'doc sem os dois lados e sem estrutura pra recuperar → fora (era o card com "—")');
// … mas quando a ESTRUTURA do torneio está carregada, os nomes SÃO nossos: recupera.
window._findTournamentById = function (id) {
  return (id === 'tour_estrut') ? { id: 'tour_estrut', name: 'Confra', sport: 'Beach Tennis', matches: [
    { id: 'm5', p1: 'Lucia Helena Silva Cerri / Nelson', p2: 'Kelly / Rodrigo' }
  ] } : null;
};
window._collectAllMatches = function (t) { return (t && t.matches) || []; };
const rec = item({ matchId: 'm5', tournamentId: 'tour_estrut', scoreP1: 6, scoreP2: 1,
  winner: 'Lucia Helena Silva Cerri / Nelson', playerUids: [UID],
  team1Uids: [UID, 'nelson'], team2Uids: ['kelly', 'rodrigo'] }, UID, EU);
ok(rec != null, 'doc sem p1/p2 é RECUPERADO da estrutura do torneio (o dado é nosso)');
eq(rec && rec.partner, 'Nelson', 'parceiro recuperado da estrutura');
eq(rec && rec.opponent, 'Kelly / Rodrigo', 'adversário recuperado da estrutura');
eq(rec && rec.competition, 'Confra', 'nome do torneio recuperado da estrutura');

console.log('▸ LEI 2b — o LADO sai do dado, não do chute (ela nunca é adversária dela mesma)');
const p2side = item({ matchId: 'm6', tournamentId: 'tour_normal', tournamentName: 'Hellen Open',
  p1: 'Daniela / Monica Rossi', p2: 'Paulinha / Lucia Helena Silva Cerri',
  scoreP1: 6, scoreP2: 4, winner: 'Daniela / Monica Rossi', playerUids: [UID],
  team1Uids: ['daniela', 'monica'], team2Uids: ['paulinha', UID] }, UID, EU);
eq(p2side.opponent, 'Daniela / Monica Rossi', 'ela está em p2 → adversário é p1 (o antigo devolvia ela mesma)');
eq(p2side.partner, 'Paulinha', 'parceira do lado dela');
eq(p2side.scoreA + 'x' + p2side.scoreB, '4x6', 'placar orientado pelo lado dela');
eq(p2side.result, 'D', 'derrota');
// e a vitória que o código antigo pintava de derrota (winner batia com um p1 indefinido)
const vit = item({ matchId: 'm7', tournamentId: 'tour_normal', p1: 'A / B',
  p2: 'Lucia Helena Silva Cerri / C', scoreP1: 1, scoreP2: 6,
  winner: 'Lucia Helena Silva Cerri / C', playerUids: [UID],
  team1Uids: ['a', 'b'], team2Uids: [UID, 'c'] }, UID, EU);
eq(vit.result, 'V', '6×1 dela é VITÓRIA (o antigo pintava de derrota)');
// sem saber de que lado jogou, o card mentiria → não existe
eq(item({ matchId: 'm8', tournamentId: 'tour_normal', p1: 'A / B', p2: 'C / D',
  scoreP1: 6, scoreP2: 1, winner: 'A / B', playerUids: [UID] }, UID, EU), null,
  'nome não bate em nenhum dos lados → fora (melhor nada que um card mentindo)');
eq(item({ matchId: 'm9', tournamentId: 'tour_normal', p1: EU + ' / X', p2: EU + ' / Y',
  scoreP1: 6, scoreP2: 1, winner: EU + ' / X', playerUids: [UID],
  team1Uids: ['outro', 'x'], team2Uids: [UID, 'y'] }, UID, EU).scoreA, '1',
  'homônimos nos dois lados: UID determina o lado, mesmo com nome idêntico');
eq(item({ matchId: 'm10', tournamentId: 'tour_normal', p1: EU + ' / X', p2: 'Y / Z',
  scoreP1: 6, scoreP2: 1, winner: EU + ' / X', playerUids: [UID],
  team1Uids: [UID, 'x'], team2Uids: [UID, 'z'] }, UID, EU), null,
  'UID duplicado nos dois lados não gera resultado pessoal');
eq(item({ matchId: 'm11', tournamentId: 'tour_normal', p1: 'A / B', p2: EU + ' / C',
  scoreP1: 1, scoreP2: 6, winner: 'A / B', winnerUids: [UID, 'c'], playerUids: [UID],
  team1Uids: ['a', 'b'], team2Uids: [UID, 'c'] }, UID, EU).result, 'V',
  'UID do vencedor prevalece sobre rótulo antigo do vencedor');
eq(item({ matchId: 'm12', tournamentId: 'tour_normal', p1: 'A / B',
  p2: 'Ana Maria / Ana Silva', scoreP1: 1, scoreP2: 6,
  winner: 'Ana Maria / Ana Silva', playerUids: [UID],
  team1Uids: ['a', 'b'], team2Uids: ['ana-maria', UID] }, UID, 'Ana').partner, 'Ana Maria',
  'parceira homônima vem da posição do UID, não da comparação de nomes');
eq(item({ matchId: 'm13', tournamentId: 'tour_normal', p1: 'A / B',
  p2: 'Ana Maria / Ana Silva', scoreP1: 1, scoreP2: 6,
  winner: 'Ana Maria / Ana Silva', playerUids: [UID],
  team1Uids: ['a', 'b'], p2Uid: UID }, UID, 'Ana').partner, null,
  'sem posição comprovada, parceiro fica vazio em vez de atribuição inventada');

console.log('▸ LEI 3 — SB nunca, por qualquer um dos 3 sinais');
eq(item({ matchId: 'x', tournamentId: 'tour_1_sb', p1: EU + ' / X', p2: 'A / B',
  scoreP1: 6, scoreP2: 1, winner: EU + ' / X', playerUids: [UID] }, UID, EU), null, 'id terminado em _sb');
eq(item({ matchId: 'x', tournamentId: 'tour_2', tournamentName: '(SB) Confra', p1: EU + ' / X', p2: 'A / B',
  scoreP1: 6, scoreP2: 1, winner: EU + ' / X', playerUids: [UID] }, UID, EU), null, 'nome prefixado com (SB)');
window._findTournamentById = function (id) { return (id === 'tour_3') ? { id: 'tour_3', isSandbox: true } : null; };
eq(item({ matchId: 'x', tournamentId: 'tour_3', p1: EU + ' / X', p2: 'A / B',
  scoreP1: 6, scoreP2: 1, winner: EU + ' / X', playerUids: [UID] }, UID, EU), null, 'doc carregado com isSandbox');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
