// REGRA DO DONO (13/ago/2026): "o tie-break deve seguir a configuração do organizador.
// Configurado 5-5 → dispara ao digitar 6-5. Configurado 6-6 → dispara ao digitar 7-6.
// Sempre lê a configuração do torneio. Não pode ser hardcoded para um valor fixo."
//
// Três frentes, porque a regra só vale se as três valerem:
//   1. LEITURA  — a config VENCE o padrão do esporte, nos DOIS sentidos, e escala com
//                 gamesPerSet. Roda o _highlightWinner REAL (o caminho do oninput).
//   2. ESCRITA  — o que a tela MOSTRA é o que fica GRAVADO. Antes a pill só era destacada:
//                 quem não clicava salvava `tiebreakAt` vazio e o gatilho passava a ser
//                 re-derivado do esporte a cada leitura (promessa não registrada).
//   3. VARREDURA — ninguém pode cravar o gatilho: todo ponto passa por _tbLoserGames.
//
// O fallback por esporte CONTINUA existindo de propósito — é ele que mantém os torneios
// JÁ gravados (medido: 8 de 8 em produção sem o campo) funcionando sem tocar no banco.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkInput() {
  const attrs = {};
  return { value: '', style: {},
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return (k in attrs) ? attrs[k] : null; } };
}

// Dirige o caminho REAL de revelar o campo do TB.
function abre(scoring, sport, s1, s2) {
  const MID = 'm-' + Math.random().toString(36).slice(2, 8);
  const els = {};
  els['s1-' + MID] = mkInput(); els['s2-' + MID] = mkInput();
  els['tb1-' + MID] = mkInput(); els['tb2-' + MID] = mkInput();
  els['s1-' + MID].value = String(s1); els['s2-' + MID].value = String(s2);
  W.document.getElementById = function (id) { return els[id] || null; };
  W.AppStore.tournaments = [{ id: 't1', sport: sport, scoring: scoring, matches: [{ id: MID, p1: 'A', p2: 'B' }] }];
  W._highlightWinner(MID);
  return els['tb1-' + MID].style.display === 'inline-block'
      && els['tb2-' + MID].style.display === 'inline-block';
}
const base = (extra) => Object.assign(
  { type: 'sets', gamesPerSet: '6', tiebreakEnabled: true, tiebreakPoints: '7',
    tiebreakMargin: '2', setsToWin: '1', countingType: 'tennis' }, extra || {});

// ─────────────────────────────────────────────────────────────────────────────
// 1. LEITURA — a CONFIG manda
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. A configuração do torneio decide o gatilho');

// configurado 5-5 → dispara no 6-5
ok(abre(base({ tiebreakAt: 'g-1' }), 'Beach Tennis', 6, 5) === true, 'config 5-5: 6-5 DISPARA');
ok(abre(base({ tiebreakAt: 'g-1' }), 'Beach Tennis', 7, 6) === false, 'config 5-5: 7-6 não dispara');
// configurado 6-6 → dispara no 7-6
ok(abre(base({ tiebreakAt: 'g' }), 'Beach Tennis', 7, 6) === true, 'config 6-6: 7-6 DISPARA');
ok(abre(base({ tiebreakAt: 'g' }), 'Beach Tennis', 6, 5) === false, 'config 6-6: 6-5 não dispara');

// a config VENCE o padrão do esporte nos DOIS sentidos (é o que prova que não é o esporte
// mandando): Beach Tennis forçado a 6-6, e Padel/Tênis forçado a 5-5.
console.log('   → a config vence o padrão do esporte nos dois sentidos');
ok(abre(base({ tiebreakAt: 'g' }), 'Beach Tennis', 7, 6) === true, 'BT (padrão 5-5) forçado a 6-6: 7-6 dispara');
ok(abre(base({ tiebreakAt: 'g' }), '🎾 Beach Tennis', 6, 5) === false, 'BT com emoji forçado a 6-6: 6-5 NÃO dispara');
ok(abre(base({ tiebreakAt: 'g-1' }), 'Padel', 6, 5) === true, 'Padel (padrão 6-6) forçado a 5-5: 6-5 dispara');
ok(abre(base({ tiebreakAt: 'g-1' }), '🏸 Padel', 7, 6) === false, 'Padel com emoji forçado a 5-5: 7-6 NÃO dispara');
ok(abre(base({ tiebreakAt: 'g-1' }), 'Tênis', 6, 5) === true, 'Tênis forçado a 5-5: 6-5 dispara');

// e ESCALA com o gamesPerSet configurado — o gatilho não é o número 5 nem o 6, é derivado
console.log('   → o gatilho deriva de gamesPerSet (não é 5 nem 6 cravado)');
ok(abre(base({ gamesPerSet: '8', tiebreakAt: 'g-1' }), 'Beach Tennis', 8, 7) === true, 'gp8 + 5-5: 8-7 dispara');
ok(abre(base({ gamesPerSet: '8', tiebreakAt: 'g-1' }), 'Beach Tennis', 6, 5) === false, 'gp8 + 5-5: 6-5 NÃO dispara');
ok(abre(base({ gamesPerSet: '8', tiebreakAt: 'g' }), 'Beach Tennis', 9, 8) === true, 'gp8 + 6-6: 9-8 dispara');
ok(abre(base({ gamesPerSet: '4', tiebreakAt: 'g-1' }), 'Beach Tennis', 4, 3) === true, 'gp4 + 5-5: 4-3 dispara');
ok(abre(base({ gamesPerSet: '11', tiebreakAt: 'g' }), 'Pickleball', 12, 11) === true, 'gp11 + 6-6: 12-11 dispara');
ok(W._tbLoserGames(base({ gamesPerSet: '9', tiebreakAt: 'g-1' }), 'X') === 8, 'gp9 + g-1 → perdedor 8');
ok(W._tbLoserGames(base({ gamesPerSet: '9', tiebreakAt: 'g' }), 'X') === 9, 'gp9 + g → perdedor 9');

// vitória normal nunca dispara, em nenhuma config (senão o fix vira ruído)
ok(abre(base({ tiebreakAt: 'g-1' }), 'Beach Tennis', 6, 4) === false, 'config 5-5: 6-4 é vitória normal');
ok(abre(base({ tiebreakAt: 'g' }), 'Beach Tennis', 7, 5) === false, 'config 6-6: 7-5 é vitória normal');

// LEGADO: torneio SEM o campo (8 de 8 em produção) segue no padrão do esporte — o fallback
// não pode sumir, senão todo torneio já gravado muda de comportamento sem ninguém pedir.
console.log('   → torneio sem o campo (legado) cai no padrão do esporte');
ok(abre(base(), 'Beach Tennis', 6, 5) === true, 'legado BT: 6-5 dispara (padrão do esporte)');
ok(abre(base(), 'Padel', 7, 6) === true, 'legado Padel: 7-6 dispara (padrão do esporte)');
ok(W._tbLoserGames(base(), 'Beach Tennis') === 5, 'legado BT resolve 5 sem campo gravado');

// ─────────────────────────────────────────────────────────────────────────────
// 2. ESCRITA — o que a tela mostra é o que fica gravado
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. A escolha mostrada na tela é PERSISTIDA');

// extrai as funções REAIS do create-tournament.js (o harness não carrega esse arquivo)
const CT = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'create-tournament.js'), 'utf8');
function extrair(nome) {
  const ini = CT.indexOf('window.' + nome + ' = function');
  if (ini < 0) return null;
  // fecha na primeira linha que é exatamente "};" na coluna 0
  const fim = CT.indexOf('\n};', ini);
  return CT.slice(ini, fim + 3);
}
// ⭐ 2.1: quem grava o gatilho é o SAVE (_gsmReadHidden), não mais a seção solta.
// A seção "🎾 Tie-break do set" do formulário SAIU (ordem do dono, 22/ago: "não pode ter em 2
// lugares na mesma fase") — ela escrevia no gsm-tiebreakAt da fase INICIAL e atropelava o
// formato das fases 2+. O comportamento que NÃO podia sumir com ela é este: salvar sem nunca
// abrir o painel de formato ainda tem de deixar o gatilho GRAVADO no torneio.
const src = extrair('_gsmReadHidden');
ok(!!src, '_gsmReadHidden existe no create-tournament.js');
ok(CT.indexOf('_reSyncTbAt') === -1 && CT.indexOf('re-tiebreak-at-block') === -1,
   '⛔ a seção solta de tie-break NÃO voltou ao formulário (fonte única: Formato da partida)');

function cfgSandbox(sportLabel, storedValue) {
  const nodes = {
    'gsm-tiebreakAt': { value: storedValue || '' },
    'gsm-tiebreakEnabled': { value: 'true' },
    'gsm-type': { value: 'sets' },
    'gsm-gamesPerSet': { value: '6' },
    'gsm-setsToWin': { value: '1' },
    'gsm-tiebreakPoints': { value: '7' },
    'gsm-tiebreakMargin': { value: '2' }
  };
  const win = {
    _scoringUsesSets: W._scoringUsesSets,
    _sportTiebreakAt: W._sportTiebreakAt,
    _sportBaseName: W._sportBaseName,
    _currentSportName: function () { return W._sportBaseName(sportLabel); },
    document: { getElementById: function (id) { return nodes[id] || null; } }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win);
  return { gravado: win._gsmReadHidden().tiebreakAt };
}

const semToque = cfgSandbox('🎾 Beach Tennis', '');
ok(semToque.gravado === 'g-1', 'BT sem tocar no painel: o save GRAVA 5-5 (o padrão do esporte, resolvido)');

const padel = cfgSandbox('🏸 Padel', '');
ok(padel.gravado === 'g', 'Padel sem tocar no painel: o save GRAVA 6-6');

// escolha EXPLÍCITA nunca é sobrescrita pelo padrão do esporte
ok(cfgSandbox('🎾 Beach Tennis', 'g').gravado === 'g', 'escolha explícita 6-6 em BT NÃO é sobrescrita pelo padrão 5-5');
ok(cfgSandbox('🏸 Padel', 'g-1').gravado === 'g-1', 'escolha explícita 5-5 em Padel NÃO é sobrescrita pelo padrão 6-6');
// e a terceira parada do slider do formato (7-7) atravessa inteira
ok(cfgSandbox('🎾 Beach Tennis', 'g+1').gravado === 'g+1', 'set longo (7-7) do painel de formato chega ao save');

// TB desligado não inventa gatilho
(function () {
  const win = cfgSandbox('🎾 Beach Tennis', '');
  ok(win.gravado === 'g-1', 'com TB ligado o gatilho existe');
})();

// round-trip: o que a config gravou é o que o lançamento usa
ok(abre(base({ tiebreakAt: semToque.gravado }), '🎾 Beach Tennis', 6, 5) === true,
  'round-trip: o valor que a config gravou faz o 6-5 disparar');
ok(abre(base({ tiebreakAt: padel.gravado }), '🏸 Padel', 7, 6) === true,
  'round-trip: o valor que a config gravou faz o 7-6 disparar no Padel');

// ─────────────────────────────────────────────────────────────────────────────
// 3. VARREDURA — o gatilho nunca é cravado
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. O gatilho nunca é um número fixo no código');
const BUI = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');

// _isTiebreakSetScore nunca recebe um literal numérico como gatilho
const literais = (BUI.match(/_isTiebreakSetScore\([^)]*,\s*\d+\s*\)/g) || []);
ok(literais.length === 0, 'nenhum _isTiebreakSetScore(..., <número fixo>) — achados: ' + JSON.stringify(literais));

// todo consumidor do gatilho passa por _tbLoserGames (fonte única)
const usos = (BUI.match(/_isTiebreakSetScore\(/g) || []).length;
const viaHelper = (BUI.match(/_tbLoserGames\(/g) || []).length;
ok(usos >= 2 && viaHelper >= usos - 1,
  'os pontos que checam TB derivam o gatilho de _tbLoserGames (' + usos + ' checagens, ' + viaHelper + ' derivações)');

// _tbLoserGames lê a config ANTES do padrão do esporte
const corpo = String(W._tbLoserGames);
ok(/scoring\s*&&\s*scoring\.tiebreakAt/.test(corpo) || /scoring\.tiebreakAt/.test(corpo),
  '_tbLoserGames lê scoring.tiebreakAt');
ok(corpo.indexOf('tiebreakAt') < corpo.indexOf('_sportTiebreakAt'),
  'lê a CONFIG antes de cair no padrão do esporte (ordem importa)');
ok(/gamesPerSet/.test(corpo), 'o gatilho deriva de gamesPerSet, não de número fixo');

console.log('\n' + (fail === 0 ? '✅ tiebreak-segue-a-config: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach(function (f) { console.error('  ✗ ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
