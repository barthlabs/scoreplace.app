'use strict';
/* O detalhe não exibe carimbo de atualização. O controle de Pontos Corridos
 * permanece independente e não cria linha vazia quando está ausente. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('js/views/tournaments.js', 'utf8');
assert(!source.includes('Atualizado em'), 'carimbo de atualização não deve aparecer no detalhe');
assert(source.includes('${ligaActiveToggleHtml ? `<div'),
  'linha do controle deve existir somente quando o controle existe');
assert(source.includes('${ligaActiveToggleHtml}</div></div>` : \'\'}'),
  'sem controle a linha deve ser vazia');
console.log('✓ detalhe: sem carimbo; controle de Pontos Corridos independente');
