'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const split = require('../js/views/tournament-split-core.js');
const writes = require('../functions-autodraw/write-plan.js');

const decision = {
  '0|fem-light|line-1|main|2': {
    sourceMatchIds: ['VC-R1-P1', 'VC-R1-P2'],
    revision: 'two-results',
    eligibleIds: ['manual-1', 'manual-2'],
    recipientId: 'manual-2',
    position: 3
  }
};
const tournament = {
  id: 'surplus-test',
  _semPesados: ['matches', 'participants', 'history'],
  participants: [
    { manualParticipantId: 'manual-1', displayName: 'Jogador 01' },
    { manualParticipantId: 'manual-2', displayName: 'Jogador 02' }
  ],
  matches: [{ id: 'VC-R1-P1', p1: 'Jogador 01', p2: 'Jogador 02' }],
  rounds: [],
  history: [],
  sobraUnicaDecisoesV1: decision
};

async function main() {
  const plan = writes.planWrites(null, tournament, {
    split,
    boundary: value => ({ persist: JSON.parse(JSON.stringify(value)) }),
    agoraIso: '2026-10-14T20:00:00.000Z',
    tournamentId: tournament.id
  });
  const rootWrite = plan.ops.find(op => op.colecao === null);
  assert(rootWrite, 'documento raiz precisa ser gravado');
  assert.deepStrictEqual(rootWrite.doc.sobraUnicaDecisoesV1, decision,
    'write-plan preserva o mapa no documento raiz de um torneio dividido');
  const docs = new Map();
  plan.ops.filter(op => op.colecao).forEach(op => {
    const bucket = docs.get(op.colecao) || [];
    if (op.tipo === 'set') bucket.push(op.doc);
    docs.set(op.colecao, bucket);
  });
  const restored = await split.montarDoBanco(rootWrite.doc, collection => docs.get(collection) || []);
  assert.deepStrictEqual(restored.sobraUnicaDecisoesV1, decision,
    '_leTorneio usa montarDoBanco e recupera a decisão byte a byte');
  assert.strictEqual(restored.matches.length, 1, 'o fixture realmente atravessou a divisão de jogos');

  const source = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
  const start = source.indexOf('const _CAMPOS_RASCUNHO_SORTEIO_INICIAL = [');
  const end = source.indexOf('/* Grava o torneio respeitando', start);
  assert(start >= 0 && end > start, 'contrato do rascunho privado encontrado');
  const context = { HttpsError: Error };
  vm.runInNewContext(source.slice(start, end) + '\nthis.stage = _rascunhoDoSorteioInicial; this.publish = _aplicaRascunhoDoSorteioInicial;', context);
  const staged = context.stage(tournament);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(staged.sobraUnicaDecisoesV1)), decision,
    'rascunho privado preserva a decisão da primeira rodada');
  const published = { id: tournament.id };
  context.publish(published, staged);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(published.sobraUnicaDecisoesV1)), decision,
    'publicação reaplica a mesma decisão, sem recalculá-la');
  console.log('✓ sobraUnicaDecisoesV1 atravessa write-plan, leitura dividida e rascunho privado');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
