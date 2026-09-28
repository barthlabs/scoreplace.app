'use strict';
/* O EXECUTOR NÃO ESPERA FILHO SUMIDO PARA SEMPRE.
 * node tests/runner-timeout-nao-pendura.test.js
 *
 * Executa `roda` extraído do runner real contra uma criança que jamais emite `close`.
 * A prova não replica o executor: o prazo tem de resolver, marcar falha e terminar o
 * GRUPO do filho — é o que limpa emulador/browser que ficaria órfão no preflight.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const EventEmitter = require('events');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'tests', 'run-unit.js'), 'utf8');
const ini = SRC.indexOf('function roda(rel) {');
const fim = SRC.indexOf('\nasync function pool', ini);
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
ok(ini !== -1 && fim > ini, 'encontrou a função roda real');

(async function () {
  const kill = [], saida = [];
  const filho = new EventEmitter();
  filho.pid = 424242;
  filho.stdout = new EventEmitter();
  filho.stderr = new EventEmitter();
  filho.kill = function () { kill.push('filho'); };
  const sb = {
    ROOT: '/repo', path, failed: [], SUITE_TIMEOUT_MS: 12,
    spawn: function () { return filho; },
    setTimeout, clearTimeout,
    console: { log() {} },
    process: {
      execPath: process.execPath,
      kill: function (pid, signal) { kill.push(String(pid) + ':' + signal); },
      stdout: { write: function (s) { saida.push(String(s)); } }
    }
  };
  vm.createContext(sb);
  vm.runInContext(SRC.slice(ini, fim) + '\nthis.roda = roda;', sb, { filename: 'run-unit-real.js' });
  await sb.roda('filho-sem-close.test.js');
  ok(sb.failed.length === 1 && sb.failed[0] === 'filho-sem-close.test.js',
    'filho sem close reprova a suíte, não deixa a promessa pendurada');
  ok(kill.includes('-424242:SIGTERM'), 'timeout encerra o GRUPO do filho, não só o pai');
  ok(saida.join('').includes('tempo limite de'), 'falha deixa diagnóstico explícito de timeout');
  console.log((fail ? '❌' : '✅') + ' runner-timeout-nao-pendura: ' + pass + ' asserções, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
})();
