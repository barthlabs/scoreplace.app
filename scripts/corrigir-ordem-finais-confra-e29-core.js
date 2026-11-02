'use strict';

// E29: validação pura do lote fechado da Confra. IDs permanecem apenas no manifesto privado.
const { stable } = require('./backup-torneio-operacional-core.js');
const SAME = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const NAME = 'Confra BT Alta da Clínica 2026';

function classify(root, matches, results, inscritosCount, expected = 'before') {
  if (!root || root.name !== NAME || !Array.isArray(matches) || !Array.isArray(results) ||
      inscritosCount !== 150 || matches.length !== 213 || results.length !== 213) {
    throw Error('censo E29 divergente');
  }
  const byId = new Map();
  const numbers = [];
  let sitOut = 0;
  const finals = {};
  for (const entry of matches) {
    if (!entry || typeof entry.id !== 'string' || byId.has(entry.id) ||
        !entry.data || !entry.data.jogo || String(entry.data.jogo.id) !== entry.id) {
      throw Error('jogo E29 inválido');
    }
    byId.set(entry.id, entry);
    const game = entry.data.jogo;
    if (game.isSitOut) {
      sitOut++;
      if (game._gameNum != null) throw Error('folga numerada');
      continue;
    }
    numbers.push(game._gameNum);
    if (game.phaseIndex !== 1 || game.round !== 6 || !['gold', 'silver'].includes(game.bracket)) continue;
    const key = game.bracket + (game.isThirdPlace ? 'Third' : 'Final');
    if (finals[key]) throw Error('final E29 duplicada');
    if (game.scheduledGameNumber != null || game.winner != null || game.scoreP1 != null ||
        game.scoreP2 != null || game.resultAt != null) throw Error('final E29 já disputada ou agendada');
    finals[key] = entry;
  }
  if (sitOut !== 9 || numbers.length !== 204 ||
      numbers.slice().sort((a, b) => a - b).some((n, i) => n !== i + 1)) {
    throw Error('numeração E29 não contígua');
  }
  const resultById = new Map();
  for (const entry of results) {
    if (!entry || typeof entry.id !== 'string' || resultById.has(entry.id) ||
        !byId.has(entry.id) || String(entry.data?.matchId) !== entry.id) throw Error('resultado E29 inválido');
    resultById.set(entry.id, entry);
  }
  const required = ['goldThird', 'goldFinal', 'silverThird', 'silverFinal'];
  if (required.some(key => !finals[key])) throw Error('final E29 ausente');
  const nums = Object.fromEntries(required.map(key => [key, finals[key].data.jogo._gameNum]));
  const wanted = expected === 'before'
    ? { goldThird: 202, goldFinal: 201, silverThird: 203, silverFinal: 204 }
    : { goldThird: 201, goldFinal: 202, silverThird: 203, silverFinal: 204 };
  if (!SAME(nums, wanted)) throw Error('ordem E29 inesperada');
  for (const key of ['goldThird', 'goldFinal']) {
    const result = resultById.get(finals[key].id).data;
    if (result.scheduledGameNumber != null || result.scoreP1 != null || result.scoreP2 != null ||
        result.resultAt != null || result.replay != null) throw Error('resultado E29 já usado');
  }
  return { finals, resultById, counts: { matches: 213, results: 213, inscritos: 150,
    games: 204, sitOut: 9, numbers: nums } };
}

function expectedAfter(matches, before) {
  return matches.map(entry => {
    const game = entry.data.jogo;
    if (entry.id === before.finals.goldThird.id) return { id: entry.id,
      data: { ...entry.data, jogo: { ...game, _gameNum: 201 } } };
    if (entry.id === before.finals.goldFinal.id) return { id: entry.id,
      data: { ...entry.data, jogo: { ...game, _gameNum: 202 } } };
    return entry;
  });
}

module.exports = { NAME, SAME, classify, expectedAfter };
