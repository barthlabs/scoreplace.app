// SWEEP DE INTEGRAÇÃO TARDIA (dono, 21/jul: "todos os testes p/ cada config × cada N funcionar").
// Reproduz o fluxo REAL: sorteia pelo motor da CF (draw-core.drawInitial — o mesmo de prod), depois
// SIMULA entradas tardias (dupla FORMADA de solos na espera — shape EXATO de bracket.js:885; dupla
// pré-formada ausente que chega; solo individual), roda draw-core.integrateLateEntries, e exige o
// INVARIANTE do dono:
//   "a entrada tardia que PODE entrar TEM que ir pra chave — preenche 'a definir'/repescagem OU abre
//    novo jogo. NUNCA fica órfã na lista de espera." E a chave joga até 1 campeão, sem TBD morto.
// Cobre Elim Simples e Dupla Elim, individual e duplas, muitos N (par/ímpar/pot2/não-pot2),
// com sorteio CHEIO e sorteio SÓ-PRESENTES (scope:present → 'a definir').
//
// node tests/late-integration-sweep.test.js
const { window: W } = require('./headless');
const dc = require('../functions-autodraw/draw-core.js');
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function pair(a, b) { return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b, name: a + ' / ' + b }; }
function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push(pair('A' + i, 'B' + i)); return a; }
function mkIndiv(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ uid: 'u' + i, displayName: 'P' + i, name: 'P' + i, gender: (i % 2 ? 'masculino' : 'feminino') }); return a; }
// dupla FORMADA de 2 solos tardios — shape EXATO de _formLateDupla (bracket.js:885): estrutural + _lateJoin.
function latePairFormed(a, b) { return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b, name: a + ' / ' + b, _lateJoin: true }; }
function lateSolo(name) { return { uid: name.toLowerCase(), displayName: name, name: name, _lateJoin: true, gender: 'masculino' }; }

function tour(format, extra) {
  return Object.assign({
    id: 'T', name: 'x', format: format, teamSize: 1, enrollmentMode: 'individual', participants: [],
    combinedCategories: [], currentPhaseIndex: 0, status: 'active', lateEnrollment: 'expand',
    checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {},
    sport: 'Beach Tennis', creatorUid: 'uOrg', organizerEmail: 'o@x.com',
    startDate: '2026-07-20T09:00:00', endDate: '2026-07-20T20:00:00',
  }, extra || {});
}
function checkInEntry(t, p) {
  if (p.p1Uid || p.p1Name) { t.checkedIn[p.p1Uid || p.p1Name] = Date.now(); t.checkedIn[p.p2Uid || p.p2Name] = Date.now(); }
  else { t.checkedIn[p.uid || p.name] = Date.now(); }
}
const nameOf = (p) => (p && (p.displayName || p.name)) || '';
const inBracket = (t, dn) => W._collectAllMatches(t).some((m) => m && (m.p1 === dn || m.p2 === dn));
const isEmpty = (v) => !v || v === 'TBD' || v === BYE || /a definir/i.test(String(v));

// joga a chave inteira até assentar → {stuck, dead, champ}
function playBracket(t) {
  let g = 0;
  while (g++ < 6000) {
    const all = W._collectAllMatches(t).filter((m) => m && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!all.length) break;
    const m = all[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
    try { W._advanceWinner(t, m); } catch (e) { return { err: 'advance:' + e.message }; }
  }
  const all = W._collectAllMatches(t);
  const maxR = all.length ? Math.max.apply(null, all.map((x) => x.round || 0)) : 0;
  const stuck = all.filter((m) => m && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)).length;
  const dead = all.filter((m) => m && !m.isThirdPlace && !m.isSitOut && !m.winner && (isEmpty(m.p1) || isEmpty(m.p2)) && (m.round || 0) < maxR).length;
  const champ = all.some((m) => m && !m.isThirdPlace && m.winner);
  return { stuck, dead, champ };
}

// Roda o cenário: monta t, sorteia, injeta tardios, integra, valida.
// opts: { fmt, enrollment('teams'|'individual'), N, lateEntries:[...], scope('present'|null),
//         presentCount, mustIntegrate:[displayNames], label }
function scenario(o) {
  const extra = { participants: o.participants };
  if (o.enrollment === 'teams') { extra.teamSize = 2; extra.enrollmentMode = 'teams'; }
  const t = tour(o.fmt, extra);
  // presença: todos, ou só os primeiros presentCount (p/ scope:present)
  const pc = (o.scope === 'present') ? (o.presentCount != null ? o.presentCount : o.participants.length) : o.participants.length;
  o.participants.forEach((p, i) => { if (i < pc) checkInEntry(t, p); });
  const decisions = (o.scope === 'present') ? { scope: 'present' } : {};
  const dr = dc.drawInitial(t, { decisions: decisions });
  ok(!!(dr && dr.ok), o.label + ' :: drawInitial ok (' + (dr && dr.reason || '') + ')');
  if (!dr || !dr.ok) return;

  // injeta tardios na espera + marca presença
  (o.lateEntries || []).forEach((p) => { t.standbyParticipants.push(p); checkInEntry(t, p); });

  const before = W._collectAllMatches(t).length;
  const ires = dc.integrateLateEntries(t, {});
  ok(!!(ires && ires.ok), o.label + ' :: integrate ok (' + (ires && ires.reason || '') + ')');

  // INVARIANTE: cada tardio "que pode entrar" TEM que estar na chave (não órfão na espera).
  (o.mustIntegrate || []).forEach((dn) => {
    ok(inBracket(t, dn), o.label + ' :: "' + dn + '" ENTROU na chave (não ficou órfão)');
    ok(!(t.standbyParticipants || []).concat(t.waitlist || []).some((p) => nameOf(p) === dn && !inBracket(t, dn)),
       o.label + ' :: "' + dn + '" saiu da espera');
  });

  // a chave ainda joga até 1 campeão, sem travado, sem TBD morto.
  const pr = playBracket(t);
  ok(!pr.err, o.label + ' :: playthrough sem erro (' + (pr.err || '') + ')');
  ok(pr.stuck === 0, o.label + ' :: nenhum jogo travado (' + pr.stuck + ')');
  ok(pr.dead === 0, o.label + ' :: nenhum slot morto (' + pr.dead + ')');
  ok(pr.champ, o.label + ' :: fechou num campeão');
}

console.log('── SWEEP INTEGRAÇÃO TARDIA: formato × config × N ──');

// ══ 1. DUPLAS · Elim Simples · sorteio CHEIO + 1 dupla FORMADA tardia (o caso do dono) ══
[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16].forEach((N) => {
  scenario({
    label: 'ElimSimples DUPLAS N=' + N + ' +1 dupla formada', fmt: 'Eliminatórias Simples',
    enrollment: 'teams', participants: mkPairs(N),
    lateEntries: [latePairFormed('L1', 'L2')], mustIntegrate: ['L1 / L2'],
  });
});

// ══ 2. DUPLAS · Elim Simples · sorteio SÓ-PRESENTES ('a definir') + 1 dupla tardia PREENCHE ══
[4, 5, 6, 7, 8, 9, 10, 12].forEach((N) => {
  const P = mkPairs(N); const absent = P[N - 1]; // último ausente no sorteio
  scenario({
    label: 'ElimSimples DUPLAS N=' + N + ' scope:present + tardia preenche a-definir',
    fmt: 'Eliminatórias Simples', enrollment: 'teams', participants: P,
    scope: 'present', presentCount: N - 1,
    lateEntries: [Object.assign({}, absent, { _lateJoin: true })], mustIntegrate: [nameOf(absent)],
  });
});

// ══ 3. DUPLAS · Elim Simples · 2 duplas formadas tardias → novo jogo entre elas ══
[2, 3, 4, 6, 8].forEach((N) => {
  scenario({
    label: 'ElimSimples DUPLAS N=' + N + ' +2 duplas formadas', fmt: 'Eliminatórias Simples',
    enrollment: 'teams', participants: mkPairs(N),
    lateEntries: [latePairFormed('L1', 'L2'), latePairFormed('L3', 'L4')],
    mustIntegrate: ['L1 / L2', 'L3 / L4'],
  });
});

// ══ 4. DUPLAS · Dupla Eliminatória · 1 e 2 duplas formadas tardias ══
[3, 4, 5, 6, 7, 8, 10, 12].forEach((N) => {
  scenario({
    label: 'DuplaElim DUPLAS N=' + N + ' +2 duplas formadas', fmt: 'Dupla Eliminatória',
    enrollment: 'teams', participants: mkPairs(N),
    lateEntries: [latePairFormed('L1', 'L2'), latePairFormed('L3', 'L4')],
    mustIntegrate: ['L1 / L2', 'L3 / L4'],
  });
});

// ══ 5. INDIVIDUAL · Elim Simples · solos tardios (1 e 2) ══
[2, 3, 4, 5, 6, 7, 8, 9, 12, 16].forEach((N) => {
  scenario({
    label: 'ElimSimples INDIV N=' + N + ' +2 solos', fmt: 'Eliminatórias Simples',
    enrollment: 'individual', participants: mkIndiv(N),
    lateEntries: [lateSolo('Lx'), lateSolo('Ly')], mustIntegrate: ['Lx', 'Ly'],
  });
});

// ══ 6. INDIVIDUAL · Dupla Eliminatória · 2 solos tardios ══
[3, 4, 5, 6, 7, 8, 12].forEach((N) => {
  scenario({
    label: 'DuplaElim INDIV N=' + N + ' +2 solos', fmt: 'Dupla Eliminatória',
    enrollment: 'individual', participants: mkIndiv(N),
    lateEntries: [lateSolo('Lx'), lateSolo('Ly')], mustIntegrate: ['Lx', 'Ly'],
  });
});

// ══ 7. INDEPENDÊNCIA "Novos Confrontos" × "Abertas" (dono, 21/jul) ══
// newMatchups:true integra a dupla formada MESMO com inscrições fechadas (lateEnrollment:'closed').
// Sem newMatchups (ou false), a dupla fica SUPLENTE (não entra) — os dois flags são independentes.
console.log('\n── independência Novos Confrontos × Abertas ──');
[['closed', true, true], ['closed', false, false], ['closed', undefined, false], ['standby', true, true], ['expand', undefined, true]].forEach(function (c) {
  const le = c[0], nm = c[1], shouldIntegrate = c[2];
  const t = tour('Eliminatórias Simples', { teamSize: 2, enrollmentMode: 'teams', participants: mkPairs(4), lateEnrollment: le });
  if (nm !== undefined) t.newMatchups = nm;
  mkPairs(4).forEach(function () {}); // noop
  t.participants.forEach(function (p) { checkInEntry(t, p); });
  dc.drawInitial(t, {});
  t.standbyParticipants.push(latePairFormed('Zx', 'Zy')); checkInEntry(t, latePairFormed('Zx', 'Zy'));
  dc.integrateLateEntries(t, {});
  const inBr = inBracket(t, 'Zx / Zy');
  const label = 'le=' + le + ' newMatchups=' + nm;
  ok(inBr === shouldIntegrate, 'independência :: ' + label + ' → integra=' + shouldIntegrate + ' (got ' + inBr + ')');
});

console.log('\n' + (fail === 0 ? '✅ late-integration-sweep: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 80).forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
