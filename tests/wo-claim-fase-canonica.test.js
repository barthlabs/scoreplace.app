'use strict';
// Exercita a tela real: a prévia do auto-W.O. mostra negociação somente para
// jogo de dupla da eliminatória, independentemente do rótulo do torneio.
const assert = require('assert');
const H = require('./headless');
const W = H.window;
H.load('wo-claim.js');

const html = [];
W.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, addEventListener() {}, set innerHTML(value) { html.push(value); } }),
  body: { appendChild() {} }
};
W.AppStore = { currentUser: { uid: 'ua' }, tournaments: [] };
W._findTournamentById = id => W.AppStore.tournaments.find(t => t.id === id);
W._souOrganizador = () => false;
W._slotUids = (m, side) => m[side + 'Uids'] || [];
W._displayNameForUid = uid => ({ ua: 'A', ub: 'B', uc: 'C', ud: 'D' })[uid] || '';

const match = { id: 'm1', p1: 'A / B', p2: 'C / D', p1Uids: ['ua', 'ub'], p2Uids: ['uc', 'ud'] };
const phases = [
  { kind: 'classification', classification: { structure: 'round_robin' }, reiRainha: true },
  { kind: 'elimination', elimination: { bracketType: 'single' }, reiRainha: false }
];
let checks = 0;
function preview(overrides, expectedNegotiation, label) {
  const t = Object.assign({ id: 't', format: 'Liga', drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha',
    currentPhaseIndex: 1, phases: JSON.parse(JSON.stringify(phases)), matches: [Object.assign({}, match, { phaseIndex: 1 })],
    woScope: 'individual', resultEntry: 'players', woClaims: [] }, overrides);
  W.AppStore.tournaments = [t];
  html.length = 0;
  const ctx = { scope: 'match', matchId: 'm1' };
  W._woClaimChip(t, ctx);
  W._woSelfConfirm('t', 'm|m1', 'A', 'ua');
  const shown = html.join(' ');
  assert.ok(shown.includes('Confirmar o seu W.O.'), label + ': a prévia foi aberta');
  assert.strictEqual(shown.includes('continua e escolhe como o jogo segue'), expectedNegotiation, label);
  checks += 2;
}

preview({}, true, 'híbrido na eliminatória não herda Rei/Rainha do topo');
preview({ currentPhaseIndex: 0 }, true, 'phaseIndex do jogo vence a fase corrente');
preview({ matches: [Object.assign({}, match, { phaseIndex: 0 })] }, false, 'jogo antigo da classificatória mantém fluxo de grupo');
preview({ matches: [Object.assign({}, match, { phaseIndex: 9 })] }, false, 'índice inválido não inventa uma fase');
preview({ phases: [] }, false, 'lista explícita vazia não recai no topo');
preview({ phases: undefined, matches: [Object.assign({}, match)] }, false, 'documento legado sem fases mantém comportamento');
preview({ format: 'Eliminatórias Simples', drawMode: '', ligaRoundFormat: '',
  phases: [{ kind: 'classification', classification: { structure: 'round_robin', pairing: {
    strategy: 'ranking_clusters', entryMode: 'fixed' } } }], currentPhaseIndex: 0,
  matches: [Object.assign({}, match, { phaseIndex: 0 })] }, false, 'classificatória de duplas fixas não é Liga rotativa');

console.log('wo-claim-fase-canonica: ' + checks + ' asserts OK');
