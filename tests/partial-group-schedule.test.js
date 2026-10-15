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

// A mesma agenda alimenta a Fase 0 e as fases posteriores. Exercitar o gerador
// real, inclusive ida e volta, evita aprovar apenas a função auxiliar.
for (let n = 2; n <= 64; n++) {
  for (let wanted = 1; wanted < n; wanted++) {
    const list = players(n);
    const cfg = { gruposCount: 1, turnos: 'ida_volta', classification: { schedule: { gamesPerUnit: wanted, mode: 'structured' } } };
    const generated = E.genGroupsFromPool(list, cfg, 'matrix-' + n + '-' + wanted);
    const ida = generated.matches.filter(m => m.label.startsWith('Ida'));
    const volta = generated.matches.filter(m => m.label.startsWith('Volta'));
    const expected = Math.floor(n * wanted / 2);
    ok(ida.length === expected, n + '×' + wanted + ': ida contém o máximo matemático de confrontos');
    ok(volta.length === expected, n + '×' + wanted + ': volta espelha a ida sem perder confronto');
    ok(Math.max(...ida.map(m => m.round)) < Math.min(...volta.map(m => m.round)),
      n + '×' + wanted + ': toda rodada da volta ocorre depois da ida');
    const seen = new Set();
    const degree = Object.fromEntries(list.map(p => [p.uid, 0]));
    const occupied = new Set();
    ida.forEach(m => {
      const key = [m.p1Uid, m.p2Uid].sort().join('|');
      ok(!seen.has(key), n + '×' + wanted + ': confronto da ida não se repete');
      seen.add(key);
      degree[m.p1Uid]++;
      degree[m.p2Uid]++;
      for (const uid of [m.p1Uid, m.p2Uid]) {
        const slot = m.round + '|' + uid;
        ok(!occupied.has(slot), n + '×' + wanted + ': ninguém joga duas vezes na mesma rodada');
        occupied.add(slot);
      }
      ok(volta.some(v => v.p1Uid === m.p2Uid && v.p2Uid === m.p1Uid),
        n + '×' + wanted + ': volta inverte os mesmos lados');
    });
    const degrees = Object.values(degree);
    ok(Math.max(...degrees) === wanted && Math.min(...degrees) >= wanted - 1,
      n + '×' + wanted + ': rodadas por unidade equilibradas sem vagas artificiais');
  }
}

// A prévia do editor deve contar as mesmas partidas que o gerador cria. Em
// particular, 8 duplas × 3 confrontos = 12 jogos na ida e 24 com volta.
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2-ui.js'), 'utf8');
const estimateLine = new Function('_groupInfo', '_minPartidaForm', '_scoringInicial', '_elimEffScoring', 'document',
  extractFunction(uiSource, 'function _estimateLine') + '; return _estimateLine;'
)(cfg => ({ people: 16, units: 8, ng: cfg.grupos, base: 8 / cfg.grupos, rem: 0, isDupla: true, t: { courtCount: 1 } }),
  () => 20, () => null, () => null, { getElementById: () => null });
const baseCfg = { grupos: 1, disputa: 'dupla', classificationSchedule: { gamesPerUnit: 3 }, eliminatoria: { ativa: false } };
ok(estimateLine({ ...baseCfg, rodadas: { turnos: 'ida' } }).includes('(12 jogos'),
  'prévia: 8 duplas × 3 jogos = 12 confrontos');
ok(estimateLine({ ...baseCfg, rodadas: { turnos: 'ida_volta' } }).includes('(24 jogos'),
  'prévia: ida e volta dobram os confrontos e a duração');
ok(estimateLine({ ...baseCfg, grupos: 2, rodadas: { turnos: 'ida_volta' } }).includes('(12 jogos'),
  'prévia: dois grupos não dobram, conforme a fase compilada');

// O compilador é a fronteira que decide se o pedido de volta chega ao gerador.
// Testar só genGroupsFromPool com turnos forçados aprovaria uma configuração
// que o editor não salva para múltiplos grupos.
const vm = require('vm');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2.js'), 'utf8'), sandbox);
for (const ng of [1, 2]) {
  const cfg = sandbox.FORMAT2.normalize({ ...baseCfg, grupos: ng, rodadas: { modo: 'todos', turnos: 'ida_volta' } }, 'Beach Tennis');
  const compiled = sandbox.FORMAT2.compileToPhases(cfg, { sport: 'Beach Tennis' });
  const phase = compiled.phases[0];
  ok(phase.turnos === (ng === 1 ? 'ida_volta' : 'ida'),
    ng + ' grupo(s): compilador propaga somente os turnos materializáveis');
  const matches = E.genGroupsFromPool(players(8), phase, 'compiled-' + ng).matches;
  ok(matches.length === (ng === 1 ? 24 : 12),
    ng + ' grupo(s): gerador consome a fase compilada com a mesma contagem da prévia');
}

console.log(fail ? `❌ partial-group-schedule: ${pass} ok, ${fail} falharam` : `✅ partial-group-schedule: ${pass} verificações`);
process.exit(fail ? 1 : 0);
