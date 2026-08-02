/* test-draw-email.js — o SORTEIO AUTOMÁTICO manda e-mail?
 *
 * BUG REAL (02/ago/2026, relato do dono: "o sorteio foi realizado e ninguém recebeu email").
 * MEDIDO na produção antes de mexer: o auto-sorteio do Confra rodou às 22:00Z e criou as
 * notificações IN-APP (users/{uid}/notifications type='draw', createdAt 22:00:04Z…), mas
 * `notif_email_queue` estava VAZIA e a coleção `mail` não recebeu NADA depois das 13:36Z.
 * Causa: esta CF escrevia SÓ o canal in-app. No cliente, _sendUserNotification despacha
 * DOIS canais (in-app + e-mail via digest) — o servidor nunca espelhou o segundo, e quem
 * sorteia num torneio de sorteio automático é a CF. [[feedback_functions_must_mirror_app]]
 *
 * Este teste roda as funções REAIS extraídas do index.js contra um Firestore falso e trava:
 *  (a) o e-mail entra na MESMA fila do cliente (notif_email_queue), com level/janela/CTA certos;
 *  (b) os opt-outs (notifyEmail, notifyLevel) são respeitados;
 *  (c) e-mail e in-app são opt-outs INDEPENDENTES (notifyPlatform:false não mata o e-mail);
 *  (d) sandbox não manda e-mail pra ninguém;
 *  (e) a FIAÇÃO: os dois pontos de notificação da CF chamam o enfileiramento.
 *
 * node test-draw-email.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

function extract(name) {
  let i = src.indexOf('function ' + name + '(');
  if (i === -1) { console.error('✗ ' + name + ' não encontrada no index.js — o canal de E-MAIL do sorteio automático não existe (é exatamente o bug: a CF notificava só in-app)'); process.exit(1); }
  // `async function` — o `async` faz parte da declaração; sem ele o await não compila.
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  const j = src.indexOf('\n}\n', i) + 3;
  return src.slice(i, j);
}
function extractConst(name) {
  const i = src.indexOf('const ' + name + ' =');
  if (i === -1) { console.error('✗ ' + name + ' não encontrada no index.js — o canal de E-MAIL do sorteio automático não existe (é exatamente o bug: a CF notificava só in-app)'); process.exit(1); }
  const j = src.indexOf('\n', i) + 1;
  return src.slice(i, j);
}

// Firestore falso: guarda o que foi escrito em notif_email_queue.
const written = [];
const db = {
  collection: (name) => ({
    add: async (doc) => { if (name === 'notif_email_queue') written.push(doc); return { id: 'x' }; }
  })
};
// vendor real do app (window._notifLevelAllowed vem de tournaments-utils.js)
let drawWindow = null;
try { drawWindow = require('./draw-core.js')._window; } catch (e) { /* sem vendor: o teste ainda roda */ }

const ctx = { console, db, drawWindow };
vm.createContext(ctx);
vm.runInContext(
  extractConst('_NOTIF_EMAIL_WINDOW_MIN') + '\n' +
  extract('_notifLevelOk') + '\n' +
  extract('_profileEmails') + '\n' +
  extract('_queueDrawEmail') + '\n' +
  extract('_drawEmailOpts') + '\n' +
  'globalThis.__q = _queueDrawEmail; globalThis.__opts = _drawEmailOpts; globalThis.__emails = _profileEmails;',
  ctx);
const queue = ctx.__q, mkOpts = ctx.__opts, emailsOf = ctx.__emails;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  ✗ FALHOU: ' + m); } }

const T = { id: 'tour_1780009816637', name: 'Confra BT Alta da Clínica 2026' };
const MSG = '🔄 Nova rodada no torneio Confra BT Alta da Clínica 2026!\n\nR1 Grupo N • Jogo 1:\nKelly / Zilda\nvs\nErika / Livia';
const opts = () => mkOpts(T, T.id, MSG);
const run = async (profile, sentTo) => { written.length = 0; const n = await queue(profile, opts(), sentTo || new Set()); return n; };

(async () => {
  console.log('──── o e-mail do sorteio entra na fila (o bug do dono) ────');
  let n = await run({ email: 'kelly@x.com' });
  ok(n === 1 && written.length === 1, 'perfil comum → 1 item em notif_email_queue');
  const it = written[0] || {};
  ok(it.email === 'kelly@x.com', 'destinatário é o e-mail do perfil');
  ok(it.level === 'fundamental', 'sorteio é FUNDAMENTAL (NOTIF_CATALOG.draw) — chega a quem só quer o essencial');
  ok(it.message === MSG, 'mensagem é a PERSONALIZADA do sorteio (os jogos da pessoa), não um texto genérico');
  ok(it.tournamentName === T.name, 'nome do torneio vai no item (assunto do digest)');
  ok(it.ctaUrl === 'https://scoreplace.app/#bracket/' + T.id, 'CTA aponta pra CHAVE (mesmo destino do _notifCta do app)');
  ok(it.ctaLabel === 'Ver chave', 'rótulo do botão = "Ver chave"');
  ok(it.tournamentUrl === 'https://scoreplace.app/#tournaments/' + T.id, 'link do torneio preenchido');
  ok(typeof it.flushAtMs === 'number' && it.flushAtMs - it.createdAt === 5 * 60 * 1000,
     'janela de 5 min (fundamental) — a MESMA tabela do queueNotifEmail do cliente');

  console.log('──── opt-outs ────');
  ok(await run({ email: 'a@x.com', notifyEmail: false }) === 0, 'notifyEmail:false → nenhum e-mail');
  ok(await run({ email: 'a@x.com', notifyLevel: 'fundamentais' }) === 1, 'quem só quer fundamentais RECEBE o sorteio');
  ok(await run({ email: 'a@x.com', notifyLevel: 'importantes' }) === 1, 'quem quer importantes também recebe');
  ok(await run({ email: 'a@x.com', notifyLevel: 'none' }) === 0, 'notifyLevel:none → nada');
  ok(await run({ email: '' }) === 0, 'perfil sem e-mail → nada (conta só por telefone)');
  ok(await run({}) === 0, 'perfil vazio → nada');

  console.log('──── união de contas e dedup ────');
  n = await run({ email: 'Kelly@X.com', linkedEmails: ['kelly.alt@x.com', 'KELLY@x.com'] });
  ok(n === 2, 'e-mail principal + vinculado; a repetição (case-insensitive) não duplica');
  ok(written.every(w => w.email === w.email.toLowerCase()), 'e-mails normalizados em minúsculas');

  const shared = new Set();
  const a = await queue({ email: 'dupla@x.com' }, opts(), shared);
  written.length = 0;
  const b = await queue({ email: 'dupla@x.com' }, opts(), shared);
  ok(a === 1 && b === 0, 'a MESMA pessoa aparecendo por 2 uids (dupla) recebe UM item, não dois');

  console.log('──── sandbox nunca manda e-mail ────');
  written.length = 0;
  ok(await queue({ email: 'a@x.com' }, mkOpts({ id: 'tour_1_sb', name: '(SB) Confra' }, 'tour_1_sb', MSG), new Set()) === 0,
     'torneio (SB) → zero e-mail (backstop na última porta)');

  console.log('──── FIAÇÃO: os dois pontos de notificação da CF chamam o e-mail ────');
  const calls = (src.match(/_queueDrawEmail\(/g) || []).length;
  ok(calls >= 3, 'auto-sorteio da rodada E sorteio de fase chamam _queueDrawEmail (achados: ' + calls + ')');
  // O e-mail NÃO pode estar dentro do gate de in-app: quem desliga a notificação do app
  // continua querendo o e-mail (opt-outs independentes, como no cliente).
  const badGate = /notifyPlatform === false\) continue;[\s\S]{0,600}?_queueDrawEmail\(/.test(src);
  ok(!badGate, 'REGRESSÃO: o e-mail voltou pra dentro do gate de notifyPlatform (in-app desligado mataria o e-mail)');
  // A fila é a MESMA do cliente — se alguém trocar por escrita direta em `mail`, o digest,
  // o tema do destinatário e o agrupamento por pessoa somem.
  ok(/collection\('notif_email_queue'\)/.test(src), 'usa a fila canônica notif_email_queue (digest do cliente), não escrita direta em mail');

  console.log((fail === 0 ? '✅' : '❌') + ` draw-email: ${pass} ok, ${fail} falharam`);
  process.exit(fail === 0 ? 0 : 1);
})();
