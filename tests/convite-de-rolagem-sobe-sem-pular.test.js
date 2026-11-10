/* Dicas sobrepostas removidas a pedido dos usuários do app. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const dashboard = read('js/views/dashboard.js');
const explore = read('js/views/explore.js');
const profile = read('js/views/auth.js');
const invite = read('js/views/tournaments-sharing.js');
const venues = read('js/views/venues.js');
const store = read('js/store.js');
const poll = read('js/views/schedule-poll.js');
let failures = 0;
const check = (condition, message) => {
  if (!condition) { failures++; console.error('✗ ' + message); }
  else console.log('✓ ' + message);
};
check(!/src="js\/coachmarks\.js/.test(index), 'o tour sobreposto não é carregado');
check(!/\.autoStartDashboard\(/.test(dashboard), 'a dashboard não inicia tour');
check(!/\.startExploreTour\(/.test(explore), 'a busca de pessoas não inicia tour');
check(!/\.startProfileTour\(/.test(profile), 'o perfil não inicia tour');
check(!/\.startInviteTour\(/.test(invite), 'a página de convite não inicia tour');
check(!/\.startPlaceTour\(/.test(venues), 'a página do local não inicia tour');
check(/window\._mostrarConviteDeRolagem = function \(\) \{[\s\S]*?antigoConvite\.remove\(\);\s*return;/.test(store),
  'o convite com texto e seta é removido sem reiniciar');
check(/window\._aplicarShineDica = function \(\) \{[\s\S]*?classList\.remove\('sp-shine-dica'\);\s*\}\);\s*return;/.test(store),
  'o destaque antigo é removido sem reaplicar');
check(!/extraClass: _temProposta \? 'sp-match-action--compact sp-shine-dica'/.test(poll),
  'botões de agenda não recebem dicas animadas');
console.log(`${9 - failures} passaram, ${failures} falharam`);
process.exit(failures ? 1 : 0);
