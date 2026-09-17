'use strict';

/* A apuração nominal é uma tela de organizador, mas ainda assim não pode baixar
 * documentos inteiros de cada votante para abrir WhatsApp. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/opinion-poll.js'), 'utf8');
const start = source.indexOf('window._opOpenTally = async function');
const end = source.indexOf('// v3.1.68: chip normal', start);
assert.ok(start >= 0 && end > start, 'achei a abertura da apuração nominal');
const block = source.slice(start, end);

assert.match(block, /carregarContatosDoElenco\(t\.id, Object\.keys\(_uidSet\)\)/,
  'a apuração pede contatos pela porta restrita do torneio');
assert.match(block, /window\._userProfileCache \|\| \{\}/,
  'a apuração consome apenas a projeção colocada no cache');
assert.match(block, /var ph = _opPhoneFull\(prof\)/,
  'o WhatsApp continua sendo montado a partir do contato autorizado');
assert.doesNotMatch(block, /loadUserProfile\(/,
  'a apuração não baixa ficha privada de votante');

console.log('✅ enquete usa contatos restritos do elenco — 4 verificações');
