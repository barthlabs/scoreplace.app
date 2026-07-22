// REPRODUZ o bug do dono (jul/2026), medido no doc REAL tour_1784727218055_sb:
//   "incluido o tardio nessa ultima oportunidade da sup, nao foi recriado o jogo 7 com o entrante
//    e um melhor repescado da r1 sup e reorganizada a r1 inf de acordo (com repescagem).
//    o entrante foi para o limbo..."
//
// O QUE O DOC MOSTRAVA: o tardio ENTROU, mas num jogo órfão —
//     main R0: "Jogador sem perfil (aL7U) / Jogador sem perfil (EABk)" vs TBD [rep x1]
// enquanto os 6 jogos reais da 1ª superior estavam em outra chave. Duas causas:
//   (1) os jogos da 1ª superior nascem SEM o campo `bracket`; o placer fazia
//       `_brk = _tpl.bracket || 'main'` e carimbava 'main' no jogo novo → ele não pertence nem à
//       superior nem à inferior no render da Dupla Eliminatória = LIMBO;
//   (2) o jogo novo nascia SEM `loserMatchId` e a 1ª INFERIOR não crescia: 7 derrotados não cabem
//       em 3 jogos. O perdedor do jogo 7 sumiria.
//
// REGRA TRAVADA: o jogo do tardio nasce IRMÃO dos outros da rodada de entrada (mesmo `bracket`,
// literalmente o mesmo valor — inclusive ausente), e a chave inferior é REORGANIZADA pelo número
// novo: ⌈derrotados/2⌉ jogos, com a vaga do ímpar preenchida por repescagem (nunca morta).
// Jogo já existente NUNCA é alterado. [[project_dupla_elim_late_integration_cascade]]
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPairs(n, off) { const a = []; for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: 'A' + k + ' / B' + k, name: 'A' + k + ' / B' + k, ligaActive: true }); } return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'GROW' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  dc.drawInitial(t, {});
  return t;
}
const all = t => W._collectAllMatches(t) || [];
const naoInferior = m => m && m.bracket !== 'lower' && m.bracket !== 'grand';
function primeiraSup(t) {
  const ms = all(t).filter(naoInferior);
  const r = Math.min.apply(null, ms.map(m => (typeof m.round === 'number') ? m.round : 1));
  return ms.filter(m => ((typeof m.round === 'number') ? m.round : 1) === r);
}
function primeiraInf(t) {
  const ms = all(t).filter(m => m && m.bracket === 'lower');
  if (!ms.length) return [];
  const r = Math.min.apply(null, ms.map(m => m.round));
  return ms.filter(m => m.round === r);
}
function chegaTardio(t, off) {
  const p = mkPairs(1, off)[0]; p._lateJoin = true;
  t.waitlist.push(p); t.participants.push(p);
  t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1;
  return p;
}

console.log('── tardio na 1ª superior: jogo IRMÃO + inferior reorganizada ──');

(function () {
  const t = mkT(12);
  const supAntes = primeiraSup(t);
  const infAntes = primeiraInf(t);
  const bracketIrmao = supAntes[0] && supAntes[0].bracket;          // pode ser undefined — é o ponto
  // CONFRONTO REAL = os dois lados preenchidos. Andaime vazio (TBD vs TBD) pode legitimamente ser
  // refeito quando a chave cresce — o que não pode é mexer em quem já tem adversário definido.
  const real = m => m && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD';
  const assinaturaAntes = all(t).filter(real).map(m => m.p1 + ' vs ' + m.p2).sort();
  ok(supAntes.length === 6, '12 duplas ⇒ 6 jogos na 1ª superior (got ' + supAntes.length + ')');
  ok(infAntes.length === 3, '12 duplas ⇒ 3 jogos na 1ª inferior (got ' + infAntes.length + ')');

  const n = chegaTardio(t, 100);
  const colocados = W._placeLateEntriesSurgically(t);
  ok(colocados > 0, 'o tardio é colocado (got ' + colocados + ')');

  const novo = all(t).filter(m => m && (m.p1 === n.displayName || m.p2 === n.displayName))[0];
  ok(!!novo, 'o tardio aparece em algum jogo');

  // (1) LIMBO: o jogo novo tem que ser IRMÃO dos outros da 1ª superior
  ok(novo && novo.bracket === bracketIrmao,
    'o jogo do tardio nasce na MESMA chave dos outros da 1ª sup (irmão=' + JSON.stringify(bracketIrmao) + ', got ' + JSON.stringify(novo && novo.bracket) + ')');
  const supDepois = primeiraSup(t);
  ok(supDepois.length === 7, '1ª superior passa a ter 7 jogos (got ' + supDepois.length + ')');
  ok(supDepois.some(m => m === novo), 'o jogo novo É contado como da 1ª superior (não ficou em limbo)');

  // (2) o adversário do tardio é um REPESCADO da própria 1ª superior
  const vaga = novo && (novo.repFill || []).filter(x => x && x.tagRep)[0];
  ok(!!vaga, 'a vaga aberta do jogo novo é preenchida por REPESCAGEM (melhor derrotado)');
  ok(vaga && vaga.srcRound === ((typeof supAntes[0].round === 'number') ? supAntes[0].round : 1),
    'o repescado vem da 1ª SUPERIOR (rodada-fonte certa)');

  // (3) a inferior é REORGANIZADA: 7 derrotados ⇒ ⌈7/2⌉ = 4 jogos
  const infDepois = primeiraInf(t);
  ok(infDepois.length === 4, '1ª inferior reorganizada para 4 jogos (⌈7/2⌉), got ' + infDepois.length);
  const impar = infDepois.filter(m => (m.repFill || []).length > 0);
  ok(impar.length === 1, 'a vaga do ímpar na 1ª inferior é preenchida por repescagem (got ' + impar.length + ')');

  // (4) o perdedor do jogo novo TEM destino na inferior
  ok(novo && !!novo.loserMatchId, 'o jogo novo manda o perdedor pra inferior (loserMatchId)');
  const destino = novo && all(t).filter(m => m.id === novo.loserMatchId)[0];
  ok(destino && destino.bracket === 'lower', 'o destino do perdedor é um jogo da chave INFERIOR');

  // (5) nada do que já existia foi alterado
  const assinaturaDepois = all(t).filter(real).map(m => m.p1 + ' vs ' + m.p2).sort();
  const sumiram = assinaturaAntes.filter(x => assinaturaDepois.indexOf(x) < 0);
  ok(sumiram.length === 0, 'nenhum confronto pré-existente foi alterado (sumiram ' + sumiram.length + ': ' + JSON.stringify(sumiram.slice(0, 3)) + ')');
})();

// ── O CAMINHO REAL: integrateLateEntries da Cloud Function ────────────────────────────────
// Em produção quem roda é `integrateLateEntries`, que chama _fillRepFillWithLateDuplas →
// _createExtraGamesFromWaitlist → _integrateLateDuplas → _placeLateEntriesSurgically NESSA ordem.
// Foi o _integrateLateDuplas (Tier 1) que criou o jogo órfão com bracket:'main' no doc do dono.
// Testar só o placer NÃO pegava o bug — este bloco entra pela mesma porta que a produção.
(function () {
  const t = mkT(12);
  const supAntes = primeiraSup(t);
  const bracketIrmao = supAntes[0] && supAntes[0].bracket;
  const n = chegaTardio(t, 200);
  const r = dc.integrateLateEntries(t, {});
  ok(!!(r && r.ok !== false), 'integrateLateEntries roda (' + JSON.stringify(r && r.reason || 'ok') + ')');

  const novo = all(t).filter(m => m && (m.p1 === n.displayName || m.p2 === n.displayName))[0];
  ok(!!novo, '[CF] o tardio aparece na chave');
  ok(novo && novo.bracket === bracketIrmao,
    '[CF] jogo do tardio na MESMA chave da 1ª sup — nada de "main" órfão (irmão=' + JSON.stringify(bracketIrmao) + ', got ' + JSON.stringify(novo && novo.bracket) + ')');
  ok(primeiraSup(t).length === 7, '[CF] 1ª superior passa a ter 7 jogos (got ' + primeiraSup(t).length + ')');
  ok(primeiraInf(t).length === 4, '[CF] 1ª inferior reorganizada para 4 jogos (got ' + primeiraInf(t).length + ')');
  ok(novo && !!novo.loserMatchId, '[CF] o perdedor do jogo novo tem destino');
  const dest = novo && all(t).filter(m => m.id === novo.loserMatchId)[0];
  ok(dest && dest.bracket === 'lower', '[CF] o destino do perdedor é a chave INFERIOR');
  // nenhum slot morto: toda vaga vazia da 1ª inferior ou é alimentada ou é repescagem
  const mortos = primeiraInf(t).filter(m => ['p1', 'p2'].some(s => {
    const vazio = !m[s] || m[s] === 'TBD';
    if (!vazio) return false;
    const alim = all(t).some(x => x !== m && ((x.nextMatchId === m.id && x.nextSlot === s) || (x.loserMatchId === m.id && x.loserSlot === s)));
    const rep = (m.repFill || []).some(rf => rf && rf.slot === s);
    return !alim && !rep;
  }));
  ok(mortos.length === 0, '[CF] nenhuma vaga morta na 1ª inferior (got ' + mortos.length + ')');
})();

console.log('\n' + (fail === 0 ? '✅ late-entry-upper-grows-lower: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
