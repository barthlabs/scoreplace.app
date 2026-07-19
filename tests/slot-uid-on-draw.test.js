/* CÂNONE DO SLOT (item 10, dono, 18-jul, torneio real de duplas): TODO slot que o SORTEIO cria
 * carrega o UID EXPLÍCITO (team*Uids/p*Uid) — R1 inclusive — não só o team*Obj/nome. Antes, o
 * gerador da 1ª rodada gravava só `team1Obj` (o slot NÃO se descrevia por uid); só as rodadas do
 * _advanceWinner carregavam uid. Regra do dono: "sempre uid e apenas uid inclusive nos jogos".
 *
 * Roda o SORTEIO REAL (buildViaDraw → draw-core.drawInitial → generatePhase + storePhase, o mesmo
 * motor da CF drawRound). FALHA no código antigo (R1 com team1Uids=undefined); PASSA com o stamp
 * no storePhase (phases-engine.js). Guest sem conta seria a única exceção (aqui todos têm uid).
 */
const { window: W, buildViaDraw, simulate } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── slot-uid-on-draw ────');

function realR1(t) {
  return (t.matches || []).filter(function (m) {
    return m && (m.round === 1 || m.round === 0) && !m.isThirdPlace && !m.isBye;
  });
}
function isRealName(nm) {
  return nm && nm !== 'TBD' && nm !== 'BYE' && !/BYE|Avança|A definir|Aguard/i.test(String(nm));
}

// ── SOLO Eliminatórias Simples (8) — todo slot real da R1 carrega team*Uids ──
var tS = buildViaDraw('Eliminatórias Simples', 8);
var r1S = realR1(tS);
ok(r1S.length > 0, 'R1 solo gerada (' + r1S.length + ' jogos)');
r1S.forEach(function (m) {
  if (isRealName(m.p1)) ok(Array.isArray(m.team1Uids) && m.team1Uids.length > 0, 'R1 solo: slot p1 (' + m.p1 + ') carrega team1Uids');
  if (isRealName(m.p1)) ok(m.p1Uid != null, 'R1 solo: slot p1 (' + m.p1 + ') carrega p1Uid');
  if (isRealName(m.p2)) ok(Array.isArray(m.team2Uids) && m.team2Uids.length > 0, 'R1 solo: slot p2 (' + m.p2 + ') carrega team2Uids');
});
// o uid do slot resolve pra alguém do elenco (não é lixo)
var _poolUids = {};
(tS.participants || []).forEach(function (p) { (W._participantUids ? W._participantUids(p) : []).forEach(function (u) { _poolUids[u] = 1; }); });
r1S.forEach(function (m) { (m.team1Uids || []).concat(m.team2Uids || []).forEach(function (u) { ok(_poolUids[u], 'uid do slot (' + u + ') pertence ao elenco'); }); });

// ── 3º lugar: TBD no sorteio (sem uid), mas ganha uid ao ser preenchido pelo _advanceWinner ──
var tS2 = buildViaDraw('Eliminatórias Simples', 4);
simulate(tS2); // joga tudo
var third = (tS2.matches || []).find(function (m) { return m && m.isThirdPlace; });
if (third && isRealName(third.p1)) {
  ok(Array.isArray(third.team1Uids) && third.team1Uids.length > 0, '3º lugar carrega team1Uids após o avanço');
}

// ── Fase de Grupos (8) — os jogos de grupo também carregam uid ──
var tG = buildViaDraw('Fase de Grupos + Eliminatórias', 8);
var grpMatches = (tG.matches || []).filter(function (m) { return m && (m.bracket === 'group' || m.groupIdx != null) && isRealName(m.p1) && isRealName(m.p2); });
if (grpMatches.length) {
  var _allGrpUid = grpMatches.every(function (m) { return (m.team1Uids && m.team1Uids.length) && (m.team2Uids && m.team2Uids.length); });
  ok(_allGrpUid, 'jogos de grupo carregam team*Uids (' + grpMatches.length + ' jogos)');
}

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ slot-uid-on-draw FALHOU'); process.exit(1); }
console.log('✅ slot-uid-on-draw: OK');
