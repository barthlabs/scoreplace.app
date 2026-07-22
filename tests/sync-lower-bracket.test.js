// _syncLowerBracket — A DONA ÚNICA DA 1ª CHAVE INFERIOR (v1.3.164).
//
// Três mecanismos mexiam na 1ª inferior em momentos diferentes e se atropelavam
// (_wireLateLoserToLower na criação do jogo do tardio; resolveRepFills quando a repescagem
// resolvia; e a definição do repescado "na hora"). Esta suíte trava o CENÁRIO DO DONO,
// medido à mão, que NENHUMA suíte anterior cobria (o fluxo de jogar a 1ª sup ANTES de
// integrar o tardio — o HEAD 1.3.163 falha aqui):
//
//   12 duplas → sortear → sup 6/3/2+1rep/1 · inf 3/3/3+1rep/2/1. Jogar os 6 da 1ª sup.
//   +1 tardio  → jogo 7 = tardio vs MELHOR DERROTADO da 1ª sup, definido NA HORA (sem
//                "a definir" pendente); o derrotado SAI da 1ª inferior; o perdedor do
//                jogo 7 herda o buraco dele. A 1ª inferior SEGUE COM 3 JOGOS.
//   +2º tardio → TOMA a vaga do repescado no jogo 7 (repescado volta pra inferior — num
//                4º jogo, a chave de 14), SEM jogo 8. 7 jogos com 14 competidores.
//
// E a VARREDURA do mesmo fluxo (jogar a 1ª sup primeiro) pra todo N=3..20 × 0/1/2 tardios:
//   • 1ª superior sempre com ⌈N/2⌉ jogos (a chave é sempre a chave de N);
//   • NENHUM competidor duplicado na 1ª inferior (o repescado do satout deslocado não é
//     "devolvido" pra onde ele já estava — bug herdado do 1.3.163, ímpares);
//   • playout completo coroa campeão, sem jogo travado.
// [[project_dupla_elim_minimal_tree_canon]] [[project_late_entry_door_upper_then_lower]]
// [[project_dupla_elim_late_integration_cascade]] [[project_uid_identity_canon_locked]]
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const isEmpty = v => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];

function mkPairs(n, off) { const a = []; for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: 'A' + k + ' / B' + k, name: 'A' + k + ' / B' + k, ligaActive: true }); } return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'SLB' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
function chegaTardio(t, off) {
  const p = mkPairs(1, off)[0]; p._lateJoin = true;
  t.waitlist.push(p); t.participants.push(p);
  t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1;
  return p;
}
function jogaPrimeiraSup(t) {
  const supR = Math.min.apply(null, all(t).filter(x => x.bracket === 'upper').map(x => x.round));
  all(t).filter(m => m.bracket === 'upper' && m.round === supR && !m.winner &&
    m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)).forEach((m, i) => {
      m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = i % 6;
      W._advanceWinner(t, m);
      if (W._resolveRepFills) W._resolveRepFills(t);
    });
  return supR;
}
function playout(t) {
  let guard = 0;
  while (guard++ < 3000) {
    const p = all(t).filter(m => m && !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = guard % 5;
    try { W._advanceWinner(t, m); } catch (e) { return 'advance: ' + e.message; }
    if (W._resolveRepFills) { try { W._resolveRepFills(t); } catch (e) {} }
  }
  return null;
}

console.log('── CENÁRIO DO DONO: 12 duplas, 1ª sup jogada, +1 e +2 tardios ──');
(function () {
  const t = mkT(12); W.AppStore.tournaments = [t];
  jogaPrimeiraSup(t);
  const infAntes = all(t).filter(m => m.bracket === 'lower' && m.round === 1);
  ok(infAntes.length === 3, 'pré: 1ª inferior com 3 jogos (got ' + infAntes.length + ')');

  // confrontos originais da 1ª inferior (pra checar a VOLTA ao jogo original depois)
  const infOrig = all(t).filter(m => m.bracket === 'lower' && m.round === 1)
    .map(m => ({ id: m.id, p1: m.p1, p2: m.p2 }));

  // +1 tardio: repescado definido NA HORA, sai da inferior, perdedor do jogo 7 herda o buraco
  const t1 = chegaTardio(t, 100);
  dc.integrateLateEntries(t, {});
  const sup1 = all(t).filter(m => m.bracket === 'upper' && m.round === 0);
  const g7 = sup1.find(m => m.p1 === t1.displayName || m.p2 === t1.displayName);
  ok(sup1.length === 7, '+1 tardio: 1ª sup com 7 jogos (got ' + sup1.length + ')');
  ok(!!g7, '+1 tardio: o jogo do tardio existe na 1ª sup');
  ok(g7 && !isEmpty(g7.p1) && !isEmpty(g7.p2), '+1 tardio: SEM "a definir" pendente — repescado definido NA HORA (' + (g7 ? g7.p1 + ' vs ' + g7.p2 : '—') + ')');
  ok(g7 && !(g7.repFill || []).length, '+1 tardio: nenhum repFill pendurado no jogo do tardio');
  const rep1 = g7 && (g7.p1FromRepechage ? g7.p1 : (g7.p2FromRepechage ? g7.p2 : null));
  ok(!!rep1, '+1 tardio: o adversário veio por REPESCAGEM (badge FromRepechage)');
  const inf1 = all(t).filter(m => m.bracket === 'lower' && m.round === 1);
  ok(inf1.length === 3, '+1 tardio: 1ª inferior SEGUE com 3 jogos (got ' + inf1.length + ')');
  ok(!inf1.some(m => m.p1 === rep1 || m.p2 === rep1), '+1 tardio: o repescado SAIU da 1ª inferior');
  const dest = g7 && g7.loserMatchId && all(t).find(m => m.id === g7.loserMatchId);
  ok(dest && dest.bracket === 'lower' && dest.round === 1 && g7.loserSlot && isEmpty(dest[g7.loserSlot]),
    '+1 tardio: o perdedor do jogo 7 herda o BURACO que o repescado deixou');

  // +2º tardio: toma a vaga do repescado no jogo 7; repescado volta pra inferior; SEM jogo 8
  const t2 = chegaTardio(t, 200);
  dc.integrateLateEntries(t, {});
  const sup2 = all(t).filter(m => m.bracket === 'upper' && m.round === 0);
  ok(sup2.length === 7, '+2º tardio: 14 competidores ⇒ 1ª sup CONTINUA com 7 jogos, sem jogo 8 (got ' + sup2.length + ')');
  const g7b = sup2.find(m => m.p1 === t1.displayName || m.p2 === t1.displayName);
  ok(g7b && (g7b.p1 === t2.displayName || g7b.p2 === t2.displayName),
    '+2º tardio: TOMA a vaga do repescado no jogo 7 (' + (g7b ? g7b.p1 + ' vs ' + g7b.p2 : '—') + ')');
  const inf2 = all(t).filter(m => m.bracket === 'lower' && m.round === 1);
  ok(inf2.length === 4, '+2º tardio: repescado volta pra inferior — chave de 14 ⇒ 4 jogos (got ' + inf2.length + ')');
  ok(inf2.some(m => m.p1 === rep1 || m.p2 === rep1), '+2º tardio: o repescado CONTINUA jogando (voltou pra 1ª inferior)');
  // v1.3.166 (dono): a volta é pro JOGO ORIGINAL — reúne o confronto que ele deixou (ele × o
  // adversário que ficou com "a definir"), nunca um jogo novo com adversário a definir.
  const jogoOrig = infOrig.find(j => j.p1 === rep1 || j.p2 === rep1);
  const advOrig = jogoOrig && (jogoOrig.p1 === rep1 ? jogoOrig.p2 : jogoOrig.p1);
  const volta = jogoOrig && inf2.find(m => m.id === jogoOrig.id);
  ok(!!volta && (volta.p1 === rep1 || volta.p2 === rep1) && (volta.p1 === advOrig || volta.p2 === advOrig),
    '+2º tardio: repescado volta pro JOGO ORIGINAL, contra o adversário original (' +
    (volta ? volta.p1 + ' x ' + volta.p2 : '—') + ')');
  const cnt = {};
  inf2.forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) cnt[v] = (cnt[v] || 0) + 1; }));
  ok(Object.keys(cnt).filter(k => cnt[k] > 1).length === 0, '+2º tardio: NINGUÉM duplicado na 1ª inferior');

  const err = playout(t);
  ok(!err, 'playout sem erro (' + (err || '') + ')');
  const grand = all(t).filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'grande final coroa um campeão');
})();

console.log('\n── VARREDURA do mesmo fluxo: N=3..20 × 0/1/2 tardios ──');
for (let N = 3; N <= 20; N++) {
  [0, 1, 2].forEach(function (q) {
    const rot = 'N=' + N + ' +' + q + ' tardio(s)';
    const t = mkT(N); W.AppStore.tournaments = [t];
    const supR = jogaPrimeiraSup(t);
    for (let i = 0; i < q; i++) { chegaTardio(t, 100 + i * 10); dc.integrateLateEntries(t, {}); }
    const Np = t.participants.length;
    const s1 = all(t).filter(m => m.bracket === 'upper' && m.round === supR);
    ok(s1.length === Math.ceil(Np / 2), rot + ' :: 1ª sup = ⌈' + Np + '/2⌉ (got ' + s1.length + ')');
    const lowR = Math.min.apply(null, all(t).filter(m => m.bracket === 'lower').map(m => m.round));
    const l1 = all(t).filter(m => m.bracket === 'lower' && m.round === lowR);
    const c = {}; l1.forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) c[v] = (c[v] || 0) + 1; }));
    const dup = Object.keys(c).filter(k => c[k] > 1);
    ok(dup.length === 0, rot + ' :: ninguém duplicado na 1ª inferior (' + JSON.stringify(dup) + ')');
    const err = playout(t);
    ok(!err, rot + ' :: playout sem erro (' + (err || '') + ')');
    const grand = all(t).filter(m => m.bracket === 'grand');
    ok(grand.length >= 1 && grand[grand.length - 1].winner, rot + ' :: campeão coroado');
    const stuck = all(t).filter(m => !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    ok(stuck.length === 0, rot + ' :: nenhum jogo travado (' + stuck.length + ')');
  });
}

// ── DESEMPATE DO REPESCADO É A ORDEM DO JOGO (v1.3.167, dono): empate total (mesmo saldo E
// mesmos pontos) desempata pelo jogo MAIS CEDO da rodada — o que a tela mostra. Nunca o seed
// interno (no pareamento 1×N o jogo 1 junta o 1º sorteado com o ÚLTIMO — critério invisível
// que contradiz a leitura natural: caso Mari (jogo 1, seed 11) × Luiza (jogo 2, seed 1)).
console.log('\n── desempate do repescado: ordem do jogo, nunca o seed interno ──');
(function () {
  const t = mkT(12); W.AppStore.tournaments = [t];
  const sup0 = all(t).filter(m => m.bracket === 'upper' && m.round === 0);
  // jogos 1 e 2 terminam 6-4 (perdedores empatados em saldo E pontos); resto 6-1
  sup0.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i < 2) ? 4 : 1;
    W._advanceWinner(t, m); if (W._resolveRepFills) W._resolveRepFills(t); });
  const perdedorJogo1 = sup0[0].p2;
  const t1 = chegaTardio(t, 100);
  dc.integrateLateEntries(t, {});
  const g7 = all(t).find(m => m.bracket === 'upper' && m.round === 0 && (m.p1 === t1.displayName || m.p2 === t1.displayName));
  const rep = g7 && (g7.p1FromRepechage ? g7.p1 : (g7.p2FromRepechage ? g7.p2 : null));
  ok(rep === perdedorJogo1,
    'empate total ⇒ repescado é o perdedor do JOGO MAIS CEDO (esperado ' + perdedorJogo1 + ', got ' + rep + ')');
})();

// ── O CASO DO DOC REAL (tour_1784727218055_sb, 22/jul): dupla tardia SÓ-COM-UID (sem nomes —
// rótulo cru "Jogador sem perfil (…)"), nomes resolvem ENTRE as passadas, e a 2ª integração
// re-processava a MESMA dupla (fantasma nos jogos 7 E 8) + o rebuild do Tier 1 apagava os
// derrotados materializados da 1ª inferior. Sintético com o MESMO shape (o doc real tem dados
// de pessoas reais — não entra no repo). [[project_uid_identity_canon_locked]]
console.log('\n── DOC REAL (shape): tardio só-uid → nomes resolvem → 2ª integração não duplica ──');
(function () {
  const t = mkT(12); W.AppStore.tournaments = [t];
  jogaPrimeiraSup(t);
  // tardio 1 SEM nomes (uid-only)
  const t1 = { p1Uid: 'N618xxxx', p2Uid: 'Q480yyyy', _lateJoin: true };
  t.waitlist.push(t1); t.participants.push(Object.assign({}, t1));
  t.checkedIn['N618xxxx'] = 1; t.checkedIn['Q480yyyy'] = 1;
  dc.integrateLateEntries(t, {});
  const g7a = all(t).filter(m => (m.team1Uids || []).indexOf('N618xxxx') >= 0 || (m.team2Uids || []).indexOf('N618xxxx') >= 0);
  ok(g7a.length === 1, '[doc] tardio só-uid entra em UM jogo, com identidade por uid (got ' + g7a.length + ')');
  // nomes resolvem entre as passadas (o que aconteceu no doc real)
  const pt1 = t.participants[t.participants.length - 1];
  pt1.p1Name = 'Luigi'; pt1.p2Name = 'Adriana'; pt1.displayName = 'Luigi / Adriana'; pt1.name = 'Luigi / Adriana';
  t.teamOrigins['Luigi / Adriana'] = 'formada';
  // tardio 2 nomeado
  const t2 = { p1Uid: 'mm1', p1Name: 'Marcello', p2Uid: 'kf1', p2Name: 'Karla', displayName: 'Marcello / Karla', name: 'Marcello / Karla', _lateJoin: true };
  t.waitlist.push(t2); t.participants.push(Object.assign({}, t2));
  t.checkedIn['mm1'] = 1; t.checkedIn['kf1'] = 1;
  dc.integrateLateEntries(t, {});
  // a MESMA dupla nunca aparece em 2 jogos da 1ª sup (era o fantasma "jogos 7 E 8")
  const jogosT1 = all(t).filter(m => m.bracket === 'upper' &&
    ((m.team1Uids || []).indexOf('N618xxxx') >= 0 || (m.team2Uids || []).indexOf('N618xxxx') >= 0));
  ok(jogosT1.length === 1, '[doc] após nomes resolverem + 2º tardio: t1 segue em UM jogo só (got ' + jogosT1.length + ')');
  const g7 = jogosT1[0];
  ok(g7 && ((m => (m.team1Uids || []).indexOf('mm1') >= 0 || (m.team2Uids || []).indexOf('mm1') >= 0)(g7)),
    '[doc] jogo do tardio vira t1 × t2 (repescado dispensado)');
  // derrotados da 1ª sup PRESERVADOS/re-materializados na 1ª inferior
  const lowR = Math.min.apply(null, all(t).filter(m => m.bracket === 'lower').map(m => m.round));
  const l1 = all(t).filter(m => m.bracket === 'lower' && m.round === lowR);
  const nomesInf = []; l1.forEach(m => ['p1', 'p2'].forEach(s => { if (m[s] && !isEmpty(m[s])) nomesInf.push(m[s]); }));
  ok(nomesInf.length >= 6, '[doc] os 6 derrotados da 1ª sup estão na 1ª inferior (got ' + nomesInf.length + ') — inferior NUNCA apaga');
  const dupInf = nomesInf.filter((v, i) => nomesInf.indexOf(v) !== i);
  ok(dupInf.length === 0, '[doc] ninguém duplicado na 1ª inferior (' + JSON.stringify(dupInf) + ')');
  const err = playout(t);
  ok(!err, '[doc] playout sem erro (' + (err || '') + ')');
  const grand = all(t).filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, '[doc] campeão coroado');
})();

console.log('\n' + (fail === 0 ? '✅ sync-lower-bracket: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 40).forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
