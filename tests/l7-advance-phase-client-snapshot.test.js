'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/views/phases-engine.js', 'utf8');
const advance = source.slice(source.indexOf('  function advanceMultiPhase(tId)'));
const gate = advance.indexOf('window._showPhasePromotePanel(tId)');
const call = advance.indexOf("window._callCF('advanceTournamentPhase'");
assert(gate >= 0 && call > gate, 'promoção Ouro/Prata é oferecida antes da chamada de avanço');
const start = source.indexOf('    // Primeiro a decisão de promoção de linhas;');
const end = source.indexOf('    // ⛔ CONGELA A CLASSIFICAÇÃO DO GRUPO NO AVANÇO', start);
assert(start > 0 && end > start, 'ramo canônico do avanço encontrado');
const branch = source.slice(start, end);

function promotionFixture(promoteHelps) {
  const events = [];
  const window = {
    _phasePromoteHelps: () => promoteHelps,
    _showPhasePromotePanel: id => events.push(['panel', id]),
    _setPhaseResInfo: () => events.push(['context']),
    _callCF: name => { events.push(['call', name]); return Promise.resolve({ data: {} }); },
    showNotification: () => {}, _warn: () => {}
  };
  const gateStart = source.indexOf('    var _cur = t.currentPhaseIndex || 0;', source.indexOf('  function advanceMultiPhase(tId)'));
  const gate = source.slice(gateStart, end);
  const ctx = { window,
    _phaseIsGroups: () => false, _phaseIsMonarch: () => false, _phaseIsLiga: () => false,
    prevPhaseGroups: () => [{}], bracketPhaseGroups: () => [],
    mappingDaTransicao: () => [{ dest: 'gold' }, { dest: 'silver' }],
    selectQualifiers: () => ({ gold: [1, 2, 3], silver: [4, 5, 6] }),
    ehReiRainhaRodadaUnica: () => false
  };
  const run = vm.runInNewContext('(function(tId,t,cs){' + gate + '})', ctx);
  run('tour', { id: 'tour', currentPhaseIndex: 0, phases: [
    { name: 'Grupos' }, { name: 'Final', politicaDaChave: 'sobra_unica' }
  ] }, () => []);
  return events;
}

function fixture(callCF, unavailable) {
  const events = [];
  const old = { id: 'tour', currentPhaseIndex: 0, phases: [
    { name: 'Grupos' }, { name: 'Final', politicaDaChave: 'sobra_unica' }
  ] };
  const window = {
    _callCF: unavailable ? undefined : (...args) => { events.push(['call', args[0], args[1]]); return callCF(); },
    _applyCFTournament: (...args) => events.push(['apply', ...args]),
    _rerenderBracket: id => events.push(['render', id]),
    showNotification: (...args) => events.push(['notice', ...args]),
    _warn: () => {}
  };
  const run = vm.runInNewContext('(function(tId,t,_niIdx){var _nextCfg=t.phases[_niIdx];' + branch + '})', { window });
  run('tour', old, 1);
  return { events, old };
}

(async () => {
  assert.deepStrictEqual(promotionFixture(true).map(e => e[0]), ['context', 'panel'],
    'duas linhas ímpares abrem promoção e não chamam a Function de avanço');
  assert.strictEqual(promotionFixture(false)[0][0], 'call',
    'sem promoção necessária, a Function é chamada após o gate');
  const fresh = { id: 'tour', currentPhaseIndex: 1, matches: [{ id: 'final' }] };
  const success = fixture(() => Promise.resolve({ data: { ok: true, tournament: fresh, phaseIndex: 1 } }));
  await Promise.resolve();
  assert.deepStrictEqual(success.events.map(e => e[0]), ['call', 'apply', 'render', 'notice']);
  assert.strictEqual(success.events[0][1], 'advanceTournamentPhase');
  assert.strictEqual(success.events[0][2].tournamentId, 'tour');
  assert.strictEqual(success.events[1][2], fresh, 'só o recibo canônico é aplicado');
  assert.strictEqual(success.old.currentPhaseIndex, 0, 'não materializa uma fase local otimista');

  const failed = fixture(() => Promise.reject(new Error('transação recusada')));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepStrictEqual(failed.events.map(e => e[0]), ['call', 'notice'],
    'falha da Function não aplica nem repinta fase fantasma');
  assert.strictEqual(failed.events[1][3], 'error');
  assert.strictEqual(failed.old.currentPhaseIndex, 0);

  const unavailable = fixture(null, true);
  assert.deepStrictEqual(unavailable.events.map(e => e[0]), ['notice'],
    'sem porta do servidor não cai no avanço otimista');
  assert.strictEqual(unavailable.old.currentPhaseIndex, 0);

  const incomplete = fixture(() => Promise.resolve({ data: { ok: true, phaseIndex: 1 } }));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepStrictEqual(incomplete.events.map(e => e[0]), ['call', 'notice'],
    'resposta sem documento canônico também não altera a tela');
  console.log('✓ avanço do cliente aplica apenas snapshot canônico; falhas não criam fase fantasma');
})().catch(error => { console.error(error); process.exitCode = 1; });
