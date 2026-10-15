'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('js/views/format2-ui.js', 'utf8');
const start = source.indexOf('window._f2ElimDupla = function');
const end = source.indexOf('window._f2PoliticaDaChave = function', start);
assert(start >= 0 && end > start);

for (const policy of ['bye', 'sobra_unica']) {
  const notices = [];
  const context = {
    S: { cfg: { eliminatoria: { dupla: false, politicaDaChave: policy } } },
    window: { showNotification: (...args) => notices.push(args) },
    _norm() {}, _rerender() {}
  };
  vm.runInNewContext(source.slice(start, end), context);
  context.window._f2ElimDupla(true);
  assert.strictEqual(context.S.cfg.eliminatoria.politicaDaChave, 'repescagem');
  assert.strictEqual(context.S.cfg.eliminatoria.dupla, true);
  assert.strictEqual(notices.length, 1, policy + ' exige aviso ao ligar dupla');
  assert.match(notices[0].join(' '), /Dupla eliminação/);
}
console.log('✓ editor torna explícita a troca de política ao ligar dupla eliminação');
