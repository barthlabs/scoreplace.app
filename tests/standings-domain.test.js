'use strict';
/* Contrato tipado da classificação - node tests/standings-domain.test.js */
const fs = require('fs');
const path = require('path');
const D = require('../js/domain/standings.js');
const C = require('../js/views/standings-core.js');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(value, message) { if (value) pass++; else { fail++; console.error('  x ' + message); } }
const line = (uid, extra) => Object.assign({ uid, name: uid, points: 3, wins: 1, played: 2, setsWon: 1, setsLost: 1, gamesWon: 10, gamesLost: 10, tiebreaksWon: 0, tiebreaksLost: 0, tbPointsWon: 0, tbPointsLost: 0, pointsFor: 10, pointsAgainst: 10, winRate: .5 }, extra || {});

const source = fs.readFileSync(path.join(ROOT, 'src/domain/standings.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/\b(window|document|localStorage|firebase)\s*[.[]/.test(source), 'domínio não depende de browser, cache ou Firestore');
ok(fs.readFileSync(path.join(ROOT, 'js/domain/standings.js'), 'utf8').includes('GERADO de src/domain/standings.ts'), 'browser executa JavaScript gerado da fonte tipada');
ok(typeof D.standingsCompareConfig === 'function' && typeof D.buildH2H === 'function', 'contrato exporta comparador e confronto direto');

const A = line('uA', { wins: 3, gamesWon: 11, gamesLost: 10 });
const B = line('uB', { wins: 1, gamesWon: 20, gamesLost: 10 });
ok(D.standingsCompareConfig(A, B, { tiebreakers: ['vitorias', 'saldo_games'] }) < 0, 'a ordem configurada de critérios é preservada');
ok(D.standingsCompareConfig(A, B, { tiebreakers: ['saldo_games', 'vitorias'] }) > 0, 'mudar a ordem configurada muda quem fica à frente');
ok(D.standingsCompare(A, B) < 0, 'cadeia padrão mantém vitórias antes de saldo de games');
const G1 = line('g1', {points: 1, wins: 3, gamesWon: 12, gamesLost: 8});
const G2 = line('g2', {points: 9, wins: 2, gamesWon: 15, gamesLost: 11});
ok(D.standingsCompareConfig(G1,G2,{primaryField:'games_diff',tiebreakers:['vitorias','games_vencidos']}) < 0,
  'saldo de games é principal e vitória desempata antes de games vencidos');
ok(D.standingsCompareConfig(G1,G2,{primaryField:'points',tiebreakers:['vitorias','games_vencidos']}) > 0,
  'pontos continuam principais quando selecionados');
ok(D.standingsCompareConfig(line('x',{gamesWon:NaN,gamesLost:undefined}),line('y',{gamesWon:0,gamesLost:0}),{primaryField:'games_diff',tiebreakers:['games_vencidos']}) === 0,
  'games ausentes ou inválidos são zero e o desempate é determinístico');
const live = require('./render-harness').sandbox;
const threeMatches = [['A','B',6,5],['A','C',6,5],['B','C',6,0]].map(([a,b,sa,sb],i) => ({
  id:'rank-'+i,team1:[a],team2:[b],p1:a,p2:b,winner:a,scoreP1:sa,scoreP2:sb,sets:[{gamesP1:sa,gamesP2:sb}]
}));
const group = {players:['A','B','C'],matches:threeMatches};
ok(live._computeMonarchStandings(group,{tiebreakers:['vitorias']})[0].name === 'A' &&
  live._computeMonarchStandings(group,{rankingPrimary:'games_diff',tiebreakers:['vitorias']})[0].name === 'B',
  'motor real escolhe pontos ou saldo de games conforme configuração persistida');
const editor = fs.readFileSync(path.join(ROOT,'js/views/create-tournament.js'),'utf8');
const server = fs.readFileSync(path.join(ROOT,'functions-autodraw/index.js'),'utf8');
ok(editor.includes("tourData.rankingPrimary = rankingPrimaryEl") && editor.includes("_rankingPrimaryEl.value = t.rankingPrimary") &&
  server.includes("'phase1Name','rankingPrimary','tiebreakers'"),
  'editor carrega e salva a escolha e o servidor aceita o campo declarativo');

const matches = [{ winner: 'Ana', team1Uids: ['uA'], team2Uids: ['uB'], sets: [{ tiebreak: { pointsP1: 7, pointsP2: 5 } }] }];
const slots = (match, side) => side === 'p1' ? match.team1Uids : match.team2Uids;
const h2h = D.buildH2H(matches, slots, () => 1);
ok(h2h['uA|||uB'] === 1, 'confronto direto recebe a regra de vencedor por injeção');
ok(D.standingsCompareConfig(line('uA'), line('uB'), { tiebreakers: ['confronto_direto'], h2h }) < 0, 'comparador consome o mapa de confronto direto por uid');
const tb = D.tiebreakPointsOfMatch(matches[0], (set) => ({ p1: set.tiebreak.pointsP1, p2: set.tiebreak.pointsP2 }));
ok(tb.p1 === 7 && tb.p2 === 5, 'leitor de tie-break também é dependência injetada');
const order = D.buildOrdemChave([{ round: 1, gameNumber: 2, team1Uids: ['uB'], team2Uids: ['uC'] }, { round: 1, gameNumber: 1, team1Uids: ['uA'], team2Uids: ['uD'] }], slots);
ok(order.uA === 0 && order.uD === 1 && order.uB === 2, 'ordem visual da chave é determinística');
ok(C.standingsCompareConfig(A, B, { tiebreakers: ['vitorias'] }) === D.standingsCompareConfig(A, B, { tiebreakers: ['vitorias'] }), 'adaptador clássico delega para o contrato tipado');

const vendor = fs.readFileSync(path.join(ROOT, 'functions-autodraw/vendor/standings.js'));
ok(vendor.equals(fs.readFileSync(path.join(ROOT, 'js/domain/standings.js'))), 'motor de sorteio recebe o mesmo domínio gerado');
const draw = fs.readFileSync(path.join(ROOT, 'functions-autodraw/draw-core.js'), 'utf8');
ok(draw.includes("ScoreplaceStandings = require('./vendor/standings.js')"), 'motor carrega o domínio antes do adaptador clássico');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(index.indexOf('js/domain/standings.js') < index.indexOf('js/views/standings-core.js'), 'shell carrega o domínio antes da ponte');

console.log((fail ? 'ERROR' : 'OK') + ' domínio tipado de classificação: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
