'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const declaration = source.match(/window\._isTournamentDateRangeValid = function \(startDate, startTime, endDate, endTime\) \{[\s\S]*?\n\};/);
assert.ok(declaration, 'validação civil de datas está disponível no formulário');
const context = { window: {} };
vm.runInNewContext(declaration[0], context);
const valid = context.window._isTournamentDateRangeValid;

assert.equal(valid('2026-12-06', '08:00', '2026-12-06', ''), true,
  'data final no mesmo dia aceita horário final estimado');
assert.equal(valid('2026-12-06', '08:00', '2026-12-05', ''), false,
  'data final civil anterior continua inválida');
assert.equal(valid('2026-12-06', '08:00', '2026-12-06', '07:59'), false,
  'hora final explícita antes do início continua inválida');
assert.equal(valid('2026-12-06', '08:00', '2026-12-06', '08:00'), false,
  'intervalo explícito de duração zero continua inválido');
assert.equal(valid('2026-12-06', '08:00', '2026-12-06', '16:00'), true,
  'hora final explícita posterior é aceita');
assert.equal(valid('2026-12-06', '23:00', '2026-12-07', ''), true,
  'data civil posterior é aceita sem presumir fuso UTC');

assert.ok(source.includes('endDate: endDateVal,'), 'a validação não substitui o valor persistido da data final');
assert.ok(source.includes('endTimeEstimated,'), 'a hora final ausente continua marcada como estimada');
console.log('✓ tournament-date-range: fim estimado e comparação civil local');
