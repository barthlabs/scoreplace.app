/* A fase inicial Rei/Rainha recebe 48 pessoas, não 24 duplas fictícias. */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment-report.js'), 'utf8');
const start = src.indexOf('    var _placeholderSingles = enrolledRows.filter');
const projectionStart = src.lastIndexOf('    if (window._initialMonarchIndividualEnrollment', start);
const end = src.indexOf('    var byPair = {};', start);
if (projectionStart < 0 || end < 0) throw new Error('Projeção real da matriz não encontrada');
const projection = new Function('rows', 't', 'window', 'enrolledRows',
  src.slice(projectionStart, end) + '\nreturn rows;');
let failures = 0;
function ok(condition, label) {
  if (condition) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); failures++; }
}
const initial = { enrollmentMode: 'individual', currentPhaseIndex: 0,
  phases: [{ reiRainha: true, drawMode: 'rei_rainha' }, { reiRainha: false, drawMode: 'sorteio' }] };
const later = Object.assign({}, initial, { currentPhaseIndex: 1 });
const rows = Array.from({ length: 48 }, (_, i) => ({ order: i + 1, manualId: 'slot-' + (i + 1), name: 'Jogador ' + String(i + 1).padStart(2, '0') }));
ok(W._initialMonarchIndividualEnrollment(initial) === true, 'configuração inicial individual Rei/Rainha reconhecida');
projection(rows, initial, W, rows);
ok(rows.filter(r => r._duplaIdx != null).length === 0, '48 placeholders permanecem 48 pessoas individuais');
projection(rows, later, W, rows);
ok(rows.filter(r => String(r._duplaIdx || '').startsWith('placeholder-pair:')).length === 48,
  'outra fase preserva a projeção anterior de duplas quando aplicável');
projection(rows, initial, W, rows);
ok(rows.filter(r => r._duplaIdx != null || r._duplaSide != null).length === 0,
  'retorno à fase inicial remove todos os pares sintéticos sem resíduo');
rows[0]._duplaIdx = rows[1]._duplaIdx = 'pending-pair:1:2';
rows[0]._duplaSide = 'p1'; rows[1]._duplaSide = 'p2';
projection(rows, initial, W, rows);
ok(rows[0]._duplaIdx === 'pending-pair:1:2' && rows[1]._duplaIdx === 'pending-pair:1:2',
  'pares confirmados em resposta do servidor não são apagados');
const guardStart = src.indexOf('  window._erFormPair = function (source, target) {');
const guardEnd = src.indexOf('    // Categoria staged', guardStart);
ok(guardStart >= 0 && guardEnd > guardStart && src.slice(guardStart, guardEnd).includes('window._initialMonarchIndividualEnrollment(_liveState.t)') && src.slice(guardStart, guardEnd).includes('return;'),
  'ação de formar dupla fica bloqueada antes da chamada ao servidor nesta fase');
process.exitCode = failures ? 1 : 0;
