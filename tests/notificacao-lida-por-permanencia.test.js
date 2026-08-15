/* 🔔 NOTIFICAÇÃO — lida só depois de 5s NA TELA
 *   node tests/notificacao-lida-por-permanencia.test.js
 *
 * ORDEM DO DONO (15/ago/2026):
 *   "quando abrimos as notificações, aquelas que aparecerem na tela devem ser
 *    consideradas lidas se ficarem mais do que 5 segs na tela."
 *
 * ⚠️ ISTO RESTRINGE O COMPORTAMENTO ANTERIOR, NÃO O AMPLIA. Até aqui o render fazia um
 * `forEach` sobre a lista INTEIRA e marcava tudo como lido de imediato:
 *
 *     notifs.forEach(function (n) {
 *       if (!n.read && _actionTypes.indexOf(n.type) === -1)
 *         window.FirestoreDB.markNotificationRead(uid, n._id);
 *     });
 *
 * Ou seja: notificação que morava vinte telas abaixo da dobra — e que ninguém chegou a
 * ver — era carimbada como lida e o contador do sininho zerava. Agora só conta o que
 * apareceu de fato e permaneceu meio visível por 5 segundos.
 *
 * ⚠️ POR QUE UM `IntersectionObserver` FALSO, e não o navegador: o Browser pane roda a
 * página com `document.visibilityState === "hidden"`, e a especificação só entrega
 * entradas de interseção quando há atualização de renderização — MEDIDO: com a página
 * oculta, ZERO callbacks em 5,8s, mesmo com os cartões inteiros dentro da viewport. Então
 * ali não dá pra verificar (é a lição de [[feedback_browser_pane_nao_reproduz_o_aparelho]]).
 * O que este teste tranca é a LÓGICA — quando o relógio começa, quando é cancelado, quem
 * nunca entra — dirigindo o observador na mão. Se o cartão entra e fica, tem que marcar;
 * se sai antes, não pode marcar.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. cartão que aparece e FICA 5s é marcado — uma vez só;
 *   B. cartão que SAI antes dos 5s não é marcado, e a contagem recomeça do zero;
 *   C. cartão fora da tela nunca é marcado (era o bug do comportamento anterior);
 *   D. tipo que pede AÇÃO (convite, amizade, placar aguardando você) nunca é marcado
 *      por permanência — quem marca é a ação aplicada;
 *   E. re-render desliga o observador velho e mata os relógios pendentes (senão o
 *      cartão órfão marcaria como lido um cartão que não está mais na tela);
 *   F. o render e o observador consultam a MESMA lista de tipos-com-ação.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'notifications-view.js'), 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// Harness: DOM mínimo + IntersectionObserver DIRIGIDO + relógio controlado
// ═══════════════════════════════════════════════════════════════════════════
function novoAmbiente() {
  const relogios = new Map();
  let seq = 0, agora = 0;

  function elemento(id, autoread) {
    const attrs = { 'data-notif-id': id };
    if (autoread) attrs['data-notif-autoread'] = '1';
    return {
      _attrs: attrs, style: {},
      getAttribute: function (k) { return k in this._attrs ? this._attrs[k] : null; },
      removeAttribute: function (k) { delete this._attrs[k]; },
      querySelector: function () { return null; }
    };
  }

  const W = {
    _safeHtml: (s) => String(s == null ? '' : s),
    FirestoreDB: { lidas: [], markNotificationRead: function (uid, id) { this.lidas.push(id); } },
    _updateNotificationBadge: function () { W._badges = (W._badges || 0) + 1; },
    setTimeout: function (fn, ms) { const id = ++seq; relogios.set(id, { fn, quando: agora + ms }); return id; },
    clearTimeout: function (id) { relogios.delete(id); },
    IntersectionObserver: function (cb, opts) {
      this._cb = cb; this._opts = opts; this._obs = new Set(); this.desconectado = false;
      this.observe = function (el) { this._obs.add(el); };
      this.unobserve = function (el) { this._obs.delete(el); };
      this.disconnect = function () { this._obs.clear(); this.desconectado = true; };
      W._ultimoObserver = this;
    }
  };
  W.window = W;

  // avança o relógio disparando o que vence no caminho
  W._avanca = function (ms) {
    const alvo = agora + ms;
    let guarda = 0;
    while (guarda++ < 1000) {
      let prox = null;
      relogios.forEach((v, k) => { if (v.quando <= alvo && (!prox || v.quando < prox.v.quando)) prox = { k, v }; });
      if (!prox) break;
      agora = prox.v.quando; relogios.delete(prox.k); prox.v.fn();
    }
    agora = alvo;
  };
  // ⚠️ o observador falso RESPEITA o unobserve/disconnect — senão ele entregaria entradas
  // que o navegador de verdade não entregaria, e o teste mediria outra coisa.
  W._entra = function (el, ratio) {
    const o = W._ultimoObserver;
    if (!o || o.desconectado || !o._obs.has(el)) return;
    o._cb([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
  };
  // ...e este entrega mesmo depois do unobserve, pra provar a guarda contra entrada
  // ENFILEIRADA (o navegador pode entregar uma que já estava na fila).
  W._entraAtrasado = function (el, ratio) {
    W._ultimoObserver._cb([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
  };
  W._elemento = elemento;
  return W;
}

// Carrega o código REAL (a função e as constantes), com o relógio e o observador do harness.
function carrega(W) {
  // ⚠️ o fim de cada trecho é DECLARADO: `_NOTIF_ACTION_TYPES` ocupa duas linhas, então
  // cortar na primeira quebra parte o array no meio (foi o que quebrou na 1ª tentativa).
  const trechos = [];
  [['window._NOTIF_ACTION_TYPES = ', '];'],
   ['function _AUTOREAD_TYPES_OK', '\n}'],
   ['window._NOTIF_DWELL_MS = ', ';'],
   ['var _NOTIF_DWELL_RATIO = ', ';'],
   ['function _observeNotifDwell', '\n}']].forEach(function (par) {
    const marca = par[0], fimMarca = par[1];
    const i = SRC.indexOf(marca);
    if (i < 0) throw new Error('não achei em notifications-view.js: ' + marca);
    const j = SRC.indexOf(fimMarca, i + marca.length);
    if (j < 0) throw new Error('fim não encontrado para: ' + marca);
    trechos.push(SRC.slice(i, j + fimMarca.length));
  });
  new Function('window', 'setTimeout', 'clearTimeout', 'IntersectionObserver',
    trechos.join('\n') + '\n window._observeNotifDwell = _observeNotifDwell;'
  )(W, W.setTimeout, W.clearTimeout, W.IntersectionObserver);
}

function lista(els) { return { querySelectorAll: function () { return els.filter(e => e.getAttribute('data-notif-autoread') === '1'); } }; }

// ═══════════════════════════════════════════════════════════════════════════
// A. APARECEU E FICOU 5s → LIDA
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = novoAmbiente(); carrega(W);
  const a = W._elemento('n0', true);
  W._observeNotifDwell('u-rb', lista([a]));
  W._entra(a, 1);
  W._avanca(4900);
  ok(W.FirestoreDB.lidas.length === 0, 'A1. aos 4,9s ainda NÃO está lida (o limiar é 5s)');
  W._avanca(200);
  ok(W.FirestoreDB.lidas.join(',') === 'n0', 'A2. passados os 5s, é marcada como lida — vi [' + W.FirestoreDB.lidas.join(',') + ']');
  // nem uma entrada ENFILEIRADA (que o navegador pode entregar depois do unobserve)
  // consegue marcar de novo — é o que a guarda por atributo protege.
  W._entraAtrasado(a, 1); W._avanca(6000);
  ok(W.FirestoreDB.lidas.length === 1, 'A3. não marca duas vezes o mesmo cartão — vi ' + W.FirestoreDB.lidas.length);
  ok(a.getAttribute('data-notif-autoread') === null, 'A4. o cartão sai da vigilância depois de marcado');
  W._avanca(1000);
  ok((W._badges || 0) >= 1, 'A5. o contador do sininho é atualizado depois de marcar');
}

// ═══════════════════════════════════════════════════════════════════════════
// B. SAIU ANTES DOS 5s → NÃO LIDA, e a contagem RECOMEÇA
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = novoAmbiente(); carrega(W);
  const a = W._elemento('n0', true);
  W._observeNotifDwell('u-rb', lista([a]));
  W._entra(a, 1);
  W._avanca(4000);
  W._entra(a, 0);                 // rolou e saiu da tela
  W._avanca(10000);
  ok(W.FirestoreDB.lidas.length === 0,
    'B1. passar batido numa rolagem NÃO marca como lida — vi [' + W.FirestoreDB.lidas.join(',') + ']');
  W._entra(a, 1);                 // voltou
  W._avanca(4900);
  ok(W.FirestoreDB.lidas.length === 0, 'B2. ao voltar, a contagem recomeça do ZERO (não aproveita os 4s de antes)');
  W._avanca(200);
  ok(W.FirestoreDB.lidas.join(',') === 'n0', 'B3. e completa quando de fato fica os 5s');
}

// meio cartão à mostra não conta — evita que uma borda espiando durante a rolagem já dispare
{
  const W = novoAmbiente(); carrega(W);
  const a = W._elemento('n0', true);
  W._observeNotifDwell('u-rb', lista([a]));
  W._entra(a, 0.2);
  W._avanca(9000);
  ok(W.FirestoreDB.lidas.length === 0, 'B4. cartão só espiando na borda (20%) não começa a contar');
}

// ═══════════════════════════════════════════════════════════════════════════
// C. NUNCA APARECEU → NUNCA LIDA (o bug do comportamento anterior)
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = novoAmbiente(); carrega(W);
  const vistos = W._elemento('n0', true);
  const abaixoDaDobra = W._elemento('n9', true);
  W._observeNotifDwell('u-rb', lista([vistos, abaixoDaDobra]));
  W._entra(vistos, 1);
  W._avanca(9000);
  ok(W.FirestoreDB.lidas.join(',') === 'n0',
    'C1. O BUG DO COMPORTAMENTO ANTERIOR: o que nunca apareceu na tela NÃO é marcado — vi [' + W.FirestoreDB.lidas.join(',') + ']');
}
// e o render não pode ter voltado a marcar tudo de uma vez
ok(!/notifs\.forEach\(function\s*\(n\)\s*\{\s*if\s*\(!n\.read/.test(SRC),
  'C2. o `forEach` que marcava a lista INTEIRA ao abrir não existe mais');

// ═══════════════════════════════════════════════════════════════════════════
// D. TIPO QUE PEDE AÇÃO NUNCA ENTRA
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = novoAmbiente(); carrega(W);
  ['host_transfer_invite', 'cohost_invite', 'friend_request', 'casual_link_request', 'match-pending-approval']
    .forEach(function (tipo) {
      ok(W._AUTOREAD_TYPES_OK ? !W._AUTOREAD_TYPES_OK(tipo) : W._NOTIF_ACTION_TYPES.indexOf(tipo) !== -1,
        'D1. "' + tipo + '" fica fora da leitura por permanência (quem marca é a ação aplicada)');
    });
  ok(W._NOTIF_ACTION_TYPES.indexOf('draw') === -1, 'D2. aviso comum (sorteio) entra normalmente');
  // convite no DOM sem o atributo → o observador nem o enxerga
  const conv = W._elemento('n-conv', false);
  W._observeNotifDwell('u-rb', lista([conv]));
  ok(!W._ultimoObserver, 'D3. sem cartão elegível, nem se cria observador (nada a vigiar)');
}

// ═══════════════════════════════════════════════════════════════════════════
// E. RE-RENDER LIMPA O ANTERIOR
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = novoAmbiente(); carrega(W);
  const velho = W._elemento('n0', true);
  W._observeNotifDwell('u-rb', lista([velho]));
  W._entra(velho, 1);
  W._avanca(3000);                       // relógio correndo, faltam 2s
  const obsVelho = W._ultimoObserver;
  const novo = W._elemento('n1', true);
  W._observeNotifDwell('u-rb', lista([novo]));   // chegou snapshot → re-render
  ok(obsVelho.desconectado === true, 'E1. o observador anterior é desconectado no re-render');
  W._avanca(10000);
  ok(W.FirestoreDB.lidas.indexOf('n0') === -1,
    'E2. o relógio pendente do cartão que saiu do DOM é cancelado — ele não marca nada — vi [' + W.FirestoreDB.lidas.join(',') + ']');
}

// ═══════════════════════════════════════════════════════════════════════════
// F. UMA LISTA SÓ DE TIPOS-COM-AÇÃO
// ═══════════════════════════════════════════════════════════════════════════
ok((SRC.match(/host_transfer_invite', 'cohost_invite'/g) || []).length === 1,
  'F1. a lista de tipos-com-ação é escrita UMA vez (o render e o observador leem a mesma)');
ok(SRC.indexOf('_AUTOREAD_TYPES_OK(n.type)') !== -1,
  'F2. o render decide quem é elegível pela MESMA função que o observador usa');
ok(/window\._NOTIF_DWELL_MS = 5000/.test(SRC), 'F3. o limiar é 5 segundos, como o dono pediu');

console.log('\n🔔 NOTIFICAÇÃO — lida por permanência em tela');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
console.log('   ✅ tudo verde');
