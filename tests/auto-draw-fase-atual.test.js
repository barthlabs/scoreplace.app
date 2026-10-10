/* Agenda automática decide pela FASE atual, nunca pelo rótulo histórico do torneio.
 * node tests/auto-draw-fase-atual.test.js */
'use strict';
const assert = require('assert');
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0;
function same(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  pass++;
  console.log('  ✓ ' + label);
}

console.log('\n──── agenda automática da fase atual ────\n');

const legacy = { format: 'Liga', drawManual: false, drawFirstDate: '2026-10-20' };
same(W._isLigaAutoDraw(legacy), true, 'documento sem phases[] preserva a ponte Liga legada');

const faseInicialProjetada = {
  format: 'Liga', drawManual: false, drawFirstDate: '2026-10-20', currentPhaseIndex: 0,
  phases: [{ kind: 'classification', classification: { structure: 'round_robin' }, rounds: 4 }]
};
same(W._isLigaAutoDraw(faseInicialProjetada), true,
  'fase 0 classificatória projetada herda agenda do topo somente quando ainda não a carrega');

const eliminatoriaAtual = Object.assign({}, faseInicialProjetada, {
  currentPhaseIndex: 1,
  phases: [faseInicialProjetada.phases[0], { kind: 'elimination', elimination: { bracketType: 'single' } }]
});
same(W._isLigaAutoDraw(eliminatoriaAtual), false,
  'eliminatória atual não herda agenda nem o rótulo Liga da classificatória');

const grupos = {
  format: 'Liga', drawManual: false, drawFirstDate: '2026-10-20', currentPhaseIndex: 0,
  phases: [{ kind: 'classification', classification: { structure: 'groups' }, drawManual: false, drawFirstDate: '2026-10-20' }]
};
same(W._isLigaAutoDraw(grupos), false, 'classificatória de grupos não é agenda de rodadas rotativas');

const fasePosteriorSemAgenda = {
  format: 'Liga', drawManual: false, drawFirstDate: '2026-10-20', currentPhaseIndex: 1,
  phases: [
    { kind: 'classification', classification: { structure: 'groups' } },
    { kind: 'classification', classification: { structure: 'round_robin' }, rounds: 3 }
  ]
};
same(W._isLigaAutoDraw(fasePosteriorSemAgenda), false,
  'fase classificatória posterior sem agenda própria não recebe a agenda obsoleta da fase 0');

const fasePosteriorAgendada = Object.assign({}, fasePosteriorSemAgenda, {
  phases: [fasePosteriorSemAgenda.phases[0], Object.assign({}, fasePosteriorSemAgenda.phases[1], {
    drawManual: false, drawFirstDate: '2026-10-27', drawFirstTime: '19:00'
  })]
});
same(W._isLigaAutoDraw(fasePosteriorAgendada), true,
  'fase classificatória posterior usa sua agenda própria');

same(W._isLigaAutoDraw({ format: 'Liga', drawManual: false, drawFirstDate: '2026-10-20', phases: [] }), false,
  'phases[] vazio não reativa caminho legado pelo rótulo do topo');
same(W._isLigaAutoDraw(Object.assign({}, fasePosteriorAgendada, {
  phases: [fasePosteriorAgendada.phases[0], Object.assign({}, fasePosteriorAgendada.phases[1], { drawManual: true })]
})), false, 'modo manual da fase vence qualquer data agendada');

console.log('\n' + pass + ' testes passaram.\n');
