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
ok(css.includes('.sp-set-grid[data-sp-best-of="3"]{gap:32px;}'),
  'melhor de 3 usa sempre 32px de separação, sem depender da largura ou da tela');
ok(css.includes('.sp-set-grid[data-sp-best-of="5"]{gap:16px;}'),
  'melhor de 5 usa sempre 16px de separação');
ok(!css.includes('@container (min-width:430px)'),
  'a folga não cai para 2px em Novidades por depender de uma container query');
ok(model.includes('data-sp-set-count="') && model.includes('data-sp-best-of="') && model.includes('plan.bestOf'),
  'modelo canônico declara formato e quantidade em cards estáticos');
ok(bracket.includes('const _setCountAttr') && bracket.includes('const _setFormatAttr') && bracket.includes('data-sp-best-of="'),
  'chave interativa declara formato no cabeçalho e nos dois placares');
ok(dashboard.includes('var _setCountAttr') && dashboard.includes('_setFormatAttr2') && dashboard.includes('data-sp-best-of="'),
  'dashboard declara o formato no cabeçalho e nos dois placares');
const renderers = [model, bracket, dashboard];
ok(renderers.every(source => source.includes('sp-set-grid') && source.includes('data-sp-best-of')),
  'nenhuma das três telas fica fora da grade canônica de espaçamento');
console.log('✅ ' + n + ' asserções — grade de sets canônica em dashboard, resultados e chave');
