'use strict';
/* Agenda parcial de grupos: a opção "N jogos por unidade" não pode inventar
 * BYE, repetir par nem concentrar jogos em parte do grupo.
 * node tests/partial-group-schedule.test.js */
const fs = require('fs');
const path = require('path');
const E = require('../js/views/phases-engine.js');
let pass = 0, fail = 0;
function ok(condition, message) { if (condition) pass++; else { fail++; console.error('  ✗ ' + message); } }

function extractFunction(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('função não encontrada: ' + marker);
  const open = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) throw new Error('função sem fechamento: ' + marker);
  return source.slice(start, end);
}
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'phases-engine.js'), 'utf8');
const partialGroupSchedule = new Function('roundRobinSchedule',
  extractFunction(source, 'function _partialGroupSchedule') + '; return _partialGroupSchedule;'
)(E.roundRobinSchedule);

function players(n) { return Array.from({ length: n }, (_, i) => ({ uid: 'u' + (i + 1), displayName: 'P' + (i + 1) })); }
function inspect(n, wanted) {
  const list = players(n);
  const schedule = partialGroupSchedule(list, wanted, 'structured', p => p.uid);
  const degree = Object.fromEntries(list.map(p => [p.uid, 0]));
  const pairs = new Set();
  schedule.forEach(round => (round.pairs || []).forEach(pair => {
    const a = pair.a && pair.a.uid, b = pair.b && pair.b.uid;
    ok(!!a && !!b && a !== b, n + '×' + wanted + ': par real, sem BYE');
    const key = [a, b].sort().join('|');
    ok(!pairs.has(key), n + '×' + wanted + ': não repete ' + key);
    pairs.add(key); degree[a]++; degree[b]++;
  }));
  return { schedule, degree, pairs };
}

let x = inspect(5, 2);
ok(x.pairs.size === 5, '5 unidades × 2 jogos gera exatamente 5 confrontos');
ok(Object.values(x.degree).every(d => d === 2), '5 unidades × 2 jogos dá grau 2 a cada unidade');

x = inspect(7, 3);
ok(x.pairs.size === 10, '7 unidades × 3 jogos (grau total ímpar) gera o máximo equilibrado de 10 confrontos');
ok(Math.max(...Object.values(x.degree)) === 3 && Math.min(...Object.values(x.degree)) === 2,
  '7 unidades × 3 jogos distribui grau 2/3, sem diferença maior que 1');

x = inspect(6, 3);
ok(x.pairs.size === 9, '6 unidades × 3 jogos gera 9 confrontos');
ok(Object.values(x.degree).every(d => d === 3), '6 unidades × 3 jogos dá grau 3 a cada unidade');

console.log(fail ? `❌ partial-group-schedule: ${pass} ok, ${fail} falharam` : `✅ partial-group-schedule: ${pass} verificações`);
process.exit(fail ? 1 : 0);
