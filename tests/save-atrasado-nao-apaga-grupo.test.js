/* O SAVE ATRASADO NÃO APAGA GRUPO FORMADO, NEM REGISTRO DE AVISO JÁ ENVIADO
 *
 * VARREDURA, não incidente. Depois de fechar o save atrasado nas 4 estruturas do W.O.
 * (1.7.95), o dono cortou: _"tem mais algum buraco que deveria estar fechado e vc vai
 * esperar dar merda pra fechar, ou já confere e fecha já?"_ — então a auditoria passou a
 * ser do DOC INTEIRO: para cada lista/mapa do torneio, "isto pode encolher num save
 * atrasado, e está guardado?".
 *
 * O que a varredura achou (e este teste trava):
 *
 * (1) `monarchGroups` — O GRUPO EM SI. O guard protegia rodada (b1) e jogo (b2), e a
 *     única menção a `monarchGroups` no arquivo era um COMENTÁRIO. Consequência medida no
 *     Confra: a formação por espera promove as 4 pessoas pro elenco e as tira da fila; um
 *     save atrasado devolvia `rounds` sem o grupo — e como `participants` NÃO encolhe
 *     (guard de 1.7.26), a promoção sobrevivia e o grupo não. Resultado: gente no elenco,
 *     fora de qualquer grupo, INVISÍVEL na rodada. Foi exatamente o estado de M.Delia
 *     Fernandez, Marcos Alvarez e Debora Castello, achado em 10/ago.
 *     ⚠️ Metade da operação persistindo é pior que nenhuma: nenhum caminho do app produz
 *     esse estado, então nada o conserta sozinho.
 *
 * (2) `remindersSent` e (3) `categoryNotifications` — REGISTROS DE "JÁ AVISEI". Varridos:
 *     **nada no app os remove** (categoryNotifications só tem `push`; remindersSent é
 *     escrito pela CF de lembrete e lido pra dedup). Sumir = re-notificar todo mundo.
 *     No doc real são 82 avisos de categoria e 3 janelas de lembrete — perder isso é
 *     spam garantido em cima de 133 pessoas. Mesma classe de `woClaims`/`polls` (1.7.34).
 *
 * NÃO entraram de propósito: `adminUids`/`adminEmails`/`memberUids` (RECOMPUTADOS a cada
 * save), `standings` (derivado dos resultados) e a configuração do organizador
 * (`scoring`, `tiebreakers`, `fmt2`…) — essa é SUBSTITUÍDA de propósito ao editar, e
 * guardá-la impediria o organizador de mudar a própria configuração.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.navigator = { userAgent: 'node' };
sandbox.document = { getElementById: () => null, addEventListener() {} };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
sandbox._participantUids = (p) => {
  if (!p || typeof p !== 'object') return [];
  return [p.uid, p.p1Uid, p.p2Uid].filter(Boolean);
};
sandbox._mergeMemberUids = (t, prev, next) => Array.from(new Set([].concat(prev || [], next || [])));
sandbox._stripStoredNamesForUidEntries = (a) => a;
sandbox.firebase = { firestore: Object.assign(() => ({}), { FieldValue: { delete: () => '__del__' } }) };

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8'),
  sandbox, { filename: 'firebase-db.js' });
const DB = sandbox.FirestoreDB;
DB._computeAdminEmails = () => [];
DB._computeAdminUids   = () => [];
DB._computeMemberUids  = (d) => (d.participants || []).flatMap(sandbox._participantUids);
DB._foldMonarchGroups  = () => {};
DB._cleanUndefined     = (d) => JSON.parse(JSON.stringify(d));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── save atrasado não apaga grupo nem registro de aviso ────');

function mkDb(doc) {
  const st = { doc: doc };
  const ref = {
    get: async () => ({ exists: !!st.doc, data: () => JSON.parse(JSON.stringify(st.doc)) }),
    set: async (d) => { st.doc = JSON.parse(JSON.stringify(d)); }
  };
  return { _banco: () => st.doc, collection: () => ({ doc: () => ref }) };
}
const P = (uid) => ({ uid: uid, addedAt: '2026-08-01T00:00:00Z' });
const G = (idx, uids) => ({ groupIdx: idx, name: 'R1 Grupo ' + idx,
  players: uids.map((u) => 'N-' + u), playersUids: uids.slice(), matchIds: ['m' + idx + 'a'] });

(async function () {

// ── (1) O CASO REAL: grupo formado da espera × save atrasado ─────────────────
{
  const banco = { id: 'T', rosterRev: 2,
    participants: [P('u1'), P('u2'), P('u3'), P('u4'), P('u5')],
    standbyParticipants: [],
    rounds: [{ round: 1,
      monarchGroups: [G(0, ['u1', 'u2', 'u3', 'u4']), G(1, ['u5', 'u6', 'u7', 'u8'])],
      matches: [{ id: 'm0a', monarchGroup: 0 }, { id: 'm1a', monarchGroup: 1 }] }] };
  const db = mkDb(banco); DB.db = db;
  // cópia velha: lida ANTES da formação do grupo 1 (só tem o grupo 0)
  const stale = { id: 'T', rosterRev: 1,
    participants: [P('u1'), P('u2'), P('u3'), P('u4'), P('u5')],
    standbyParticipants: [],
    rounds: [{ round: 1, monarchGroups: [G(0, ['u1', 'u2', 'u3', 'u4'])],
      matches: [{ id: 'm0a', monarchGroup: 0 }, { id: 'm1a', monarchGroup: 1 }] }] };
  await DB.saveTournament(stale);
  const gs = db._banco().rounds[0].monarchGroups;
  ok(gs.length === 2, 'o GRUPO formado sobrevive ao save atrasado (era o buraco: só rodada e jogo tinham guard)');
  ok(gs.some((g) => g.groupIdx === 1 && (g.playersUids || []).includes('u5')),
     'e volta com o elenco dele — é de `monarchGroups[].players` que sai a CLASSIFICAÇÃO');
}

// ── (2) RE-SORTEIO CONTINUA LIVRE — o guard não pode travar o motor ─────────
// O motor reescrevendo traz jogo com id NOVO; é o mesmo sinal que os guards de
// 1.7.32/1.7.34 já usam pra sair de cena. Sem isto, sortear de novo ficaria impossível.
{
  const banco = { id: 'T', participants: [P('u1')],
    rounds: [{ round: 1, monarchGroups: [G(0, ['u1', 'u2', 'u3', 'u4']), G(1, ['u5', 'u6', 'u7', 'u8'])],
      matches: [{ id: 'm0a' }, { id: 'm1a' }] }] };
  const db = mkDb(banco); DB.db = db;
  const resorteio = { id: 'T', participants: [P('u1')],
    rounds: [{ round: 1, monarchGroups: [G(9, ['u1', 'u5', 'u3', 'u7'])],
      matches: [{ id: 'NOVO-1' }] }] };
  await DB.saveTournament(resorteio);
  const gs = db._banco().rounds[0].monarchGroups;
  ok(gs.length === 1 && gs[0].groupIdx === 9,
     're-sorteio (jogo com id novo) reescreve os grupos — o guard sai de cena');
}

// ── (3) ZERAR A RODADA CONTINUA LIVRE (reset declarado pela FORMA) ──────────
{
  const banco = { id: 'T', participants: [P('u1')],
    rounds: [{ round: 1, monarchGroups: [G(0, ['u1', 'u2', 'u3', 'u4'])], matches: [{ id: 'm0a' }] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T', participants: [P('u1')], rounds: [] });
  ok((db._banco().rounds || []).length === 0, 'reset (rounds: []) continua zerando — N→0 é declarado');
}

// ── (4) REGISTRO DE AVISO JÁ ENVIADO NÃO SOME ──────────────────────────────
// Perder isto não some com dado: RE-NOTIFICA. No doc real do Confra são 82 avisos de
// categoria sobre 133 pessoas.
{
  const banco = { id: 'T', participants: [P('u1')],
    categoryNotifications: [{ uid: 'u1', cat: 'A' }, { uid: 'u2', cat: 'B' }],
    remindersSent: { r7d: true, r2d: true } };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T', participants: [P('u1')] });   // save velho: sem os dois
  const b = db._banco();
  ok((b.categoryNotifications || []).length === 2,
     'categoryNotifications sobrevive — perder = re-avisar todo mundo de categoria');
  ok(b.remindersSent && b.remindersSent.r7d && b.remindersSent.r2d,
     'remindersSent sobrevive — perder = re-disparar lembrete do torneio');
}

// ── (5) ACRESCENTAR AVISO NOVO CONTINUA FUNCIONANDO ────────────────────────
{
  const banco = { id: 'T', participants: [P('u1')],
    categoryNotifications: [{ uid: 'u1', cat: 'A' }], remindersSent: { r7d: true } };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T', participants: [P('u1')],
    categoryNotifications: [{ uid: 'u1', cat: 'A' }, { uid: 'u9', cat: 'C' }],
    remindersSent: { r7d: true, r2d: true } });
  const b = db._banco();
  ok((b.categoryNotifications || []).length === 2, 'aviso NOVO entra normalmente (o guard só impede PERDER)');
  ok(b.remindersSent.r2d === true, 'janela de lembrete nova entra normalmente');
}

// ── (6) CONFIGURAÇÃO DO ORGANIZADOR NÃO É CONGELADA ────────────────────────
// Guardar `scoring`/`tiebreakers` impediria o organizador de MUDAR a própria config —
// esses campos são substituídos de propósito ao editar o torneio.
{
  const banco = { id: 'T', participants: [P('u1')], tiebreakers: ['a', 'b', 'c'] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T', participants: [P('u1')], tiebreakers: ['x'] });
  ok((db._banco().tiebreakers || []).length === 1,
     'config do organizador (tiebreakers) continua editável — não é registro, é escolha');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
})();
