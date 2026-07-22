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

console.log('── Dupla Elim: presente na espera entra na R1 SUPERIOR (não vai pro limbo) ──');
[4, 8].forEach(N => {
  const t = mkT(N);
  W.AppStore.tournaments = [t];
  const rd = dc.drawInitial(t, {});
  ok(rd && rd.ok, `N=${N}: sorteio inicial ok`);
  ok(/dupla/i.test(t.format || ''), `N=${N}: é MESMO Dupla Eliminatória (format="${t.format}") — o gate de Elim Simples NÃO pode pegar`);
  if (!rd || !rd.ok) return;

  // CENÁRIO DO DONO: "aqui como nenhum jogo com posicao a definir". Tira TODA vaga de repescagem
  // (repFill) — assim o _fillRepFillWithLateDuplas não tem o que preencher nem de onde roubar, e a
  // responsabilidade cai em _placeLateEntriesSurgically (criar jogo novo na R1 superior).
  all(t).forEach(m => { if (m) { delete m.repFill; delete m.isPhaseRepGame; delete m.awaitsBestLoser; } });
  const semADefinir = all(t).every(m => !(Array.isArray(m.repFill) && m.repFill.length));
  ok(semADefinir, `N=${N}: (pré) nenhuma vaga de repescagem sobrou — é o cenário do dono`);

  // dupla PRÉ-FORMADA na espera — SEM _lateJoin (é o que o sorteio "só presentes" produz)
  const dupla = { p1Uid: 'wA', p1Name: 'Espera A', p2Uid: 'wB', p2Name: 'Espera B', displayName: NM, name: NM };
  t.standbyParticipants.push(dupla);
  ok(!dupla._lateJoin, `N=${N}: (pré) a dupla NÃO tem _lateJoin — é pré-formada`);
  // organizador dá PRESENÇA aos dois
  t.checkedIn['wA'] = 1; t.checkedIn['wB'] = 1;

  const before = all(t).length;
  const r = dc.integrateLateEntries(t, {});
  const mine = all(t).filter(m => m && (m.p1 === NM || m.p2 === NM));

  ok(mine.length === 1, `N=${N}: ✅ entrou na chave em UM jogo (got ${mine.length}) — antes ficava no LIMBO [${JSON.stringify(r)}]`);
  if (mine.length === 1) {
    const g = mine[0];
    ok(g.bracket === 'upper' || g.bracket === 'main',
       `N=${N}: o jogo é da chave SUPERIOR (got "${g.bracket}") — nunca lower/grand`);
    // é a 1ª rodada da chave principal
    const mainMs = all(t).filter(m => m && (m.bracket === 'upper' || m.bracket === 'main' || !m.bracket));
    const minR = Math.min.apply(null, mainMs.map(m => (typeof m.round === 'number') ? m.round : 1));
    ok(((typeof g.round === 'number') ? g.round : 1) === minR, `N=${N}: está na 1ª RODADA da chave principal (r${g.round}, min=${minR})`);
    ok(isEmpty(g.p1) || isEmpty(g.p2), `N=${N}: adversário fica "a definir" (não inventa oponente)`);
    ok(g.p1 !== g.p2, `N=${N}: não joga contra si mesma`);
  }
  ok(all(t).length > before, `N=${N}: um jogo NOVO foi criado`);
});

console.log('\n' + (fail === 0 ? '✅ late-dupla-elim-r1-entry: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
