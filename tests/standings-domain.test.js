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
