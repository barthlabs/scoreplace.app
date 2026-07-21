// E2E "TUDO NA CF": dirige a AÇÃO REAL do usuário — window._formDuplaByUids (o mesmo que o
// clique de "formar dupla" chama) — pelo dispatch real → CF formPair (funde) → CF
// integrateLateEntries (integra na chave). Prova que a dupla formada pós-sorteio ENTRA na chave
// SEM o cliente mutar/gravar roster (form/split NÃO chamam saveTournament).
const E = require('./e2e-cf-harness');
const W = E.W;
const ok = E.ok;
const BYE = W._t('bui.byeLabel');
const isEmpty = (v) => !v || v === 'TBD' || v === BYE || /a definir/i.test(String(v));

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function labels(t) {
  const s = new Set();
  (W._collectAllMatches(t) || []).forEach((m) => { if (!m) return; [m.p1, m.p2].forEach((x) => { if (x && !isEmpty(x)) s.add(String(x)); }); });
  (t.groups || []).forEach((gr) => (gr && (gr.players || gr.participants) || []).forEach((x) => s.add(String((x && (x.displayName || x.name)) || x))));
  return s;
}
function playPhase0(t) {
  let g = 0;
  while (g++ < 6000) {
    const all = W._collectAllMatches(t).filter((m) => m && (m.phaseIndex || 0) === 0 && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && !m.isSitOut && !m.isBye);
    if (!all.length) break;
    const m = all[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
    try { W._advanceWinner(t, m); } catch (e) { return 'advance:' + e.message; }
  }
  return null;
}

function cfg(kind) {
  if (kind === 'Elim Simples') return { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false } };
  if (kind === 'Dupla Elim') return { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio', duplaElim: true, terceiro: false } };
  if (kind === 'Grupos') return { disputa: 'dupla', grupos: 2, parceria: 'fixa', classifAtiva: true, classificados: 2, rodadas: { modo: 'todos', turnos: 'ida' }, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance' } };
  if (kind === 'Suíço') return { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 2, rodadas: { modo: 'suico' }, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance' } };
  if (kind === 'Liga') return { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 4, rodadas: { modo: 'todos', turnos: 'ida' }, eliminatoria: { ativa: false } };
}

console.log('── E2E form-pair pós-sorteio pelo DISPATCH REAL (todo formato) ──');

['Elim Simples', 'Dupla Elim', 'Grupos', 'Suíço', 'Liga'].forEach((kind) => {
  const t = E.createTournament(cfg(kind), { id: 'FPE-' + kind.replace(/\s/g, ''), participants: mkPairs(8), newMatchups: true, lateEnrollment: 'expand' });
  const label = 'E2E ' + kind;
  E.draw(t);
  ok(W._collectAllMatches(t).length > 0, label + ' :: sorteou (chave existe)');

  // chega uma dupla nova (2 solos presentes) e o ORGANIZADOR forma a dupla — AÇÃO REAL
  t.participants.push({ uid: 'lx', displayName: 'LateX', name: 'LateX', ligaActive: true });
  t.participants.push({ uid: 'ly', displayName: 'LateY', name: 'LateY', ligaActive: true });
  t.checkedIn['lx'] = 1; t.checkedIn['ly'] = 1;
  const before = labels(t);
  ok(!before.has('LateX / LateY'), label + ' :: (pré) dupla nova não está na chave');

  E.resetSaveCounter();
  E.resetLateGuards();
  W._formDuplaByUids(t.id, 'LateX', 'lx', 'LateY', 'ly');   // ← o clique real

  const after = labels(t);
  ok(after.has('LateX / LateY'), label + ' :: ✅ dupla formada ENTROU na chave (via CF)');
  ok(E.sawSave() === 0, label + ' :: cliente NÃO chamou saveTournament (tudo na CF)');
  // a fusão saiu do roster de solos e virou 1 dupla
  const roster = t.participants.map((p) => (p && (p.displayName || p.name)) || p);
  ok(roster.indexOf('LateX / LateY') !== -1 && roster.indexOf('LateX') === -1 && roster.indexOf('LateY') === -1, label + ' :: roster tem a dupla e não os 2 solos');

  const e0 = playPhase0(t);
  ok(!e0, label + ' :: fase joga sem travar após integrar (' + (e0 || '') + ')');
});

// ── GATE: novos confrontos OFF → forma a dupla mas NÃO entra na chave (respeita config) ──
console.log('\n── gate: sem novos confrontos, dupla formada fica fora ──');
(function () {
  const t = E.createTournament(cfg('Grupos'), { id: 'FPE-gateoff', participants: mkPairs(8), newMatchups: false, lateEnrollment: 'closed' });
  E.draw(t);
  t.participants.push({ uid: 'lx', displayName: 'LateX', name: 'LateX', ligaActive: true });
  t.participants.push({ uid: 'ly', displayName: 'LateY', name: 'LateY', ligaActive: true });
  t.checkedIn['lx'] = 1; t.checkedIn['ly'] = 1;
  E.resetLateGuards();
  W._formDuplaByUids(t.id, 'LateX', 'lx', 'LateY', 'ly');
  ok(!labels(t).has('LateX / LateY'), 'gate OFF :: dupla formada NÃO entra na chave (config do dono)');
  // mas a fusão no roster aconteceu (formar dupla vale sempre; só a integração respeita o gate)
  ok(t.participants.some((p) => (p.displayName || p.name) === 'LateX / LateY'), 'gate OFF :: dupla existe no roster');
})();

// ── SPLIT: desfazer dupla pós-sorteio via _splitDupla REAL (tudo na CF) ──
console.log('\n── split: desfazer dupla via dispatch real ──');
(function () {
  const t = E.createTournament(cfg('Grupos'), { id: 'FPE-split', participants: mkPairs(8), newMatchups: true, lateEnrollment: 'expand' });
  E.draw(t);
  E.resetSaveCounter();
  E.resetLateGuards();
  if (typeof W._splitDupla !== 'function') { ok(false, 'split :: _splitDupla indisponível no harness (definido no render) — SKIP'); return; }
  // desfaz a dupla A1/B1 (por uid dos dois membros)
  W._splitDupla(t.id, 'a1', 'b1');
  const roster = t.participants.map((p) => (p && (p.displayName || p.name)) || p);
  ok(roster.indexOf('A1 / B1') === -1, 'split :: dupla sumiu do roster');
  ok(roster.indexOf('A1') !== -1 && roster.indexOf('B1') !== -1, 'split :: 2 solos voltaram ao roster');
  ok(E.sawSave() === 0, 'split :: cliente NÃO chamou saveTournament (tudo na CF)');
})();

// ── BUG DO DONO: DUPLA FORMADA NA LISTA DE ESPERA (_formLateJoinDupla) tem que ENTRAR na chave.
// Esse é o caminho da tela de INSCRITOS (arrastar 1 card da espera sobre outro) — DIFERENTE do
// _formDuplaByUids (roster). A integração dependia do re-render do bracket, que não acontece na
// tela de inscritos → a dupla ficava na espera sem entrar na chave. Dirige a função REAL. ──
console.log('\n── dupla formada na LISTA DE ESPERA (_formLateJoinDupla) entra na chave ──');
['Elim Simples', 'Dupla Elim', 'Grupos', 'Suíço'].forEach((kind) => {
  const t = E.createTournament(cfg(kind), { id: 'LJ-' + kind.replace(/\s/g, ''), participants: mkPairs(8), newMatchups: true, lateEnrollment: 'expand' });
  const label = 'espera ' + kind;
  E.draw(t);
  if (typeof W._formLateJoinDupla !== 'function') { ok(false, label + ' :: _formLateJoinDupla indisponível'); return; }
  // dois solos chegam tarde e vão pra LISTA DE ESPERA (não pro roster)
  t.standbyParticipants.push({ uid: 'lx', displayName: 'LateX', name: 'LateX', ligaActive: true });
  t.standbyParticipants.push({ uid: 'ly', displayName: 'LateY', name: 'LateY', ligaActive: true });
  E.resetLateGuards();
  const before = labels(t);
  ok(!before.has('LateX / LateY'), label + ' :: (pré) dupla da espera não está na chave');
  W._formLateJoinDupla(t.id, 'lx', 'ly');   // ← arrastar-e-soltar REAL da tela de inscritos
  const after = labels(t);
  ok(after.has('LateX / LateY'), label + ' :: ✅ dupla da ESPERA entrou na chave');
  // saiu da espera, virou 1 dupla presente
  const stillSolo = (t.standbyParticipants || []).some((p) => (p.displayName || p.name) === 'LateX' || (p.displayName || p.name) === 'LateY');
  ok(!stillSolo, label + ' :: os 2 solos saíram da espera');
});

// ── BUG DO DONO: DUAS duplas na espera EM SEQUÊNCIA — as DUAS têm que entrar na chave (a 2ª
// "criada em seguida" não entrava) + DESFAZER a dupla da espera tem que funcionar. ──
console.log('\n── 2 duplas na espera em sequência + desfazer (_splitLateDupla) ──');
(function () {
  const t = E.createTournament(cfg('Elim Simples'), { id: 'LJ2', participants: mkPairs(8), newMatchups: true, lateEnrollment: 'expand' });
  E.draw(t);
  // 1ª dupla tardia
  t.standbyParticipants.push({ uid: 'x1', displayName: 'Ana', name: 'Ana', ligaActive: true });
  t.standbyParticipants.push({ uid: 'y1', displayName: 'Bia', name: 'Bia', ligaActive: true });
  E.resetLateGuards();
  W._formLateJoinDupla(t.id, 'x1', 'y1');
  ok(labels(t).has('Ana / Bia'), '2seq :: 1ª dupla da espera entrou');
  // 2ª dupla tardia LOGO EM SEGUIDA (o caso que falhava)
  t.standbyParticipants.push({ uid: 'x2', displayName: 'Cid', name: 'Cid', ligaActive: true });
  t.standbyParticipants.push({ uid: 'y2', displayName: 'Duda', name: 'Duda', ligaActive: true });
  W._formLateJoinDupla(t.id, 'x2', 'y2');
  ok(labels(t).has('Cid / Duda'), '2seq :: ✅ 2ª dupla (criada EM SEGUIDA) TAMBÉM entrou');

  // DESFAZER a 1ª dupla (o ✕ vermelho chama _splitLateDupla com o nome da dupla)
  if (typeof W._splitLateDupla !== 'function') { ok(false, 'desfazer :: _splitLateDupla indisponível'); return; }
  // a dupla desfeita tem que estar na ESPERA (não integrada ainda) pra o split achar — forma uma nova
  const t2 = E.createTournament(cfg('Elim Simples'), { id: 'LJ3', participants: mkPairs(8), newMatchups: false, lateEnrollment: 'closed' });
  E.draw(t2);
  t2.standbyParticipants.push({ uid: 'p1', displayName: 'Nei', name: 'Nei', ligaActive: true });
  t2.standbyParticipants.push({ uid: 'p2', displayName: 'Sil', name: 'Sil', ligaActive: true });
  E.resetLateGuards();
  W._formLateJoinDupla(t2.id, 'p1', 'p2');   // gate off → fica na espera como dupla formada
  ok(t2.standbyParticipants.some((p) => (p.displayName || p.name) === 'Nei / Sil'), 'desfazer :: dupla formada está na espera');
  // o ✕ real passa as IDENTIDADES DE MEMBRO (uid), NUNCA a string "A / B" (cânone uid).
  W._splitLateDupla(t2.id, 'p1', 'p2');
  const stbNames = t2.standbyParticipants.map((p) => (p && (p.displayName || p.name)) || p);
  ok(stbNames.indexOf('Nei / Sil') === -1, 'desfazer :: ✅ dupla sumiu da espera (casou por uid de membro)');
  ok(stbNames.indexOf('Nei') !== -1 && stbNames.indexOf('Sil') !== -1, 'desfazer :: 2 solos voltaram pra espera');
  // compat: chamada antiga só com o nome inteiro também casa
  W._formLateJoinDupla(t2.id, 'p1', 'p2');
  W._splitLateDupla(t2.id, 'Nei / Sil');
  ok(!t2.standbyParticipants.some((p) => (p.displayName || p.name) === 'Nei / Sil'), 'desfazer :: compat por nome inteiro ainda casa');
})();

// ── re-enfileiramento (a corrida async real que o harness síncrono não encena): enquanto uma
// integração está EM VOO, um 2º force NÃO pode ser descartado — fica PENDENTE e re-dispara ao fim. ──
console.log('\n── re-enfileira integração enquanto a anterior está em voo ──');
(function () {
  const t = E.createTournament(cfg('Elim Simples'), { id: 'RQ', participants: mkPairs(8), newMatchups: true, lateEnrollment: 'expand' });
  E.draw(t);
  W._lateIntegrateInflight = {}; W._lateIntegratePending = {}; W._lateIntegrateLastSig = {};
  W._lateIntegrateInflight[t.id] = true;    // simula a 1ª integração ainda em voo
  W._triggerLateIntegration(t, { force: true });   // 2º force chega no meio
  ok(W._lateIntegratePending[t.id] === true, 're-queue :: 2º force em voo fica PENDENTE (não é descartado em silêncio)');
  W._lateIntegrateInflight[t.id] = false;   // sem force, em voo, NÃO enfileira
  W._lateIntegratePending = {};
  W._lateIntegrateInflight[t.id] = true;
  W._triggerLateIntegration(t, {});         // sem force
  ok(!W._lateIntegratePending[t.id], 're-queue :: sem force em voo NÃO enfileira (anti-spam preservado)');
})();

const r = E.results();
console.log('\n' + (r.fail === 0 ? '✅ e2e-form-pair: OK' : '❌ ' + r.fail + ' FALHA(S)') + '  (' + r.pass + ' asserts ok)');
if (r.fails.length) { console.error('\nFALHAS:'); r.fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(r.fail > 0 ? 1 : 0);
