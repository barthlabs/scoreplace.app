'use strict';
// A rota fria de inscritos não pode depender do detalhe ter sido aberto antes.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'js/router.js'), 'utf8');
const start = source.indexOf("      case 'participants':");
const end = source.indexOf("      case 'rules':", start);
assert(start > 0 && end > start);
const branch = source.slice(start, end);
function scenario(options) {
  options = options || {};
  const calls = [];
  const container = { innerHTML: '' };
  const local = options.local || null;
  const window = {
    _isSoftRefresh: !!options.soft,
    _findTournamentById: () => local,
    _elencoCanonicoAtual: () => !!options.receipt,
    _ensureTournamentLoaded: (_id, cb, fresh) => { calls.push({ cb, fresh }); },
  };
  const context = { window, viewContainer: container, cleanParam: 'neon', _routeEpoch: 3,
    _routeIsCurrent: () => !options.left, encodeURIComponent,
    renderParticipants: () => { calls.push('render'); } };
  vm.runInNewContext("switch ('participants') {\n" + branch + "\ncase 'rules': break; }", context);
  return { window, calls, container, context };
}
const cold = scenario();
assert.strictEqual(cold.calls.length, 1);
assert.strictEqual(cold.calls[0].fresh, true);
assert(cold.container.innerHTML.includes('Carregando…'));
cold.calls[0].cb({ id: 'neon' });
assert.strictEqual(cold.calls[1], 'render', 'sucesso frio só pinta após carregar');
const failed = scenario();
failed.calls[0].cb(null);
assert(failed.container.innerHTML.includes('Não foi possível carregar'));
assert(!failed.calls.includes('render'), 'falha não mostra elenco velho');
const abandoned = scenario({ left: true });
abandoned.calls[0].cb({ id: 'neon' });
assert(!abandoned.calls.includes('render'), 'callback de rota abandonada não pinta');
const ready = scenario({ soft: true, receipt: true,
  local: { id: 'neon', canonicalRegistrationMigration: { fingerprint: 'x' } } });
assert.deepStrictEqual(ready.calls, ['render'], 'soft-refresh confirmado não reconsulta');
const partial = scenario({ soft: true, receipt: false,
  local: { id: 'neon', canonicalRegistrationMigration: { fingerprint: 'x' } } });
assert.strictEqual(partial.calls.length, 1, 'soft-refresh sem receipt busca o canônico');
assert.strictEqual(partial.calls[0].fresh, false);
console.log('✅ participants-route-canonical-load: frio, falha, navegação abandonada, soft-refresh');
