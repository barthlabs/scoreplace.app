'use strict';
/* ⛔ DUAS BARRAS IGUAIS, LADO A LADO, SÃO UMA BARRA DUPLICADA — MESMO QUE FILTREM COISAS
 * DIFERENTES. Relato do dono (12/set/2026, chave do Confra): _"continua a barra de busca
 * duplicada aqui"_. Investigado: NÃO eram duas barras da chave (essas já eram deduplicadas no
 * DOM desde a 2.2.71). A de cima busca JOGOS; a de baixo busca NOMES na classificação. O
 * problema era que (a) as duas tinham exatamente a mesma cara — mesma barra canônica, mesmo
 * "🔎 Buscar…" — e (b) a da classificação nascia FORA do `<details>`, então aparecia mesmo com
 * o bloco FECHADO: uma busca oferecida para uma lista que ninguém está vendo.
 * Agora ela mora dentro do bloco e diz o que filtra.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const S = fs.readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// ── ① a barra da classificação mora DENTRO do bloco ─────────────────────────
const ini = S.indexOf("  var _searchBar = (typeof window._classifSearchBar === 'function')");
const fim = S.indexOf('</details>', ini);
assert.ok(ini > 0 && fim > ini, 'âncoras do bloco de classificação');
const bloco = S.slice(ini, fim);
must(!/return _searchBar \+ '<details/.test(bloco),
  '① ⛔ a barra não sai mais ANTES do <details> — era isso que a fazia aparecer com o bloco fechado');
must(bloco.indexOf('</summary>') < bloco.indexOf("+ _searchBar +"),
  '① ⭐ ela nasce DEPOIS do resumo, dentro do bloco: fechado, não existe; aberto, fica em cima da lista');

// ── ② e diz o que filtra ────────────────────────────────────────────────────
const barra = S.slice(S.indexOf("stateKey: 'classif'"), S.indexOf("searchId: 'classif-search'"));
must(/placeholder: '🔎 Buscar na classificação…'/.test(barra),
  '② ⭐ o texto do campo diz a lista que ele filtra — não mais o "Buscar…" genérico da chave');
must(/placeholder="' \+ esc\(opts\.placeholder \|\| '🔎 Buscar…'\)/.test(S),
  '② a barra canônica aceita o texto por opção, e mantém o padrão de sempre para quem não passa');

// ── ③ a busca da CHAVE continua com o texto e a dedupe de antes ─────────────
const bar = S.slice(S.indexOf('window._bracketBar = function'), S.indexOf('window._inscritosBar = function'));
must(/querySelectorAll\('#fbwrap-chaves'\)/.test(bar),
  '③ ⛔ a dedupe das barras de CHAVE (2.2.71) continua de pé — são dois defeitos diferentes');
must(!/placeholder:/.test(bar), '③ e a da chave segue com o texto padrão');

console.log('✅ ' + ok + ' asserções — uma barra por lista, e cada uma diz o que filtra');
