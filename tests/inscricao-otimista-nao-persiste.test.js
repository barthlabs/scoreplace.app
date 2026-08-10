/* O PUSH OTIMISTA DA INSCRIÇÃO NÃO PODE VIRAR INSCRITO DE VERDADE
 * node tests/inscricao-otimista-nao-persiste.test.js
 *
 * CAUSA-RAIZ ENCONTRADA EM 10/ago/2026, depois de descartar todas as outras.
 *
 * O QUE FOI MEDIDO: três pessoas (M.Delia Fernandez, Marcos Alvarez, Debora Castello)
 * estavam em `t.participants` do Confra SEM grupo e SEM folga — invisíveis na rodada,
 * nunca chamadas. Todas se inscreveram DEPOIS do sorteio, quando a regra (1.6.86) manda
 * ir pra LISTA DE ESPERA.
 *
 * O que foi ELIMINADO por medição, um a um:
 *  · inscrição manual do organizador → não: as três têm `selfEnrolled: true`;
 *  · o bug do toggle (1.7.38) → não: consertado em 05/ago, ANTES das três;
 *  · a proteção do elenco (1.7.72) → não: a única restauração múltipla do histórico
 *    devolveu gente pra `standbyParticipants`, corretamente;
 *  · a CF e o fallback do cliente → não: rodei `computeEnroll` REAL contra o doc REAL e
 *    ele devolve `waitlisted`; o fallback tem a mesma trava desde 02/ago;
 *  · promoção por formação de grupo → não: o motor só promove quem ENTROU em grupo
 *    (`if (!_agora[k]) return`), e a sequência de nomes dos 32 grupos (A…Z, A2…F2) não
 *    tem NENHUM buraco — se um grupo tivesse sido criado e perdido, a letra dele estaria
 *    queimada. Isso REFUTOU a hipótese anterior (save atrasado apagando grupo).
 *
 * O QUE SOBROU, e explica tudo: o cliente faz um PUSH OTIMISTA em `t.participants` ANTES
 * de falar com o servidor, e só o desfaz quando a resposta chega (`result.waitlisted` →
 * `t.participants = result.participants`). Se a resposta NUNCA chega — 4G caindo na
 * quadra, aba fechada, timeout — o push fica. Qualquer `saveTournament` posterior o
 * grava, e a pessoa vira "inscrita" sem nunca ter passado pela fila. Bate com a FORMA da
 * entrada (objeto do fluxo de inscrição), com `selfEnrolled`, com as datas (06–07/ago,
 * inscrição em massa) e com o fato de atingir só ALGUMAS pessoas.
 *
 * ⚠️ E o guard "o elenco nunca encolhe" (1.7.26) PROTEGE o push errado: uma vez no
 * elenco, nada mais o tira — ele não distingue inscrito de verdade de push órfão.
 *
 * A REGRA: o push otimista é da TELA. Ele nasce marcado (`_pendingEnroll`) e o ponto de
 * gravação o remove. Quem grava inscrição de verdade é a CF (ou a transação de fallback),
 * e essas devolvem o array autoritativo — que não tem a marca.
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

function mkDb(doc) {
  const st = { doc: doc };
  const ref = {
    get: async () => ({ exists: !!st.doc, data: () => JSON.parse(JSON.stringify(st.doc)) }),
    set: async (d) => { st.doc = JSON.parse(JSON.stringify(d)); }
  };
  return { _banco: () => st.doc, collection: () => ({ doc: () => ref }) };
}
const P = (uid) => ({ uid: uid, addedAt: '2026-08-01T00:00:00Z', selfEnrolled: true });

console.log('──── push otimista não persiste ────');

(async function () {

// ── (1) O CASO REAL: a resposta do servidor nunca chega ──────────────────────
{
  const banco = { id: 'T', participants: [P('u-a'), P('u-b')], rounds: [{ round: 1, matches: [{ id: 'm1' }] }] };
  const db = mkDb(banco); DB.db = db;
  // a tela empurra otimista e a rede morre; um save de OUTRA coisa acontece depois
  const local = JSON.parse(JSON.stringify(banco));
  local.participants.push(Object.assign(P('u-nova'), { _pendingEnroll: true }));
  local.venue = 'Quadra 2';
  await DB.saveTournament(local);
  const uids = (db._banco().participants || []).map((p) => p.uid);
  ok(uids.indexOf('u-nova') === -1,
     'inscrição só-otimista NÃO é gravada — era assim que alguém virava inscrito sem passar pela fila');
  ok(uids.length === 2, 'e ninguém mais é afetado');
  ok(db._banco().venue === 'Quadra 2', 'a mudança real daquele save é gravada normalmente');
}

// ── (2) A MARCA NUNCA VAZA PRO BANCO ─────────────────────────────────────────
// Campo transiente gravado é campo que alguém lê depois sem saber o que é.
{
  const banco = { id: 'T', participants: [P('u-a')] };
  const db = mkDb(banco); DB.db = db;
  const local = { id: 'T', participants: [Object.assign(P('u-a'), { _pendingEnroll: true })] };
  await DB.saveTournament(local);
  const g = db._banco().participants[0];
  ok(g && g.uid === 'u-a', 'quem JÁ ESTÁ no banco não some por causa da marca (o guard do elenco devolve)');
  ok(!('_pendingEnroll' in (g || {})), 'e a marca transiente não é persistida');
}

// ── (3) INSCRIÇÃO DE VERDADE CONTINUA ENTRANDO ───────────────────────────────
// Quem grava inscrição é a CF / a transação, e elas devolvem o array autoritativo,
// sem marca. Se isto quebrar, ninguém mais se inscreve.
{
  const banco = { id: 'T', participants: [P('u-a')] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T', participants: [P('u-a'), P('u-confirmada')] });
  const uids = (db._banco().participants || []).map((p) => p.uid).sort();
  ok(uids.indexOf('u-confirmada') !== -1, 'inscrição confirmada (sem marca) entra normalmente');
}

// ── (4) A MARCA VALE SÓ PRO ELENCO ───────────────────────────────────────────
// Quem foi pra ESPERA já é destino autoritativo do servidor — não é otimista.
{
  const banco = { id: 'T', participants: [P('u-a')], standbyParticipants: [] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T', participants: [P('u-a')],
    standbyParticipants: [P('u-fila')] });
  ok((db._banco().standbyParticipants || []).length === 1,
     'entrada na lista de espera não é afetada pela regra do otimista');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
})();
