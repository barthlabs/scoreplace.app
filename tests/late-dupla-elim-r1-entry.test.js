// REPRODUZ o bug do dono (jul/2026, Dupla Eliminatória em teste): "dado presença a uma dupla da
// lista de espera, essa dupla deveria entrar na R1, mas foi para o limbo. (nao criou novo confronto
// — aqui como nenhum jogo com posicao a definir, deveria criar novo jogo na R1 sup, R2 sup nao
// iniciada)".
//
// DUAS causas em _placeLateEntriesSurgically:
//  (1) a coleta exigia `p._lateJoin`. Essa flag só existe em dupla FORMADA TARDE — a dupla
//      PRÉ-FORMADA que o sorteio mandou pra espera ("só entre os presentes") NÃO a tem → era
//      ignorada → LIMBO. A UI promete o contrário: "Marque presença de quem está na espera".
//  (2) a rodada/chave de ENTRADA vinha do mínimo entre TODOS os jogos — em Dupla Elim isso inclui
//      `lower` e `grand`, então o jogo novo podia nascer na chave INFERIOR.
//
// REGRA TRAVADA: presente na espera ⇒ entra na R1 da chave SUPERIOR; sem "a definir" disponível,
// CRIA um jogo novo lá (vs a definir). [[project_dupla_elim_late_integration_cascade]]
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const isEmpty = v => !v || v === 'TBD' || /a definir/i.test(String(v));
const NM = 'Espera A / Espera B';

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N) {
  const t = { id: 'DEr1', sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false,
            eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio', dupla: true, terceiro: false } },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [], currentPhaseIndex: 0,
    checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [],
    lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  return t;
}
const all = t => W._collectAllMatches(t) || [];

// N em modo BYE (12,13,15) — a chave tem byes que o tardio preenche (bye→confronto). Pow2/play-in
// não tem vaga aditiva (o tardio ficaria na espera, testado no sweep); aqui provamos a ENTRADA.
console.log('── Dupla Elim: presente na espera PREENCHE UM BYE na R1 sup (bye→confronto, R1 intacta) ──');
const isEmptyR1 = v => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
function r1real(t) { const sup = all(t).filter(m => m.bracket === 'upper' || !m.bracket); const minR = Math.min.apply(null, sup.map(m => m.round)); return sup.filter(m => m.round === minR && !isEmptyR1(m.p1) && !isEmptyR1(m.p2)).map(m => [m.p1, m.p2].sort().join(' vs ')).sort(); }
[12, 13, 15].forEach(N => {
  const t = mkT(N);
  W.AppStore.tournaments = [t];
  const rd = dc.drawInitial(t, {});
  ok(rd && rd.ok, `N=${N}: sorteio inicial ok`);
  ok(/dupla/i.test(t.format || ''), `N=${N}: é MESMO Dupla Eliminatória (format="${t.format}")`);
  if (!rd || !rd.ok) return;
  const antesR1 = r1real(t);

  // dupla PRÉ-FORMADA na espera — SEM _lateJoin (é o que o sorteio "só presentes" produz)
  const dupla = { p1Uid: 'wA', p1Name: 'Espera A', p2Uid: 'wB', p2Name: 'Espera B', displayName: NM, name: NM };
  t.standbyParticipants.push(dupla);
  ok(!dupla._lateJoin, `N=${N}: (pré) a dupla NÃO tem _lateJoin — é pré-formada`);
  t.checkedIn['wA'] = 1; t.checkedIn['wB'] = 1;

  const r = dc.integrateLateEntries(t, {});
  ok(r && r.changed, `N=${N}: integração AGIU (não ficou no limbo) [${JSON.stringify(r)}]`);
  const mine = all(t).filter(m => m && (m.p1 === NM || m.p2 === NM));
  ok(mine.length >= 1, `N=${N}: ✅ a dupla presente ENTROU na chave preenchendo um bye (got ${mine.length} jogo(s))`);
  ok(!t.standbyParticipants.some(p => p.displayName === NM), `N=${N}: saiu da lista de espera`);
  ok(mine.every(m => m.p1 !== m.p2), `N=${N}: nenhum jogo dela é auto-confronto`);
  // ⛔ NUNCA re-sortear: nenhum confronto REAL da 1ª rodada SOME (o bye vira +1 jogo, os originais
  // ficam). Checa antes ⊆ depois (o preenchimento do bye ACRESCENTA, não remove).
  ok(antesR1.filter(x => r1real(t).indexOf(x) < 0).length === 0, `N=${N}: confrontos REAIS da 1ª sup INTACTOS (nada re-sorteado)`);
  ok(!r.redrawnFresh, `N=${N}: NÃO re-semeou a chave (redrawnFresh ausente)`);
  // sem double-book vivo
  const liveSlots = {}; all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v) && !/bye/i.test(String(v))) (liveSlots[v] = liveSlots[v] || []).push(m.id); }));
  ok(!(liveSlots[NM] && liveSlots[NM].length > 1), `N=${N}: dupla não está viva em 2 jogos (double-book)`);
  // joga até o fim → campeão único
  let g = 0;
  while (g++ < 4000) {
    const p = all(t).filter(m => m && !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && !/bye/i.test(String(m.p1)) && !/bye/i.test(String(m.p2)));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
    try { W._advanceWinner(t, m); } catch (e) {}
    if (W._resolveRepFills) { try { W._resolveRepFills(t); } catch (e) {} }
  }
  const grand = all(t).filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, `N=${N}: campeão único após re-semear pro N+1`);
});

console.log('\n' + (fail === 0 ? '✅ late-dupla-elim-r1-entry: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
