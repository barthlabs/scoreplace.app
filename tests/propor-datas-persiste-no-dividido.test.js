/* PROPOR DATAS PERSISTE — a porta `setMatchSchedule`
 * node tests/propor-datas-persiste-no-dividido.test.js
 *
 * ⛔ O BURACO (medido no Confra, 03/set/2026): `schedule-poll.js` gravava `m.schedule` e
 * `scheduledAt` com `saveTournament(t)` — `.set(merge)` no DOCUMENTO. Num torneio DIVIDIDO
 * os jogos moram na subcoleção (`allow write: if false` pro cliente): a proposta aparecia
 * na tela e NADA persistia. Quem propôs não via mais; os outros nunca viram; o organizador
 * também não. 9 jogos com schedule no banco, todos de agosto (antes da divisão), zero depois.
 * Mesma família do link do grupo (tests/link-do-grupo-do-jogo-persiste.test.js), mesmo
 * harness: a CF REAL contra um Firestore de mentira que se comporta como o real.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'scoreplace-testes';

/* ⛔ A MESMA INSTÂNCIA de firebase-admin que o functions/index.js carrega — o cache do
 * Node é por caminho RESOLVIDO. Requerer 'firebase-admin' daqui pegaria a cópia da raiz e
 * o stub não teria efeito nenhum: a CF falaria com o Firestore real. */
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
const FieldPathReal = admin.firestore.FieldPath;
const FieldValueReal = admin.firestore.FieldValue;
const S = require(path.join(ROOT, 'functions', 'vendor', 'tournament-split-core.js'));

let falhas = 0, passou = 0;
const ok = (n, c, extra) => {
  if (c) { passou++; console.log('  ✓ ' + n); }
  else { falhas++; console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); }
};
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ═══ O FIRESTORE DE MENTIRA ══════════════════════════════════════════════════
 * Só o que importa pra esta prova, e com as regras que importam:
 *  · a transação LÊ tudo antes de escrever (anota se alguém violar);
 *  · escrita fica pendente e só é aplicada no commit — como no real;
 *  · `update` num documento que não existe FALHA (é precondição, não upsert);
 *  · `update(ref, FieldPath, valor)` toca SÓ aquele campo — é a propriedade inteira
 *    em que esta porta se apoia pra não destruir `_chave`/`_loc`/`playerUids`.
 */
function bancoDeMentira(tid, doc, subs, users) {
  const b = {
    doc: clone(doc),
    subs: clone(subs || {}),
    users: clone(users || {}),
    leuDepoisDeEscrever: false,
    tentativas: 0,
    conflitoUmaVez: null,   // hook: simula OUTRO escritor commitando entre as tentativas
  };

  const colRef = (nome) => ({ _tipo: 'col', _nome: nome, doc: (id) => ({ _tipo: 'doc', _sub: nome, _id: String(id) }) });
  const tRef = { _tipo: 'doc', _raiz: true, _id: tid, collection: colRef };

  function alvoDe(ref, pend) {
    if (ref._raiz) return { get: () => (pend.docApagado ? null : Object.assign({}, b.doc, pend.doc)), tipo: 'raiz' };
    const m = b.subs[ref._sub] || {};
    const p = (pend.subs[ref._sub] || {});
    if (Object.prototype.hasOwnProperty.call(p, ref._id)) return { get: () => p[ref._id], tipo: 'sub' };
    return { get: () => (m[ref._id] ? clone(m[ref._id]) : null), tipo: 'sub' };
  }

  function aplicaCaminho(obj, segs, valor) {
    let cur = obj;
    for (let i = 0; i < segs.length - 1; i++) {
      if (!cur[segs[i]] || typeof cur[segs[i]] !== 'object') cur[segs[i]] = {};
      cur = cur[segs[i]];
    }
    const ultimo = segs[segs.length - 1];
    if (valor && valor.constructor && valor.constructor.name === 'DeleteTransform') delete cur[ultimo];
    else cur[ultimo] = clone(valor);
  }

  b.runTransaction = async function (fn) {
    for (let volta = 0; volta < 5; volta++) {
      b.tentativas++;
      const pend = { doc: {}, subs: {} };
      let escreveu = false;
      const tx = {
        get: async (ref) => {
          if (escreveu) b.leuDepoisDeEscrever = true;
          if (ref._tipo === 'col') {
            const m = b.subs[ref._nome] || {};
            return { docs: Object.keys(m).sort().map((k) => ({ id: k, data: () => clone(m[k]) })) };
          }
          if (ref._raiz) return { exists: true, data: () => clone(b.doc) };
          const a = alvoDe(ref, pend).get();
          return { exists: !!a, data: () => clone(a) };
        },
        update: (ref, ...args) => {
          escreveu = true;
          const atual = alvoDe(ref, pend).get();
          if (!atual) throw new Error('NOT_FOUND: update em documento inexistente ' + JSON.stringify(ref));
          const alvo = clone(atual);
          if (args.length === 1 && args[0] && typeof args[0] === 'object' && !(args[0] instanceof FieldPathReal)) {
            Object.keys(args[0]).forEach((k) => {
              const v = args[0][k];
              if (v && v.constructor && v.constructor.name === 'DeleteTransform') delete alvo[k];
              else alvo[k] = clone(v);
            });
          } else {
            for (let i = 0; i < args.length; i += 2) {
              const campo = args[i];
              const segs = (campo instanceof FieldPathReal) ? campo.segments : String(campo).split('.');
              aplicaCaminho(alvo, segs, args[i + 1]);
            }
          }
          if (ref._raiz) pend.doc = alvo;
          else { (pend.subs[ref._sub] = pend.subs[ref._sub] || {})[ref._id] = alvo; }
        },
        set: (ref, v) => {
          escreveu = true;
          if (ref._raiz) pend.doc = clone(v);
          else (pend.subs[ref._sub] = pend.subs[ref._sub] || {})[ref._id] = clone(v);
        },
        delete: (ref) => {
          escreveu = true;
          if (ref._raiz) pend.docApagado = true;
          else (pend.subs[ref._sub] = pend.subs[ref._sub] || {})[ref._id] = null;
        },
      };

      const saida = await fn(tx);

      // OUTRO escritor commitou no meio: o Firestore aborta e RE-EXECUTA o callback.
      if (b.conflitoUmaVez) { const f = b.conflitoUmaVez; b.conflitoUmaVez = null; f(b); continue; }

      // commit
      if (Object.keys(pend.doc).length) b.doc = pend.doc;
      Object.keys(pend.subs).forEach((c) => {
        b.subs[c] = b.subs[c] || {};
        Object.keys(pend.subs[c]).forEach((id) => {
          if (pend.subs[c][id] === null) delete b.subs[c][id];
          else b.subs[c][id] = pend.subs[c][id];
        });
      });
      return saida;
    }
    throw new Error('transação não convergiu');
  };

  b.collection = function (nome) {
    if (nome === 'tournaments') return { doc: (id) => (String(id) === tid ? tRef : { _tipo: 'doc', _raiz: false, _sub: '__inexistente', _id: String(id), collection: colRef }) };
    if (nome === 'users') {
      return { doc: (uid) => ({ get: async () => ({ exists: !!b.users[uid], data: () => clone(b.users[uid] || {}) }) }) };
    }
    return colRef(nome);
  };
  return b;
}

/* Torneio inexistente: o `tx.get` do docRef precisa devolver exists:false. Banco separado
 * pra não sujar o feliz — um `_raiz` que sempre existe é justamente o que esconderia o
 * `not-found`. */
function bancoSemTorneio() {
  const b = bancoDeMentira('nao-existe', {}, {}, {});
  const orig = b.runTransaction;
  b.collection = function (nome) {
    if (nome === 'tournaments') return { doc: () => ({ _tipo: 'doc', _fantasma: true, collection: (n) => ({ _tipo: 'col', _nome: n, doc: (i) => ({ _tipo: 'doc', _sub: n, _id: i }) }) }) };
    if (nome === 'users') return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
    return { doc: () => ({}) };
  };
  b.runTransaction = async function (fn) {
    return await fn({ get: async (ref) => (ref._fantasma ? { exists: false, data: () => null } : { docs: [] }), update() {}, set() {}, delete() {} });
  };
  void orig;
  return b;
}

/* ── carrega a CF REAL, com o admin já dublado ────────────────────────────────
 * ⚠️ `admin.firestore` é um GETTER no protótipo do FirebaseNamespace: `admin.firestore = x`
 * não lança em modo solto — falha CALADO, e a CF continuaria falando com o Firestore de
 * verdade. `defineProperty` cria uma propriedade PRÓPRIA que sombreia o getter, e o
 * 'use strict' no topo deste arquivo garante que uma regressão aqui vire erro, não
 * silêncio. [[feedback_never_invent_config_to_silence_error]] */
let BANCO = null;
const fsStub = function () { return BANCO; };
fsStub.FieldPath = FieldPathReal;
fsStub.FieldValue = FieldValueReal;
Object.defineProperty(admin, 'initializeApp', { value: function () { return {}; }, writable: true, configurable: true });
Object.defineProperty(admin, 'firestore', { value: fsStub, writable: true, configurable: true });
if (admin.firestore !== fsStub) { console.error('  ✗ o dublê do admin.firestore não pegou — abortando'); process.exit(1); }
const CF = require(path.join(ROOT, 'functions', 'index.js'));
if (typeof CF.setMatchSchedule !== 'function' || typeof CF.setMatchSchedule.run !== 'function') {
  console.error('  ✗ setMatchSchedule não existe (ou não é onCall) — abortando');
  process.exit(1);
}
const UUID = (n) => '00000000-0000-4000-8000-00000000000' + n;
function chamar(uid, data) {
  return CF.setMatchSchedule.run({ data: data, auth: { uid: uid, token: { name: uid, uid: uid } }, rawRequest: { headers: {} }, acceptsStreaming: false });
}
async function erroDe(p) { try { await p; return null; } catch (e) { return e; } }
const P = (u) => ({ uid: u });
function torneio() {
  const g = (gi, n, a, b2, c, d) => ({
    id: 'g' + gi + '-' + n, isMonarch: true, round: 1, monarchGroup: gi, phaseIndex: 0,
    p1: 'dupla ' + a + '/' + b2, p2: 'dupla ' + c + '/' + d, team1Uids: [a, b2], team2Uids: [c, d], team1: [a, b2], team2: [c, d],
  });
  return {
    id: 'T1', name: 'Copa de Teste', creatorUid: 'uOrg', adminUids: ['uAdm'], coHosts: [{ uid: 'uCo', status: 'active' }],
    participants: ['uA', 'uB', 'uC', 'uD', 'uE', 'uF', 'uG', 'uH'].map(P),
    rounds: [{ round: 1, format: 'rei_rainha', status: 'active', monarchGroups: [{ name: 'A' }, { name: 'B' }],
      matches: [g(0, 1, 'uA', 'uB', 'uC', 'uD'), g(0, 2, 'uA', 'uC', 'uB', 'uD'), g(0, 3, 'uA', 'uD', 'uB', 'uC'),
                g(1, 1, 'uE', 'uF', 'uG', 'uH'), g(1, 2, 'uE', 'uG', 'uF', 'uH'), g(1, 3, 'uE', 'uH', 'uF', 'uG')] }],
    matches: [],
  };
}
// divide como o banco de produção: jogos e inscritos na subcoleção, doc só com a config
function bancoDividido() {
  const t = torneio();
  const partes = S.dividir(clone(t), ['matches', 'participants']);
  const doc = Object.assign({}, partes.config, { _semPesados: ['matches', 'participants'], _nJogos: partes.matches.length,
    _nPartes: { matches: partes.matches.length, participants: partes.participants.length } });
  const subs = {};
  subs[S.colecaoDaParte('matches')] = {}; partes.matches.forEach((r) => { subs[S.colecaoDaParte('matches')][S.chaveDoRegistro(r)] = r; });
  subs[S.colecaoDaParte('participants')] = {}; partes.participants.forEach((r) => { subs[S.colecaoDaParte('participants')][S.chaveDoRegistro(r)] = r; });
  return bancoDeMentira('T1', doc, subs, {});
}
const jogoNoBanco = (b, id) => { const col = b.subs[S.colecaoDaParte('matches')]; const k = Object.keys(col).find((k) => col[k].jogo && col[k].jogo.id === id); return k ? col[k].jogo : null; };
const PROPOSTA = { options: [{ id: 'so_1', kind: 'date', dateISO: '2026-09-10', time: '19:00', byUid: 'uA' }], votes: {}, dayVotes: {}, enabledAt: '2026-09-04T00:00:00.000Z' };

(async () => {
  console.log('\n──── propor datas persiste no torneio dividido ────');

  console.log('① quem joga propõe — e a proposta chega à SUBCOLEÇÃO, não ao documento');
  BANCO = bancoDividido();
  const docAntes = clone(BANCO.doc);
  const r1 = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', operationId: UUID(1), schedule: PROPOSTA });
  ok('a porta responde ok', r1 && r1.ok === true && r1.jaAplicado === false);
  const j1 = jogoNoBanco(BANCO, 'g0-1');
  ok('⭐ jogo.schedule persistiu na subcoleção', !!(j1 && j1.schedule && j1.schedule.options && j1.schedule.options.length === 1 && j1.schedule.options[0].dateISO === '2026-09-10'));
  ok('  → com a proposta de quem propôs', j1.schedule.options[0].byUid === 'uA');
  ok('⛔ o documento NÃO ganhou jogo de volta (só updatedAt)', !docAntes.matches.length && !BANCO.doc.matches.length && !((BANCO.doc.rounds[0] || {}).matches || []).length);
  ok('⛔ a subcoleção não perdeu ninguém (6 jogos antes, 6 depois)', Object.keys(BANCO.subs[S.colecaoDaParte('matches')]).length === 6);
  ok('  → e o registro manteve _chave/_loc (senão sumia da chave no remonte)', (() => { const col = BANCO.subs[S.colecaoDaParte('matches')]; const k = Object.keys(col).find((k) => col[k].jogo.id === 'g0-1'); return !!(col[k]._chave && col[k]._loc); })());

  console.log('② quem NÃO joga o confronto não propõe');
  const e2 = await erroDe(chamar('uE', { tournamentId: 'T1', matchId: 'g0-1', operationId: UUID(2), schedule: PROPOSTA }));
  ok('permission-denied para quem não joga', !!(e2 && e2.code === 'permission-denied'), e2 && e2.message);
  ok('  → e nada mudou no jogo', jogoNoBanco(BANCO, 'g0-1').schedule.options.length === 1);

  console.log('③ o outro jogador do confronto VÊ e ACRESCENTA a sua (vota)');
  const comVoto = clone(PROPOSTA); comVoto.votes = { uC: { so_1: 1 } };
  const r3 = await chamar('uC', { tournamentId: 'T1', matchId: 'g0-1', operationId: UUID(3), schedule: comVoto });
  ok('ok', r3.ok === true);
  ok('⭐ o voto do adversário persistiu junto da proposta', (() => { const j = jogoNoBanco(BANCO, 'g0-1'); return j.schedule.votes.uC && j.schedule.votes.uC.so_1 === 1 && j.schedule.options.length === 1; })());

  console.log('④ jogador NÃO aponta como organizador');
  const e4 = await erroDe(chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', operationId: UUID(4), scheduledAt: '2026-09-10T19:00:00.000Z', scheduledBy: 'uA', scheduledKind: 'organizer' }));
  ok('permission-denied ao tentar kind organizer', !!(e4 && e4.code === 'permission-denied'));

  console.log('⑤ o organizador APONTA a data — e espelha nos 3 jogos do grupo Rei/Rainha');
  const r5 = await chamar('uOrg', { tournamentId: 'T1', matchId: 'g0-1', operationId: UUID(5), scheduledAt: '2026-09-12T10:00:00.000Z', scheduledBy: 'uOrg', scheduledKind: 'organizer', espelharGrupo: true });
  ok('ok, 2 espelhados', r5.ok === true && r5.espelhados.length === 2);
  ok('⭐ o jogo ficou com scheduledAt/Kind do organizador', (() => { const j = jogoNoBanco(BANCO, 'g0-1'); return j.scheduledAt === '2026-09-12T10:00:00.000Z' && j.scheduledKind === 'organizer'; })());
  ok('  → e a proposta anterior continua lá (apontar não apaga o histórico)', jogoNoBanco(BANCO, 'g0-1').schedule.options.length === 1);
  ok('  → os irmãos g0-2 e g0-3 receberam a MESMA data', ['g0-2', 'g0-3'].every((id) => jogoNoBanco(BANCO, id).scheduledAt === '2026-09-12T10:00:00.000Z'));
  ok('  → e o grupo B não foi tocado', ['g1-1', 'g1-2', 'g1-3'].every((id) => !jogoNoBanco(BANCO, id).scheduledAt));

  console.log('⑥ idempotência: o retry com o MESMO operationId não grava de novo');
  const antes6 = clone(jogoNoBanco(BANCO, 'g0-1'));
  const r6 = await chamar('uOrg', { tournamentId: 'T1', matchId: 'g0-1', operationId: UUID(5), scheduledAt: '2026-09-12T10:00:00.000Z', scheduledBy: 'uOrg', scheduledKind: 'organizer', espelharGrupo: true });
  ok('jaAplicado=true', r6.jaAplicado === true);
  ok('  → e o jogo está byte a byte igual', JSON.stringify(jogoNoBanco(BANCO, 'g0-1')) === JSON.stringify(antes6));

  console.log('⑦ o LOTE do organizador (grade estimada) grava vários jogos de uma vez');
  const r7 = await chamar('uAdm', { tournamentId: 'T1', operationId: UUID(7), jogos: [
    { matchId: 'g1-1', scheduledAt: '2026-09-13T09:00:00.000Z', scheduledBy: '', scheduledKind: 'estimate' },
    { matchId: 'g1-2', scheduledAt: '2026-09-13T10:00:00.000Z', scheduledBy: '', scheduledKind: 'estimate' }] });
  ok('ok com 2 jogos', r7.ok === true && r7.jogos.length === 2);
  ok('⭐ os dois ficaram com estimativa', jogoNoBanco(BANCO, 'g1-1').scheduledKind === 'estimate' && jogoNoBanco(BANCO, 'g1-2').scheduledAt === '2026-09-13T10:00:00.000Z');
  ok('  → g1-3 intacto (não estava no lote)', !jogoNoBanco(BANCO, 'g1-3').scheduledAt);

  console.log('⑧ torneio NÃO dividido: grava no documento, no lugar certo');
  const tInt = torneio();
  BANCO = bancoDeMentira('T1', tInt, {}, {});
  const r8 = await chamar('uE', { tournamentId: 'T1', matchId: 'g1-1', operationId: UUID(8), schedule: PROPOSTA });
  ok('ok', r8.ok === true);
  ok('⭐ rounds[0].matches[3].schedule no documento', !!(BANCO.doc.rounds[0].matches[3].schedule && BANCO.doc.rounds[0].matches[3].schedule.options.length === 1));
  ok('  → os outros 5 jogos do documento seguem sem schedule', BANCO.doc.rounds[0].matches.filter((m) => m.schedule).length === 1);

  console.log('⑨ o que a porta recusa antes de tocar no banco');
  ok('sem login → unauthenticated', (await erroDe(CF.setMatchSchedule.run({ data: { tournamentId: 'T1', matchId: 'g1-1', operationId: UUID(9) }, auth: null, rawRequest: { headers: {} } }))).code === 'unauthenticated');
  ok('operationId que não é UUID v4 → invalid-argument', (await erroDe(chamar('uE', { tournamentId: 'T1', matchId: 'g1-1', operationId: 'abc' }))).code === 'invalid-argument');
  ok('scheduledKind inventado → invalid-argument', (await erroDe(chamar('uOrg', { tournamentId: 'T1', matchId: 'g1-1', operationId: UUID(9), scheduledKind: 'magia' }))).code === 'invalid-argument');
  ok('jogo inexistente → not-found', (await erroDe(chamar('uOrg', { tournamentId: 'T1', matchId: 'nao-existe', operationId: UUID(9) }))).code === 'not-found');

  console.log('\n' + (falhas ? '❌ ' + falhas + ' falha(s)' : '✅ propor-datas-persiste-no-dividido: OK') + '  (' + passou + ' ok)');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('✗ estourou:', e && e.stack || e); process.exit(1); });
