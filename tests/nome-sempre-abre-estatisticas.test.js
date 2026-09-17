/* Todo participante identificado por UID abre a própria ficha/estatísticas em qualquer render.
 * O clique é delegado no store para não depender de cada tela lembrar um onclick diferente. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── nomes sempre abrem estatísticas ────');
const store = read('js/store.js');
const css = read('css/components.css');
const style = read('css/style.css');
const bracket = read('js/views/bracket.js');
const dashboard = read('js/views/dashboard.js');
const participants = read('js/views/participants.js');

ok(/window\._personProfileLinkHtml = function/.test(store), 'há um wrapper canônico de ficha por UID');
ok(/data-player-profile-uid=/.test(store), 'o wrapper carrega a identidade por UID');
ok(/sp-person-name-link[\s\S]{0,120}role="button" tabindex="0"/.test(store),
  'o wrapper já nasce acessível, sem depender da hidratação posterior');
ok(/window\._personNameHtml = function \(uid, name, css, cls, extraAttrs\)/.test(store), 'o helper público preserva sua assinatura');
ok(/window\._personNameHtml[\s\S]{0,900}window\._personProfileLinkHtml/.test(store), 'todo nome emitido pelo helper vira acesso à ficha');
ok(/document\.addEventListener\('click',[\s\S]{0,600}true\)/.test(store), 'o clique é delegado na captura, antes da ação do card');
ok(/document\.addEventListener\('keydown'/.test(store) && /ev\.key !== 'Enter' && ev\.key !== ' '/.test(store), 'Enter e Espaço também abrem a ficha');
ok(/_editParticipantName/.test(store), 'o atalho de edição administrativa continua protegido');
ok(/botão dentro de outro para leitor de tela/.test(store), 'o marcador interno de hidratação não vira um segundo botão');
ok(/\.sp-person-name-link,[\s\S]{0,240}\[data-uid-name\]/.test(css), 'o sublinhado pontilhado vale para helper e renders legados');
ok(/\[data-theme="light"\] \.sp-person-name-link,[\s\S]{0,180}text-decoration-color: var\(--primary-color, #007aff\)/.test(css) && /\[data-theme="light"\][\s\S]{0,1200}--primary-color: #007aff/.test(style),
  'no tema claro o sublinhado usa a tinta primária com contraste');
ok(/window\._personProfileLinkHtml\(s\.uid, s\.name, _txt/.test(bracket), 'a classificação de cada grupo usa o wrapper canônico');
ok(/window\._personNameHtml\(_slotUid, name\)/.test(bracket), 'os nomes dos cards de jogo também usam o helper');
ok(/A faixa interna delimita somente o nome[\s\S]{0,480}sp-person-name-content/.test(bracket), 'o card documenta a faixa do nome separada do balão de contato');
const recentIni = dashboard.indexOf('// ── Últimos resultados confirmados');
const recentFim = dashboard.indexOf('// Agrupa por (grupo + torneio)', recentIni);
const recent = dashboard.slice(recentIni, recentFim);
ok(recent.includes('window.renderMatchCard(m2') && /window\._personNameHtml\(_slotUid, name\)/.test(bracket),
  'Últimos Resultados delega os dois lados ao card canônico, que usa a ficha por UID');
ok((participants.match(/_contactPersonIconHtml\(t,/g) || []).length >= 2, 'cards de inscritos exibem o balão ao lado do nome');
ok(/O nome abre a ficha também para o organizador[\s\S]{0,1500}_personNameHtml/.test(participants),
  'na lista administrativa o nome abre a ficha e a edição fica em botão próprio');
ok((participants.match(/aria-label="Editar /g) || []).length >= 2,
  'o organizador mantém um controle de edição explícito para pessoa e dupla');
ok(/_contactPersonByUid[\s\S]{0,1200}c\.useWhatsApp[\s\S]{0,1000}mailto:/.test(read('js/views/tournaments-organizer.js')),
  'o balão mantém WhatsApp como prioridade e e-mail como fallback');

// Fixture mínima do card de jogo: o listener delegado roda na captura e interrompe o
// evento antes do onclick do card. Assim, tocar no nome nunca abre placar/edição junto.
const vm = require('vm');
const listeners = {};
const documentFixture = {
  addEventListener(type, fn, capture) { listeners[type] = { fn, capture }; },
  querySelectorAll() { return []; }
};
const W = { window: null, document: documentFixture };
W.window = W;
const activationStart = store.indexOf('window._activatePlayerProfileLinks = function');
const activationEnd = store.indexOf('\n\nwindow._openPlayerProfileFromNameElement', activationStart);
vm.createContext(W);
vm.runInContext(store.slice(activationStart, activationEnd), W, { filename: 'player-profile-activation' });
function fixtureElement(attributes, parent) {
  const attrs = Object.assign({}, attributes);
  const classes = {};
  return {
    parentNode: parent,
    textContent: 'Ana',
    getAttribute(key) { return attrs[key] || ''; },
    setAttribute(key, value) { attrs[key] = String(value); },
    removeAttribute(key) { delete attrs[key]; },
    classList: { add(key) { classes[key] = true; }, remove(key) { delete classes[key]; } },
    attrs,
    classes
  };
}
const activationRoot = { querySelectorAll() { return [profileWrapper, nameMarker]; } };
const profileWrapper = fixtureElement({ 'data-player-profile-uid': 'u-ana' }, activationRoot);
const nameMarker = fixtureElement({ 'data-uid-name': 'u-ana' }, profileWrapper);
W._activatePlayerProfileLinks(activationRoot);
ok(profileWrapper.attrs.role === 'button' && profileWrapper.attrs.tabindex === '0' &&
  !nameMarker.attrs.role && !nameMarker.attrs.tabindex,
  'o wrapper é o único botão; o marcador interno continua só para hidratação');
const start = store.indexOf('window._openPlayerProfileFromNameElement = function');
const end = store.indexOf('\nwindow._profileAvatarUrl', start);
vm.runInContext(store.slice(start, end), W, { filename: 'player-profile-delegation' });
let opened = 0, cardOpened = 0;
W._openPlayerProfile = function (name, opts) { if (name === 'Ana' && opts.uid === 'u-ana') opened++; };
const card = { parentNode: documentFixture };
const name = {
  parentNode: card,
  getAttribute(key) { return ({ 'data-player-profile-uid': 'u-ana', 'data-player-profile-name': 'Ana' })[key] || ''; }
};
const click = { target: name, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
listeners.click.fn(click);
if (!click.stopped) cardOpened++;
ok(listeners.click.capture === true && opened === 1 && click.prevented && click.stopped && cardOpened === 0,
  'no card de jogo, tocar no nome abre só a ficha e não abre o placar');

console.log(fail ? `❌ nome-sempre-abre-estatisticas: ${fail} falha(s), ${pass} ok` : `✅ nome-sempre-abre-estatisticas: ${pass} ok`);
process.exit(fail ? 1 : 0);
