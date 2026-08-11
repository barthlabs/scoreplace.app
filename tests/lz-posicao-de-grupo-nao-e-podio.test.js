/* POSIÇÃO DE GRUPO NÃO É PÓDIO — e a lista é UMA só, em ordem cronológica inversa.
 * node tests/lz-posicao-de-grupo-nao-e-podio.test.js
 *
 * BUG REAL (dono, 10/ago/2026, com print):
 *   "PPP seletiva consta 2o lugar? 4o e 3o lugar nos BTG pactual? de forma alguma eu
 *    nunca passei da primeira fase de qualquer torneio no letzplay."
 *
 * MEDIDO no doc real (letzplayScans/B17n7JCXYOfqahlcLZ0fKxGGyUu1) antes de mexer — os
 * números do print são posição DENTRO DO GRUPO, não colocação no torneio:
 *   BTG Pactual Masc 50 → GRUPO 02, pos 4 de 4  (ÚLTIMO)  … a tela mostrava "🏅 4º"
 *   BTG Pactual Masc D  → GRUPO 03, pos 3 de 3  (ÚLTIMO)  … a tela mostrava "🥉 3º"
 *   Seletiva PPP Mista D→ GRUPO 03, pos 2 de 3            … a tela mostrava "🥈 2º"
 * O scraper diz isso na cara (`.table-group` → [{group:'GRUPO 01', rows:[…]}]), e RANKING
 * é outra coisa: [{group:'Classificação', ranking:true}] — ali a posição é real.
 *
 * SEGUNDO BUG do mesmo print: "os torneios não estão sendo apresentados na ordem
 * cronológica invertida (letz e score)". Cada fonte vinha ordenada e as duas eram
 * CONCATENADAS, então jul/26 do app caía depois de dez/24 do letzplay. A causa de não
 * fundirem era a escala: letzplay ordena por AAAAMMDD, o app por epoch ms.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'js/views/tournaments-enrollment-report.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// ── o footprint REAL do dono, recortado nos 3 torneios do print ────────────────
const G = (nome, grupos) => ({
  official: true, name: nome, categoryRaw: null, club: 'paineiras-bt',
  tourneyId: String(Math.abs(nome.length * 7919)), standings: grupos
});
const grupo = (nome, linhas) => ({ group: nome, rows: linhas });
const eu = (pos) => ({ pos: pos, handles: ['RodrigoBarth'], players: ['Rodrigo Barth'] });
const outro = (pos) => ({ pos: pos, handles: ['Fulano'], players: ['Fulano'] });

const IMP = {
  games: [],
  tournamentsList: [],
  rankingsList: [],
  footprint: [
    G('Torneio Interno de Beach Tennis - BTG Pactual - Masculina 50', [
      grupo('GRUPO 01', [outro(1), outro(2), outro(3)]),
      grupo('GRUPO 02', [outro(1), outro(2), outro(3), eu(4)])      // ÚLTIMO de 4
    ]),
    G('Seletiva de mistas - PPP - Mista - D', [
      grupo('GRUPO 01', [outro(1), outro(2), outro(3)]),
      grupo('GRUPO 03', [outro(1), eu(2), outro(3)])
    ]),
    // RANKING: aqui a posição É classificação de verdade (o scraper marca ranking:true)
    { official: false, name: 'BT SOCIAL - Cat Masculina D', club: 'paineiras-bt', rankingId: '4242',
      standings: [{ group: 'Classificação', ranking: true, rows: [outro(1), eu(2), outro(3)] }] }
  ]
};

// ── harness: roda o IIFE REAL e expõe as internas (sem reimplementar nada) ──────
function carregar() {
  const i = SRC.lastIndexOf('})();');
  const inj = SRC.slice(0, i) +
    // _lzTourneyRows é `window._lzTourneyRows = function…` (no browser o nome nu resolve
    // pelo global; aqui `window` é um objeto, então pega-se pela propriedade).
    // _lzRenderComps/_lzOrdDeTs são declarações DENTRO deste mesmo IIFE — nome nu serve.
    '\n  globalThis.__probe = { rows: window._lzTourneyRows, render: _lzRenderComps, ordTs: _lzOrdDeTs };\n' +
    SRC.slice(i);
  const win = {
    _spLzModel: { dateNum: () => null, dateParts: () => null },
    addEventListener() {}, setTimeout, clearTimeout
  };
  const doc = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, children: [] }) };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'globalThis', inj)(win, doc, globalThis);
  globalThis.__win = win;
  return globalThis.__probe;
}
const P = carregar();
const win = globalThis.__win;

// ⚠️ ASSERÇÕES REVISADAS EM 11/ago/2026 — POR ORDEM DO DONO, e o motivo fica escrito aqui.
// Esta suíte nasceu em 10/ago consertando o pódio falso ("🥈 2º" pra quem foi 2º de 3 NO
// GRUPO). O conserto da época foi mostrar o número COM O CONTEXTO — "GRUPO 03 · 2º de 3" —
// e era isso que as 3 asserções abaixo travavam.
//
// No dia seguinte ele foi além: _"não interessa grupo x, yº de tantos. só importa a
// classificação geral. sempre. nem que seja por faixa se não for personalizada como num
// ranking."_ Ou seja: contextualizar não bastava; posição de grupo não é colocação e
// simplesmente não se exibe. Quem responde "onde terminei" é a CHAVE (via _lzPlacement,
// por faixa quando não dá pra cravar) ou o RANKING.
//
// O INVARIANTE QUE ELAS DEFENDIAM CONTINUA TRAVADO, e mais forte: antes era "o número do
// grupo não pode virar medalha"; agora é "o número do grupo não pode aparecer". A regressão
// que originou a suíte (Rodrigo aparecendo em 2º/3º/4º sem nunca ter passado da 1ª fase)
// segue impossível pelos dois lados.
console.log('\n1. Torneio: posição de GRUPO não é colocação — e não aparece');
const htmlT = P.rows(IMP, 'RodrigoBarth', 'tour');
ok(!/🥇|🥈|🥉|🏅/.test(htmlT), 'nenhuma medalha em linha de TORNEIO');
ok(!/GRUPO 0\d/.test(htmlT), 'o nome do grupo não aparece como colocação (era "GRUPO 02 · 4º de 4")');
ok(!/\dº de \d/.test(htmlT), 'o "Nº de N" do grupo não aparece (era "2º de 3" na Seletiva PPP)');
ok(!/>\s*\dº\s*</.test(htmlT), 'e não sobrou nenhum "Nº" solto — sem chave lida, a linha fica sem colocação');

console.log('\n2. Ranking: ali a posição É classificação, e o pódio continua valendo');
const htmlR = P.rows(IMP, 'RodrigoBarth', 'rank');
ok(/🥈/.test(htmlR), 'ranking com pos 2 mantém a medalha de prata');
ok(!/GRUPO/.test(htmlR), 'e não fala em grupo');

console.log('\n3. Uma lista só: letzplay + scoreplace em ordem cronológica INVERSA');
P.rows(IMP, 'RodrigoBarth', 'tour');
const reg = win._lzCompItens;
ok(Array.isArray(reg && reg.tour), '_lzTourneyRows publica os itens pra fusão (antes só devolvia HTML)');
// escalas diferentes: letzplay AAAAMMDD × app epoch ms — é o que impedia fundir
ok(P.ordTs(new Date(2026, 6, 25).getTime()) === 20260725, 'epoch ms vira AAAAMMDD (25/jul/26 → 20260725)');
ok(P.ordTs(0) === 0 && P.ordTs(null) === 0, 'sem data → 0, não NaN (NaN envenenaria o sort)');
reg.tour = reg.tour.concat([
  { ord: P.ordTs(new Date(2026, 6, 25).getTime()), h: '<div>APP jul26</div>' },
  { ord: P.ordTs(new Date(2026, 5, 6).getTime()), h: '<div>APP jun26</div>' }
]);
const fundido = P.render('tour');
const iApp = fundido.indexOf('APP jul26');
const iBTG = fundido.indexOf('BTG Pactual');
ok(iApp >= 0 && iBTG >= 0 && iApp < iBTG,
   'torneio do app de jul/26 vem ANTES do letzplay de dez/24 (o bug era ele cair no fim)');
ok(fundido.indexOf('APP jul26') < fundido.indexOf('APP jun26'), 'e o app também fica ordenado entre si');

console.log('\n4. Varredura: a regra não pode voltar a ser "medalha pra qualquer posição"');
ok(/g\.ranking/.test(SRC), 'a distinção sai do DADO (g.ranking), não de palpite da tela');
ok(!/_lzMedalha\(L\.pos\)/.test(SRC), 'não existe mais medalha aplicada à posição crua');

console.log('\n5. Ranking ZERADO não é classificação (caso real: T&F lançado como ranking)');
// Dono, 11/ago: "lançaram o torneio de pais como um ranking … os lancamentos ali estao
// zerados e nao podem ser considerados." MEDIDO no doc dele: rid 58234, pontos
// [0,0,0,0,0,0], ele em 9º. Sem guard a tela dava "🏅 9º" em cor de pódio.
{
  const zerado = { footprint: [{ official: false, club: 'pb', rankingId: '58234',
    name: 'T&F Special Edition - torneio PAIS', categoryRaw: 'Masc',
    standings: [{ group: 'Classificação', ranking: true, rows: [
      { pos: 8, handles: ['Outro'], points: 0 },
      { pos: 9, handles: ['RodrigoBarth'], points: 0 }] }] }] };
  const h = P.rows(zerado, 'RodrigoBarth', 'rank');
  ok(!/🥇|🥈|🥉|🏅/.test(h), 'tabela zerada NÃO ganha medalha');
  ok(!/9º/.test(h), 'e nem exibe a posição, que ali não significa nada');
  ok(/sem pontuação lançada/.test(h), 'diz o que é, em vez de calar', h.slice(0, 120));
}
{
  // o outro lado: ranking COM pontos segue com pódio (rid 33695 real, ele em 3º)
  const real = { footprint: [{ official: false, club: 'pb', rankingId: '33695',
    name: 'BT SOCIAL - Cat Masculina D', categoryRaw: 'Masc D',
    standings: [{ group: 'Classificação', ranking: true, rows: [
      { pos: 1, handles: ['A'], points: 2944 },
      { pos: 3, handles: ['RodrigoBarth'], points: 2402 }] }] }] };
  const h2 = P.rows(real, 'RodrigoBarth', 'rank');
  ok(/🥉 3º/.test(h2), 'ranking com pontos de verdade mantém a medalha', h2.slice(0, 120));
}
{
  // ⚠️ AUSENTE ≠ ZERO: import antigo sem o campo `points` não pode perder a classificação.
  // Suprimir por não saber seria errar para o outro lado.
  const semCampo = { footprint: [{ official: false, club: 'pb', rankingId: '999',
    name: 'Ranking antigo', categoryRaw: 'Masc',
    standings: [{ group: 'Classificação', ranking: true, rows: [
      { pos: 1, handles: ['A'] }, { pos: 2, handles: ['RodrigoBarth'] }] }] }] };
  const h3 = P.rows(semCampo, 'RodrigoBarth', 'rank');
  ok(/🥈 2º/.test(h3), 'sem o campo points, a posição é mantida (ausente não é zero)', h3.slice(0, 110));
}

console.log('\n6. Selo RK: a lista denuncia o "torneio" que foi lançado como ranking');
// Dono: "vamos colocar RK antes do LP para indicar quando um torneio foi lancado como
// ranking (assim driblamos o 3 de 3 … mas ai na lista indica tambem que aquele que deveria
// ser um torneio, e um ranking)."
{
  const hR = P.rows(IMP, 'RodrigoBarth', 'rank');
  ok(/aria-label="lançado como ranking"/.test(hR), 'linha de RANKING leva o selo RK');
  ok(hR.indexOf('lançado como ranking') < hR.indexOf('aria-label="letzplay"'), 'e o RK vem ANTES do LP');
  const hT = P.rows(IMP, 'RodrigoBarth', 'tour');
  ok(!/lançado como ranking/.test(hT), 'linha de TORNEIO não leva RK — senão o sinal não distinguiria nada');
  ok(/aria-label="letzplay"/.test(hT), 'mas leva o LP normalmente');
}

console.log('\n' + (fail ? '✗' : '✅') + ' lz-posicao-de-grupo-nao-e-podio: ' + pass + ' passaram, ' + fail + ' falharam');
if (fail) process.exit(1);
