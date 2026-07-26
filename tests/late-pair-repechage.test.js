// CENÁRIO REAL do dono — SB Casais, torneio AO VIVO (tour_1781996342871, 25/jul/2026).
// Dupla Eliminatória, 8 duplas FORMADAS, os 4 jogos da R1 superior já com placar, e duplas
// chegando depois.
//
// ⚠️ ESTE ARQUIVO FOI REESCRITO em 25/jul/2026. O que ele afirmava antes:
//   1. "a dupla nova cria automaticamente um jogo na R1 com 'Adversário a definir' do outro lado";
//   2. "quando todos os jogos da R1 tiverem placar, o sistema identifica o MELHOR DERROTADO da R1
//      e o coloca como adversário nesse jogo".
// Os DOIS mecanismos foram aposentados no mesmo dia, por decisão do dono:
//   • a repescagem virou ESTRUTURAL — já no sorteio se sabe qual jogo alimenta qual vaga, então
//     acabou o "melhor derrotado por saldo" (repFill / _resolveRepFills). Ver
//     [[project_numeric_resolution_canon_superseded]] e tests/repechage.test.js;
//   • com a chave CHEIA (8 = potência de 2 exata) o tardio não entra vs "a definir": ele ESPERA
//     PAR, e aí os dois entram juntos num jogo novo ENTRE ELES, sem tocar em nenhum confronto já
//     publicado — _"avisa na 9a que precisa da 10a... só cria jogo entre 9 e 10"_. Ver
//     [[project_pow2_growth_frozen_prefix]] e tests/growth-frozen-prefix.
// `_duplaAutoStructure` também deixou de existir: a estrutura sai de chave(N, formato).
//
// O que este arquivo trava AGORA, no MESMO cenário real: os placares já lançados sobrevivem
// intactos, a tardia sozinha espera com motivo explícito, o par entra sem mexer em nada, e a
// chave fecha num campeão sem slot morto.
//
// node tests/late-pair-repechage.test.js

const H = require('./render-harness');
const win = H.sandbox;
const core = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + JSON.stringify(got) + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + ' (got ' + JSON.stringify(got) + ')'); }
}

const BYE = 'BYE (Avança Direto)';
const vazio = (v) => !v || v === 'TBD' || v === BYE || /a definir/i.test(String(v));

function pair(a, b) {
  return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b, name: a + ' / ' + b };
}
function checkInPair(t, p) { t.checkedIn[p.p1Uid] = Date.now(); t.checkedIn[p.p2Uid] = Date.now(); }
function all(t) { return (typeof win._collectAllMatches === 'function') ? win._collectAllMatches(t) : (t.matches || []); }
function upperR1(t) {
  const ms = all(t).filter((m) => m && (m.bracket === 'upper' || m.bracket === 'main' || !m.bracket));
  const r = Math.min.apply(null, ms.map((m) => (typeof m.round === 'number') ? m.round : 1));
  return ms.filter((m) => ((typeof m.round === 'number') ? m.round : 1) === r);
}
function upperR1Reais(t) { return upperR1(t).filter((m) => !vazio(m.p1) && !vazio(m.p2)); }
// fotografia dos jogos JÁ DISPUTADOS: id + confronto + vencedor. É o que não pode mudar.
function placares(t) {
  return all(t).filter((m) => m && m.winner && !m.isBye && !vazio(m.p1) && !vazio(m.p2))
    .map((m) => m.id + '|' + m.p1 + ' x ' + m.p2 + '|' + m.winner).sort();
}
function jogosDe(t, nm) { return all(t).filter((m) => m && (m.p1 === nm || m.p2 === nm)); }
function motivos(res) { return ((res && res.recusas) || []).map((r) => r && r.motivo); }

// ── ELENCO ───────────────────────────────────────────────────────────────────
// 8 duplas no sorteio; CATIA, MARILIA e PAULO chegam DEPOIS (tardias).
const P = {};
[['K1', 'K2'], ['F1', 'F2'], ['R1x', 'R2x'], ['L1', 'L2'],
 ['V1', 'V2'], ['C1', 'C2'], ['N1', 'N2'], ['G1', 'G2']].forEach((x, i) => { P['d' + i] = pair(x[0], x[1]); });
const CATIA = pair('Catia', 'Max');
const MARILIA = pair('Marilia', 'Joao');
const PAULO = pair('Paulo', 'Elide');

const t = {
  id: 'tour_sbcasais', name: 'Torneio de Férias só Casais', format: 'Dupla Eliminatória',
  teamSize: 2, enrollmentMode: 'teams', lateEnrollment: 'expand', newMatchups: true,
  currentPhaseIndex: 0, status: 'active', elimThirdPlace: true,
  creatorUid: 'uOrg', organizerEmail: 'org@x.com',
  startDate: '2026-07-25T10:00', endDate: '',
  participants: [P.d0, P.d1, P.d2, P.d3, P.d4, P.d5, P.d6, P.d7],
  standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, teamOrigins: {},
  matches: [],
  scoring: { type: 'sets', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, tiebreakMargin: 2, countingType: 'tennis' },
};
Object.keys(P).forEach((k) => { t.teamOrigins[P[k].displayName] = 'formada'; checkInPair(t, P[k]); });
win.AppStore.tournaments = [t];

// ── sorteio + os 4 jogos da R1 superior JÁ DISPUTADOS ────────────────────────
console.log('── sorteio (8 duplas formadas) + R1 superior disputada ──');
const dres = core.drawInitial(t, {});
ok('sorteio ok', !!(dres && dres.ok), dres && dres.reason);
ok('R1 superior com 4 jogos reais (chave CHEIA, sem folga)', upperR1Reais(t).length === 4, upperR1Reais(t).length);

// placar pelo MESMO caminho do app (mutação + _advanceWinner)
upperR1Reais(t).filter((m) => !m.winner).forEach((m, i) => {
  win._applyResultToTournament(t, m.id, { s1: 6, s2: i % 5, useSets: true });
});
const placar0 = placares(t);
ok('os 4 jogos ficaram com placar', placar0.length === 4, placar0.length);

// ── CATIA chega SOZINHA: ENTRA pela vaga de sobra, e nada na chave se mexe ───
// Mudou em jul/2026, quando a ÁRVORE MÍNIMA substituiu a chave inflada: 9 entrantes dão 5
// jogos (4 normais + a vaga da sobra), então o tardio sozinho não espera mais par — ele
// ocupa a sobra e joga a REPESCAGEM contra o perdedor do 1º jogo da rodada. O que continua
// intocável, e é o ponto deste arquivo, são os 4 placares já lançados.
console.log('\n── CATIA chega sozinha: entra pela vaga de sobra (repescagem) ──');
t.standbyParticipants.push(Object.assign({ _lateJoin: true }, CATIA));
t.teamOrigins[CATIA.displayName] = 'formada'; checkInPair(t, CATIA);
const r1 = core.integrateLateEntries(t, {});
ok('CATIA ENTROU sozinha (não espera mais par)', jogosDe(t, CATIA.displayName).length === 1, jogosDe(t, CATIA.displayName).length);
ok('sem recusa "falta-par" — ninguém fica de fora por falta de parceiro', motivos(r1).indexOf('falta-par') === -1, motivos(r1));
ok('nenhum placar já lançado se mexeu', placares(t).join('#') === placar0.join('#'));

// ── MARILIA chega: as duas entram JUNTAS, num jogo entre elas ────────────────
console.log('\n── MARILIA chega: o par entra sem tocar no que já foi jogado ──');
t.standbyParticipants.push(Object.assign({ _lateJoin: true }, MARILIA));
t.teamOrigins[MARILIA.displayName] = 'formada'; checkInPair(t, MARILIA);
core.integrateLateEntries(t, {});

ok('CATIA entrou na chave', jogosDe(t, CATIA.displayName).length === 1, jogosDe(t, CATIA.displayName).length);
ok('MARILIA entrou na chave', jogosDe(t, MARILIA.displayName).length === 1, jogosDe(t, MARILIA.displayName).length);
const duelo = all(t).filter((m) => m &&
  [m.p1, m.p2].indexOf(CATIA.displayName) !== -1 && [m.p1, m.p2].indexOf(MARILIA.displayName) !== -1);
ok('…e entraram UMA CONTRA A OUTRA, num jogo novo', duelo.length === 1, duelo.length);
ok('o jogo novo está na R1 SUPERIOR', duelo.length === 1 && (duelo[0].bracket === 'upper' || duelo[0].bracket === 'main'),
  duelo.length && duelo[0].bracket);
ok('R1 superior agora tem 5 jogos (os 4 de antes + 1)', upperR1Reais(t).length === 5, upperR1Reais(t).length);
ok('✅ os 4 placares já lançados seguem INTACTOS (id, confronto e vencedor)',
  placar0.every((x) => placares(t).indexOf(x) !== -1),
  placar0.filter((x) => placares(t).indexOf(x) === -1));
ok('saíram da Lista de Espera',
  !(t.standbyParticipants || []).some((p) => p && (p.displayName === CATIA.displayName || p.displayName === MARILIA.displayName)));

// ── PAULO chega sozinho: com a chave de novo cheia, ele abre a próxima sobra ─
// A regra vale sempre, e agora é a regra INVERSA da antiga: chave cheia (10 duplas, par)
// + 1 tardio = 11 entrantes = 6 jogos, o último sendo a vaga dele. Ninguém espera.
console.log('\n── PAULO chega sozinho: entra também, pela nova vaga de sobra ──');
t.standbyParticipants.push(Object.assign({ _lateJoin: true }, PAULO));
t.teamOrigins[PAULO.displayName] = 'formada'; checkInPair(t, PAULO);
const r3 = core.integrateLateEntries(t, {});
ok('PAULO ENTROU sozinho', jogosDe(t, PAULO.displayName).length === 1, jogosDe(t, PAULO.displayName).length);
ok('sem recusa "falta-par"', motivos(r3).indexOf('falta-par') === -1, motivos(r3));

// ── a chave inteira fecha num campeão, sem auto-confronto nem slot morto ────
console.log('\n── joga tudo até o fim ──');
let guard = 0, erro = null;
while (guard++ < 600) {
  const self = all(t).find((m) => m && !vazio(m.p1) && !vazio(m.p2) && String(m.p1) === String(m.p2));
  if (self) { erro = 'AUTO-CONFRONTO em ' + self.id + ' (' + self.p1 + ')'; break; }
  const jogaveis = all(t).filter((m) => m && !m.winner && !m.isBye && !vazio(m.p1) && !vazio(m.p2));
  if (!jogaveis.length) break;
  const m = jogaveis[0];
  m.winner = m.p1;
  try { win._advanceWinner(t, m); } catch (e) { erro = 'advanceWinner: ' + e.message; break; }
}
ok('playout sem auto-confronto/erro', !erro, erro || 'ok');
const pendentes = all(t).filter((m) => m && !m.winner && !m.isBye);
ok('nenhum jogo pendente (nenhum slot morto)', pendentes.length === 0, pendentes.map((m) => m.id));
const gf = all(t).filter((m) => m && m.bracket === 'grand');
ok('campeão coroado na grande final', gf.length >= 1 && !!gf[gf.length - 1].winner, gf.length && gf[gf.length - 1].winner);

console.log('\n' + '═'.repeat(40));
console.log((fail === 0 ? '✅' : '❌') + ' late-pair-repechage: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
