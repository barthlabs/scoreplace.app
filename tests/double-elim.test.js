/* DUPLA ELIMINATÓRIA (lower bracket + loser-drop + grande final) — node tests/double-elim.test.js
 *
 * Congela a topologia e o ciclo de vida da Dupla Eliminatória sobre o código REAL:
 *   • `window._buildDoubleElimBracket` (tournaments-draw.js) monta upper + lower + grand.
 *   • `window._advanceWinner` (bracket-logic.js) roteia vencedor→próxima e PERDEDOR→lower
 *     (loser-drop, decidido pela fase canônica quando ela existir).
 * Invariantes (pow2 4 e 8): upper drop pra lower (loserMatchId), upper final + lower final
 *   convergem na ÚNICA grande final, e jogando TUDO sai 1 campeão com ZERO órfãos (nenhum
 *   match real fica sem vencedor ou com slot 'TBD' pendente).
 * Carrega tournaments-draw.js no MESMO contexto do harness (exporta `load`).
 */
const H = require('./headless.js');
H.load('tournaments-draw.js'); // traz window._buildDoubleElimBracket pro contexto
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const isReal = (x) => x && x !== 'TBD' && !/BYE/.test(String(x));

function buildDE(n) {
  // upper R1: n/2 jogos, semente adjacente (T1×T2, T3×T4 …) — basta pra topologia.
  const names = []; for (let i = 1; i <= n; i++) names.push('T' + i);
  const t = {
    id: 'de' + n,
    // O rótulo de topo deliberadamente contradiz a fase: prova que o motor
    // não volta ao legado quando um documento já é canônico.
    format: 'Liga',
    phases: [{ kind: 'elimination', elimination: { bracketType: 'double' } }],
    currentPhaseIndex: 0,
    matches: []
  };
  for (let i = 0; i < n / 2; i++) {
    t.matches.push({ id: 'u' + i, round: 1, bracket: 'upper',
      p1: names[2 * i], p2: names[2 * i + 1],
      p1Uid: 'uid_' + names[2 * i], p2Uid: 'uid_' + names[2 * i + 1],
      team1Uids: ['uid_' + names[2 * i]], team2Uids: ['uid_' + names[2 * i + 1]], winner: null });
  }
  W._buildDoubleElimBracket(t);
  return t;
}
// auto-player determinístico: enquanto houver jogo pronto (2 reais, sem vencedor), p1 vence.
function playAll(t) {
  let guard = 0;
  while (guard++ < 5000) {
    const ready = t.matches.find((m) => !m.winner && !m.isBye && isReal(m.p1) && isReal(m.p2));
    if (!ready) break;
    ready.winner = ready.p1;
    W._advanceWinner(t, ready);
  }
}

[4, 8].forEach((n) => {
  const tag = '[DE n=' + n + ']';
  const t = buildDE(n);
  const upper = t.matches.filter((m) => m.bracket === 'upper');
  const lower = t.matches.filter((m) => m.bracket === 'lower');
  const grand = t.matches.filter((m) => m.bracket === 'grand');

  // estrutura
  ok(upper.length && lower.length && grand.length === 1, tag + ' tem upper + lower + 1 grande final');
  ok(upper.every((m) => !!m.loserMatchId), tag + ' todo jogo do upper dropa o perdedor pro lower (loserMatchId)');
  const upperFinal = upper.find((m) => m.nextMatchId === grand[0].id);
  const lowerFinal = lower.find((m) => m.nextMatchId === grand[0].id);
  ok(!!upperFinal, tag + ' final do upper liga na grande final');
  ok(!!lowerFinal, tag + ' final do lower (lower final) liga na grande final');
  ok(upperFinal && upperFinal.loserMatchId === lowerFinal.id, tag + ' perdedor da final do upper cai na lower final');

  // ciclo de vida completo
  playAll(t);
  ok(grand[0].winner && isReal(grand[0].winner), tag + ' grande final decidida → campeão ' + grand[0].winner);
  ok(t.classificationEntries && t.classificationEntries['uid:uid_T1'] && t.classificationEntries['uid:uid_T1'].pos === 1,
    tag + ' campeão também entra no registro paralelo pela identidade do slot');
  const orphans = t.matches.filter((m) => !m.isBye && !(isReal(m.p1) && isReal(m.p2) && m.winner));
  ok(orphans.length === 0, tag + ' ZERO órfãos (todos os jogos preenchidos e decididos) — sobraram ' + orphans.length);
  // loser-drop de fato aconteceu: a lower R1 recebeu perdedores reais do upper R1
  const lowerR1 = lower.filter((m) => m.round === Math.min.apply(null, lower.map((x) => x.round)));
  ok(lowerR1.every((m) => isReal(m.p1) && isReal(m.p2)), tag + ' lower R1 preenchida pelos perdedores do upper R1');
});

const separate = {id:'de-categories', matches:[], phases:[{kind:'elimination', elimination:{bracketType:'double'}}], currentPhaseIndex:0};
['Diamante','Ouro'].forEach((category) => {
  for (let i = 0; i < 2; i++) separate.matches.push({id:category+'-u'+i, round:1,
    bracket:'upper', category, p1:category+'-'+(i*2+1), p2:category+'-'+(i*2+2), winner:null});
});
['Diamante','Ouro'].forEach(category => W._buildDoubleElimBracket(separate, {phaseIndex:0, category, ts:1234}));
ok(separate.matches.filter(m => m.bracket === 'grand').length === 2,
  'cada categoria tem a própria grande final');
ok(separate.matches.every(m => m.category === 'Diamante' || m.category === 'Ouro'),
  'todos os jogos da dupla eliminação conservam a categoria');
ok(new Set(separate.matches.map(m => m.id)).size === separate.matches.length,
  'IDs da dupla eliminação não colidem entre categorias');
ok(separate.matches.every(m => !m.nextMatchId || separate.matches.find(n => n.id === m.nextMatchId && n.category === m.category)),
  'os caminhos das chaves não atravessam categorias');

const mixed = { id:'mixed', matches:[], phases:[{kind:'elimination'}], currentPhaseIndex:0,
  combinedCategories:['Diamante','Ouro'] };
for (let i = 0; i < 2; i++) {
  mixed.matches.push({id:'diamante-u'+i, round:1, bracket:'upper', category:'Diamante',
    p1:'D'+(i*2+1), p2:'D'+(i*2+2), phaseIndex:0});
  mixed.matches.push({id:'ouro-u'+i, round:1, bracket:'upper', category:'Ouro',
    p1:'O'+(i*2+1), p2:'O'+(i*2+2), phaseIndex:0});
}
W._buildDoubleElimBracket(mixed, {phaseIndex:0, category:'Diamante'});
ok(mixed.matches.filter(m => m.category === 'Ouro').length === 2,
  'uma categoria DE não cria jogos adicionais na categoria simples');
ok(mixed.matches.filter(m => m.category === 'Ouro').every(m => !m.loserMatchId && !m.nextMatchId),
  'uma categoria DE não liga jogos da categoria simples à sua chave');
ok(mixed.matches.filter(m => m.bracket === 'grand').length === 1,
  'categoria DE isolada cria uma só grande final');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' double-elim: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
