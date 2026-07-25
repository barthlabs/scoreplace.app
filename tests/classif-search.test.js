/* BUSCA NA CLASSIFICAÇÃO — node tests/classif-search.test.js
 *
 * Pedido do dono: "vamos colocar a barra de busca logo acima da classificação da linha 1
 * (assim podemos buscar nomes e ver o seu resultado final mais facilmente)."
 *
 * DOIS invariantes que só quebram em uso real (por isso o teste):
 *  (1) UMA barra por render, no PRIMEIRO bloco. Com Ouro + Prata (2 blocos) sairiam DUAS
 *      barras com o MESMO id — getElementById devolveria uma ao acaso e a busca ficaria
 *      capenga. O controle é _classifSearchReset()/_classifSearchBar() (uma emissão por passo).
 *  (2) O filtro cobre TODOS os blocos, não só o que hospeda a barra — é uma busca só.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const i = src.indexOf('window._classifSearchPending = false;');
const j = src.indexOf('window._renderClassifBlock = function');
ok(i !== -1 && j > i, 'helpers de busca da classificação não encontrados no store.js');

const sandbox = { window: null, console, document: null, setTimeout: function () {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(i, j), sandbox, { filename: 'store-classif-search' });
const W = sandbox.window;
W._inscritosFilterBar = function (o) { return '<input id="' + o.searchId + '">'; };

// ── 1. uma barra por render, no PRIMEIRO bloco ───────────────────────────────
W._classifSearchReset();
const b1 = W._classifSearchBar();   // bloco Ouro
const b2 = W._classifSearchBar();   // bloco Prata
ok(b1.indexOf('classif-search') !== -1, 'o PRIMEIRO bloco devia trazer a barra');
ok(b2 === '', 'REGRESSÃO: o 2º bloco também emitiu barra → id DUPLICADO e busca capenga');

// ── 2. render seguinte volta a emitir ────────────────────────────────────────
W._classifSearchReset();
ok(W._classifSearchBar().indexOf('classif-search') !== -1, 'novo render devia emitir a barra de novo');

// ── 3. sem reset, não emite (não vaza pro meio da lista) ─────────────────────
ok(W._classifSearchBar() === '', 'sem reset não pode emitir barra no meio dos blocos');

// ── 4. o filtro cobre linhas de TODOS os blocos ──────────────────────────────
(function () {
  W._bracketNorm = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  function mkRow(name, det) { var r = { style: {}, dataset: {}, getAttribute: function () { return name; }, closest: function () { return det; } }; det._rows.push(r); return r; }
  function mkDet() { var d = { style: {}, dataset: {}, open: false, _rows: [], querySelectorAll: function () { return d._rows; } }; return d; }
  var ouro = mkDet(), prata = mkDet();
  var rows = [mkRow('Fe Biojone / marcia andrade', ouro), mkRow('Monica Rossi / Rodrigo Barth', ouro),
              mkRow('Thereza / Cynthia', prata), mkRow('Suely / Elide Luccas', prata)];
  var empty = { style: {} }, input = { value: '' };
  sandbox.document = { getElementById: function (id) { return id === 'classif-search' ? input : (id === 'classif-search-empty' ? empty : null); },
    querySelectorAll: function () { return rows; } };

  input.value = 'thereza'; W._classifApplyFilter();
  var vis = rows.filter(function (r) { return r.style.display !== 'none'; }).map(function (r) { return r.getAttribute(); });
  ok(vis.length === 1 && vis[0] === 'Thereza / Cynthia', 'busca devia achar linha do OUTRO bloco (Prata) — veio ' + JSON.stringify(vis));
  ok(ouro.style.display === 'none', 'bloco sem resultado devia sumir');
  ok(prata.open === true, 'bloco com resultado devia abrir');

  input.value = 'zzz'; W._classifApplyFilter();
  ok(empty.style.display === 'block', 'sem resultado devia mostrar "Nenhum nome encontrado"');

  input.value = ''; W._classifApplyFilter();
  ok(rows.every(function (r) { return r.style.display !== 'none'; }), 'limpar devia restaurar todas as linhas');
  ok(ouro.style.display !== 'none' && prata.style.display !== 'none', 'limpar devia restaurar os blocos');
})();

console.log((fail === 0 ? '✅' : '❌') + ` busca na classificação: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
