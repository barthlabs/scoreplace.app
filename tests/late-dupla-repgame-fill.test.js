// GAP (dono, 17/jul, com screenshot): Dupla Eliminatória com nº ÍMPAR de duplas deixa a
// dupla sobrando num repGame esperando adversário — "JOGO N: Kelly/Rodrigo VS A definir"
// (isPhaseRepGame, um lado real + outro TBD). Quando 1 dupla é formada na lista de espera,
// ela DEVE preencher esse slot (não ficar esperando fora da chave). Regra do dono: "novos
// confrontos é justamente isso: gente esperando pra jogar na chave × gente esperando fora.
// entra e muda os números e as contas de potência de 2 (mantendo a decisão bye/repescagem)".
//
// Este teste REPRODUZ a falha: no código VELHO _integrateLateDuplas só achava "satTeam" FORA
// de qualquer jogo — a dupla ímpar está DENTRO do repGame (em inRep), então NÃO era achada e
// a tardia solitária voltava 0 (ficava na lista de espera). No NOVO, a dupla real do repGame
// vira o par da tardia, o repGame é removido e a chave é reconstruída (pow2/repescagem) com o
// nº novo. Ver [[project_dupla_elim_repechage]] / [[project_late_enrollment_elimination]].
const { window: W, sandbox, load, E } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
load('tournaments-draw.js');
const BYE = 'BYE (Avança Direto)';

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

function mkPool(n) { var a = []; for (var i = 0; i < n; i++) a.push({ displayName: 'D' + i, name: 'D' + i, uid: 'u' + i }); return a; }
function build(n) {
  const CAT = 'Misto Obrig.';
  const cfg = { format: 'Dupla Eliminatória', formatCode: 'elim_dupla', teamSize: 2, bracketResolution: 'playin', seedVip: true, thirdPlace: true, source: { type: 'enrollment' }, categories: [CAT] };
  const pool = mkPool(n).map(p => Object.assign({ categories: [CAT] }, p));
  const t = { id: 'T' + n, format: 'Dupla Eliminatória', teamSize: 2, matches: [], currentPhaseIndex: 0, lateEnrollment: 'expand' };
  const built = E.generatePhase(pool, cfg, { idPrefix: 'gp', ordered: true, t, isVip: () => false, catOf: e => (e.categories && e.categories[0]) || '' });
  E.storePhase(t, 0, built);
  if (built.needsRepechageDoubleElim && W._buildRepechageDoubleElim) {
    (built.repMetaByCat && built.repMetaByCat.length ? built.repMetaByCat : [built.repMeta]).forEach(mm => W._buildRepechageDoubleElim(t, mm));
  }
  return t;
}
const upperR0 = (t) => W._collectAllMatches(t).filter(m => m && m.bracket === 'upper' && m.round === 0 && m.isPhaseRepR1);
const isEmpty = (v) => !v || v === 'TBD' || v === BYE;

function run(n) {
  console.log('\n== repGame-fill · n=' + n + ' (ímpar) ==');
  const t = build(n);

  // pré-condição: existe um repGame com um lado real + outro "A definir" (a dupla ímpar).
  const rg = upperR0(t).find(m => m.isPhaseRepGame && (isEmpty(m.p1) !== isEmpty(m.p2)));
  ok(!!rg, 'existe repGame "dupla real VS A definir" (a ímpar esperando na chave)');
  const oddName = rg && (isEmpty(rg.p1) ? rg.p2 : rg.p1);

  // 1 dupla formada na lista de espera (estrutural + _lateJoin).
  t.standbyParticipants = [{ p1Name: 'LA', p2Name: 'LB', p1Uid: 'lla', p2Uid: 'llb', displayName: 'LA / LB', _lateJoin: true }];

  W._lastIntegrateTier = null;
  const ret = W._integrateLateDuplas(t);
  ok(ret === 1, 'integrou a dupla tardia solitária (got ' + ret + ') — no código velho seria 0');
  ok(W._lastIntegrateTier === 1, 'Tier 1 (append no upper R1)');
  ok(!(t.standbyParticipants || []).some(p => (p.displayName) === 'LA / LB'), 'saiu da lista de espera');

  // a dupla ímpar agora joga um repR1 REAL contra a tardia (o repGame virou jogo real).
  const realGame = upperR0(t).find(m => (m.p1 === oddName || m.p2 === oddName) && (m.p1 === 'LA / LB' || m.p2 === 'LA / LB'));
  ok(!!realGame, oddName + ' agora joga a R1 contra LA / LB (preencheu o "A definir")');
  ok(!(realGame && realGame.isPhaseRepGame), 'o slot deixou de ser repGame/awaits — virou confronto real');

  // playout completo: chave reconstruída resolve num campeão, sem travar.
  let guard = 0;
  const playable = () => W._collectAllMatches(t).filter(m => m && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  while (guard++ < 500) { const p = playable(); if (!p.length) break; const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = guard % 5; W._advanceWinner(t, m); }
  const all = W._collectAllMatches(t);
  const stuck = all.filter(m => !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  const grand = all.filter(m => m.bracket === 'grand');
  ok(stuck.length === 0, 'playout: nenhum jogo travado (got ' + stuck.length + ')');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'playout: grande final num campeão');
}

run(5);   // caso do screenshot (5 duplas → repGame D4 VS A definir)
run(7);   // outra ímpar
run(9);   // ímpar maior

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
