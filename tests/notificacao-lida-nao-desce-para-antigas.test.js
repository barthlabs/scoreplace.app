/* 🔔 NOTIFICAÇÃO LIDA NA TELA NÃO DESCE PRO BLOCO DAS ANTIGAS
 *   node tests/notificacao-lida-nao-desce-para-antigas.test.js
 *
 * ORDEM DO DONO (20/ago/2026):
 *   "as notificacoes que ficam na tela por 5s sao dadas como lidas esta bom, quando
 *    isso acontece, nao pode ir para as mais antigas. tem que ficar no topo na mais
 *    nova nao lida."
 *
 * A FALHA QUE ISTO REPRODUZ (o agrupamento anterior, uma linha):
 *
 *     var _unread = notifs.filter(function(n){ return !n.read; });
 *
 * Agrupar pelo `read` DO INSTANTE fazia o aviso lido por permanência mudar de bloco no
 * próximo re-render ("Carregar mais", voltar pra tela): ele saía do topo e caía junto
 * das antigas — sumia da vista exatamente o que a pessoa acabou de ler. O observador de
 * permanência já cuidava de não re-renderizar na hora; o que faltava era o re-render
 * SEGUINTE não desmanchar a tela.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. não lida vai pro topo (o de sempre);
 *   B. lida NESTA VISITA fica no topo, mesmo com read=true — é o bug do dono;
 *   C. lida em visita ANTERIOR desce pras antigas (senão o bloco de cima nunca esvazia);
 *   D. sair e voltar reclassifica — o gesto de reabrir é o que limpa a visita;
 *   E. o rótulo não mente: conta as que seguem não lidas e as lidas agora, separadas;
 *   F. a ordem DENTRO do bloco é preservada (createdAt desc do servidor);
 *   G. a tela realmente usa esta função (senão o teste trava uma regra que ninguém roda).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'notifications-view.js'), 'utf8');

// O arquivo é de tela: carregado num sandbox com um `window` de mentira, o que roda no
// topo dele são só atribuições de funções e constantes.
const win = {};
const sandbox = { window: win, document: { getElementById: () => null }, setTimeout, clearTimeout, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox, { filename: 'notifications-view.js' });

ok(typeof win._notifAgrupaPorVisita === 'function',
  'G0. a função de agrupamento existe e é exportada no window');

const n = (id, read, ts) => ({ _id: id, read: !!read, createdAt: ts });

// ── A + B: o caso do dono ───────────────────────────────────────────────────
// Visita começa com n1 e n2 não lidas; n9 é antiga e já lida.
let sess = {};
const lista1 = [n('n1', false, 100), n('n2', false, 99), n('n9', true, 10)];
const g1 = win._notifAgrupaPorVisita(lista1, sess);
ok(g1.topo.map(x => x._id).join(',') === 'n1,n2', 'A1. não lidas vão pro topo');
ok(g1.antigas.map(x => x._id).join(',') === 'n9', 'A2. lida de antes fica nas antigas');

// 5s na tela → n1 vira lida. Chega um re-render (o "Carregar mais" do fim, por ex.).
const lista2 = [n('n1', true, 100), n('n2', false, 99), n('n9', true, 10)];
const g2 = win._notifAgrupaPorVisita(lista2, sess);
ok(g2.topo.map(x => x._id).join(',') === 'n1,n2',
  'B1. lida por permanência NESTA visita continua no topo — vi [' + g2.topo.map(x => x._id).join(',') + ']');
ok(g2.antigas.map(x => x._id).indexOf('n1') === -1,
  'B2. e NÃO aparece no bloco das antigas (era o bug: sumia embaixo do dedo)');
ok(g2.topo[0]._id === 'n1',
  'B3. continua na MESMA posição, no topo — a mais nova não muda de lugar');

// ── C: lida de outra visita não é promovida ────────────────────────────────
const gC = win._notifAgrupaPorVisita([n('nX', true, 50)], {});
ok(gC.topo.length === 0 && gC.antigas.map(x => x._id).join(',') === 'nX',
  'C1. lida que não é desta visita fica nas antigas — senão o bloco de cima nunca esvazia');

// ── D: sair e voltar reclassifica ──────────────────────────────────────────
sess = {};                                   // é o que renderNotifications faz ao ENTRAR
const g3 = win._notifAgrupaPorVisita(lista2, sess);
ok(g3.topo.map(x => x._id).join(',') === 'n2',
  'D1. na visita seguinte, n1 (já lida) desce e só n2 segue no topo');
ok(g3.antigas.map(x => x._id).indexOf('n1') !== -1, 'D2. n1 passou a ser antiga');

// ── E: o rótulo não mente ──────────────────────────────────────────────────
ok(g1.vivas === 2 && g1.lidasAgora === 0 && /Não lidas|notif\.unread/.test(g1.rotulo) && / 2/.test(g1.rotulo),
  'E1. só não lidas: o rótulo conta 2 e não fala em "lidas agora"');
ok(g2.vivas === 1 && g2.lidasAgora === 1 && /1 lida agora/.test(g2.rotulo),
  'E2. com uma lida na visita, o rótulo separa "1" não lida de "1 lida agora" — vi "' + g2.rotulo + '"');
const gTudoLido = win._notifAgrupaPorVisita([n('n1', true, 100), n('n2', true, 99)], { n1: 1, n2: 1 });
ok(gTudoLido.vivas === 0 && /2 lidas agora/.test(gTudoLido.rotulo),
  'E3. zeradas todas na visita, o rótulo vira "2 lidas agora" — nunca "Não lidas · 0"');

// ── F: a ordem do servidor sobrevive ao agrupamento ────────────────────────
const gOrdem = win._notifAgrupaPorVisita(
  [n('a', false, 300), n('b', true, 200), n('c', false, 100)], { b: 1 });
ok(gOrdem.topo.map(x => x._id).join(',') === 'a,b,c',
  'F1. dentro do bloco a ordem createdAt desc é preservada — vi [' + gOrdem.topo.map(x => x._id).join(',') + ']');

// ── G: FIAÇÃO — a tela usa mesmo esta função ───────────────────────────────
ok(/_notifAgrupaPorVisita\(notifs, window\._notifSessionUnread/.test(SRC),
  'G1. renderNotifications agrupa por esta função');
ok(/if \(_visitaNova\) window\._notifSessionUnread = \{\}/.test(SRC),
  'G2. entrar na tela zera a visita (e "Carregar mais" NÃO zera)');
ok(!/var _unread = notifs\.filter\(function\(n\)\{ return !n\.read; \}\)/.test(SRC),
  'G3. o agrupamento pelo `read` do instante não voltou');

console.log('\n🔔 NOTIFICAÇÃO — lida na tela não desce pro bloco das antigas');
// ── 2.0.5 · QUEM DIZ "É VISITA NOVA" É O ROTEADOR ───────────────────────────
// A função pura acima continuou certa o tempo todo — e mesmo assim o defeito VOLTOU na tela.
// Relato do dono: _"quando deixamos notificacoes na tela por 5s e elas sao consideradas
// lidas, esta de novo pulando para o final"_.
// A causa não era o agrupamento: era o critério de RESET da sessão. "Visita nova" vinha da
// AUSÊNCIA da bandeira de "Carregar mais" — então todo render que não fosse paginação zerava
// a sessão. E o ouvinte em tempo real (store.js) re-renderiza a tela a cada mudança de
// documento, INCLUSIVE a gravação que os 5s de permanência fazem ao marcar como lida.
// Ou seja: marcar como lida disparava o render que apagava a memória de "estava não lida".
(function () {
  const fs2 = require('fs'), path2 = require('path');
  const view = fs2.readFileSync(path2.join(__dirname, '..', 'js/views/notifications-view.js'), 'utf8');
  const router = fs2.readFileSync(path2.join(__dirname, '..', 'js/router.js'), 'utf8');
  const store = fs2.readFileSync(path2.join(__dirname, '..', 'js/store.js'), 'utf8');

  ok(/var _visitaNova = window\._notifNovaVisita === true;/.test(view),
    'a tela lê a visita do ROTEADOR, não deduz da ausência de bandeira');
  ok(!/var _visitaNova = !window\._notifKeepLimit;/.test(view),
    'e o critério antigo (qualquer render = visita nova) não voltou');
  ok(/window\._notifNovaVisita = true;\s*\n\s*renderNotifications\(viewContainer\);/.test(router),
    'só a ENTRADA pela rota marca visita nova');
  ok(/window\._notifNovaVisita = false;/.test(view), 'e a marca é consumida uma vez só');

  // O ouvinte em tempo real re-renderiza — e NÃO pode marcar visita nova.
  const trecho = store.slice(Math.max(0, store.indexOf("hash === '#notifications'") - 200),
                             store.indexOf("hash === '#notifications'") + 400);
  ok(/renderNotifications\(vc\)/.test(trecho) && !/_notifNovaVisita/.test(trecho),
    'o refresh do ouvinte re-renderiza SEM marcar visita nova — é a mesma visita');
})();

console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }

console.log('   ✅ tudo verde');
