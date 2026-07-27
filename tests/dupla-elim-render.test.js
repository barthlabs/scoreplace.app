/* Dupla Eliminatória — testa a SAÍDA OBSERVÁVEL (estrutura por rodada, nomes de rodada,
 * pódio e classificação renderizados), não só invariantes (sem-travado/1-campeão/contagem).
 *
 * Cada bloco mapeia um bug que pegamos À MÃO no simulado do Casais e que os testes antigos
 * deixavam passar — porque ninguém exercitava a camada de render. Regra (memória): o assert
 * FALHA no código velho e PASSA no novo. Ex.: a estrutura 3-4-2-2-1-1 antiga quebra o bloco 1;
 * a "Linha 1/2/3" (bracket 'grand' vs 'grandfinal') quebra os blocos 2 e 3.
 */
const H = require('./render-harness');
const W = H.window, buildDupla = H.buildDupla, simulate = H.simulate, lowerCadence = H.lowerCadence;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ' esperado ' + JSON.stringify(b)); }

console.log('\n== Dupla Eliminatória — saída observável ==');

// ---------- 1. ESTRUTURA POR RODADA (bug: chave inferior 3-4-2-2-1-1 com battle intercalada) ----------
(function () {
  const t = buildDupla(14);
  const cad = lowerCadence(t);
  // DECISÃO DO DONO (jul/2026): a chave deixou de ser inflada até potência de 2. O
  // desenho continua determinístico (js/views/chaves.js, chave = f(N, formato)) e o id
  // continua estrutural — o que mudou é que não se completa mais até B.
  //
  //   inflada até B=16:  4 - 4 - 2 - 2 - 1 - 1   (com 2 equipes avançando sem jogar)
  //   árvore mínima:     3 - 4 - 3 - 2 - 1       (14 duplas, sem inflar)
  //
  // A 1ª rodada da inferior recebe MENOS que as seguintes por causa da NORMALIZAÇÃO DA R2
  // (jul/2026): dos 7 perdedores da 1ª superior, 1 é REPESCADO para completar a R2 até 8,
  // então só 6 descem naquele momento (3 jogos). Ele desce depois, se perder na R2 — por
  // isso a inferior CRESCE de 3 para 4 antes de encolher. Não é anomalia: é a descida
  // adiada do repescado chegando junto com as quedas da 2ª superior.
  eq(cad, [3, 4, 3, 2, 1], 'chave inferior de 14 = árvore mínima com a R2 normalizada');
  ok(cad[cad.length - 1] === 1, 'última rodada inferior = 1 jogo (Final da inferior)');
  // A cadência CONVERGE para 1. Ela não é mais monotônica desde a normalização da R2:
  // a descida dos repescados é adiada, então a inferior pode crescer UMA vez (a 1ª para
  // a 2ª rodada) antes de encolher. Da 2ª em diante nunca mais cresce.
  for (let i = 2; i < cad.length; i++) {
    ok(cad[i] <= cad[i - 1],
      `inferior cresceu da rodada ${i} para a ${i + 1} (${cad[i - 1]} → ${cad[i]}) — depois da 2ª só encolhe`);
  }
  ok(cad.length >= 2 && cad[cad.length - 2] === 2,
    'penúltima rodada da inferior = 2 jogos (semifinal da inferior)');
})();

// ---------- 2. NOME DAS RODADAS renderizadas (bug: "Linha", "Rodada 5", "Quartas" na inferior) ----------
(function () {
  const t = buildDupla(14);
  const html = W.renderDoubleElimBracket(t, false, '');
  ok(/Chave Superior/.test(html), 'render tem título "Chave Superior"');
  ok(/Chave Inferior/.test(html), 'render tem título "Chave Inferior"');
  ok(!/Linha \d/.test(html), 'render NÃO tem "Linha N"');
  ok(/Semifina/.test(html) && /Final/.test(html), 'render tem "Semifinais" e "Final"'); // i18n: "Semifinais"
  // na CHAVE INFERIOR de 14 NÃO há "Quartas" — a rodada anterior à semi tem 3 jogos, não 4
  const lowerPart = html.split('Chave Inferior')[1] || '';
  ok(!/Quartas/.test(lowerPart), 'chave inferior de 14 NÃO tem "Quartas" (só Superior tem)');
})();

// ---------- 3. CLASSIFICAÇÃO + PÓDIO renderizados (bug: Linha 1/2/3, ordem, box escuro) ----------
(function () {
  const t = simulate(buildDupla(14));
  const gf = t.matches.find(function (m) { return m.bracket === 'grand'; });
  const gfWinner = gf.winner, gfLoser = (gf.winner === gf.p1) ? gf.p2 : gf.p1;
  const faux = { matches: t.matches, tiebreakers: t.tiebreakers };
  W._updateDuplaElimClassification(faux);
  const cl = faux.classification;
  eq(cl[gfWinner], 1, '1º = vencedor da Grande Final');
  eq(cl[gfLoser], 2, '2º = perdedor da Grande Final');
  // 3º = perdedor da Final da Chave Inferior (maior round da inferior)
  const lr = t.matches.filter(function (m) { return m.bracket === 'lower' && m.round != null; });
  const maxLR = Math.max.apply(null, lr.map(function (m) { return m.round; }));
  const lowFinal = lr.filter(function (m) { return m.round === maxLR && m.winner; })[0];
  const lowFinalLoser = (lowFinal.winner === lowFinal.p1) ? lowFinal.p2 : lowFinal.p1;
  eq(cl[lowFinalLoser], 3, '3º = perdedor da Final da Chave Inferior');
  ok(Object.keys(cl).length === 14, 'as 14 duplas classificadas (got ' + Object.keys(cl).length + ')');

  const html = W._renderPodiumsAndClassif(t) || '';
  ok(/🥇/.test(html), 'render final tem pódio (🥇)');
  ok(/Classificação geral/.test(html), 'render final tem UMA "Classificação geral"');
  ok(!/Linha \d/.test(html), 'render final NÃO tem "Linha N" (não é por-linha)');
  ok(/15,23,42/.test(html), 'pódio com box ESCURO (rgba(15,23,42))');
})();

// ---------- 4. VARREDURA: qualquer n não-pow2 → estrutura + render coerentes ----------
(function () {
  let sweepFail = 0, checked = 0;
  for (let n = 5; n <= 24; n++) {
    if ((n & (n - 1)) === 0) continue; // pow2 = dupla elim padrão (outro caminho)
    checked++;
    const t = simulate(buildDupla(n));
    const cad = lowerCadence(t);
    if (!cad.length || cad[cad.length - 1] !== 1) { sweepFail++; console.log('    n=' + n + ' última inferior ≠ 1 (' + cad + ')'); }
    const html = W._renderPodiumsAndClassif(t) || '';
    if (/Linha \d/.test(html)) { sweepFail++; console.log('    n=' + n + ' render final tem "Linha N"'); }
    if (!/Classificação geral/.test(html)) { sweepFail++; console.log('    n=' + n + ' render final sem "Classificação geral"'); }
    const br = W.renderDoubleElimBracket(t, false, '');
    if (/Linha \d/.test(br)) { sweepFail++; console.log('    n=' + n + ' bracket tem "Linha N"'); }
  }
  ok(sweepFail === 0, 'varredura n=5..24 (' + checked + ' casos): estrutura + render sem "Linha", com classificação');
})();

console.log(pass + ' ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
