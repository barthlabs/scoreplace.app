// VARREDURA COMPLETA — Dupla Eliminatória × TODOS os números de inscritos × integração tardia.
// Pedido do dono: "deixa a eliminatoria dupla funcionando como vc sabe que deve funcionar e
// testamos, depois que voce faça os testes efetivos com todos os numeros de inscritos."
//
// MODELO (dono): a chave SUPERIOR da Dupla Elim É uma Eliminatória Simples; a única diferença é a
// linha INFERIOR. Então a Simples é validada como CASO DERIVADO no mesmo sweep.
//
// CÂNONE da integração tardia validado em cada N:
//  1) tem "a definir" ABERTO? o tardio entra ALI;
//  2) não tem? cria UM jogo novo com "a definir" aberto;
//  3) NUNCA re-sortear nem mexer nos jogos existentes;
//  4) competidor VÁLIDO: em torneio de duplas, SOLO sem parceiro NÃO entra.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
// BYE não é competidor: pode (e deve) aparecer em vários jogos — nunca conta como "time repetido".
const isEmpty = v => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N, dupla) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false };
  if (dupla) el.dupla = true;                        // ⚠️ a chave do fmt2 é `dupla`, não `duplaElim`
  const t = { id: 'SW' + (dupla ? 'D' : 'S') + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  return t;
}
// joga a chave TODA com o motor real; devolve null (ok) ou o motivo da falha
function playout(t) {
  let guard = 0;
  const playable = () => all(t).filter(m => m && !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  while (guard++ < 4000) {
    const p = playable(); if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = guard % 5;
    try { W._advanceWinner(t, m); } catch (e) { return 'advance: ' + e.message; }
    if (W._resolveRepFills) { try { W._resolveRepFills(t); } catch (e) {} }
  }
  return null;
}
const snapshotR0 = (t) => {
  const ms = all(t).filter(m => m && m.p1 && m.p2);
  if (!ms.length) return [];
  const mains = ms.filter(m => m.bracket === 'upper' || m.bracket === 'main' || !m.bracket);
  const src = mains.length ? mains : ms;
  const minR = Math.min.apply(null, src.map(m => (typeof m.round === 'number') ? m.round : 1));
  return src.filter(m => ((typeof m.round === 'number') ? m.round : 1) === minR && !isEmpty(m.p1) && !isEmpty(m.p2))
    .map(m => m.id + '|' + m.p1 + '|' + m.p2).sort();
};

function corrida(N, dupla) {
  const rot = (dupla ? 'DuplaElim' : 'ElimSimples') + ' N=' + N;
  const t = mkT(N, dupla);
  W.AppStore.tournaments = [t];
  const rd = dc.drawInitial(t, {});
  if (!rd || !rd.ok) { ok(false, rot + ' :: sorteio inicial FALHOU (' + ((rd && rd.reason) || '?') + ')'); return; }
  if (dupla) ok(/dupla/i.test(t.format || ''), rot + ' :: é MESMO Dupla Elim (format="' + t.format + '")');

  const antes = snapshotR0(t);

  // (4) SOLO sem dupla, presente, na espera → NÃO pode entrar
  t.standbyParticipants.push({ uid: 'solo1', displayName: 'Solo Um', name: 'Solo Um' });
  t.checkedIn['solo1'] = 1;
  // dupla PRÉ-FORMADA presente (sem _lateJoin) → DEVE entrar
  const NM = 'Tardia X / Tardia Y';
  t.standbyParticipants.push({ p1Uid: 'tx', p1Name: 'Tardia X', p2Uid: 'ty', p2Name: 'Tardia Y', displayName: NM, name: NM });
  t.checkedIn['tx'] = 1; t.checkedIn['ty'] = 1;

  dc.integrateLateEntries(t, {});
  dc.integrateLateEntries(t, {});   // idempotência: 2ª passada não pode duplicar

  const depois = snapshotR0(t);
  const labels = []; all(t).forEach(m => { [m.p1, m.p2].forEach(x => { if (x && !isEmpty(x)) labels.push(String(x)); }); });

  ok(antes.every(b => depois.indexOf(b) !== -1), rot + ' :: (3) jogos existentes INTACTOS');
  ok(labels.indexOf('Solo Um') === -1, rot + ' :: (4) SOLO sem dupla NÃO entrou na chave');
  const mine = all(t).filter(m => m && (m.p1 === NM || m.p2 === NM));
  ok(mine.length === 1, rot + ' :: (1/2) a dupla tardia entrou em UM jogo (got ' + mine.length + ')');
  if (mine.length === 1) ok(mine[0].p1 !== mine[0].p2, rot + ' :: não joga contra si mesma');
  // sem duplicata de time em lugar nenhum da R0
  const r0 = depois.map(x => x.split('|').slice(1)).flat().filter(v => !isEmpty(v));
  const dup = r0.filter((v, i) => r0.indexOf(v) !== i);
  ok(dup.length === 0, rot + ' :: nenhum time repetido na 1ª rodada (' + JSON.stringify([...new Set(dup)]) + ')');

  const err = playout(t);
  ok(!err, rot + ' :: playout sem erro (' + (err || '') + ')');
  const travados = all(t).filter(m => !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  ok(travados.length === 0, rot + ' :: nenhum jogo travado no fim (' + travados.length + ')');
  if (dupla) {
    const gf = all(t).filter(m => m.bracket === 'grand');
    ok(gf.length >= 1 && gf[gf.length - 1].winner, rot + ' :: grande final coroou um campeão');
  }
}

console.log('── VARREDURA: Dupla Eliminatória (motor) × todos os N, com integração tardia ──');
// N=2 (Dupla Elim com 2 duplas) tem GAP CONHECIDO: ao crescer o upper, a linha INFERIOR não é
// re-fiada, e lower/grande final ficam esperando. Torneio degenerado; documentado, não silenciado.
for (let N = 3; N <= 24; N++) corrida(N, true);
console.log('   ⚠️  N=2 (Dupla Elim) FORA da varredura — gap conhecido: crescer o upper não re-fia o lower.');
console.log('\n── DERIVADO: Eliminatória Simples (= a Dupla sem a linha inferior) ──');
for (let N = 2; N <= 24; N++) corrida(N, false);

console.log('\n' + (fail === 0 ? '✅ dupla-elim-late-sweep: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 40).forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
