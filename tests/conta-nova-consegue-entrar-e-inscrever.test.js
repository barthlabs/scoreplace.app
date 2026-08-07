/* QUEM ACABOU DE CRIAR CONTA CONSEGUE ENTRAR E SE INSCREVER
 * node tests/conta-nova-consegue-entrar-e-inscrever.test.js
 *
 * DOIS DEFEITOS MEDIDOS no Confra (06/ago/2026), ambos atingindo exatamente quem acabou
 * de criar conta — o perfil mais frágil que existe no app.
 *
 * (1) INSCRIÇÃO RECUSADA "torneio removido". `_findTournamentById` só olha DUAS listas em
 *     memória: `AppStore.tournaments` (listener por `memberUids array-contains meuUid`) e
 *     `AppStore.publicDiscovery` (carga assíncrona). Conta recém-criada não é membro de
 *     nada e o discovery pode não ter chegado → null → o app conclui "removido".
 *     PROVA de que a recusa era do CLIENTE: a CF `enrollParticipant` não foi chamada UMA
 *     ÚNICA VEZ na janela (log do dia). O torneio estava `active`, público, 122 inscritos.
 *     Caso real: Paula Vasconcelos, conta criada 06/ago 23:33:53.
 *
 * (2) SESSÃO MORTA PELO IndexedDB. Sentry, 06/ago 23:20:07 UTC, web, Mobile Safari iOS:
 *     "UnknownError: Database deleted by request of the user" — 1min29s ANTES de a Cristina
 *     criar a 1ª das 2 contas que ela abriu tentando entrar, e que ficaram SEM perfil no
 *     Firestore. É a persistência do Firestore sendo apagada com a conexão aberta: a
 *     AsyncQueue morre e tudo depois falha em cascata — inclusive gravar o perfil no login.
 *     O auto-reload guardado que existe pra essa situação só reconhecia as frases do bug
 *     interno do SDK, então esta família ficava sem NENHUMA recuperação.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── (1) _ensureTournamentLoaded: o último degrau da busca ────────────────────
(() => {
  const SRC = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  const i = SRC.indexOf('window._ensureTournamentLoaded = function');
  ok(i !== -1, 'não achei _ensureTournamentLoaded no store.js');
  const fim = SRC.indexOf('\n};', i);
  const corpo = SRC.slice(SRC.indexOf('{', i) + 1, fim);
  const win = {
    _findTournamentById: null, _warn: function () {}, FirestoreDB: null,
    AppStore: { tournaments: [], publicDiscovery: [] },
  };
  win._findTournamentById = function (tId) {
    const s = String(tId);
    const listas = [win.AppStore.tournaments, win.AppStore.publicDiscovery];
    for (const arr of listas) for (const x of (arr || [])) if (x && String(x.id) === s) return x;
    return null;
  };
  const fn = new Function('window', 'tId', 'cb', corpo);
  const ensure = (tId, cb) => fn(win, tId, cb);

  // (a) já está em memória → NÃO vai ao Firestore
  let leituras = 0;
  win.FirestoreDB = { loadTournamentById: function () { leituras++; return Promise.resolve(null); } };
  win.AppStore.tournaments = [{ id: 'tour_x', name: 'Local' }];
  let got = 'NADA';
  ensure('tour_x', (t) => { got = t; });
  ok(got && got.name === 'Local', 'acha em memória sem ir ao servidor');
  ok(leituras === 0, 'e não faz leitura desnecessária no Firestore');

  // (b) NÃO está em memória (conta nova) → busca no Firestore e entra no discovery
  win.AppStore.tournaments = []; win.AppStore.publicDiscovery = [];
  win.FirestoreDB = { loadTournamentById: function (id) {
    leituras++; return Promise.resolve({ id: id, name: 'Confra BT', status: 'active', isPublic: true });
  } };
  return new Promise((resolve) => {
    ensure('tour_1780009816637', (t) => {
      ok(!!t, 'conta nova (memória vazia) ACHA o torneio pelo servidor — era aqui que a inscrição morria');
      ok(t && t.name === 'Confra BT', 'e vem o doc certo');
      ok(win.AppStore.publicDiscovery.length === 1, 'o torneio carregado entra no discovery pro resto da tela achar');
      ok(String(win.AppStore.publicDiscovery[0].id) === 'tour_1780009816637', 'com o id preenchido');

      // (c) segunda chamada não duplica
      ensure('tour_1780009816637', () => {
        ok(win.AppStore.publicDiscovery.length === 1, 'chamar de novo NÃO duplica o torneio na lista');

        // (d) doc não existe → devolve null (aí sim é "não encontrado")
        win.FirestoreDB = { loadTournamentById: () => Promise.resolve(null) };
        ensure('tour_inexistente', (t2) => {
          ok(t2 === null, 'torneio que realmente não existe devolve null');
          // (e) erro de rede não estoura
          win.FirestoreDB = { loadTournamentById: () => Promise.reject(new Error('offline')) };
          ensure('tour_zzz', (t3) => {
            ok(t3 === null, 'falha de rede devolve null sem estourar');
            resolve();
          });
        });
      });
    });
  }).then(finalize);
})();

function finalize() {
  // ── Fiação: a inscrição usa o degrau novo ──────────────────────────────────
  const ENR = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const bloco = ENR.slice(ENR.indexOf('window.enrollCurrentUser = function'), ENR.indexOf('window.submitTeamEnroll'));
  ok(/_ensureTournamentLoaded\(/.test(bloco),
     'enrollCurrentUser busca o torneio no servidor quando não acha em memória');
  ok(/enrollCurrentUser\(tId, true\)/.test(bloco),
     'e REENTRA na própria função depois de carregar');
  ok(/_reentrouAposCarregar/.test(bloco),
     'com flag de reentrada — sem ela, torneio inexistente viraria laço infinito');
  ok(bloco.indexOf('tournNotFoundAlertMsg') !== -1,
     'e só aí diz "não encontrado" — antes ela recusava sem nem tentar');

  // ── (2) O auto-reload reconhece o IndexedDB apagado ────────────────────────
  const SI = fs.readFileSync(path.join(ROOT, 'js', 'sentry-init.js'), 'utf8');
  const m = SI.match(/function _fsFatal\(s\)\s*\{\s*return (\/[^\n]+\/i)\.test/);
  ok(!!m, 'não achei o detector _fsFatal no sentry-init.js');
  if (m) {
    const re = eval(m[1]);
    ok(re.test('Error: UnknownError: Database deleted by request of the user'),
       'o erro REAL do Sentry (IndexedDB apagado) dispara a recuperação — antes ficava de fora');
    ok(re.test('INTERNAL ASSERTION FAILED: Unexpected state'),
       'e o bug interno do SDK continua coberto (nada regrediu)');
    ok(!re.test('FirebaseError: Missing or insufficient permissions.'),
       'permission-denied NÃO pode disparar reload — é erro de regra, não sessão morta');
    ok(!re.test('TypeError: undefined is not an object'),
       'erro comum de JS também não dispara reload');
  }

  console.log((fail === 0 ? '✅' : '❌') + ' conta-nova-entra-e-inscreve: ' + pass + ' asserções, ' + fail + ' falha(s)');
  process.exit(fail === 0 ? 0 : 1);
}
