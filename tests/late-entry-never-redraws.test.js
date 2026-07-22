// REPRODUZ o desastre relatado pelo dono (jul/2026, print do SB "Torneio de Férias só Casais"):
// "coloquei a presença do marcelo/karla e ativei a entrada (que estava desligada) e cagou tudo.
//  era para eles entrarem no jogo 7 sem mudar nenhum dos demais 6 jogos. mudou tudo, dupla virou
//  individual; criou jogo 8!"
//
// CAUSA: o fallback de REDRAW em integrateLateEntries fazia _clearTournamentDraw + drawInitial —
// APAGA a chave inteira e re-sorteia. O guard era só "não há resultado lançado", o que protege os
// PLACARES mas NÃO os CONFRONTOS: a chave já estava publicada, todo mundo já tinha visto seu jogo.
// (No print: changed:true com extra:0/duplas:0/monarch:0 → só o redraw podia ter mudado.)
//
// REGRA TRAVADA: entrada tardia é SEMPRE ADITIVA. Com chave já sorteada, os jogos EXISTENTES da 1ª
// rodada são INTOCÁVEIS — o tardio entra num jogo NOVO (vs "a definir"). NUNCA re-sortear.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const isEmpty = v => !v || v === 'TBD' || /a definir/i.test(String(v));

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N) {
  const t = {
    id: 'NOREDRAW', sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false } },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true,
  };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  return t;
}
const all = t => W._collectAllMatches(t) || [];
// "jogos da 1ª rodada" = a rodada de menor índice (os 6 do print)
function firstRoundSnapshot(t) {
  const ms = all(t).filter(m => m && m.p1 && m.p2);
  const minR = Math.min.apply(null, ms.map(m => (typeof m.round === 'number' ? m.round : 1)));
  return all(t).filter(m => m && (typeof m.round === 'number' ? m.round : 1) === minR && !isEmpty(m.p1) && !isEmpty(m.p2))
    .map(m => m.id + '|' + m.p1 + '|' + m.p2).sort();
}

console.log('── entrada tardia NÃO pode re-sortear a chave já publicada ──');
(function () {
  const t = mkT(8);   // 8 duplas → 4 jogos na 1ª rodada, potência de 2 (SEM bye ⇒ nenhum jogo
                      // decidido ⇒ o guard "não há resultado" não segura o redraw: o cenário do dono)
  W.AppStore.tournaments = [t];
  const rd = dc.drawInitial(t, {});
  ok(rd && rd.ok, 'sorteio inicial ok');
  const before = firstRoundSnapshot(t);
  ok(before.length === 4, 'pré: 4 jogos reais na 1ª rodada (got ' + before.length + ')');

  // dupla FORMADA à mão, presente, fora da chave (o caso Marcello/Karla)
  const nm = 'Marcello / Karla';
  t.participants.push({ p1Uid: 'mm', p1Name: 'Marcello', p2Uid: 'kf', p2Name: 'Karla', displayName: nm, name: nm, ligaActive: true });
  t.teamOrigins[nm] = 'formada';
  t.checkedIn['mm'] = 1; t.checkedIn['kf'] = 1;

  const r = dc.integrateLateEntries(t, {});

  const after = firstRoundSnapshot(t);
  // ⚠️ O ASSERT CENTRAL: os 6 jogos que já existiam continuam EXATAMENTE iguais.
  ok(before.every(b => after.indexOf(b) !== -1),
     '✅ os jogos ORIGINAIS seguem INTACTOS (mesmos ids e confrontos) [' + JSON.stringify(r) + ']');
  // e nenhum rótulo quebrado tipo "/ Camila Putignani" (dupla virando individual)
  const broken = all(t).filter(m => m && [m.p1, m.p2].some(x => typeof x === 'string' && /^\s*\/|\/\s*$/.test(x)));
  ok(broken.length === 0, 'nenhum rótulo de dupla quebrado ("/ Fulano") — got ' + broken.length);
  // a dupla nova entrou (num jogo NOVO, vs "a definir" ou contra alguém)
  const mine = all(t).filter(m => m && (m.p1 === nm || m.p2 === nm));
  ok(mine.length >= 1, 'a dupla tardia entrou na chave (jogo novo)');
  ok(mine.every(m => m.p1 !== m.p2), 'não joga contra si mesma');
})();

console.log('\n' + (fail === 0 ? '✅ late-entry-never-redraws: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
