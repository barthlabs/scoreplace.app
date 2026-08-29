/* A UI DESFAZ QUANDO O SERVIDOR RECUSA — teste FUNCIONAL (4ª auditoria, ponto 9).
 * node tests/amizade-ui-rollback.test.js
 *
 * ⛔ O QUE ISTO TRAVA: `_acceptFriend`, `_rejectFriend` e `_removeFriend` alteravam
 * `currentUser.friends` / `friendRequests*` ANTES da Cloud Function e não tinham `.catch`.
 * Com a autoridade nova a recusa deixou de ser rara — sessão de conta unificada (lápide),
 * conta excluída, alvo que não aceita convites, validação do servidor. Sem rollback, a tela
 * seguia afirmando uma amizade que o servidor recusou.
 *
 * ⭐ NÃO é regex: o `js/views/explore.js` é CARREGADO e os handlers REAIS são executados
 * contra um `FirestoreDB` falso que rejeita. O que se afirma é o ESTADO depois da recusa.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'explore.js'), 'utf8');

function montar(rejeitar, opts) {
  const cu = {
    uid: 'u_eu',
    friends: ['u_amigo'],
    friendRequestsSent: ['u_enviado'],
    friendRequestsReceived: ['u_recebido'],
  };
  const chamadas = [];
  const notificacoes = [];
  const recusa = () => Promise.reject(new Error('conta unificada — entre de novo'));
  const sucesso = () => Promise.resolve();
  const win = {
    AppStore: { currentUser: cu },
    FirestoreDB: {
      acceptFriendRequest: (a, b) => { chamadas.push(['accept', b]); return rejeitar ? recusa() : sucesso(); },
      rejectFriendRequest: (a, b) => { chamadas.push(['reject', b]); return rejeitar ? recusa() : sucesso(); },
      removeFriend:        (a, b) => { chamadas.push(['remove', b]); return rejeitar ? recusa() : sucesso(); },
      sendFriendRequest:   () => (rejeitar ? recusa() : Promise.resolve({})),
      // multi-cancel: o SEGUNDO uid falha, o primeiro passa — é o caso de falha PARCIAL
      cancelFriendRequest: (a, b) => {
        chamadas.push(['cancel', b]);
        if (!rejeitar) return sucesso();
        return (b === 'u_parcial_ok') ? sucesso() : recusa();
      },
    },
    _t: (k) => k,
    _warn: () => {}, _log: () => {}, _error: () => {},
    _exploreScrollSafeRender: () => {},
    _spinButton: () => {},
  };
  const sandbox = {
    window: win, document: { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) },
    showNotification: (t, m) => notificacoes.push([t, m]),
    // com `semDialog` o handler cai no fallback sem diálogo — o caminho que faltava cobrir
    showAlertDialog: (opts && opts.semDialog) ? undefined : ((t, m, cb) => cb()),
    setTimeout: (fn) => fn(), clearTimeout: () => {}, console,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { onLine: true }, location: { hash: '' }, firebase: undefined,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(src, sandbox, { filename: 'explore.js' }); }
  catch (e) { console.error('  (explore.js não carregou:', e.message + ')'); }
  return { win, cu, chamadas, notificacoes };
}

// ══ RECUSA: o estado tem que VOLTAR ═════════════════════════════════════════
const tick = () => new Promise((r) => setImmediate(r));
const assentar = async () => { for (let i = 0; i < 8; i++) await tick(); };

(async () => {
  let a = montar(true);
  ok(typeof a.win._acceptFriend === 'function', 'os handlers reais de explore.js foram carregados');

  a.win._acceptFriend('u_recebido');
  await assentar();
  ok(a.cu.friends.length === 1 && a.cu.friends[0] === 'u_amigo',
    '⛔ ACEITAR recusado: `friends` volta ao estado anterior (não fica com o amigo falso)');
  ok(a.cu.friendRequestsReceived.includes('u_recebido'), '⛔ e o convite recebido VOLTA pra lista');
  ok(a.notificacoes.some(([t]) => /FriendError/.test(t)), 'e a pessoa é avisada do erro');

  const b = montar(true);
  b.win._removeFriend('u_amigo');
  await assentar();
  ok(b.cu.friends.includes('u_amigo'),
    '⛔ REMOVER recusado: a amizade VOLTA (a tela não pode dizer que desfez)');

  const c = montar(true);
  c.win._rejectFriend('u_recebido');
  await assentar();
  ok(c.cu.friendRequestsReceived.includes('u_recebido'),
    '⛔ RECUSAR recusado pelo servidor: o convite VOLTA');

  // ══ cancelar convite ══════════════════════════════════════════════════════
  const e1 = montar(true);
  e1.win._cancelFriendRequest('u_enviado');
  await assentar();
  ok(e1.cu.friendRequestsSent.includes('u_enviado'),
    '⛔ CANCELAR recusado: o convite enviado VOLTA pra lista');

  // ══ multi-cancel com falha PARCIAL ════════════════════════════════════════
  const e2 = montar(true);
  e2.cu.friendRequestsSent = ['u_parcial_ok', 'u_parcial_falha'];
  e2.win._cancelFriendRequestMulti(['u_parcial_ok', 'u_parcial_falha']);
  await assentar();
  ok(!e2.cu.friendRequestsSent.includes('u_parcial_ok'), 'multi-cancel: o que DEU CERTO some da lista');
  ok(e2.cu.friendRequestsSent.includes('u_parcial_falha'),
    '⛔ multi-cancel: e SÓ o que falhou é restaurado');
  ok(e2.notificacoes.some(([t]) => /FriendError/.test(t)),
    '⛔ e o aviso é de ERRO, não o "convite cancelado" de sucesso global');

  // ══ fallback do remove SEM showAlertDialog ════════════════════════════════
  const e3 = montar(true, { semDialog: true });
  e3.win._removeFriend('u_amigo');
  await assentar();
  ok(e3.cu.friends.includes('u_amigo'),
    '⛔ REMOVER pelo fallback (sem diálogo) também desfaz quando o servidor recusa');
  ok(e3.chamadas.some(([k]) => k === 'remove'), 'e o caminho de fato foi exercitado');

  // ══ SUCESSO: o estado otimista PERMANECE ══════════════════════════════════
  const d = montar(false);
  d.win._acceptFriend('u_recebido');
  await assentar();
  ok(d.cu.friends.includes('u_recebido'), 'controle: no SUCESSO a amizade permanece');
  ok(!d.cu.friendRequestsReceived.includes('u_recebido'), 'e o convite sai de pendentes');
  ok(d.chamadas.length === 1 && d.chamadas[0][0] === 'accept', 'e a CF foi chamada uma vez');

  const d2 = montar(false);
  d2.cu.friendRequestsSent = ['u_a', 'u_b'];
  d2.win._cancelFriendRequestMulti(['u_a', 'u_b']);
  await assentar();
  ok(d2.cu.friendRequestsSent.length === 0, 'controle: multi-cancel bem-sucedido limpa os dois');
  ok(d2.notificacoes.some(([t]) => /InviteCancelled/.test(t)), 'e avisa sucesso');

  console.log(pass + ' passaram, ' + fail + ' falharam');
  process.exit(fail ? 1 : 0);
})();
