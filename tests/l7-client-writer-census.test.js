'use strict';

// L7.P1.26 — o navegador ainda possui mutadores transacionais legados. Este
// teste não os declara seguros: registra a dívida e impede que outra porta
// apareça fora do censo enquanto cada intenção é migrada para uma CF estreita.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const jsRoot = path.join(root, 'js');
const approved = {
  'store.js': 0,
  'views/bracket-logic.js': 0,
  'views/liga-substitution.js': 1,
  'views/participants.js': 0,
  'views/tournaments-categories.js': 0,
  'views/tournaments-draw-prep.js': 0,
  'views/tournaments-draw.js': 0,
  'views/tournaments-org-tools.js': 0,
  'views/tournaments.js': 10,
  'views/wo-claim.js': 0
};
let failed = 0;
function ok(value, label) {
  console.log((value ? '✓ ' : '✗ ') + label);
  if (!value) failed++;
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const found = {};
walk(jsRoot).filter((file) => file.endsWith('.js')).forEach((file) => {
  const relative = path.relative(jsRoot, file).replace(/\\/g, '/');
  const count = (fs.readFileSync(file, 'utf8').match(/AppStore\.(?:mutate|commitTournamentTx)\s*\(/g) || []).length;
  if (count) found[relative] = count;
});
Object.keys(found).forEach((file) => ok(Object.prototype.hasOwnProperty.call(approved, file),
  file + ' está classificado no censo L7'));
Object.keys(approved).forEach((file) => ok((found[file] || 0) <= approved[file],
  file + ' não ganhou mutador novo (' + (found[file] || 0) + '/' + approved[file] + ')'));
const total = Object.values(found).reduce((sum, count) => sum + count, 0);
ok(total <= 60, 'o total de mutadores do navegador só pode cair (' + total + '/60)');
process.exit(failed ? 1 : 0);
