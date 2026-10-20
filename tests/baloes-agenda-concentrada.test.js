'use strict';
// Exercita os dois renderizadores de nomes: chave e cards da tela inicial.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const W = require('./render-harness').window;
const originalContact = W._contactPersonIconHtml;
W._contactPersonIconHtml = () => '<span data-contact-test>💬</span>';

const dashboard = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
const start = dashboard.indexOf('function _playerRow(name, uid)');
const end = dashboard.indexOf('// Time: jogadores', start);
assert(start > 0 && end > start, 'renderizador de atleta da dashboard encontrado');
function dashboardRow(t) {
  const context = {
    window: {
      _isConcentratedTournament: W._isConcentratedTournament,
      _contactPersonIconHtml: () => '<span data-contact-test>💬</span>',
      _personAvatarHtml: () => '<span>avatar</span>',
      _spCor: value => value
    },
    _geoMini: null, _isMe: () => false, _sf: value => String(value),
    tRef: t, item: { t }, cu: null
  };
  vm.createContext(context);
  return vm.runInContext(dashboard.slice(start, end) + '\n_playerRow("Atleta Teste", "uid-teste")', context);
}
function bracketRow(t) {
  const m = { id: 'jogo-teste', p1: 'Atleta Teste', p2: 'Adversário Teste' };
  return W._teamAvatarHtml(m.p1, null, t, null, m, 'p1');
}
const variants = [
  { name: 'janela de dias', t: { id: 't1', scheduleWindow: { days: [{ day: '2026-10-22', startTime: '18:00', endTime: '23:00' }] } }, hidden: true },
  { name: 'agenda da competição', t: { id: 't2', teamCompetition: { enabled: true, schedule: { enabled: true } } }, hidden: true },
  { name: 'torneio distribuído', t: { id: 't3' }, hidden: false }
];
for (const { name, t, hidden } of variants) {
  assert.equal(bracketRow(t).includes('data-contact-test'), !hidden, 'chave: ' + name);
  assert.equal(dashboardRow(t).includes('data-contact-test'), !hidden, 'tela inicial: ' + name);
}
W._contactPersonIconHtml = originalContact;
console.log('✓ balões ausentes na agenda concentrada e preservados no torneio distribuído');
