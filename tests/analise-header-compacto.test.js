'use strict';

const fs = require('fs');
const assert = require('assert');
const report = fs.readFileSync('js/views/tournaments-enrollment-report.js', 'utf8');
const css = fs.readFileSync('css/components.css', 'utf8');
const page = report.slice(report.indexOf('function _renderPage('), report.indexOf('function _renderLoading('));

assert(page.includes('class="er-analysis-heading"'), 'nome e título devem compartilhar o cabeçalho');
assert(page.includes('class="er-analysis-tournament"'), 'nome do torneio deve permanecer visível no cabeçalho largo');
assert(page.includes('class="er-analysis-title" aria-hidden="true" style="height:1px;"'), 'âncora de medição não deve criar uma linha visível');
assert(!page.includes('var subtitle ='), 'não pode haver segunda linha de título antes da busca');
assert(css.includes('.er-analysis-back-header.er-analysis-editing .er-analysis-heading { display: none; }'), 'ações de edição devem caber no celular');
assert(report.includes("analysisHeader.classList.toggle('er-analysis-editing', n > 0 || _erBtnOcupado(inlineBtn))"), 'edição deve controlar o modo compacto da barra');

console.log('✓ cabeçalho da Análise compacto sem linha duplicada e com ações responsivas');
