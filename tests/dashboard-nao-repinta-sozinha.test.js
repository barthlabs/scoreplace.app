/* A DASHBOARD PISCAVA PRETO DEPOIS DE CARREGADA (relato do dono, 18/ago/2026).
 *
 * Não era animação nem tema: era RE-RENDER EM LOOP. A dashboard tem um gate por
 * assinatura justamente pra não se repintar a cada snapshot do Firestore (v2.8.23/60 —
 * "travada no scroll"), e o gate estava sempre aberto porque as DUAS pontas falavam
 * línguas diferentes:
 *
 *   • quem CARIMBA (renderDashboard, ao pintar):    `N|id1,id2,…`
 *   • quem COMPARA (_softRefreshView, por snapshot): `N|id1:updatedAt,id2:updatedAt,…`
 *
 * A v3.1.26 acrescentou o `updatedAt` só do lado que compara. Dois formatos que NUNCA
 * são iguais ⇒ "mudou" em todo snapshot ⇒ rebuild do innerHTML ⇒ piscada. E como o
 * próprio re-render re-carimba no formato curto, o loop se realimenta sozinho.
 *
 * A regra é a de sempre: fórmula ÚNICA, uma porta só ([[feedback_unify_dual_entry_points]]).
 */
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== dashboard não repinta sozinha ==');

// 1. a fórmula existe e é UMA só
ok(typeof W._dashDataSigFor === 'function', 'existe UMA fórmula da assinatura (_dashDataSigFor)');

// 2. ninguém monta a assinatura à mão — o defeito nasceu de um carimbo paralelo
['js/views/dashboard.js', 'js/store.js'].forEach(function (rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const atribuicoes = src.match(/window\._dashDataSig\s*=\s*[^;]+;/g) || [];
  // "à mão" = a atribuição MONTA o formato ali (join/map/'|') em vez de receber pronto.
  // Guardar numa variável o retorno de _dashDataSigFor é legítimo; refazer a string não.
  const aMao = atribuicoes.filter(function (a) { return /\.map\(|'\|'|"\|"/.test(a); });
  ok(aMao.length === 0, rel + ': assinatura montada à mão (' + aMao.length + ') — o formato mora em _dashDataSigFor');
});

// 3. comportamento: snapshot que não muda nada NÃO repinta
const tours = [
  { id: 't1', updatedAt: '2026-08-18T00:00:00.000Z' },
  { id: 't2', updatedAt: '2026-08-18T01:00:00.000Z' }
];
W.AppStore.tournaments = tours;
W.location.hash = '';
W._suppressSoftRefresh = false;

// o CARIMBO do render. Sem a fórmula única, cai no formato que o renderDashboard usava
// (só ids) — é assim que este teste REPRODUZ o loop contra o código de 1.9.34, em vez de
// simplesmente explodir: ali as repinturas contam 3, 4, 5… uma por snapshot.
const carimboDoRender = function (arr) {
  return (typeof W._dashDataSigFor === 'function')
    ? W._dashDataSigFor(arr)
    : arr.length + '|' + arr.map(function (t) { return t && t.id; }).join(',');
};

let repintou = 0;
W._dashRerender = function () {
  repintou++;
  W._dashDataSig = carimboDoRender(W.AppStore.tournaments);
};

W._dashDataSig = carimboDoRender(tours);   // 1ª pintura (o router pinta, não passa pelo gate)
W._softRefreshView(); W._softRefreshView(); W._softRefreshView();
ok(repintou === 0, '3 snapshots sem mudança → 0 repinturas (got ' + repintou + ')');
// ── 4. MUDANÇA DE CONTEÚDO NÃO REPINTA (1.9.42) ──────────────────────────────
// Já foi assim (a v3.1.26 pôs `updatedAt` na assinatura) e o preço apareceu no aparelho
// do dono: a dashboard se repintava a cada placar lançado por QUALQUER pessoa — piscada
// preta ao entrar, e o card destruído entre o toque e o clique ("pra entrar no detalhe do
// torneio tem que clicar 2x"). Repintar é trocar o DOM debaixo do dedo. Placar novo
// aparece ao ENTRAR no torneio, que é onde ele é olhado.
tours[0].updatedAt = '2026-08-18T02:00:00.000Z';
W._softRefreshView(); W._softRefreshView();
ok(repintou === 0, 'placar lançado num torneio da lista NÃO repinta a dashboard (got ' + repintou + ')');

// ── 5. torneio novo no CONJUNTO repinta uma vez (o caso que a v2.8.60 existe pra atender)
tours.push({ id: 't3', updatedAt: '2026-08-18T03:00:00.000Z' });
W._softRefreshView();
ok(repintou === 1, 'torneio novo no conjunto → repinta 1 vez (got ' + repintou + ')');
W._softRefreshView();
ok(repintou === 1, 'e para (got ' + repintou + ')');

console.log((fail ? '❌' : '✅') + ' dashboard-nao-repinta-sozinha: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
