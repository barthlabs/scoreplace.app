// REPRODUZ O BUG DO DONO (21/jul): "formei dupla e nada dela entrar na porra das chaves."
// Uma dupla FORMADA depois do sorteio funde 2 solos em t.participants (não passa pela lista de
// espera) → nenhuma função de integração tardia (que lê waitlist/_lateJoin) a enxergava, e o
// disparo _triggerLateIntegration abortava com espera vazia. A dupla ficava em participants mas
// SEM confronto na chave.
//
// O fix: (1) draw-core.integrateLateEntries detecta ÓRFÃO DE ROSTER (inscrito em participants fora
// da chave) e re-sorteia (sem resultado + novos confrontos on), em TODO formato inclusive Elim
// Simples; (2) _triggerLateIntegration com {force} ignora o bail de espera vazia; (3) os dois
// caminhos de formar dupla disparam a integração (force) depois de persistir, se a chave existe.
//
// Aqui provo o CORE (a CF): sorteia a chave de duplas, funde uma dupla pós-sorteio direto em
// participants (como o formPair faz no doc), chama integrateLateEntries e exige que a dupla ENTRE
// na chave — e que a chave siga jogável até um campeão. Todo formato. Também prova o gate: sem
// novos confrontos, NÃO integra (fica na config do dono).
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const isEmpty = (v) => !v || v === 'TBD' || v === BYE || /a definir/i.test(String(v));

// N duplas "A1 / B1" .. "AN / BN"
function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }

function labelsInBracket(t) {
  const s = new Set();
  const all = W._collectAllMatches(t) || [];
  all.forEach((m) => { if (!m) return; [m.p1, m.p2].forEach((x) => { if (x && !isEmpty(x)) s.add(String(x)); }); if (Array.isArray(m.team1)) m.team1.forEach((x) => s.add(String((x && (x.displayName || x.name)) || x))); if (Array.isArray(m.team2)) m.team2.forEach((x) => s.add(String((x && (x.displayName || x.name)) || x))); });
  (t.groups || []).forEach((gr) => (gr && (gr.players || gr.participants) || []).forEach((x) => s.add(String((x && (x.displayName || x.name)) || x))));
  return s;
}
// joga a fase 0 até assentar (só pra provar que a chave com a dupla nova não trava)
function playPhase0(t) {
  let g = 0;
  while (g++ < 5000) {
    const all = W._collectAllMatches(t).filter((m) => m && (m.phaseIndex || 0) === 0 && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && !m.isSitOut && !m.isBye);
    if (!all.length) break;
    const m = all[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
    try { W._advanceWinner(t, m); } catch (e) { return 'advance:' + e.message; }
  }
  return null;
}

// fmt2 de duplas por "kind" de eliminatória / classificatória.
function mkTournament(kind, N) {
  let cfg;
  if (kind === 'Elim Simples') cfg = { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false } };
  else if (kind === 'Dupla Elim') cfg = { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio', duplaElim: true, terceiro: false } };
  else if (kind === 'Grupos') cfg = { disputa: 'dupla', grupos: 2, parceria: 'fixa', classifAtiva: true, classificados: 2, rodadas: { modo: 'todos', turnos: 'ida' }, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance' } };
  else if (kind === 'Suíço') cfg = { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 2, rodadas: { modo: 'suico' }, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance' } };
  else if (kind === 'Liga') cfg = { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 4, rodadas: { modo: 'todos', turnos: 'ida' }, eliminatoria: { ativa: false } };
  const t = {
    id: 'FP-' + kind.replace(/\s/g, '') + '-' + N, sport: 'Beach Tennis', fmt2: cfg,
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [],
    lateEnrollment: 'expand', newMatchups: true,
  };
  // Dupla Elim é config legada por t.format (o compile de fmt2 já resolve, mas garante)
  const rc = dc.compileFromFmt2(t);
  return { t, rc };
}

// Funde uma dupla NOVA pós-sorteio direto em participants (exatamente como computeFormPair grava no
// doc): dois solos que chegaram tarde viram "LX / LY". Marca presença dos dois membros.
function formPairPostDraw(t, idx) {
  const nm = 'LX' + idx + ' / LY' + idx;
  t.participants.push({ p1Uid: 'lx' + idx, p1Name: 'LX' + idx, p2Uid: 'ly' + idx, p2Name: 'LY' + idx, displayName: nm, name: nm, ligaActive: true });
  t.teamOrigins[nm] = 'formada';
  t.checkedIn['lx' + idx] = 1; t.checkedIn['ly' + idx] = 1;
  return nm;
}

console.log('── FORM-PAIR PÓS-SORTEIO: a dupla formada TEM que entrar na chave (todo formato) ──');

['Elim Simples', 'Dupla Elim', 'Grupos', 'Suíço', 'Liga'].forEach((kind) => {
  const N = (kind === 'Grupos') ? 8 : (kind === 'Suíço' || kind === 'Liga') ? 8 : 8;
  const { t, rc } = mkTournament(kind, N);
  const label = 'FormPair ' + kind + ' N=' + N;
  ok(rc && rc.ok, label + ' :: compile ok (' + (rc && rc.reason || '') + ')');
  W.AppStore.tournaments = [t];
  const rd = dc.drawInitial(t, {});
  ok(rd && rd.ok, label + ' :: sorteio inicial ok (' + (rd && rd.reason || '') + ')');
  if (!rd || !rd.ok) return;

  const before = labelsInBracket(t);
  const nm = formPairPostDraw(t, 1);
  ok(!before.has(nm), label + ' :: (pré) dupla nova NÃO estava na chave');

  const r = dc.integrateLateEntries(t, {});
  ok(r && r.changed === true, label + ' :: integrateLateEntries changed=true (' + JSON.stringify(r) + ')');
  const after = labelsInBracket(t);
  ok(after.has(nm), label + ' :: ✅ a dupla FORMADA entrou na chave');

  // a chave com a dupla nova segue jogável até assentar a fase 0 sem travar
  const e0 = playPhase0(t);
  ok(!e0, label + ' :: fase joga sem erro após integrar (' + (e0 || '') + ')');
});

// ── GATE: novos confrontos DESLIGADO → a dupla formada NÃO entra (respeita a config do dono) ──
console.log('\n── gate: sem novos confrontos, NÃO integra ──');
(function () {
  const { t } = mkTournament('Grupos', 8);
  t.newMatchups = false; t.lateEnrollment = 'closed';
  W.AppStore.tournaments = [t];
  dc.drawInitial(t, {});
  const nm = formPairPostDraw(t, 9);
  const r = dc.integrateLateEntries(t, {});
  ok(!(r && r.changed), 'gate OFF :: integrateLateEntries NÃO muda (' + JSON.stringify(r) + ')');
  ok(!labelsInBracket(t).has(nm), 'gate OFF :: dupla formada fica FORA da chave (config do dono)');
})();

// ── RESULTADO já lançado → NÃO re-sorteia (não perde jogo jogado) ──
console.log('\n── guard: com resultado, NÃO re-sorteia ──');
(function () {
  const { t } = mkTournament('Elim Simples', 8);
  W.AppStore.tournaments = [t];
  dc.drawInitial(t, {});
  // lança 1 resultado
  const m0 = (W._collectAllMatches(t) || []).find((m) => m && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  if (m0) { m0.winner = m0.p1; m0.scoreP1 = 6; m0.scoreP2 = 2; }
  const nm = formPairPostDraw(t, 7);
  const r = dc.integrateLateEntries(t, {});
  ok(!(r && r.redrawn), 'guard resultado :: NÃO re-sorteia com jogo já jogado (redrawn falsy)');
  // o jogo jogado continua com o vencedor
  const still = (W._collectAllMatches(t) || []).some((m) => m && m.winner);
  ok(still, 'guard resultado :: resultado preservado');
})();

console.log('\n' + (fail === 0 ? '✅ form-pair-integration: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
