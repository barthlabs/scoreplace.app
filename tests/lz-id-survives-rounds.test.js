/* O lzId atravessa as rodadas — node tests/lz-id-survives-rounds.test.js
 * MEDIDO em 31/jul/2026 no doc da Kelly, depois de uma leitura correta com o motor novo:
 *   users/{uid}.letzplayImport  → 157 jogos, 0 sem lzId   (leitura em UMA rodada)
 *   letzplayScans/{uid}         → 157 jogos, 157 SEM lzId (leitura RETOMADA)
 * A diferença era `_gamesToMatches`, que reconstrói os jogos gravados pra dentro da rodada
 * seguinte e não copiava o id. A prova de "motor novo" evaporava sozinha e o nome dela
 * ficava violeta depois de uma leitura que deu certo.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// roda a função de verdade, isolada
const i = src.indexOf('function _gamesToMatches(games)');
const j = src.indexOf('function slimRankingStandings');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(i, j) + '\nthis.__f = _gamesToMatches;', ctx);
const g2m = ctx.__f;

const gravados = [
  { lzId: '10004859', date: 'Quarta, 29/07/26', competition: 'Fem C', club: 'paineiras-bt',
    rankingId: '55291', official: false, myScore: 6, oppScore: 3, won: true,
    oppHandles: ['a', 'b'], oppNames: ['Ana', 'Bia'], partnerHandle: 'k' },
  { date: 'Terça, 28/07/26', competition: 'Fem C', club: 'x', official: true, tourneyId: '11',
    myScore: 4, oppScore: 6, won: false, oppHandles: ['c'], oppNames: ['Cris'] }  // legado, sem id
];
const ms = g2m(gravados);
ok(ms.length === 2, 'converte todos os jogos');
ok(ms[0].lzId === '10004859', 'o id do letzplay ATRAVESSA a conversão (era isto que sumia)');
ok(ms[1].lzId === null, 'jogo legado sem id continua sem id — nada é inventado');
ok(ms[0].date === 'Quarta, 29/07/26' && ms[0].myScore === 6, 'o resto do jogo continua íntegro');
ok(ms[0].oppNames.join('/') === 'Ana/Bia', 'e os adversários também');

// a chave de dedup usa o id — sem ele, a mesma partida vira duas
const k = src.indexOf('function _gameKey');
const ctx2 = {}; vm.createContext(ctx2);
vm.runInContext(src.slice(k, src.indexOf('\n', src.indexOf('}', k + 200))) + '\nthis.__k = _gameKey;', ctx2);
if (ctx2.__k) {
  ok(ctx2.__k({ lzId: '77' }) === 'lz77', 'a identidade da partida é o id do letzplay');
  ok(ctx2.__k(ms[0]) === 'lz10004859', 'e o jogo reconstruído mantém essa identidade');
}

// ── partialReason: NULL explícito, porque merge preserva o que não vem ──
ok(/else imp\.partialReason = null;/.test(src),
  'ao fechar, o partialReason vai como NULL (delete não apaga em set com merge:true)');
ok(!/delete imp\.partialReason/.test(src), 'e o delete que não funcionava saiu');

console.log((fail ? '✗' : '✓') + ' lz-id-survives-rounds: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
