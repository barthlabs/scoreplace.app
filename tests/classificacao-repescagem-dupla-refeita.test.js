'use strict';
// Uma vaga de repescagem com parceira trocada continua sendo uma vaga.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { window: W, sandbox } = require('./headless');

const store = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
const start = store.indexOf('window._classifCompetitorEntries = function');
const end = store.indexOf('\n// A COLOCAÇÃO DE UMA PESSOA', start);
assert(start > 0 && end > start);
vm.runInContext(store.slice(start, end), sandbox);

const team = (name, uids) => ({ name, uids });
const side = (m, field, t) => { m[field] = t.name; m[field === 'p1' ? 'team1Uids' : 'team2Uids'] = t.uids; };
const game = (id, round, one, two, winner, extra) => {
  const m = { id, round, winner: winner && winner.name, ...extra };
  side(m, 'p1', one); side(m, 'p2', two);
  return m;
};
const old = team('Ana / Bia', ['a', 'b']);
const replacement = team('Ana / Carla', ['a', 'c']);
const first = team('Dani / Elisa', ['d', 'e']);
const second = team('Fabi / Gabi', ['f', 'g']);
const third = team('Helo / Iara', ['h', 'i']);
const fourth = team('Jo / Kika', ['j', 'k']);
const fifth = team('Lia / Mara', ['l', 'm']);
const matches = [
  game('r1-a', 1, old, first, first),
  game('r1-b', 1, second, third, third),
  game('r1-c', 1, fourth, fifth, fifth),
  game('r2-a', 2, first, replacement, replacement, { p2FromRepechage: true }),
  game('r2-b', 2, third, fifth, third),
  game('final', 3, replacement, third, third)
];
const oldKey = W._classifEntryKey(old.name, old.uids);
assert.deepStrictEqual(Object.keys(W._classifDuplasSubstituidas(matches)), [oldKey]);
assert.strictEqual(W._classifCompetitorEntries(matches).length, 6);

const t = { format: 'Eliminatórias Simples', matches };
W._updateProgressiveClassification(t);
const rows = W._classifRows(t);
assert.strictEqual(rows.length, 6);
assert.deepStrictEqual(Array.from(rows, x => x.pos).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
assert(!rows.some(x => x.key === oldKey));
assert(rows.some(x => x.key === W._classifEntryKey(replacement.name, replacement.uids)));
assert.strictEqual(matches[0].p1, old.name, 'o resultado histórico não é reescrito');
assert(W._classifIsComplete(matches, rows));
assert.strictEqual(W._congelaLinhasEncerradas(t), 1);
assert.strictEqual(t.classifFinalDaLinha.main.length, 6);
assert.strictEqual(Math.max(...t.classifFinalDaLinha.main.map(x => x.pos)), 6);

// Sem a marca canônica da repescagem, a nova dupla é outra entrada.
const independent = matches.map(m => ({ ...m }));
delete independent[3].p2FromRepechage;
assert.strictEqual(Object.keys(W._classifDuplasSubstituidas(independent)).length, 0);
assert.strictEqual(W._classifCompetitorEntries(independent).length, 7);
const mixedLines = matches.map((m, i) => ({ ...m, bracket: i < 3 ? 'silver' : 'gold' }));
assert.strictEqual(Object.keys(W._classifDuplasSubstituidas(mixedLines)).length, 0,
  'duas linhas não compartilham vaga de classificação');

console.log('✓ classificação da vaga recomposta: 6 posições, histórico intacto');
