'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const utils = fs.readFileSync(path.join(root, 'js/views/tournaments-utils.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'js/views/rules.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const helper = utils.match(/window\._isNeonTournament = function\(t\) \{[\s\S]*?\n\};/);
assert(helper, 'identidade do Neon centralizada');

const neonId = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const neonName = 'NEON NIGHTMARE – THE TOURNAMENT';
let tournament;
const browser = {
  _t: (key) => key,
  _findTournamentById: () => tournament,
  _safeHtml: (value) => String(value),
  _souOrganizador: () => false,
  _renderBackHeader: () => '',
  AppStore: {},
};
const context = vm.createContext({ window: browser });
vm.runInContext(helper[0], context);
vm.runInContext(rules, context);

function page(data) {
  tournament = data;
  const container = { innerHTML: '' };
  context.renderRules(container, data.id);
  return container.innerHTML;
}

assert(browser._isNeonTournament({ id: neonId, name: neonName }));
assert(!browser._isNeonTournament({ id: 'outro', name: neonName }));
assert(!browser._isNeonTournament({ id: neonId, name: 'Outro torneio' }));

const html = page({ id: neonId, name: neonName });
assert(html.includes('data-neon-regulation'), 'regulamento aparece no Neon');
assert(html.includes('<h2 style="margin:0;">Regulamento</h2>'));
assert(html.includes('src="/assets/regulamento-neon-nightmare-2026.pdf#toolbar=1"'));
assert(html.includes('download="Regulamento_NEON_NIGHTMARE_2026.pdf"'));
assert(!html.includes('rules.currentParams'), 'sem parâmetros genéricos junto ao PDF original');
assert(!html.includes('A inscrição implica'), 'sem transcrição divergente do documento');
const pdf = fs.readFileSync(path.join(root, 'assets/regulamento-neon-nightmare-2026.pdf'));
assert(pdf.subarray(0, 5).toString() === '%PDF-', 'arquivo PDF válido');
assert.strictEqual(crypto.createHash('sha256').update(pdf).digest('hex'),
  'e9ed5135d2cd57dd980410b484ca0d406b7024c97f27593d73a35a11d1e5a56a',
  'PDF exibido deve ser idêntico ao original aprovado pela organização');

const other = page({ id: 'outro', name: 'Outro torneio' });
assert(!other.includes('data-neon-regulation'));
assert(other.includes('rules.title'), 'outro torneio mantém a página existente');

assert.strictEqual((tournaments.match(/\$\{rulesActionLabel\}<\/button>/g) || []).length, 5,
  'cinco rótulos do detalhe usam o helper');
assert(tournaments.includes("window._isNeonTournament(t)) ? 'Regulamento' : 'Regras'"));
assert.strictEqual((bracket.match(/\$\{rulesActionLabel\}<\/a>/g) || []).length, 1,
  'rótulo das chaves usa o helper');
assert(bracket.includes("window._isNeonTournament(t)) ? 'Regulamento' : 'Regras'"));

console.log('✓ Regulamento Neon: PDF original idêntico, sem transcrição divergente, e rótulos canônicos');
