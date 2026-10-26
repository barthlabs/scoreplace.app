'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const participants = fs.readFileSync(path.join(root, 'js/views/participants.js'), 'utf8');
const start = participants.indexOf('window._partSearch = window._partSearch ||');
const end = participants.indexOf('window._toggleVip = function', start);
assert(start >= 0 && end > start, 'filtro real de inscritos disponível');

function visibleNames(search) {
  const host = {
    items: [],
    appendChild(card) { this.items.splice(this.items.indexOf(card), 1); this.items.push(card); }
  };
  // O placeholder manual só entra uma vez na projeção ativa. Uma inscrição
  // histórica retirada não deve voltar à lista por efeito da busca.
  ['José Ávila', 'João Lima', 'Nilo Fontes'].forEach((name, i) => {
    const attrs = { 'data-part-name': name.toLowerCase(), 'data-part-order': String(i + 1) };
    host.items.push({ name, attrs, parentNode: host, style: {},
      getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; } });
  });
  const empty = { style: {} };
  const doc = {
    scrollingElement: { scrollTop: 0 }, documentElement: { scrollTop: 0 },
    getElementById(id) {
      if (id === 'part-search') return { value: search };
      if (id === 'part-sort') return { value: 'order-asc' };
      if (id === 'part-search-empty') return empty;
      return null;
    },
    querySelectorAll(selector) { return selector === '[data-part-card]' ? host.items.slice() : []; }
  };
  const context = { window: { _partSearch: '', _stickyFilterKeepRoom() {} }, document: doc, console };
  vm.runInNewContext(participants.slice(start, end), context);
  context.window._partApplyFilter();
  return host.items.filter(card => card.style.display !== 'none').map(card => card.name);
}

assert.deepEqual(visibleNames('jose avila'), ['José Ávila']);
assert.deepEqual(visibleNames('JOSÉ ÁVILA'), ['José Ávila']);
assert.deepEqual(visibleNames('nilo'), ['Nilo Fontes'], 'placeholder manual ativo continua pesquisável');
assert.deepEqual(visibleNames('joao'), ['João Lima']);

const dbSource = fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8');
const a = dbSource.indexOf('async searchUsers(queryText, opts)');
const b = dbSource.indexOf('async listInvitableUsers()', a);
assert(a >= 0 && b > a, 'busca real de pessoas convidáveis disponível');
const searchUsers = vm.runInNewContext('({' + dbSource.slice(a, b) + '}).searchUsers', { window: { _warn() {} } });

(async () => {
  let reads = 0;
  const scope = { listInvitableUsers: async () => { reads++; return [
    { displayName: 'José Ávila' }, { displayName: 'Nilo Fontes' }
  ]; } };
  assert.deepEqual(Array.from(await searchUsers.call(scope, 'jose')).map(u => u.displayName), ['José Ávila']);
  assert.deepEqual(Array.from(await searchUsers.call(scope, 'JOSÉ')).map(u => u.displayName), ['José Ávila']);
  assert.deepEqual(Array.from(await searchUsers.call(scope, 'nilo')).map(u => u.displayName), ['Nilo Fontes']);
  assert.deepEqual(Array.from(await searchUsers.call(scope, 'João')).map(u => u.displayName), [],
    'normalização não revela pessoa fora da lista autorizada');
  assert.equal(reads, 4);
  console.log('✓ busca de inscritos e de pessoas autorizadas tolera acentos sem ampliar acesso');
})().catch(error => { console.error(error); process.exitCode = 1; });
