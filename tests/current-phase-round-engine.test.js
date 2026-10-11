'use strict';
/* node tests/current-phase-round-engine.test.js
 * O motor de rodadas não pode decidir parceiros rotativos nem Rei/Rainha pelo
 * rótulo do torneio. É o mesmo torneio híbrido que expõe o defeito: o topo
 * histórico diz Liga, mas a fase eliminatória já é outra operação. */
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.window;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}

function parts(n) {
  return Array.from({ length: n }, function (_, i) {
    return { uid: 'u' + i, name: 'J' + i, displayName: 'J' + i, ligaActive: true };
  });
}

const hybrid = {
  format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', currentPhaseIndex: 0,
  phases: [
    { kind: 'classification', classification: { structure: 'round_robin' }, reiRainha: true },
    { kind: 'elimination', elimination: { bracketType: 'single' }, reiRainha: false }
  ]
};
ok(W._faseCorrenteUsaEntradasRotativas(hybrid) === true,
  'classificatória atual usa entradas rotativas mesmo sem depender do rótulo');
ok(W._sorteioDaFaseEhReiRainha(hybrid) === true,
  'Rei/Rainha vem da fase classificatória atual');
ok(W._motorDaFaseUsaReiRainha(hybrid) === true,
  'motor canônico também seleciona Rei/Rainha pela fase atual');
hybrid.currentPhaseIndex = 1;
ok(W._faseCorrenteUsaEntradasRotativas(hybrid) === false,
  'eliminatória posterior não herda entradas rotativas do topo Liga');
ok(W._sorteioDaFaseEhReiRainha(hybrid) === false,
  'eliminatória posterior não herda Rei/Rainha do topo');
ok(W._motorDaFaseUsaReiRainha(hybrid) === false,
  'motor não herda Rei/Rainha na eliminatória posterior');
ok(W._faseCorrenteUsaEntradasRotativas({ format: 'Liga' }) === true,
  'documento sem phases preserva o motor legado');
ok(W._faseCorrenteUsaEntradasRotativas({ format: 'Liga', phases: [] }) === false,
  'lista explícita vazia não inventa uma fase de Liga');

// A fase canônica, não o formato de topo, escolhe o gerador de duplas rotativas.
const canonicalLeague = {
  id: 'phase-current-rotating', format: 'Eliminatórias Simples', teamSize: 1,
  participants: parts(4), rounds: [], matches: [], currentPhaseIndex: 0,
  phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }],
  ligaRoundFormat: 'padrao', drawManual: true
};
W._generateNextRound(canonicalLeague);
const firstRound = canonicalLeague.rounds[0] || {};
const real = (firstRound.matches || []).filter(function (m) { return m && !m.isSitOut && !m.isBye; });
ok(real.length > 0 && real.every(function (m) { return /\s\/\s/.test(m.p1) && /\s\/\s/.test(m.p2); }),
  'classificatória canônica usa o motor rotativo mesmo com formato de topo não-Liga');

const source = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-logic.js'), 'utf8');
const engine = source.slice(source.indexOf('function _generateNextRound(t, det)'), source.indexOf('window._generateNextRound = _generateNextRound'));
ok(engine.includes('_motorDaFaseUsaReiRainha(t)') && !engine.includes('var useReiRainha = t.ligaRoundFormat'),
  'despacho do sorteio consulta Rei/Rainha da fase atual');
const monarchGuard = source.slice(source.indexOf('window._onParticipantAddedToMonarchRound'), source.indexOf('window._healMonarchRemainderToWaitlist'));
ok(monarchGuard.includes('_faseCorrenteUsaEntradasRotativas(t)') && monarchGuard.includes('_motorDaFaseUsaReiRainha(t)'),
  'entrada tardia no Rei/Rainha é guardada pela fase atual');

const substitutions = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
const woCore = fs.readFileSync(path.join(ROOT, 'js', 'views', 'wo-core.js'), 'utf8');
ok(substitutions.includes('W.O. de grupo é próprio da classificatória rotativa') &&
   substitutions.includes('_faseCorrenteUsaEntradasRotativas(t)') &&
   substitutions.includes('_motorDaFaseUsaReiRainha(t)'),
  'controles de W.O. consultam a fase atual, não o rótulo Liga do torneio');
ok(woCore.includes('O fluxo de grupo pertence à fase atual') &&
   woCore.includes('_faseCorrenteUsaEntradasRotativas(t)') &&
   woCore.includes('_motorDaFaseUsaReiRainha(t)'),
  'motor único de W.O. não delega eliminatória híbrida ao fluxo de grupo');

const autoDrawSource = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
const waitlistWorker = autoDrawSource.slice(autoDrawSource.indexOf('async function _formarGruposDaEspera'), autoDrawSource.indexOf('exports.autoDrawReconcile'));
ok(waitlistWorker.includes('drawWindow._faseCorrenteUsaEntradasRotativas(t0)') &&
   waitlistWorker.includes('drawWindow._motorDaFaseUsaReiRainha(t0)') &&
   !waitlistWorker.includes('const _liga = drawWindow._isLigaFormat'),
  'Function forma grupos da espera pela fase atual, não pelo rótulo global');

console.log((fail ? '✗' : '✓') + ' current-phase-round-engine: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
