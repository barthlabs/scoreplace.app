/* O LINK DO GRUPO DE WHATSAPP DO JOGO PERSISTE — a porta `setMatchWhatsAppGroup`
 * node tests/link-do-grupo-do-jogo-persiste.test.js
 *
 * ⛔ O BURACO QUE ISTO FECHA: `js/views/wa-group.js` gravava `m.waGroup` em MEMÓRIA e
 * persistia com `FirestoreDB.saveTournament(t)` → `.set(merge:true)` no DOCUMENTO. Num
 * torneio DIVIDIDO (`_semPesados` contém 'matches') os jogos não moram mais no documento:
 * moram na subcoleção, onde `firestore.rules` diz `allow write: if false` pro cliente.
 * O link era pintado na tela, o app dizia "Grupo salvo" — e NADA persistia. Na abertura
 * seguinte o botão "Abrir grupo" tinha sumido e ninguém sabia por quê.
 * Mesma família do buraco que a 2.0.120 fechou na inscrição.
 * [[project_dividir_exige_todo_escritor_ciente]]
 *
 * ⛔ E A ARMADILHA QUE QUASE ENTROU NO CONSERTO — medida, não suposta. O caminho "óbvio"
 * era `split-parts.gravar(tx, ref, antes, { matches: <array novo> })`. Ele resolve a parte
 * com `dividir({ matches: <array> }, ['matches'])`, e esse `dividir` só enxerga
 * `t.matches[]`: todo registro sai com `_loc = {tipo:'matches', mi}` e SEM `playerUids`,
 * enquanto os jogos do Confra moram em `rounds[ri].matches[mi]`. Duas consequências:
 *   ① o jogo alterado voltaria pro banco com o LUGAR ERRADO (sumiria da chave no remonte);
 *   ② todo jogo FORA do array passado cairia em `sumiram` e seria APAGADO.
 * Este arquivo prova as duas coisas rodando o `dividir` REAL (seção ⓪) e, depois, prova
 * que a porta que existe NÃO faz isso.
 *
 * COMO ESTA SUÍTE PROVA: ela carrega `functions/index.js` DE VERDADE (o `onCall` da v2
 * expõe `.run(request)`) e roda a CF contra um Firestore de mentira que se comporta como
 * o real — leitura antes de escrita, `update` por caminho de campo, retry da transação.
 * Nenhuma réplica da lógica: o que falha aqui falha em produção.
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
if (typeof CF.setMatchWhatsAppGroup !== 'function' || typeof CF.setMatchWhatsAppGroup.run !== 'function') {
  console.error('  ✗ setMatchWhatsAppGroup não existe (ou não é onCall) — abortando');
  process.exit(1);
}

const UUID = (n) => '00000000-0000-4000-8000-00000000000' + n;
const LINK = (s) => 'https://chat.whatsapp.com/AbCdEf' + s;

function chamar(uid, data, nome) {
  return CF.setMatchWhatsAppGroup.run({
    data: data,
    auth: { uid: uid, token: { name: nome || '', uid: uid } },
    rawRequest: { headers: {} },
    acceptsStreaming: false,
  });
}
async function erroDe(p) { try { await p; return null; } catch (e) { return e; } }

/* ═══ O TORNEIO DE TESTE ══════════════════════════════════════════════════════
 * Rei/Rainha: 1 rodada, 2 grupos de 4 pessoas → 3 jogos por grupo. É a forma do Confra,
 * e é a única em que o espelho existe. Os jogos moram em `rounds[0].matches` — a morada
 * que a armadilha do `dividir({matches:…})` não sabe reproduzir. */
const P = (u) => ({ uid: u });
function torneio() {
  const g = (gi, n, a, b2, c, d) => ({
    id: 'g' + gi + '-' + n, isMonarch: true, round: 1, monarchGroup: gi, phaseIndex: 0,
    p1: 'dupla ' + a + '/' + b2, p2: 'dupla ' + c + '/' + d,
    team1Uids: [a, b2], team2Uids: [c, d],
    team1: [a, b2], team2: [c, d],
  });
  return {
    id: 'T1', name: 'Copa de Teste', creatorUid: 'uOrg',
    adminUids: ['uAdm'],
    coHosts: [{ uid: 'uCo', status: 'active' }, { uid: 'uPend', status: 'pending' }],
    participants: ['uA', 'uB', 'uC', 'uD', 'uE', 'uF', 'uG', 'uH'].map(P),
    rounds: [{
      round: 1, format: 'rei_rainha', status: 'active',
      monarchGroups: [{ name: 'R1 Grupo A' }, { name: 'R1 Grupo B' }],
      matches: [
        g(0, 1, 'uA', 'uB', 'uC', 'uD'), g(0, 2, 'uA', 'uC', 'uB', 'uD'), g(0, 3, 'uA', 'uD', 'uB', 'uC'),
        g(1, 1, 'uE', 'uF', 'uG', 'uH'), g(1, 2, 'uE', 'uG', 'uF', 'uH'), g(1, 3, 'uE', 'uH', 'uF', 'uG'),
      ],
    }],
  };
}
const USERS = { uA: { displayName: 'Ana' }, uOrg: { displayName: 'Olga' }, uAdm: { displayName: 'Adão' }, uCo: { displayName: 'Cora' }, uZ: { displayName: 'Zé de fora' } };

/* O torneio DIVIDIDO como fica no banco: doc sem os jogos, subcoleção `matches` com um
 * registro por jogo. `playerUids` é INJETADO — no navegador quem o produz é
 * `window._matchPlayerUids`, que não existe em node; o banco real TEM o campo, e é
 * justamente ele que a gravação não pode derrubar. */
function bancoDividido() {
  const t = torneio();
  const p = S.dividir(clone(t), ['matches']);
  const subs = { matches: {} };
  p.matches.forEach((r) => {
    r.playerUids = (r.jogo.team1Uids || []).concat(r.jogo.team2Uids || []);
    subs.matches[S.chaveDoRegistro(r)] = r;
  });
  const doc = Object.assign(p.config, { _semPesados: ['matches'], _nJogos: p.matches.length, updatedAt: '2026-09-01T00:00:00.000Z' });
  return bancoDeMentira('T1', doc, subs, USERS);
}
function bancoInteiro() {
  const t = torneio();
  t.updatedAt = '2026-09-01T00:00:00.000Z';
  return bancoDeMentira('T1', t, {}, USERS);
}
const regDe = (b, id) => b.subs.matches[id];
const jogoDoDoc = (b, id) => (b.doc.rounds[0].matches || []).find((m) => m && m.id === id);

(async () => {
  console.log('──── o link do grupo do jogo persiste ────');

  // ═══ ⓪ A ARMADILHA, PROVADA NO CÓDIGO REAL ═════════════════════════════════
  console.log('\n⓪ por que NÃO se grava com `gravar(tx, ref, antes, { matches: … })`');
  {
    const t = torneio();
    const pAntes = S.dividir(clone(t), ['matches']);
    const soUm = [Object.assign(clone(t.rounds[0].matches[0]), { waGroup: { link: LINK('X') } })];
    const depois = S.dividir({ matches: soUm }, ['matches']);
    ok('⛔ `dividir({matches: array})` carimba o LUGAR ERRADO (tipo "matches", não "rounds")',
      depois.matches[0]._loc.tipo === 'matches' && pAntes.matches[0]._loc.tipo === 'rounds',
      'antes: ' + JSON.stringify(pAntes.matches[0]._loc) + ' · depois: ' + JSON.stringify(depois.matches[0]._loc));
    const d = S.jogosQueMudaram(pAntes.matches, depois.matches);
    ok('⛔ e os outros 5 jogos entrariam em `sumiram` — seriam APAGADOS',
      d.sumiram.length === 5, 'sumiram: ' + d.sumiram.length);
    ok('  → é por isso que a porta escreve por CAMINHO DE CAMPO, não por diff de array', true);
  }

  /* ⓪b E POR QUE A LEITURA É `montarDoBanco`, NÃO `_splitParts.hidratar`.
   * `hidratar` remonta cada parte ISOLADA — `remontar({config:{matches:[]}, matches: regs})`
   * — e o jogo que mora em `rounds[ri].matches[mi]` só volta pro lugar se o config que
   * entra no remonte TIVER as rodadas. Sem elas o remonte descarta o registro em SILÊNCIO.
   * Nas outras portas isso nunca mordeu porque nenhuma delas lê jogo; aqui o jogo É o
   * assunto, e um leitor que devolve zero jogo faz a porta responder "not-found" pra um
   * jogo que existe. */
  console.log('\n⓪b e por que a leitura é `montarDoBanco`, não `hidratar`');
  {
    const SP = require(path.join(ROOT, 'functions', 'split-parts.js'));
    const t = torneio(); t._semPesados = ['matches'];
    const p = S.dividir(clone(t), ['matches']);
    const cfg = Object.assign(p.config, { _semPesados: ['matches'] });
    const regs = p.matches;
    const txFalso = { get: async () => ({ docs: regs.map((r) => ({ id: S.chaveDoRegistro(r), data: () => r })) }) };
    const refFalso = { collection: () => ({}) };
    const viaHidratar = await SP.hidratar(txFalso, refFalso, clone(cfg));
    ok('⛔ `hidratar` devolve o torneio com ZERO jogos (rounds[0].matches vazio)',
      (viaHidratar.rounds[0].matches || []).length === 0,
      'MEDIDO: ' + JSON.stringify(viaHidratar.rounds[0].matches));
    const viaMontar = await S.montarDoBanco(clone(cfg), async () => regs);
    ok('⭐ `montarDoBanco` devolve os 6 jogos no lugar certo — é ele que a porta usa',
      (viaMontar.rounds[0].matches || []).length === 6);
  }

  // ═══ ① CRIAR / TROCAR / REMOVER em torneio DIVIDIDO ════════════════════════
  console.log('\n① criar, trocar e remover — torneio DIVIDIDO (jogos na subcoleção)');
  {
    BANCO = bancoDividido();
    const antesDoJogo = clone(regDe(BANCO, 'g0-1'));
    const r1 = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⭐ criar: a CF confirma o estado gravado', !!(r1 && r1.ok && r1.waGroup && r1.waGroup.link === LINK('1')));
    const reg = regDe(BANCO, 'g0-1');
    ok('⭐ e o link está na SUBCOLEÇÃO (era isto que não persistia)', reg.jogo.waGroup.link === LINK('1'));
    ok('  → com byUid do CHAMADOR e byName do PERFIL, não do payload',
      reg.jogo.waGroup.byUid === 'uA' && reg.jogo.waGroup.byName === 'Ana');
    ok('  → e com o opId, que é o que sustenta a idempotência', reg.jogo.waGroup.opId === UUID(1));

    ok('⛔ `_chave` intacta', reg._chave === antesDoJogo._chave);
    ok('⛔ `_loc` intacto (tipo/ri/mi) — sem ele o remonte perde o jogo',
      JSON.stringify(reg._loc) === JSON.stringify(antesDoJogo._loc), JSON.stringify(reg._loc));
    ok('⛔ `playerUids` intacto — é o insumo da regra por jogo',
      JSON.stringify(reg.playerUids) === JSON.stringify(antesDoJogo.playerUids), JSON.stringify(reg.playerUids));
    const semWa = clone(reg.jogo); delete semWa.waGroup;
    ok('⛔ e TODO o resto do jogo intacto (só `waGroup` entrou)',
      JSON.stringify(semWa) === JSON.stringify(antesDoJogo.jogo));
    ok('⛔ o documento NÃO recebeu os jogos de volta',
      (BANCO.doc.rounds[0].matches || []).length === 0);
    ok('⭐ mas o documento FOI TOCADO (`updatedAt`) — senão nenhum onSnapshot dispara',
      BANCO.doc.updatedAt !== '2026-09-01T00:00:00.000Z');
    ok('⛔ nenhuma leitura depois de escrita (a transação proíbe)', !BANCO.leuDepoisDeEscrever);

    const r2 = await chamar('uB', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('2'), operationId: UUID(2) }, 'Bia');
    ok('⭐ trocar: o outro jogador do confronto substitui o link',
      regDe(BANCO, 'g0-1').jogo.waGroup.link === LINK('2') && r2.waGroup.byUid === 'uB');
    ok('  → e `playerUids`/`_loc` seguem intactos depois da troca',
      JSON.stringify(regDe(BANCO, 'g0-1').playerUids) === JSON.stringify(antesDoJogo.playerUids) &&
      JSON.stringify(regDe(BANCO, 'g0-1')._loc) === JSON.stringify(antesDoJogo._loc));

    const r3 = await chamar('uB', { tournamentId: 'T1', matchId: 'g0-1', link: null, operationId: UUID(3) });
    ok('⭐ remover: `link: null` APAGA o campo', r3.waGroup === null && !('waGroup' in regDe(BANCO, 'g0-1').jogo));
    const semWa2 = clone(regDe(BANCO, 'g0-1'));
    ok('  → e o registro volta a ser byte a byte o que era antes de tudo',
      JSON.stringify(semWa2) === JSON.stringify(antesDoJogo),
      JSON.stringify(semWa2));
  }

  // ═══ ② o mesmo, com o torneio INTEIRO no documento ═════════════════════════
  console.log('\n② criar, trocar e remover — torneio NÃO dividido (jogos no documento)');
  {
    BANCO = bancoInteiro();
    const antes = clone(jogoDoDoc(BANCO, 'g0-1'));
    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⭐ o link vai pro jogo DENTRO do documento', jogoDoDoc(BANCO, 'g0-1').waGroup.link === LINK('1'));
    const cru = clone(jogoDoDoc(BANCO, 'g0-1')); delete cru.waGroup;
    ok('  → e o jogo continua idêntico no resto', JSON.stringify(cru) === JSON.stringify(antes));
    ok('  → os outros 5 jogos ficaram exatamente como estavam',
      (BANCO.doc.rounds[0].matches || []).filter((m) => m.waGroup).length === 3,
      'só o portador + os 2 irmãos do grupo podem ter link');
    ok('  → e nenhuma subcoleção foi criada', Object.keys(BANCO.subs).length === 0);

    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('9'), operationId: UUID(2) });
    ok('⭐ trocar no documento também funciona', jogoDoDoc(BANCO, 'g0-1').waGroup.link === LINK('9'));
    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: null, operationId: UUID(3) });
    ok('⭐ e remover devolve o jogo ao estado original',
      JSON.stringify(jogoDoDoc(BANCO, 'g0-1')) === JSON.stringify(antes));
  }

  /* ═══ ②b O CASO MISTO — jogo no DOCUMENTO, outra parte na SUBCOLEÇÃO ═════════
   * ⛔ É AQUI QUE ESTE PROJETO JÁ PERDEU PARTE QUATRO VEZES: pra gravar o jogo é preciso
   * reescrever o CAMPO DE TOPO que o contém (`rounds`) — array aninhado não tem caminho de
   * campo no Firestore. Se esse `rounds` sair do torneio HIDRATADO, ele leva junto o que
   * mora FORA (os `monarchGroups`, o elenco) e devolve tudo pro documento: duas verdades
   * pro mesmo dado, e o documento voltando a crescer sem teto.
   * ⇒ A porta escreve o que `dividir(t, _semPesados)` deixou no `config`, nunca o `t`.
   * [[project_grupo_e_documento_e_dividir_seletivo]] */
  console.log('\n②b caso misto: o jogo está no documento, mas OUTRA parte mora fora');
  {
    // (a) dividido em `participants`: o elenco não pode voltar pro documento
    const t = torneio();
    const p = S.dividir(clone(t), ['participants']);
    const subs = { inscritos: {} };
    p.participants.forEach((r) => { subs.inscritos[S.chaveDoRegistro(r)] = r; });
    BANCO = bancoDeMentira('T1', Object.assign(p.config, { _semPesados: ['participants'], updatedAt: 'x' }), subs, USERS);
    ok('o documento começa com o elenco VAZIO (é o que significa estar dividido)',
      (BANCO.doc.participants || []).length === 0);
    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⭐ o link foi gravado no jogo, dentro do documento', jogoDoDoc(BANCO, 'g0-1').waGroup.link === LINK('1'));
    ok('⛔ e o ELENCO continua vazio no documento — não voltou pra dentro',
      (BANCO.doc.participants || []).length === 0, JSON.stringify(BANCO.doc.participants));
    ok('  → e a subcoleção `inscritos` não foi tocada', Object.keys(BANCO.subs.inscritos).length === 8);

    // (b) dividido em `grupos`: os monarchGroups moram DENTRO de `rounds`, que é o campo
    // que esta gravação reescreve. É o caso mais fácil de estragar.
    const t2 = torneio();
    const p2 = S.dividir(clone(t2), ['grupos']);
    const subs2 = { grupos: {} };
    p2.grupos.forEach((r) => { subs2.grupos[S.chaveDoRegistro(r)] = r; });
    BANCO = bancoDeMentira('T1', Object.assign(p2.config, { _semPesados: ['grupos'], _nGrupos: p2.grupos.length, updatedAt: 'x' }), subs2, USERS);
    ok('o documento começa com `monarchGroups` VAZIO', (BANCO.doc.rounds[0].monarchGroups || []).length === 0);
    ok('e os 2 grupos estão na subcoleção', Object.keys(BANCO.subs.grupos).length === 2);
    // ⚠️ A ARMADILHA, tornada visível: o torneio MONTADO tem os grupos de volta dentro de
    // `rounds`. Gravar `rounds` a partir DELE devolveria os 2 grupos pro documento — este
    // teste só distingue as duas implementações porque a diferença é medível aqui.
    const montado = await S.montarDoBanco(clone(BANCO.doc), async () => p2.grupos);
    ok('  ⚠️ e o torneio MONTADO tem os 2 grupos dentro de `rounds` (é o que não pode voltar)',
      (montado.rounds[0].monarchGroups || []).length === 2);
    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⭐ o link foi gravado no jogo', jogoDoDoc(BANCO, 'g0-1').waGroup.link === LINK('1'));
    ok('⛔ e os GRUPOS não voltaram pro documento junto com `rounds`',
      (BANCO.doc.rounds[0].monarchGroups || []).length === 0,
      'MEDIDO: ' + JSON.stringify(BANCO.doc.rounds[0].monarchGroups));
    ok('  → e a subcoleção `grupos` seguiu intacta', Object.keys(BANCO.subs.grupos).length === 2);
    ok('  → e o espelho Rei/Rainha continuou funcionando no caso misto',
      !!jogoDoDoc(BANCO, 'g0-2').waGroup && jogoDoDoc(BANCO, 'g0-2').waGroup.link === LINK('1'));
  }

  // ═══ ③ QUEM PODE ═══════════════════════════════════════════════════════════
  console.log('\n③ quem pode mexer no grupo (por UID, nunca por nome)');
  {
    for (const [uid, rot] of [['uA', 'jogador do confronto'], ['uOrg', 'organizador'], ['uAdm', 'admin do torneio'], ['uCo', 'co-organizador ATIVO']]) {
      BANCO = bancoDividido();
      const e = await erroDe(chamar(uid, { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) }));
      ok('⭐ ' + rot + ' PODE', !e && regDe(BANCO, 'g0-1').jogo.waGroup.link === LINK('1'), e && e.message);
    }
    for (const [uid, rot] of [['uZ', 'quem não é nada no torneio'], ['uE', 'jogador de OUTRO grupo'], ['uPend', 'co-organizador só CONVIDADO']]) {
      BANCO = bancoDividido();
      const e = await erroDe(chamar(uid, { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) }));
      ok('⛔ ' + rot + ' é NEGADO', !!e && e.code === 'permission-denied', e && (e.code + ' ' + e.message));
      ok('  → e nada foi gravado', !regDe(BANCO, 'g0-1').jogo.waGroup);
    }
    BANCO = bancoDividido();
    const eSemLogin = await erroDe(CF.setMatchWhatsAppGroup.run({ data: { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) }, auth: null, rawRequest: { headers: {} } }));
    ok('⛔ sem login, nem chega a ler o torneio', !!eSemLogin && eSemLogin.code === 'unauthenticated');
  }

  // ═══ ④ o que a porta RECUSA ════════════════════════════════════════════════
  console.log('\n④ o que a porta recusa antes de tocar no banco');
  {
    BANCO = bancoDividido();
    const casos = [
      ['jogo que não existe', { tournamentId: 'T1', matchId: 'nao-existe', link: LINK('1'), operationId: UUID(1) }, 'not-found'],
      ['sem matchId', { tournamentId: 'T1', matchId: '', link: LINK('1'), operationId: UUID(1) }, 'invalid-argument'],
      ['sem tournamentId', { tournamentId: '', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) }, 'invalid-argument'],
      ['operationId ausente', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1') }, 'invalid-argument'],
      ['operationId que não é UUID v4', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: 'op-1' }, 'invalid-argument'],
      ['UUID v1 (versão errada)', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: '00000000-0000-1000-8000-000000000001' }, 'invalid-argument'],
      ['UUID v4 com variante errada', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: '00000000-0000-4000-0000-000000000001' }, 'invalid-argument'],
      ['link de outro domínio', { tournamentId: 'T1', matchId: 'g0-1', link: 'https://chat.whatsapp.evil.com/AbCdEfGh', operationId: UUID(1) }, 'invalid-argument'],
      ['link http (sem TLS)', { tournamentId: 'T1', matchId: 'g0-1', link: 'http://chat.whatsapp.com/AbCdEfGh', operationId: UUID(1) }, 'invalid-argument'],
      ['wa.me (conversa 1:1, não é grupo)', { tournamentId: 'T1', matchId: 'g0-1', link: 'https://wa.me/5511999998888', operationId: UUID(1) }, 'invalid-argument'],
      ['código curto demais', { tournamentId: 'T1', matchId: 'g0-1', link: 'https://chat.whatsapp.com/abc', operationId: UUID(1) }, 'invalid-argument'],
    ];
    for (const [rot, data, code] of casos) {
      const e = await erroDe(chamar('uA', data));
      ok('⛔ ' + rot + ' → ' + code, !!e && e.code === code, e ? (e.code + ': ' + e.message) : 'não recusou');
    }
    ok('  → e o banco continua limpo depois de todas as recusas',
      Object.keys(BANCO.subs.matches).every((k) => !BANCO.subs.matches[k].jogo.waGroup));

    BANCO = bancoSemTorneio();
    const eT = await erroDe(chamar('uA', { tournamentId: 'X', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) }));
    ok('⛔ torneio que não existe → not-found', !!eT && eT.code === 'not-found', eT && eT.code);

    BANCO = bancoDividido();
    const rColado = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', operationId: UUID(4), link: 'Entre no meu grupo de WhatsApp: ' + LINK('1') + '\nvia WhatsApp' });
    ok('⭐ MAS a colagem do "Compartilhar" (texto em volta) é ACEITA e normalizada',
      rColado.waGroup.link === LINK('1'),
      'recusar seria bug de UX: a pessoa não distingue "Copiar" de "Compartilhar" no WhatsApp');
  }

  // ═══ ⑤ IDEMPOTÊNCIA — o retry da quadra sem sinal ══════════════════════════
  console.log('\n⑤ idempotência: o retry com o MESMO operationId não grava de novo');
  {
    BANCO = bancoDividido();
    const r1 = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    const gravado = clone(regDe(BANCO, 'g0-1'));
    const docDepois = BANCO.doc.updatedAt;
    const r2 = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⭐ o retry devolve o estado atual e diz que JÁ estava aplicado', r2.jaAplicado === true && r2.waGroup.at === r1.waGroup.at);
    ok('⛔ e NÃO reescreve nada — nem o `at`, nem o `updatedAt` do documento',
      JSON.stringify(regDe(BANCO, 'g0-1')) === JSON.stringify(gravado) && BANCO.doc.updatedAt === docDepois);

    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: null, operationId: UUID(5) });
    const r3 = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: null, operationId: UUID(5) });
    ok('⭐ apagar duas vezes também é idempotente (o 2º é no-op)', r3.jaAplicado === true && r3.waGroup === null);

    const r4 = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('7'), operationId: UUID(6) });
    ok('⭐ mas operationId NOVO grava normalmente (não é trava, é reconhecimento de retry)',
      r4.jaAplicado === false && regDe(BANCO, 'g0-1').jogo.waGroup.link === LINK('7'));
  }

  // ═══ ⑥ CONCORRÊNCIA ═══════════════════════════════════════════════════════
  console.log('\n⑥ dois salvando ao mesmo tempo');
  {
    // (a) sequencial: quem chega depois DECIDE sobre o dado fresco, não sobre o que leu antes
    BANCO = bancoDividido();
    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('A'), operationId: UUID(1) }, 'Ana');
    await chamar('uB', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('B'), operationId: UUID(2) }, 'Bia');
    ok('⭐ o segundo substitui o primeiro, inteiro (link E autoria)',
      regDe(BANCO, 'g0-1').jogo.waGroup.link === LINK('B') && regDe(BANCO, 'g0-1').jogo.waGroup.byUid === 'uB');

    // (b) o outro escritor commita DEPOIS da leitura: o Firestore aborta e RE-EXECUTA.
    BANCO = bancoDividido();
    BANCO.conflitoUmaVez = function (b) {
      const r = b.subs.matches['g0-1'];
      r.jogo.waGroup = { link: LINK('C'), byUid: 'uC', byName: 'Carla', at: 1, opId: UUID(9) };
    };
    const rr = await chamar('uD', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('D'), operationId: UUID(3) }, 'Dora');
    ok('⭐ a transação foi RE-EXECUTADA (o outro escritor entrou no meio)', BANCO.tentativas === 2, 'tentativas: ' + BANCO.tentativas);
    ok('⭐ e a decisão saiu do dado FRESCO — o link do uD venceu, sem apagar o registro',
      rr.waGroup.link === LINK('D') && regDe(BANCO, 'g0-1').jogo.waGroup.byUid === 'uD');
    ok('  → e `playerUids`/`_loc` sobreviveram à corrida',
      !!regDe(BANCO, 'g0-1').playerUids && regDe(BANCO, 'g0-1')._loc.tipo === 'rounds');

    // (c) o MESMO opId chegando duas vezes por caminhos diferentes (o retry que se cruza)
    BANCO = bancoDividido();
    BANCO.conflitoUmaVez = function (b) {
      const r = b.subs.matches['g0-1'];
      r.jogo.waGroup = { link: LINK('E'), byUid: 'uA', byName: 'Ana', at: 7, opId: UUID(4) };
    };
    const rDupla = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('E'), operationId: UUID(4) });
    ok('⛔ retry que se cruza com a própria gravação NÃO duplica: reconhece o opId e para',
      rDupla.jaAplicado === true && regDe(BANCO, 'g0-1').jogo.waGroup.at === 7);
  }

  // ═══ ⑦ REI/RAINHA: o espelho leva SÓ o link ════════════════════════════════
  console.log('\n⑦ Rei/Rainha: um grupo de WhatsApp para os 3 jogos, e só o LINK viaja');
  {
    BANCO = bancoDividido();
    const r = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⭐ os 2 irmãos do grupo foram espelhados', r.espelhados.slice().sort().join(',') === 'g0-2,g0-3', JSON.stringify(r.espelhados));
    const irmao = regDe(BANCO, 'g0-2').jogo.waGroup;
    ok('⭐ e o irmão recebeu SÓ o link — nada de byUid/byName/at/opId',
      JSON.stringify(irmao) === JSON.stringify({ link: LINK('1') }), JSON.stringify(irmao),
      'medido no Confra: o objeto inteiro triplicado dava 13 KB, sendo o link 21% deles');
    ok('⛔ o registro do portador é o ÚNICO com autoria', !!regDe(BANCO, 'g0-1').jogo.waGroup.byUid);
    ok('⛔ o OUTRO grupo continua sem link nenhum (o bug da Raquel × Catia)',
      ['g1-1', 'g1-2', 'g1-3'].every((id) => !regDe(BANCO, id).jogo.waGroup));
    ok('  → e os irmãos preservaram `_loc`/`playerUids`',
      ['g0-2', 'g0-3'].every((id) => regDe(BANCO, id)._loc.tipo === 'rounds' && (regDe(BANCO, id).playerUids || []).length === 4));

    await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: null, operationId: UUID(2) });
    ok('⭐ apagar TAMBÉM espelha — senão sobra link morto nos irmãos',
      ['g0-1', 'g0-2', 'g0-3'].every((id) => !regDe(BANCO, id).jogo.waGroup));

    // jogo comum (não monarca) NÃO espelha
    BANCO = bancoDividido();
    Object.keys(BANCO.subs.matches).forEach((k) => { delete BANCO.subs.matches[k].jogo.isMonarch; });
    const rn = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⛔ jogo que NÃO é Rei/Rainha não espelha em ninguém',
      rn.espelhados.length === 0 && !regDe(BANCO, 'g0-2').jogo.waGroup);

    // trava de sanidade: "grupo" com mais de 3 jogos é bug de agrupamento — não espalha
    BANCO = bancoDividido();
    Object.keys(BANCO.subs.matches).forEach((k) => { BANCO.subs.matches[k].jogo.monarchGroup = 0; });
    const rs = await chamar('uA', { tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1) });
    ok('⛔ agrupamento com mais de 3 jogos é RECUSADO (na dúvida, não espalha)',
      rs.espelhados.length === 0 && ['g0-2', 'g0-3', 'g1-1'].every((id) => !regDe(BANCO, id).jogo.waGroup));
  }

  // ═══ ⑧ O QUE A PORTA NÃO PODE MEXER ═══════════════════════════════════════
  console.log('\n⑧ a porta só sabe escrever `jogo.waGroup`');
  {
    BANCO = bancoDividido();
    const antesTudo = clone(BANCO.subs.matches);
    const docAntes = clone(BANCO.doc);
    await chamar('uA', {
      tournamentId: 'T1', matchId: 'g0-1', link: LINK('1'), operationId: UUID(1),
      // ⛔ payload hostil: campos que a porta NÃO declara. Se algum deles vazasse pro
      // banco, esta porta viraria uma porta de escrita geral no torneio.
      winner: 'A', scoreP1: 6, schedule: { options: ['x'] }, playerUids: ['uZ'],
      participants: [], rounds: [], byUid: 'uZ', byName: 'Impostor', at: 1, opId: 'x',
      waGroup: { link: LINK('9'), byUid: 'uZ' },
    }, 'Ana');
    const depois = BANCO.subs.matches;
    const so = (r) => { const c = clone(r); delete c.jogo.waGroup; return c; };
    ok('⛔ nenhum outro campo do jogo mudou',
      Object.keys(antesTudo).every((k) => JSON.stringify(so(depois[k])) === JSON.stringify(so(antesTudo[k]))));
    ok('⛔ `playerUids` não aceitou o do payload', JSON.stringify(depois['g0-1'].playerUids) !== JSON.stringify(['uZ']));
    ok('⛔ o `waGroup` gravado é o que a CF montou, não o do payload',
      depois['g0-1'].jogo.waGroup.link === LINK('1') && depois['g0-1'].jogo.waGroup.byUid === 'uA' &&
      depois['g0-1'].jogo.waGroup.byName === 'Ana');
    const dA = clone(docAntes), dD = clone(BANCO.doc);
    delete dA.updatedAt; delete dD.updatedAt;
    ok('⛔ e no DOCUMENTO só o `updatedAt` andou', JSON.stringify(dA) === JSON.stringify(dD));
  }

  console.log('\n' + (falhas === 0 ? '✅ link-do-grupo-do-jogo-persiste: ' + passou + ' ok' : '❌ ' + falhas + ' falha(s) em ' + (passou + falhas)));
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('EXPLODIU:', e); process.exit(1); });
