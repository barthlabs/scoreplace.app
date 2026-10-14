'use strict';

const fs = require('fs');
const assert = require('assert');
const report = fs.readFileSync('js/views/tournaments-enrollment-report.js', 'utf8');
const css = fs.readFileSync('css/components.css', 'utf8');
const page = report.slice(report.indexOf('function _renderPage('), report.indexOf('function _renderLoading('));
const headerRule = css.match(/\.sticky-back-header\.er-analysis-back-header\s*\{([^}]*)\}/);
const maskRule = css.match(/\.sticky-back-header\.er-analysis-back-header::before\s*\{([^}]*)\}/);

assert(page.includes('class="sticky-back-header er-analysis-back-header"'), 'cabeçalho da Análise deve ter sua classe exclusiva');
assert(headerRule && !/box-shadow\s*:\s*0\s+-/.test(headerRule[1]), 'cabeçalho da Análise não pode projetar sombra para cima');
assert(maskRule && /top\s*:\s*0\s*;/.test(maskRule[1]), 'máscara da Análise não pode sair pelo topo');
assert(page.includes('var subtitle ='), 'conteúdo do cabeçalho não foi reposicionado junto com esta correção');

console.log('✓ cabeçalho da Análise não invade o cabeçalho principal');
