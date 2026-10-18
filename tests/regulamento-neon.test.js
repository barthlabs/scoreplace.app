'use strict';
const assert = require('assert');
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
for (const sentence of [
  '24 Light Feminino', '8 Power Feminino', '8 Extreme Feminino',
  '8 Light Masculino', '8 Power Masculino', '8 Extreme Masculino',
  '16 Light Feminino',
  '8 duplas e 16 atletas: 10 mulheres e 6 homens',
  'As duplas Light Feminino de sexta-feira jogarão apenas entre si',
  'Cada dupla disputará 3 partidas',
]) assert(html.includes(sentence), `regra ausente: ${sentence}`);
assert(!html.includes('24 vagas para duplas'));
assert(!html.includes('12 atletas: 6 mulheres e 6 homens'));

const section = html.match(/<section class="card" data-neon-regulation[\s\S]*?<\/section>/);
assert(section, 'seção própria do regulamento');
assert(!/#[0-9a-f]{3,8}\b/i.test(section[0]), 'sem cores hexadecimais inline');
assert(section[0].includes('var(--text-main)') && section[0].includes('var(--text-bright)'), 'tokens dos dois temas');

const other = page({ id: 'outro', name: 'Outro torneio' });
assert(!other.includes('data-neon-regulation'));
assert(other.includes('rules.title'), 'outro torneio mantém a página existente');

assert.strictEqual((tournaments.match(/\$\{rulesActionLabel\}<\/button>/g) || []).length, 5,
  'cinco rótulos do detalhe usam o helper');
assert(tournaments.includes("window._isNeonTournament(t)) ? 'Regulamento' : 'Regras'"));
assert.strictEqual((bracket.match(/\$\{rulesActionLabel\}<\/a>/g) || []).length, 1,
  'rótulo das chaves usa o helper');
assert(bracket.includes("window._isNeonTournament(t)) ? 'Regulamento' : 'Regras'"));

console.log('✓ Regulamento Neon: texto, composição, dias, tema e rótulos canônicos');
