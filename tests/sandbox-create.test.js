/* Sandbox (SB) — a CRIAÇÃO é um pedido ao servidor.  (FIX.SANDBOX.P2, 2.1.87)
 * node tests/sandbox-create.test.js
 *
 * ⚠️ ESTE ARQUIVO MUDOU DE ASSUNTO NA 2.1.87, e o motivo é estrutural. Ele media o clone
 * feito NO CLIENTE (deep-copy do objeto do AppStore). Esse caminho não existe mais — e não
 * podia existir:
 *   · o cliente NÃO PODE escrever as subcoleções de um torneio REAL (`firestore.rules`:
 *     `allow write: if false` em inscritos/matches/opponentHistory/...), e era de lá que o
 *     clone saía: ele gravava `_nPartes` prometendo partes que ninguém preencheria — foi o
 *     defeito medido "14 inscritos e 0 jogos";
 *     ⚠️ DENTRO de `sandboxes/{id}` o DONO escreve (é como ele opera o sandbox: placar,
 *     avanço). O que ele não pode, lá, é CRIAR (`allow create: if false`) — e é isso que
 *     mantém a criação sendo um pedido ao servidor;
 *   · e o objeto que o cliente tem em mãos é o documento MAGRO (as partes chegam depois),
 *     então clonar dali já nasce incompleto.
 *
 * ⭐ Quem copia é a Cloud Function `createSandbox`: lê o original inteiro, PROVA a igualdade
 * canônica e escreve as partes com o Admin SDK. A fidelidade é provada onde ela acontece —
 * `tests/sandbox-cf-emulador.test.js`, contra Firestore, Rules e Function de verdade.
 * O que sobra pro cliente, e é o que este arquivo trava, é o CONTRATO: só o dev pede, o
 * pedido leva um id e mais nada, e nada é gravado por aqui.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox: W } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-organizer.js'), 'utf8'),
  W, { filename: 'tournaments-organizer.js' });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── sandbox-create ────');
W.showNotification = function () {};

(async () => {
  ok(typeof W._openOrCreateSandbox === 'function', '_openOrCreateSandbox existe');
  ok(typeof W._criaSandboxFiel === 'function', '_criaSandboxFiel existe');

  let chamadas = [], gravou = 0, navegou = null;
  const armaCF = (resposta, erro) => {
    W.firebase = { functions: true, app: () => ({ functions: () => ({ httpsCallable: (nome) => (payload) => {
      chamadas.push({ nome, payload });
      return erro ? Promise.reject(erro) : Promise.resolve({ data: resposta });
    } }) }) };
  };
  W.FirestoreDB = { db: true, saveTournament: () => { gravou++; return Promise.resolve(true); } };
  Object.defineProperty(W, 'location', { configurable: true,
    value: { set hash(v) { navegou = v; }, get hash() { return navegou || ''; } } });

  function mkOrig() {
    return { id: 'ORIG', name: 'Copa Real', sport: 'Beach Tennis', isPublic: true, creatorUid: 'uORG',
      participants: [{ uid: 'uP1' }, { uid: 'uP2' }], memberUids: ['uORG', 'uP1', 'uP2'] };
  }

  // (0) não-dev → no-op
  W.AppStore.tournaments = [mkOrig()];
  W.AppStore.currentUser = { uid: 'uRANDO', email: 'rando@x.com' };
  armaCF({ ok: true, id: 'sb_1' });
  chamadas = [];
  await W._openOrCreateSandbox('ORIG');
  ok(chamadas.length === 0, '0: não-dev nem chega a pedir ao servidor');

  // (1) dev → pede ao servidor
  W.AppStore.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
  W._sbIdsConhecidos = {};
  chamadas = []; gravou = 0; navegou = null;
  armaCF({ ok: true, id: 'sb_ORIG_1', docsCopiados: 269 });
  const r = await W._openOrCreateSandbox('ORIG');
  ok(chamadas.length === 1 && chamadas[0].nome === 'createSandbox', '1: chamou a CF createSandbox');
  ok(JSON.stringify(Object.keys(chamadas[0].payload)) === JSON.stringify(['originalTournamentId']),
    '1: o pedido leva SÓ originalTournamentId (nenhum payload de torneio)');
  ok(chamadas[0].payload.originalTournamentId === 'ORIG', '1: e é o id do original');
  ok(gravou === 0, '1: ⛔ o cliente não grava torneio nenhum');
  ok(r && r.ok === true && r.id === 'sb_ORIG_1', '1: devolve o id que o servidor deu');
  ok(W._sbIdsConhecidos['sb_ORIG_1'] === true, '1: já sabe rotear esse id pra `sandboxes`');

  // (2) original INTACTO
  const orig = W.AppStore.tournaments.find((t) => t.id === 'ORIG');
  ok(orig.sandboxId === undefined, '2: original não recebe sandboxId');
  ok(orig.isPublic === true && orig.creatorUid === 'uORG', '2: original inalterado');
  ok(orig.participants.length === 2, '2: roster do original intacto');

  // (3) falha do servidor → não abre, não grava
  chamadas = []; gravou = 0; navegou = null;
  armaCF(null, Object.assign(new Error('original incompleto'), { code: 'failed-precondition' }));
  const r3 = await W._openOrCreateSandbox('ORIG');
  ok(r3 && r3.ok === false, '3: falha devolve ok:false');
  ok(gravou === 0, '3: ⛔ nada gravado');
  ok(navegou === null, '3: ⛔ e NÃO navegou pro sandbox');

  // (4) já existe SB em memória → abre, sem pedir de novo
  chamadas = [];
  W.AppStore.tournaments = [mkOrig(), { id: 'sb_ORIG_1', isSandbox: true, sandboxOf: 'ORIG' }];
  await W._openOrCreateSandbox('ORIG');
  ok(chamadas.length === 0, '4: com SB já em memória, abre sem pedir ao servidor');

  // (5) ESTRUTURAL: o cliente não fabrica
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-organizer.js'), 'utf8');
  ok(src.indexOf('JSON.stringify(orig)') === -1, '5: ⛔ não clona mais o objeto da tela');
  ok(src.indexOf('window._sbAplicaEnvelope =') === -1, '5: ⛔ e não monta mais o envelope (é do servidor)');
  ok(/httpsCallable\('createSandbox'\)/.test(src), '5: a porta é a Cloud Function');
  ok(!/_clearTournamentDraw/.test(src), '5: a CRIAÇÃO não zera sorteio — zerar é do "Resetar"');

  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ sandbox-create FALHOU'); process.exit(1); }
  console.log('✅ sandbox-create: OK');
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(1); });
