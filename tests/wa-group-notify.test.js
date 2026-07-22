/* Convite pro grupo oficial de WhatsApp do torneio (dono, 19-jul): o organizador notifica TODOS
 * os inscritos com o LINK do grupo — app + e-mail + notificação nativa — via botão "Notificar
 * participantes" E automaticamente ao salvar o link. A notificação (type 'wa_group') carrega
 * `waGroupLink`; o CTA (e-mail + in-app) abre o link direto ("Entrar no grupo").
 *
 * FALHA que este teste reproduz: sem o caso 'wa_group' em _notifCta, o convite cairia no CTA
 * genérico "Ver torneio" (sem o link do grupo). Com o caso, o CTA é o link do grupo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox.SCOREPLACE_URL = 'https://scoreplace.app';
sandbox.document = { getElementById: () => null, createElement: () => ({ style: {} }), addEventListener() {} };
sandbox.FirestoreDB = { db: null };
sandbox.AppStore = { currentUser: null };
sandbox._warn = sandbox._log = () => {};
vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'notification-catalog.js'), 'utf8'), sandbox, { filename: 'notification-catalog.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-organizer.js'), 'utf8'), sandbox, { filename: 'tournaments-organizer.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── wa-group-notify ────');

// (1) catálogo tem o tipo wa_group como FUNDAMENTAL (todo inscrito vê, mesmo com filtro).
ok(W.NOTIF_CATALOG && W.NOTIF_CATALOG.wa_group, 'catálogo tem wa_group');
ok(W.NOTIF_CATALOG.wa_group.level === 'fundamental', 'wa_group é fundamental (alcança inscritos filtrados)');

// (2) CTA do wa_group COM link → abre o grupo direto.
ok(typeof W._notifCta === 'function', '_notifCta existe');
var link = 'https://chat.whatsapp.com/ABC123';
var cta = W._notifCta('wa_group', { waGroupLink: link, tournamentId: 'T1' });
ok(cta && cta.url === link, 'CTA aponta pro LINK do grupo (não pro torneio)');
ok(cta && /Entrar no grupo/.test(cta.label || ''), 'CTA rotula "Entrar no grupo"');

// (3) REPRODUÇÃO: sem link, o wa_group NÃO tem o CTA do grupo — cai no genérico (Ver torneio).
//     (Espelha o comportamento ANTIGO, quando não havia caso wa_group.)
var ctaNoLink = W._notifCta('wa_group', { tournamentId: 'T1' });
ok(ctaNoLink && ctaNoLink.url.indexOf('chat.whatsapp.com') === -1, 'sem link → NÃO é o grupo (cai no genérico)');
ok(ctaNoLink && /Ver torneio/.test(ctaNoLink.label || ''), 'sem link → CTA genérico "Ver torneio"');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ wa-group-notify FALHOU'); process.exit(1); }
console.log('✅ wa-group-notify: OK');
