// REGRESSÃO (dono, 13/ago/2026): "ao digitar 6-5 os subcampos do tie-break pararam de abrir".
//
// CAUSA: `t.sport` chega em DUAS grafias pro MESMO esporte. O form completo grava limpo
// ("Beach Tennis"); o quick-create gravava o rótulo CRU do seletor ("🎾 Beach Tennis").
// _sportTiebreakAt comparava por igualdade ESTRITA → o segundo caía no default do tênis
// ('g' = TB no 7-6) e o campo do TB não abria no 6-5. MEDIDO em produção: dos 8 torneios,
// 4 têm o emoji gravado — 2 deles são Beach Tennis VIVOS (tour_1781797546400 'active' e
// tour_1782004352492 'open'), e a TELA DE CONFIGURAÇÃO deles já dizia "Tie-break em 5-5"
// (ela passa por _currentSportName, que tira o emoji). Config prometia 6-5, lançamento
// exigia 7-6.
//
// Este teste roda o _highlightWinner REAL (não o helper isolado) contra o shape REAL do
// doc de produção — é o caminho que o oninput dos inputs de placar dispara.
// Contra o código anterior: 4 falhas (os 2 casos "COM emoji" do reveal + os 2 do helper).
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// scoring REAL de tour_1781797546400 (lido do Firestore de produção, 13/ago/2026)
const SC_PROD = {
  type: 'sets', gamesPerSet: '6', tiebreakEnabled: true, tiebreakPoints: '7',
  tiebreakMargin: '2', setsToWin: '1', advantageRule: false, superTiebreak: false,
  countingType: 'tennis', superTiebreakPoints: '10'
};

function mkInput() {
  const attrs = {};
  return {
    value: '', style: {},
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return (k in attrs) ? attrs[k] : null; }
  };
}

// Dirige o caminho REAL: monta os 4 inputs do card e chama _highlightWinner.
function revealsTB(sport, scoring, s1, s2) {
  const MID = 'm-tb';
  const els = {};
  els['s1-' + MID] = mkInput(); els['s2-' + MID] = mkInput();
  els['tb1-' + MID] = mkInput(); els['tb2-' + MID] = mkInput();
  els['s1-' + MID].value = String(s1);
  els['s2-' + MID].value = String(s2);
  W.document.getElementById = function (id) { return els[id] || null; };
  W.AppStore.tournaments = [{ id: 't1', sport: sport, scoring: scoring, matches: [{ id: MID, p1: 'A', p2: 'B' }] }];
  W._highlightWinner(MID);
  return els['tb1-' + MID].style.display === 'inline-block'
      && els['tb2-' + MID].style.display === 'inline-block';
}

// ── O BUG DO RELATO: 6-5 abre em Beach Tennis, escrito das DUAS formas ──
ok(revealsTB('Beach Tennis', SC_PROD, 6, 5) === true, 'BT limpo: 6-5 ABRE o tie-break');
ok(revealsTB('🎾 Beach Tennis', SC_PROD, 6, 5) === true, 'BT com emoji: 6-5 ABRE o tie-break (era o bug)');
ok(revealsTB('🎾 Beach Tennis', SC_PROD, 5, 6) === true, 'BT com emoji: 5-6 ABRE (o lado não importa)');

// ── e o que NÃO pode abrir continua não abrindo (senão o fix vira ruído) ──
ok(revealsTB('🎾 Beach Tennis', SC_PROD, 6, 4) === false, 'BT com emoji: 6-4 é vitória normal, NÃO abre');
ok(revealsTB('🎾 Beach Tennis', SC_PROD, 7, 6) === false, 'BT com emoji: 7-6 não é o gatilho de BT (max 6)');
ok(revealsTB('Beach Tennis', SC_PROD, 6, 6) === false, 'BT: 6-6 é empate, não placar final de set');

// ── o normalizador é FONTE ÚNICA e não estraga quem já estava certo ──
// (wrapper: sem a função o teste REPORTA falha em vez de estourar — contra o código
//  anterior o red tem que ser a lista de comportamentos quebrados, não um stack trace)
const baseName = (s) => (typeof W._sportBaseName === 'function' ? W._sportBaseName(s) : '<_sportBaseName AUSENTE>');
ok(baseName('🎾 Beach Tennis') === 'Beach Tennis', '_sportBaseName tira o emoji');
ok(baseName('Beach Tennis') === 'Beach Tennis', '_sportBaseName é idempotente no nome limpo');
ok(baseName('⚽ Futevôlei') === 'Futevôlei', '_sportBaseName preserva acento (À-ɏ)');
ok(baseName('Tênis de Mesa') === 'Tênis de Mesa', '_sportBaseName não mexe em nome com espaço/acento');
ok(baseName('') === '' && baseName(null) === '' && baseName(undefined) === '',
  '_sportBaseName tolera vazio/null/undefined');

// ── as duas grafias passam a dar a MESMA resposta em todo leitor do gatilho ──
ok(W._sportTiebreakAt('🎾 Beach Tennis') === W._sportTiebreakAt('Beach Tennis'),
  '_sportTiebreakAt: mesma resposta pras duas grafias');
ok(W._sportTiebreakAt('🎾 Beach Tennis') === 'g-1', 'BT com emoji → g-1 (TB no 5-5, set 6-5)');
ok(W._tbLoserGames(SC_PROD, '🎾 Beach Tennis') === 5, '_tbLoserGames BT com emoji = 5');
ok(W._tbLoserGames(SC_PROD, 'Beach Tennis') === 5, '_tbLoserGames BT limpo = 5 (inalterado)');

// ── outros esportes seguem no padrão do tênis (7-6), com e sem emoji ──
ok(W._sportTiebreakAt('🏸 Padel') === 'g', 'Padel com emoji → g (7-6), como Padel limpo');
ok(W._sportTiebreakAt('Padel') === 'g', 'Padel limpo → g (inalterado)');
ok(W._tbLoserGames(SC_PROD, '🎾 Tênis') === 6, 'Tênis com emoji = 6 (7-6)');
ok(revealsTB('🏸 Padel', SC_PROD, 7, 6) === true, 'Padel com emoji: 7-6 ABRE');
ok(revealsTB('🏸 Padel', SC_PROD, 6, 5) === false, 'Padel com emoji: 6-5 NÃO abre (regra do tênis)');

// ── override explícito do torneio continua vencendo o default do esporte ──
ok(W._tbLoserGames({ gamesPerSet: 6, tiebreakAt: 'g' }, '🎾 Beach Tennis') === 6,
  'override tiebreakAt=g vence o default de BT, mesmo com emoji');
ok(W._tbLoserGames({ gamesPerSet: 6, tiebreakAt: 'g-1' }, '🏸 Padel') === 5,
  'override tiebreakAt=g-1 vence o default de Padel, mesmo com emoji');

// ── o quick-create não pode voltar a gravar o rótulo cru (varredura de código) ──
const fs = require('fs');
const mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8');
ok(/sport:\s*sportClean/.test(mainSrc), 'quick-create grava sport LIMPO (sport: sportClean)');
ok(!/sport:\s*sportRaw/.test(mainSrc), 'quick-create NÃO grava o rótulo cru (sport: sportRaw)');

console.log('\n' + (fail === 0 ? '✅ tiebreak-sport-com-emoji: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach(function (f) { console.error('  ✗ ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
