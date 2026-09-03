/* A rota de detalhe nunca pode ser substituída pela tela de inscritos.
 * Exercita o renderer real: callbacks atrasados chamam renderParticipants, mas
 * com #tournaments/<id> ele tem de ser no-op e preservar o container inteiro. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { window: W } = require('./render-harness');

vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'participants.js'), 'utf8'),
  W,
  { filename: 'participants.js' }
);

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}

const TID = 'tour_1787972005809';
const container = { innerHTML: '<section id="detail-sentinel">detalhe intacto</section>' };

console.log('\n── detalhe não vira inscritos ──');

W.location.hash = '#tournaments/' + TID;
W.renderParticipants(container, TID);
ok(container.innerHTML.indexOf('detail-sentinel') !== -1,
  '#tournaments/<id> bloqueia renderParticipants e preserva o detalhe');

W.location.hash = '#participants/tour_outro';
container.innerHTML = '<section id="other-sentinel">outro detalhe</section>';
W.renderParticipants(container, TID);
ok(container.innerHTML.indexOf('other-sentinel') !== -1,
  '#participants de outro torneio não recebe render atrasado');

W.location.hash = '#participants/' + TID + '?ref=origem';
ok(W._isParticipantsRouteFor(TID) === true,
  '#participants/<id> com query continua sendo rota válida de inscritos');

W.location.hash = '#dashboard';
ok(W._isParticipantsRouteFor(TID) === false,
  'dashboard também não aceita renderer de inscritos');

console.log('\n  detalhe-route: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
