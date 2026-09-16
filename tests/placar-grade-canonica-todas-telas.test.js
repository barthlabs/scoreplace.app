'use strict';
/* Cada renderizador de card precisa declarar a mesma contagem de sets. Sem essa
 * marca explícita, CSS baseado em estrutura (:has) deixa dashboard e chave divergirem. */
const fs = require('fs');
const assert = require('assert/strict');
let n = 0;
function ok(v, m) { assert.ok(v, m); n++; console.log('  ✓ ' + m); }
const css = fs.readFileSync('css/components.css', 'utf8');
const model = fs.readFileSync('js/views/bracket-model.js', 'utf8');
const bracket = fs.readFileSync('js/views/bracket.js', 'utf8');
const dashboard = fs.readFileSync('js/views/dashboard.js', 'utf8');
ok(css.includes('.sp-set-grid[data-sp-set-count="2"],') && css.includes('.sp-set-grid[data-sp-set-count="3"]') && css.includes('gap:32px;'),
  'melhor de 3 usa 32px de separação em qualquer card que tenha espaço');
ok(css.includes('.sp-set-grid[data-sp-set-count="4"]') && css.includes('.sp-set-grid[data-sp-set-count="5"]'),
  'melhor de 5 usa regra própria e mais compacta');
ok(model.includes('data-sp-set-count="') && model.includes('plan.columns.length'),
  'modelo canônico declara a quantidade em cards estáticos');
ok(bracket.includes('const _setCountAttr') && bracket.includes('data-sp-set-count="'),
  'chave interativa declara a quantidade no cabeçalho e no placar');
ok(dashboard.includes('var _setCountAttr') && dashboard.includes('data-sp-set-count="'),
  'dashboard declara a quantidade no cabeçalho e no placar');
const renderers = [model, bracket, dashboard];
ok(renderers.every(source => source.includes('sp-set-grid') && source.includes('data-sp-set-count')),
  'nenhuma das três telas fica fora da grade canônica');
console.log('✅ ' + n + ' asserções — grade de sets canônica em dashboard, resultados e chave');
