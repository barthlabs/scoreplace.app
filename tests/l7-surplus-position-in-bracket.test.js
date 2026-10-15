'use strict';

const assert = require('assert');
const H = require('./headless.js');
H.load('chaves.js');
H.load('bracket-policy.js');
H.load('chaves-adapter.js');
H.load('phases-engine.js');
const C = H.window._chaves;
const A = H.window._chavesAdapter;
const E = H.window._phasesEngine;

for (const n of [5, 7, 36]) {
  const old = C.chave(n, 'simples', 'sobra_unica');
  const withoutDecision = C.chave(n, 'simples', 'sobra_unica', null);
  assert.deepStrictEqual(withoutDecision, old, 'sem decisão preserva desenho publicado N=' + n);
}
const five = C.chave(5, 'simples', 'sobra_unica', { 'VC-R1': 'seed:1' });
assert.strictEqual(five.porId['VC-R1-P3'].entradas[0].seed, 1,
  'decisão da primeira rodada ocupa o slot de folga');
assert.strictEqual(five.totalJogos, C.chave(5, 'simples', 'sobra_unica').totalJogos,
  'a decisão não cria nem remove jogo');
const thirtySix = C.chave(36, 'simples', 'sobra_unica', { 'VC-R3': 'winner:VC-R2-P1' });
assert.strictEqual(thirtySix.porId['VC-R3-P5'].entradas[0].de, 'VC-R2-P1',
  'vencedor escolhido ocupa a sobra da rodada posterior');
const pending36 = A.build(36, 'simples', { participantes: Array.from({ length: 36 }, (_, i) =>
  ({ uid: 'u' + i, name: 'Equipe ' + i })), politicaDaChave: 'sobra_unica', ns: 'pending' });
assert.strictEqual(pending36.matches.find(m => m.id === 'pending-VC-R3-P5').sobraAguardaDecisao, true,
  'a folga posterior fica pendente até a rodada-fonte fechar');
const phaseMatches = pending36.matches.map(m => Object.assign({}, m, m.sobraAguardaDecisao
  ? {} : { winner: m.p1 || 'Vencedor' }, { phaseIndex: 1 }));
const phaseTournament = { phases: [{}, {}], currentPhaseIndex: 1, matches: phaseMatches };
assert.strictEqual(E.phaseComplete(phaseTournament), false,
  'fase não termina enquanto a sobra ainda aguarda decisão');
assert(E.pendingMatches(phaseTournament).some(u => u.match.id === 'pending-VC-R3-P5'),
  'a mesma sobra aparece ao organizador entre os jogos pendentes');
const resolvedTournament = { ...phaseTournament, matches: phaseMatches.map(m => m.sobraAguardaDecisao
  ? { ...m, sobraAguardaDecisao: false } : m) };
assert.strictEqual(E.phaseComplete(resolvedTournament), true,
  'folga decidida volta a ser resolvida sem exigir placar artificial');
assert.throws(() => C.chave(36, 'simples', 'sobra_unica', { 'VC-R3': 'winner:nao-existe' }),
  /não pertence/i, 'decisão obsoleta não troca silenciosamente outra equipe');
const participants = Array.from({ length: 5 }, (_, i) => ({ name: 'Equipe ' + (i + 1), uid: 'u' + (i + 1) }));
const built = A.build(5, 'simples', { participantes: participants, politicaDaChave: 'sobra_unica',
  decisoes: { 'VC-R1': 'seed:1' }, ns: 'l7' });
assert.strictEqual(built.matches.find(m => m.id === 'l7-VC-R1-P3').p1, 'Equipe 1',
  'adapter leva a decisão persistida até o jogo exibido');
let callbackCount = 0;
const prepared = A.build(5, 'simples', { participantes: participants, politicaDaChave: 'sobra_unica',
  ns: 'l7-prepared', prepareSurplusDecision: ({ scope, eligible }) => {
    callbackCount++;
    assert.strictEqual(scope.round, 1);
    assert.strictEqual(scope.line, 'l7-prepared-');
    assert.deepStrictEqual(eligible.map(e => e.sourceId), ['seed:1', 'seed:2', 'seed:3', 'seed:4', 'seed:5']);
    assert.deepStrictEqual(eligible.map(e => e.identity), ['uid:u1', 'uid:u2', 'uid:u3', 'uid:u4', 'uid:u5']);
    return { decision: { recipientSourceId: 'seed:1' } };
  } });
assert.strictEqual(callbackCount, 1);
assert.strictEqual(prepared.matches.find(m => m.id === 'l7-prepared-VC-R1-P3').p1, 'Equipe 1');
console.log('✓ posição decidida da sobra preserva contagem e chega ao adapter');
