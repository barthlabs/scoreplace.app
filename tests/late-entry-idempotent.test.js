// REPRODUZ o bug do dono (jul/2026, print JOGO 7 + JOGO 8 idênticos): "testando a integracao tardia
// da mesma forma, criou 2 jogos inves de 1".
// CAUSA: a integração roda 1× por toggle de presença E de novo ao ligar "aceitar entradas". Numa 2ª
// passada a entrada ainda era coletada e ganhava um SEGUNDO jogo.
//
// ⚠️ RESSALVA DO DONO (e razão de NÃO usar "já está na chave → pula"): na REPESCAGEM um time aparece
// LEGITIMAMENTE em 2 jogos (perdeu a R1 e volta como repescado — o cânone que flexibiliza as 2
// derrotas). Um guard por "nome na chave" INVIABILIZARIA a repescagem. Por isso o registro é POR
// ENTRADA TARDIA JÁ COLOCADA (t.lateIntegrated[key]).
// Este teste trava as DUAS coisas: idempotência E repescagem intacta.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const NM = 'Marcello / Karla';

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N, dupla) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false };
  if (dupla) el.duplaElim = true;
  const t = { id: 'IDEM', sport: 'Beach Tennis', fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [], currentPhaseIndex: 0,
    checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [],
    lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  return t;
}
const gamesOf = (t, nm) => (W._collectAllMatches(t) || []).filter(m => m && (m.p1 === nm || m.p2 === nm));

console.log('── integração tardia é IDEMPOTENTE (N chamadas ⇒ 1 jogo) ──');
[['Elim Simples', false], ['Dupla Elim', true]].forEach(([label, dupla]) => {
  [4, 8].forEach(N => {
    ['roster', 'wait'].forEach(where => {
      const t = mkT(N, dupla);
      W.AppStore.tournaments = [t];
      if (!dc.drawInitial(t, {}).ok) return;
      const d = { p1Uid: 'mm', p1Name: 'Marcello', p2Uid: 'kf', p2Name: 'Karla', displayName: NM, name: NM };
      t.checkedIn['mm'] = 1; t.checkedIn['kf'] = 1;
      if (where === 'roster') { t.participants.push(d); t.teamOrigins[NM] = 'formada'; }
      else { t.waitlist.push(Object.assign({ _lateJoin: true }, d)); t.teamOrigins[NM] = 'formada'; }
      // 3 chamadas seguidas (marcou 1º membro, marcou 2º, ligou "aceitar entradas")
      dc.integrateLateEntries(t, {}); dc.integrateLateEntries(t, {}); dc.integrateLateEntries(t, {});
      const g = gamesOf(t, NM);
      ok(g.length === 1, `${label} N=${N} (${where}): 3 chamadas ⇒ 1 jogo só (got ${g.length})`);
    });
  });
});

// ── REPESCAGEM INTACTA: um time PODE aparecer em 2 jogos da R1 (perdeu e voltou repescado) ──
console.log('\n── repescagem segue possível (time em 2 jogos NÃO é bloqueado) ──');
(function () {
  // o guard é por ENTRADA TARDIA, não por nome na chave: um nome já presente na chave continua
  // podendo receber OUTRO jogo pelo motor de repescagem.
  const t = mkT(4, true);
  W.AppStore.tournaments = [t];
  dc.drawInitial(t, {});
  const someone = (W._collectAllMatches(t) || []).map(m => m && m.p1).filter(Boolean)[0];
  ok(!!someone, 'peguei um time já na chave (' + someone + ')');
  // NÃO está em lateIntegrated → nada o impede de ser colocado de novo (repescagem)
  ok(!W._lateAlreadyIntegrated(t, { displayName: someone, name: someone }),
     '✅ time JÁ NA CHAVE não é marcado como "integrado" — repescagem segue livre pra colocá-lo de novo');
  // e a entrada tardia realmente marcada fica bloqueada
  const d = { p1Uid: 'mm', p1Name: 'Marcello', p2Uid: 'kf', p2Name: 'Karla', displayName: NM, name: NM };
  W._markLateIntegrated(t, d);
  ok(W._lateAlreadyIntegrated(t, d), 'entrada tardia já colocada fica registrada (não duplica)');
  // re-sorteio limpa a lousa
  W._clearTournamentDraw(t);
  ok(!W._lateAlreadyIntegrated(t, d), 're-sorteio zera o registro (lousa limpa)');
})();

console.log('\n' + (fail === 0 ? '✅ late-entry-idempotent: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
