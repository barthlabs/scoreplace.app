const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const begin = source.indexOf('function _bracketAgendaCompare(');
const end = source.indexOf('function _bracketToggleEmptySourceRounds(', begin);
assert(begin >= 0 && end > begin, 'funções reais da agenda estão no bracket.js');
const context = {
  window: { _collectAllMatches: t => (t.matches || []).concat(...(t.rounds || []).map(r => r.matches || [])) },
  _matchCardTimestamp: value => Date.parse(value), Intl, Date, Number, String, Set
};
vm.createContext(context);
vm.runInContext(source.slice(begin, end), context);

const entries = [
  { at: 1000, num: 3, court: 'Quadra 4', position: 0 },
  { at: 1000, num: 2, court: 'Quadra 5', position: 1 },
  { at: 1000, num: 1, court: 'Quadra 6', position: 2 }
];
entries.sort(context._bracketAgendaCompare);
assert.deepStrictEqual(entries.map(e => e.num), [1, 2, 3]);
entries[0].court = 'Quadra 9';
entries.sort(context._bracketAgendaCompare);
assert.deepStrictEqual(entries.map(e => e.num), [1, 2, 3], 'redesignar quadra não move o jogo');
assert.deepStrictEqual([
  { at: 1000, num: 0, court: 'Quadra 6' },
  { at: 1000, num: 0, court: 'Quadra 4' }
].sort(context._bracketAgendaCompare).map(e => e.court), ['Quadra 4', 'Quadra 6'], 'legado usa quadra');

const split = require(path.join(root, 'js/views/tournament-split-core.js'));
const matches = Array.from({ length: 96 }, (_, i) => ({
  id: 'm' + (i + 1), scheduledGameNumber: i + 1,
  category: i % 2 ? 'Fem Power' : 'Fem Light',
  scheduledAt: i < 48 ? '2026-10-22T18:00:00-03:00' : '2026-10-23T18:00:00-03:00'
}));
const tournament = { id: 't', _nJogos: 96, matches, rounds: [{ matches: [matches[0]] }] };
const parts = split.dividir(tournament);
const full = split.remontar(parts);
const first = context._bracketAgendaExpected(full, '2026-10-22', '', 'America/Sao_Paulo');
assert.strictEqual(first.count, 48, '48 jogos do primeiro dia, sem duplicar ID em rounds');
assert.strictEqual(first.complete, true);
assert.strictEqual(context._bracketAgendaExpected(full, '2026-10-22', 'Fem Light', 'America/Sao_Paulo').count, 24);
assert.strictEqual(context._bracketAgendaExpected(full, '2026-10-23', '', 'America/Sao_Paulo').count, 48);
const partial = split.remontar(Object.assign({}, parts, { matches: parts.matches.slice(0, 48) }));
partial._nJogos = 96;
assert.strictEqual(context._bracketAgendaExpected(partial, '2026-10-22', '', 'America/Sao_Paulo').complete, false,
  'subcoleção parcial não passa por foto completa');
assert(source.includes('entries.sort(_bracketAgendaCompare)') &&
  source.includes('groups[key].sort(_bracketAgendaCompare)') &&
  !source.includes('waitingEntries.sort(_bracketAgendaCompare)'), 'a fila única e as colunas usam o mesmo comparador');
assert(source.includes('data-scheduled-game-number="${_plannedGameNumber > 0 ? _plannedGameNumber : \'\'}"'),
  'o DOM diferencia o número canônico do contador legado');
console.log('✓ agenda por número canônico e contagem de torneio dividido');
