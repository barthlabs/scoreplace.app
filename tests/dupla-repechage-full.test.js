// DUPLA ELIMINATÓRIA fora de pow2 com REPESCAGEM (não elimina na 1ª rodada).
// Dirige o motor REAL: _duplaR1FromPool (repescagem R1) → _buildRepechageDoubleElim
// (upper T-bracket + lower com TODOS os derrotados + grande final) → simula TODOS os
// jogos até o fim (winner=p1), resolvendo repescagens via _advanceWinner. Invariantes
// que provam a estrutura correta, sem depender da minha derivação à mão:
// v1.3.159 — CÂNONE NOVO (dono): a superior passou a ser a ÁRVORE MÍNIMA (⌈E/2⌉ por rodada, 1
// repescado SÓ no ímpar), igual à Eliminatória Simples. Antes ela era inflada até a potência de 2
// e os derrotados subiam/caíam por repescagem — 7 repescados com 12 duplas, quando o mínimo é 1.
// Agora TODOS os derrotados da 1ª sup caem na 1ª inf pelo jeito clássico (loserMatchId), então a
// 1ª inf tem ⌈derrotados/2⌉ jogos (era menos) e o total sobe 1. Números conferidos à mão contra a
// regra em cada N abaixo. Ver [[project_minimal_elim_formula_canon]].
//   • chave inferior R1 = ⌈jogos da 1ª sup / 2⌉;
//   • jogo-ímpar (3ª vida) na 1ª inf existe SÓ quando o nº de derrotados é ÍMPAR;
//   • NENHUM jogo trava (dois lados reais e sem vencedor no fim) e NENHUMA vaga fica
//     morta (TBD permanente) — o torneio fecha num só campeão;
//   • as 14 duplas aparecem na chave (ninguém sumiu antes de perder).
const { window, sandbox, load, E } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
load('tournaments-draw.js');

function mkPool(n) { var a = []; for (var i = 0; i < n; i++) a.push({ displayName: 'D' + i, name: 'D' + i, uid: 'u' + i }); return a; }
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

// build() SEMPRE via ramo de CATEGORIAS (é o caminho real: o "Casais" tem 1 categoria
// "Misto Obrig."). Foi exatamente aqui que o sorteio silenciava (a categoria descartava
// needsRepechageDoubleElim+repMeta → chave incompleta → "volta como se não tivesse sorteado").
function build(n, res) {
  const CAT = 'Misto Obrig.';
  const cfg = { format: 'Dupla Eliminatória', formatCode: 'elim_dupla', teamSize: 2, bracketResolution: res || 'playin', seedVip: true, thirdPlace: true, source: { type: 'enrollment' }, categories: [CAT] };
  const pool = mkPool(n).map(p => Object.assign({ categories: [CAT] }, p));
  const t = { id: 'T' + n, format: 'Dupla Eliminatória', teamSize: 2, matches: [], currentPhaseIndex: 0 };
  const built = E.generatePhase(pool, cfg, { idPrefix: 'gp', ordered: true, t, isVip: () => false, catOf: e => (e.categories && e.categories[0]) || '' });
  const r = E.storePhase(t, 0, built);
  if (!r || !r.ok) { fail++; console.error('  ✗ n=' + n + ': storePhase abortou (' + (r && r.error) + ')'); return t; }
  if (built.needsRepechageDoubleElim && window._buildRepechageDoubleElim) {
    (built.repMetaByCat && built.repMetaByCat.length ? built.repMetaByCat : [built.repMeta]).forEach(mm => window._buildRepechageDoubleElim(t, mm));
  } else if (built.needsDoubleElim && window._buildDoubleElimBracket) window._buildDoubleElimBracket(t);
  return t;
}

function simulate(t) {
  // joga tudo até não haver progresso: qualquer jogo com 2 lados reais e sem vencedor → winner=p1.
  const BYE = 'BYE (Avança Direto)';
  let guard = 0;
  while (guard++ < 500) {
    const all = window._collectAllMatches(t);
    const playable = all.filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
    if (!playable.length) break;
    const m = playable[0];
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (guard % 7); // saldo variado p/ ranking de repescagem
    window._advanceWinner(t, m);
  }
  return window._collectAllMatches(t);
}

function run(n, expLowerR1, expTotal) {
  console.log('\n== n=' + n + ' duplas ==');
  const t = build(n);
  const all0 = window._collectAllMatches(t);
  const lowerR1 = all0.filter(m => m.bracket === 'lower' && m.round === 1);
  ok(lowerR1.length === expLowerR1, 'chave inferior R1 = ' + expLowerR1 + ' jogos (got ' + lowerR1.length + ')');

  // todas as n duplas aparecem em algum slot da repescagem R1 (round 0)
  const rep = all0.filter(m => m.isPhaseRepR1);
  const teams = new Set(); rep.forEach(m => { teams.add(m.p1); teams.add(m.p2); });
  ok(teams.size === n, 'as ' + n + ' duplas estao na repescagem R1 (got ' + teams.size + ')');

  const after = simulate(t);
  const stuck = after.filter(m => !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== 'BYE (Avança Direto)' && m.p2 !== 'TBD');
  const deadTBD = after.filter(m => !m.winner && (m.p1 === 'TBD' || m.p2 === 'TBD' || !m.p1 || !m.p2));
  ok(stuck.length === 0, 'nenhum jogo travado no fim (got ' + stuck.length + ' ' + JSON.stringify(stuck.slice(0,4).map(s => s.bracket + 'R' + s.round)) + ')');
  ok(deadTBD.length === 0, 'nenhuma vaga morta no fim (got ' + deadTBD.length + ' ' + JSON.stringify(deadTBD.slice(0,6).map(s => (s.bracket||'-') + 'R' + s.round + ':' + s.p1 + '/' + s.p2)) + ')');

  const total = after.length;
  ok(total === expTotal, 'total de jogos = ' + expTotal + ' (got ' + total + ')');

  // grande final existe e resolve num campeão
  const grand = after.filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'grande final resolvida num campeao');
}

// Casos com total exato conferido à mão (par):
run(14, 4, 29);   // 1ª sup=7 jogos → 7 derrotados → ⌈7/2⌉=4 na 1ª inf (1 é o ímpar)
run(12, 3, 25);   // 1ª sup=6 → 6 derrotados → 3 jogos, PAR ⇒ sem ímpar
run(6, 2, 14);    // 1ª sup=3 → 3 derrotados → 2 jogos (1 é o ímpar)
run(10, 3, 24);   // 1ª sup=5 → 5 derrotados → 3 jogos (1 é o ímpar)

// ── REPESCAGEM RECURSIVA na R1 inferior (n ímpar) — project_lower_bracket_recursive_repechage ──
// n ímpar + repescagem: a ímpar da inferior joga um jogo-repescagem (3ª vida) na PRÓPRIA R1 inf,
// ressuscitando o melhor derrotado dos jogos normais dela. A R1 inf GANHA 1 jogo (o ímpar) e o
// perdedor do jogo da ímpar SUPERIOR não vai mais direto pro merge1. REPRODUZ a falha: no código
// velho a R1 inf tinha 1 jogo A MENOS (satout pulava pro merge1) e não havia jogo-ímpar na inferior.
function runOddLower(n, expLowerR1, expTotal) {   // expImpar é DERIVADO: derrotados ímpares ⇒ 1
  console.log('\n== n=' + n + ' duplas (ímpar → repescagem recursiva na inferior) ==');
  const t = build(n);
  const all0 = window._collectAllMatches(t);
  const lowerR1 = all0.filter(m => m.bracket === 'lower' && m.round === 1);
  ok(lowerR1.length === expLowerR1, 'n=' + n + ': R1 inferior = ' + expLowerR1 + ' jogos (got ' + lowerR1.length + ')');
  // REGRA (não número mágico): a 1ª inf recebe TODOS os derrotados da 1ª sup; se esse total é
  // ÍMPAR sobra 1 vaga, preenchida por 3ª vida (repescagem, nunca bye). Se é PAR, não há ímpar —
  // criar um seria repescar ALÉM do mínimo, contra a regra do dono.
  const supR1 = all0.filter(m => (m.bracket === 'upper' || !m.bracket) && m.round === 0).length;
  const expImpar = supR1 % 2;
  const lowImpar = lowerR1.filter(m => m.isPhaseRepGame && m.isLowerImpar);
  ok(lowImpar.length === expImpar, 'n=' + n + ': ' + expImpar + ' jogo-ímpar (3ª vida) na R1 inferior — 1ª sup tem ' + supR1 + ' jogos (got ' + lowImpar.length + ')');
  const after = simulate(t);
  const stuck = after.filter(m => !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== 'BYE (Avança Direto)');
  const deadTBD = after.filter(m => !m.winner && (m.p1 === 'TBD' || m.p2 === 'TBD' || !m.p1 || !m.p2));
  ok(stuck.length === 0, 'n=' + n + ': nenhum jogo travado (got ' + stuck.length + ')');
  ok(deadTBD.length === 0, 'n=' + n + ': nenhuma vaga morta (got ' + deadTBD.length + ' ' + JSON.stringify(deadTBD.slice(0,4).map(s => (s.bracket||'-')+'R'+s.round+':'+s.p1+'/'+s.p2)) + ')');
  ok(after.length === expTotal, 'n=' + n + ': total de jogos = ' + expTotal + ' (got ' + after.length + ')');
  const impar = after.filter(m => m.bracket === 'lower' && m.round === 1 && m.isLowerImpar)[0];
  ok(expImpar ? !!(impar && impar.winner) : !impar, 'n=' + n + ': jogo-ímpar da inferior coerente com a regra');
  const grand = after.filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'n=' + n + ': campeão único');
}
runOddLower(15, 4, 30);   // 1ª sup=8 (PAR) ⇒ 4 jogos na inf, SEM ímpar
runOddLower(13, 4, 29);   // 1ª sup=7 (ímpar) ⇒ 4 jogos, 1 deles é o ímpar
runOddLower(11, 3, 25);   // 1ª sup=6 (PAR) ⇒ 3 jogos, SEM ímpar
// n=2^k+1 (toLower=0): sem jogos normais na pré → sem fonte pra ressuscitar → mantém satout→merge1.
function runOddNoImpar(n) {
  const t = build(n);
  const lowerR1 = window._collectAllMatches(t).filter(m => m.bracket === 'lower' && m.round === 1);
  // v1.3.159: com a árvore mínima, 2^k+1 dá 1ª sup com nº ÍMPAR de jogos (9→5, 17→9), então a
  // 1ª inf TEM o jogo do ímpar. No modelo antigo (pow2) a pré-rodada ficava sem jogos normais e
  // não havia o que ressuscitar — o caso degenerado deixou de existir.
  const _sup = window._collectAllMatches(t).filter(m => (m.bracket === 'upper' || !m.bracket) && m.round === 0).length;
  ok(lowerR1.filter(m => m.isLowerImpar).length === (_sup % 2), 'n=' + n + ' (2^k+1): ímpar da inferior segue a regra (1ª sup=' + _sup + ')');
  const after = simulate(t);
  const grand = after.filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'n=' + n + ' (2^k+1): campeão único');
}
runOddNoImpar(9); runOddNoImpar(17);

// VARREDURA AMPLA — a lógica de repescagem deve valer p/ QUALQUER nº de inscritos
// (pares E ímpares), menos potências de 2 (que usam a dupla-elim padrão). Invariantes
// estruturais: todos entram, ninguém trava, sem vaga morta, campeão único.
function sweep(n) {
  const isPow2 = (n & (n - 1)) === 0;
  if (isPow2) return;                       // pow2 = caminho padrão (não repescagem)
  const t = build(n);
  const all0 = window._collectAllMatches(t);
  // Todos os n inscritos entram na repescagem R1 (round 0). A dupla ÍMPAR agora joga o repGame
  // NA R1 sup (isPhaseRepGame, p1=ímpar, p2=TBD até o repescado ser definido) — não vai mais
  // direto pro lower. Logo TODOS os n aparecem em round 0 (excl. TBD/BYE).
  const rep = all0.filter(m => m.isPhaseRepR1);
  const teams = new Set();
  rep.forEach(m => { [m.p1, m.p2].forEach(x => { if (x && x !== 'TBD' && x !== 'BYE (Avança Direto)') teams.add(x); }); });
  ok(teams.size === n, 'n=' + n + ': todos os ' + n + ' inscritos entram (got ' + teams.size + ')');
  // a ÍMPAR (n ímpar) fica na chave SUPERIOR (repGame), NÃO cai direto pro lower
  if (n % 2 === 1) {
    const repGame = all0.filter(m => m.isPhaseRepGame && m.bracket === 'upper' && m.round === 0);
    ok(repGame.length === 1, 'n=' + n + ': 1 jogo da ímpar na R1 sup (got ' + repGame.length + ')');
    const satName = repGame[0] && repGame[0].p1;
    ok(!all0.some(m => m.bracket === 'lower' && (m.p1 === satName || m.p2 === satName)), 'n=' + n + ': ímpar (' + satName + ') NAO entra direto no lower');
  }
  const after = simulate(t);
  const stuck = after.filter(m => !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== 'BYE (Avança Direto)');
  const deadTBD = after.filter(m => !m.winner && (m.p1 === 'TBD' || m.p2 === 'TBD' || !m.p1 || !m.p2));
  const grand = after.filter(m => m.bracket === 'grand');
  // REGRA DO DONO: repescagem = SEM bye em lugar nenhum (nem no caso n=2^k+1, que antes
  // caía em bye no merge inferior por falta de fonte pra ressuscitar). project_lower_bracket_recursive_repechage
  const byes = after.filter(m => m.p1 === 'BYE (Avança Direto)' || m.p2 === 'BYE (Avança Direto)');
  ok(byes.length === 0, 'n=' + n + ' (repescagem): ZERO byes (got ' + byes.length + ' ' + JSON.stringify(byes.slice(0,4).map(s => (s.bracket||'-')+'R'+s.round)) + ')');
  ok(stuck.length === 0, 'n=' + n + ': nenhum jogo travado (got ' + stuck.length + ')');
  ok(deadTBD.length === 0, 'n=' + n + ': nenhuma vaga morta (got ' + deadTBD.length + ' ' + JSON.stringify(deadTBD.slice(0,4).map(s => (s.bracket||'-')+'R'+s.round+':'+s.p1+'/'+s.p2)) + ')');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'n=' + n + ': campeao unico');
}
console.log('\n== VARREDURA n=5..40 (pares e ímpares, exceto pow2) ==');
for (let n = 5; n <= 40; n++) sweep(n);

// ── BYE CANÔNICO (bracketResolution='bye') — bye é bye, mesma semeadura do single-elim ─────
// Completa até a MENOR pow2 >= n com BYEs nos melhores semeados; o BYE avança direto pra R2 sup;
// o perdedor do jogo real cai na chave inferior. Invariantes: byes = pow2-n, todos entram,
// nada trava, sem vaga morta, campeão único, e a(s) dupla(s) com BYE já estão na R2 sup.
function sweepBye(n) {
  const isPow2 = (n & (n - 1)) === 0;
  if (isPow2) return;
  const t = build(n, 'bye');
  const powB = (() => { let p = 1; while (p < n) p *= 2; return p; })();
  const r1 = window._collectAllMatches(t).filter(m => m.round === 1 && m.bracket === 'upper');
  const byeGames = r1.filter(m => m.isBye);
  ok(byeGames.length === powB - n, 'bye n=' + n + ': ' + (powB - n) + ' BYE(s) na R1 sup (got ' + byeGames.length + ')');
  // todas as n duplas aparecem na R1 sup (excl. BYE)
  const teams = new Set();
  r1.forEach(m => { [m.p1, m.p2].forEach(x => { if (x && x !== 'TBD' && x !== 'BYE (Avança Direto)') teams.add(x); }); });
  ok(teams.size === n, 'bye n=' + n + ': todas as ' + n + ' duplas na R1 sup (got ' + teams.size + ')');
  // cada dupla com BYE já está na R2 sup
  const r2 = window._collectAllMatches(t).filter(m => m.round === 2 && m.bracket === 'upper');
  const allByeInR2 = byeGames.every(bg => r2.some(m => m.p1 === bg.winner || m.p2 === bg.winner));
  ok(allByeInR2, 'bye n=' + n + ': dupla(s) com BYE já na R2 sup');
  const after = simulate(t);
  const stuck = after.filter(m => !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== 'BYE (Avança Direto)');
  const deadTBD = after.filter(m => !m.winner && (m.p1 === 'TBD' || m.p2 === 'TBD' || !m.p1 || !m.p2) && !m.isBye);
  ok(stuck.length === 0, 'bye n=' + n + ': nenhum jogo travado (got ' + stuck.length + ')');
  ok(deadTBD.length === 0, 'bye n=' + n + ': nenhuma vaga morta (got ' + deadTBD.length + ' ' + JSON.stringify(deadTBD.slice(0,4).map(s => (s.bracket||'-')+'R'+s.round+':'+s.p1+'/'+s.p2)) + ')');
  const grand = after.filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'bye n=' + n + ': campeao unico');
}
console.log('\n== VARREDURA BYE n=5..40 (fora de pow2) ==');
for (let n = 5; n <= 40; n++) sweepBye(n);

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
