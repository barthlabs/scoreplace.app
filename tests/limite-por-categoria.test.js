'use strict';

/*
 * Regressão — 29/set/2026
 *
 * O organizador escolhe a capacidade DA categoria. O total é derivado das
 * categorias combinadas e chega ao servidor como configuração declarativa.
 * Manter o teste textual aqui é intencional: o formulário é HTML montado em
 * string, e este teste protege os três contratos sem precisar de navegador.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const create = fs.readFileSync(path.join(root, 'js/views/create-tournament.js'), 'utf8');
const fn = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failures = 0;
function ok(condition, label) {
  console.log((condition ? '✓ ' : '✗ ') + label);
  if (!condition) failures++;
}

ok(/id="tourn-max-per-category"/.test(create), 'há um único input de vagas por categoria no box de categorias');
ok(/id="category-capacity-summary"/.test(create), 'a tela explica o cálculo do total junto às categorias');
ok(/var calculated = per \* count;[\s\S]*total\.value = String\(calculated\)/.test(create), 'o total é multiplicação exata: categorias × vagas por categoria');
ok(/total\.readOnly = count > 0/.test(create), 'com categorias, o total não pode divergir por edição manual');
ok(/maxParticipantsPerCategory: maxPerCategoryVal/.test(create), 'criação e edição persistem a unidade por categoria');
ok(/maxParticipantsPerCategory: parseInt\(get\('tourn-max-per-category'\)\)/.test(create), 'templates preservam a unidade por categoria');
ok(/'maxParticipants','maxParticipantsPerCategory','autoCloseOnFull'/.test(fn), 'a Function aceita a configuração na mesma porta canônica');

process.exit(failures ? 1 : 0);
