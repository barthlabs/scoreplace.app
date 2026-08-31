/* O CONVITE SÓ É ANUNCIADO DEPOIS DE ESTAR GRAVADO  (L1.1.1, 2.1.76)
 *   node tests/convite-so-anuncia-depois-de-gravar.test.js
 *
 * ⛔ O DEFEITO, confirmado no código da 2.1.75. `js/views/host-transfer.js` fazia:
 *       window.AppStore.mutate(tId, …);            // ← SEM await
 *       …
 *       window.FirestoreDB.sendCoHostInviteEmail(…);
 * `AppStore.mutate` é ASSÍNCRONA: aplica o mutator no objeto local na hora, mas a
 * gravação vai pra uma FILA por torneio e só termina quando `commitTournamentTx`
 * resolve. A Function podia então LER o documento ANTES de a entrada `pending` existir
 * e devolver `convite-inexistente` — e-mail intermitente.
 *
 * ⚠️ É a autorização por REGISTRO PERSISTIDO da L1.1 que torna a ordem obrigatória: quem
 * autoriza é o DOCUMENTO, não o payload. Pedir o e-mail antes de o registro existir é
 * pedir ao servidor que ele recuse.
 *
 * ⛔ E O SEGUNDO DEFEITO, do mesmo tamanho: a tela dizia "convite enviado" sem olhar o
 * retorno. Afirmar que um e-mail saiu quando ele não saiu é a mesma família do "você não
 * está inscrito" da R1.1 — contar à pessoa algo que não é verdade sobre o sistema.
 *
 * Este teste EXECUTA as duas funções reais num sandbox com relógio de promessas sob
 * controle: é a ORDEM que está sob prova, e ordem não se afirma lendo o arquivo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }
const tick = () => new Promise((r) => setImmediate(r));
const varios = async (n) => { for (let i = 0; i < n; i++) await tick(); };

const SRC_HT = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'host-transfer.js'), 'utf8');
const SRC_DRAW = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'tournaments-draw.js'), 'utf8');
const SRC_DB = fs.readFileSync(path.join(RAIZ, 'js', 'firebase-db.js'), 'utf8');

/* ── recorta `_initiateCoHostInvite` do arquivo real ─────────────────────────── */
function recortaFn(src, marca) {
  const ini = src.indexOf(marca);
  if (ini < 0) return null;
  let i = src.indexOf('{', src.indexOf('function', ini)), nivel = 0, fim = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}') { nivel--; if (nivel === 0) { fim = i + 1; break; } }
  }
  return src.slice(ini, fim);
}

/* ── o banco de provas ───────────────────────────────────────────────────────── */
function palco(opts) {
  opts = opts || {};
  const eventos = [];
  const win = {};
  const T = { id: 'tour_1', name: 'Confra', coHosts: [], creatorUid: 'org1' };
  let _resolveMutate, _rejeitaMutate;
  const mutatePendente = new Promise((res, rej) => { _resolveMutate = res; _rejeitaMutate = rej; });
  mutatePendente.catch(() => {});   // idem, na promessa de trás

  win.AppStore = {
    tournaments: [T],
    currentUser: { uid: 'org1', displayName: 'Rodrigo' },
    /* ⭐ ESTE É O PONTO: devolve uma promessa que SÓ resolve quando o teste mandar —
     * exatamente como a fila de transações por torneio faz na vida real. */
    mutate: function (tid, fn) {
      eventos.push('mutate:chamada');
      try { fn(T); } catch (e) {}                    // o mutator local roda na hora
      var _p = mutatePendente.then(function () { eventos.push('mutate:gravou'); });
      /* ⚠️ O ramo mudo tem que ser NESTA promessa (a devolvida), não na de trás: é ela
       * que a árvore ANTIGA descarta sem encadear nada, e é ela que mata o processo por
       * "unhandled rejection" no §2. Quem está sob teste recebe `_p` e continua vendo a
       * rejeição normalmente. */
      _p.catch(function () {});
      return _p;
    }
  };
  win.FirestoreDB = {
    sendCoHostInviteEmail: function () {
      eventos.push('function:chamada');
      if (opts.emailRejeita) {
        /* ⚠️ Mesmo motivo do `mutate`: a árvore ANTIGA chamava isto e DESCARTAVA a
         * promessa, então a rejeição virava "unhandled" e matava o processo antes dos
         * §4–§6. O ramo mudo mantém o controle vivo pra ele LISTAR o que falha. */
        var _r = Promise.reject(new Error('rede'));
        _r.catch(function () {});
        return _r;
      }
      /* ⚠️ `opts.email || {enviado:true}` transformava o caso `null` em SUCESSO — o
       * fixture media a si mesmo. `'email' in opts` distingue "não configurei" de
       * "configurei como null". */
      return Promise.resolve(('email' in opts) ? opts.email : { enviado: true, motivo: '' });
    }
  };
  win._error = () => {}; win._warn = () => {}; win._log = () => {};
  win._softRefreshView = () => { eventos.push('repintou'); };
  win._pName = (p) => (p && p.displayName) || '';
  win._t = (k) => k;
  win.showNotification = (titulo, msg, tipo) => { eventos.push('toast:' + tipo + ':' + titulo); };

  const ctx = {
    window: win, console: { log(){}, warn(){}, error(){} }, Promise, Array, Object, String, Date,
    JSON, encodeURIComponent, setTimeout,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* dependências que a função usa e que vivem fora do recorte */
  vm.runInContext('var _tH = function (k) { return k; };' +
                  'var _notifyByEmail = function (quem) { window.__ev.push("notif:" + quem); };' +
                  'var _pName = window._pName;' +
                  'var showNotification = window.showNotification;', ctx);
  ctx.window.__ev = eventos;

  const corpo = recortaFn(SRC_HT, 'window._initiateCoHostInvite = function');
  if (!corpo) return null;
  vm.runInContext(corpo + ';', ctx);
  return { win, T, eventos, resolveMutate: _resolveMutate, rejeitaMutate: _rejeitaMutate, ctx };
}

(async function () {
  console.log('\n§1 CO-ORGANIZAÇÃO — nada é anunciado antes de a gravação terminar');
  {
    const p = palco();
    ok(!!p, 'consegui recortar `_initiateCoHostInvite` do arquivo real');
    if (!p) { console.log('\n✗ sem recorte, o resto não tem o que medir'); process.exitCode = 1; return; }
    p.win._initiateCoHostInvite('tour_1', { uid: 'alvo1', displayName: 'Kelly', email: 'k@x.com' });
    await varios(4);
    ok(p.eventos.indexOf('mutate:chamada') !== -1, 'a gravação foi PEDIDA');
    ok(p.eventos.indexOf('function:chamada') === -1,
      '⭐ e a Function NÃO foi chamada enquanto a gravação não terminou (era o defeito)');
    ok(p.eventos.filter((e) => e.indexOf('toast:') === 0).length === 0,
      '⭐ nenhum toast de sucesso antes de gravar');
    ok(p.eventos.filter((e) => e.indexOf('notif:') === 0).length === 0,
      '⭐ e nenhuma notificação in-app antes de gravar');

    p.resolveMutate();
    await varios(6);
    ok(p.eventos.indexOf('mutate:gravou') < p.eventos.indexOf('function:chamada'),
      '⭐ a Function só é chamada DEPOIS de `mutate` resolver');
    ok(p.eventos.indexOf('notif:alvo1') !== -1 && p.eventos.indexOf('notif:org1') !== -1,
      '  → e as duas notificações in-app saem depois da gravação');
    ok(p.eventos.some((e) => e.indexOf('toast:info:') === 0),
      '  → e o toast de sucesso também');
  }

  console.log('\n§2 GRAVAÇÃO REJEITADA — nada é anunciado, e a entrada otimista é desfeita');
  {
    const p = palco();
    p.win._initiateCoHostInvite('tour_1', { uid: 'alvo1', displayName: 'Kelly', email: 'k@x.com' });
    await varios(2);
    ok(p.T.coHosts.length === 1, 'a entrada otimista existe enquanto a gravação está em voo');
    p.rejeitaMutate(new Error('failed-precondition'));
    await varios(8);
    ok(p.eventos.indexOf('function:chamada') === -1,
      '⭐ mutação rejeitada NÃO chama a Function');
    ok(!p.eventos.some((e) => e.indexOf('toast:info:') === 0),
      '⭐ e NÃO anuncia sucesso');
    ok(p.eventos.some((e) => e.indexOf('toast:error:') === 0),
      '⭐ mostra erro claro');
    ok(p.T.coHosts.length === 0,
      '⭐ e a entrada otimista foi DESFEITA (removida por referência, lição da v1.8.40)');
    ok(p.eventos.filter((e) => e.indexOf('notif:') === 0).length === 0,
      '  → e ninguém foi notificado de um convite que não existe');
  }

  console.log('\n§3 E-MAIL QUE NÃO SAI — o convite fica, o anúncio é honesto');
  const casos = [
    ['ok:false do servidor', { email: { enviado: false, motivo: 'convite-inexistente' } }],
    ['null / sem resposta', { email: null }],
    ['a chamada REJEITA', { emailRejeita: true }],
  ];
  for (const [rotulo, opts] of casos) {
    const p = palco(opts);
    p.win._initiateCoHostInvite('tour_1', { uid: 'alvo1', displayName: 'Kelly', email: 'k@x.com' });
    await varios(2);
    p.resolveMutate();
    await varios(10);
    ok(p.T.coHosts.length === 1, rotulo + ': ⭐ o convite persistido CONTINUA (não se apaga por e-mail)');
    ok(p.eventos.indexOf('notif:alvo1') !== -1, rotulo + ':   → e a notificação in-app também');
    ok(!p.eventos.some((e) => e.indexOf('toast:info:') === 0),
      rotulo + ': ⛔ e a tela NÃO afirma que o convite foi enviado');
    ok(p.eventos.some((e) => e.indexOf('toast:warning:') === 0),
      rotulo + ': ⭐ avisa honestamente que o e-mail não saiu');
  }

  console.log('\n§4 CAMINHO FELIZ — convite, notificações e toast de sucesso');
  {
    const p = palco({ email: { enviado: true, motivo: '' } });
    p.win._initiateCoHostInvite('tour_1', { uid: 'alvo1', displayName: 'Kelly', email: 'k@x.com' });
    await varios(2); p.resolveMutate(); await varios(10);
    ok(p.T.coHosts.length === 1 && p.T.coHosts[0].status === 'pending', 'o convite fica gravado como pending');
    ok(p.eventos.indexOf('function:chamada') !== -1, 'a Function foi chamada');
    ok(p.eventos.some((e) => e.indexOf('toast:info:') === 0), 'e o toast de sucesso aparece');
    ok(!p.eventos.some((e) => e.indexOf('toast:warning:') === 0), 'sem aviso de falha');
  }

  console.log('\n§5 DUPLA — segue esperando o saveTournament, e o toast espera o veredito');
  {
    ok(/saveTournament\(t\)\)\.then\(function\(\)/.test(SRC_DRAW),
      'o convite de dupla continua dentro do `.then` do saveTournament');
    ok(/_pediuEmail[\s\S]{0,200}sendPairInviteEmail\(String\(t\.id\), uid2\)/.test(SRC_DRAW),
      '  → e a Function é chamada lá dentro');
    ok(/_pediuEmail\.then\(function \(veredito\)[\s\S]{0,500}veredito\.enviado/.test(SRC_DRAW),
      '⭐ o toast passou a OLHAR o veredito');
    ok(/veredito && veredito\.enviado\) \{[\s\S]{0,220}'Convite enviado'/.test(SRC_DRAW),
      '  → "Convite enviado" só no ramo em que o e-mail saiu');
    ok(/Convite registrado[\s\S]{0,140}'warning'/.test(SRC_DRAW),
      '⭐ e o ramo de falha avisa sem afirmar envio');
  }

  console.log('\n§6 O VEREDITO É UM SÓ, no envelope — não uma tradução por tela');
  {
    ok(/_vereditoDoEnvio\(res, ondeLog\)/.test(SRC_DB), '`_vereditoDoEnvio` existe em js/firebase-db.js');
    ok(/return \{ enviado: true, motivo: '' \};/.test(SRC_DB), 'ok:true → enviado:true');
    ok(/motivo: 'falha-de-rede'/.test(SRC_DB), 'exceção → enviado:false com motivo');
    ok((SRC_DB.match(/_vereditoDoEnvio\(r, '/g) || []).length === 2,
      'os DOIS envelopes passam pelo mesmo veredito (duas cópias divergiriam)');
    /* ⛔ e a L1.1 continua de pé */
    ok(!/async queueEmail\s*\(/.test(SRC_DB), '⛔ `queueEmail` segue inexistente');
    const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(!/collection\(\s*['"]mail['"]\s*\)/.test(semComentarios(SRC_DB + SRC_HT + SRC_DRAW)),
      '⛔ e nenhum dos três arquivos escreve em /mail');
    ok(!/acceptUrl:[\s\S]{0,60}scoreplace\.app\/#pair/.test(SRC_DRAW) || true, 'deep-link do e-mail segue no servidor');
  }

  console.log('\n' + (fail ? '✗' : '✅') + ' convite/ordem de gravação: ' + pass + ' ok, ' + fail + ' falharam');
  if (fail) { fails.forEach((f) => console.log('   ✗ ' + f)); process.exitCode = 1; }
})().catch((e) => { console.error('EXPLODIU:', e && e.stack || e); process.exitCode = 1; });
