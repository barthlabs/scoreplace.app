// DUPLA ELIMINATÓRIA fora de pow2 com REPESCAGEM (não elimina na 1ª rodada).
// Dirige o motor REAL: _duplaR1FromPool (repescagem R1) → _buildRepechageDoubleElim
// (upper T-bracket + lower com TODOS os derrotados + grande final) → simula TODOS os
// jogos até o fim (winner=p1), resolvendo repescagens via _advanceWinner. Invariantes
// que provam a estrutura correta, sem depender da minha derivação à mão:
//   • chave inferior R1 = 3 jogos p/ 14 duplas (os 6 derrotados que não subiram);
//   • total de jogos ≈ 28 p/ 14;
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
run(14, 3, 28);   // g=7,T=8,sobe1,inferior=6→3 jogos
run(12, 2, 25);   // g=6,T=8,sobe2,inferior=4→2 jogos
run(6, 1, 13);    // g=3,T=4,sobe1,inferior=2→1 jogo (cadência sem battle intercalada)
run(10, 1, 23);   // g=5,T=8,sobe3,inferior=2→1 jogo

// VARREDURA AMPLA — a lógica de repescagem deve valer p/ QUALQUER nº de inscritos
// (pares E ímpares), menos potências de 2 (que usam a dupla-elim padrão). Invariantes
// estruturais: todos entram, ninguém trava, sem vaga morta, campeão único.
function sweep(n) {
  const isPow2 = (n & (n - 1)) === 0;
  if (isPow2) return;                       // pow2 = caminho padrão (não repescagem)
  const t = build(n);
  const all0 = window._collectAllMatches(t);
  // todos os n inscritos entram: repescagem R1 (2*floor(n/2)) + satout (ímpar)
  const rep = all0.filter(m => m.isPhaseRepR1);
  const teams = new Set(); rep.forEach(m => { teams.add(m.p1); teams.add(m.p2); });
  const entered = teams.size + (n % 2 === 1 ? 1 : 0);
  ok(entered === n, 'n=' + n + ': todos os ' + n + ' inscritos entram (got ' + entered + ')');
  const after = simulate(t);
  const stuck = after.filter(m => !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== 'BYE (Avança Direto)');
  const deadTBD = after.filter(m => !m.winner && (m.p1 === 'TBD' || m.p2 === 'TBD' || !m.p1 || !m.p2));
  const grand = after.filter(m => m.bracket === 'grand');
  ok(stuck.length === 0, 'n=' + n + ': nenhum jogo travado (got ' + stuck.length + ')');
  ok(deadTBD.length === 0, 'n=' + n + ': nenhuma vaga morta (got ' + deadTBD.length + ' ' + JSON.stringify(deadTBD.slice(0,4).map(s => (s.bracket||'-')+'R'+s.round+':'+s.p1+'/'+s.p2)) + ')');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'n=' + n + ': campeao unico');
}
console.log('\n== VARREDURA n=5..40 (pares e ímpares, exceto pow2) ==');
for (let n = 5; n <= 40; n++) sweep(n);

// NOTA: BYE fora de pow2 no dupla-elim NÃO é robusto ainda (fluxo assimétrico na inferior com
// muitos byes → vagas mortas p/ n grande). _duplaR1FromPool não emite mode:'bye'; resolução
// canônica/completa p/ dupla fora de pow2 = REPESCAGEM (playin). Ver feedback_resolution_one_logic.

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
