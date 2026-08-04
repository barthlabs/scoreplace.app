/* O ELENCO NUNCA ENCOLHE POR ACIDENTE — trava do guard em FirestoreDB.saveTournament.
 *
 * INCIDENTE REAL QUE ESTE TESTE REPRODUZ (Confra BT Alta da Clínica 2026, 02/ago/2026):
 * o Gersom se inscreveu em 01/08 18:34 (notificação ao organizador), recebeu o lembrete
 * das 09:00 do dia seguinte — e a CF do lembrete itera `t.participants` NO SERVIDOR, ou
 * seja ele estava no elenco — e às 19:00 não estava no sorteio. Não se desinscreveu:
 * essa ação notifica o organizador e não existe notificação nenhuma. Sumiu em silêncio e
 * ficou dois dias fora do torneio.
 *
 * CAUSA ESTRUTURAL: `saveTournament` grava o doc inteiro com merge, e há ~65 pontos no app
 * chamando `saveTournament(t)` com um `t` vindo da memória. Qualquer um com cópia atrasada
 * do elenco apaga quem entrou depois — sem erro, sem log, sem rastro. `skipParticipants`
 * existia pra isso, mas SÓ o `sync()` passava a flag.
 *
 * A REGRA: remover do elenco é ATO DECLARADO (`allowRosterRemoval`). Qualquer outro save
 * pode alterar CAMPOS de um inscrito, mas não faz ninguém desaparecer.
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
// identidade por uid — inclui os dois membros de uma dupla
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
// Helpers periféricos (derivados/denormalizados) NÃO são a lógica sob teste — o guard é.
DB._computeAdminEmails = () => [];
DB._computeAdminUids   = () => [];
DB._computeMemberUids  = (d) => (d.participants || []).flatMap(sandbox._participantUids);
DB._foldMonarchGroups  = () => {};
DB._cleanUndefined     = (d) => JSON.parse(JSON.stringify(d));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── elenco nunca encolhe ────');

(async function () {

// Firestore falso: guarda o doc "no banco" e registra o que foi gravado.
function mkDb(docNoBanco) {
  let gravado = null;
  return {
    _gravado: () => gravado,
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: !!docNoBanco, data: () => docNoBanco }),
        set: async (d) => { gravado = d; }
      })
    })
  };
}
const P = (uid, extra) => Object.assign({ uid: uid, addedAt: '2026-08-01T21:34:35Z' }, extra || {});

// ── (1) o caso do Gersom: save atrasado que "esqueceu" um inscrito ────────────
{
  const banco = { id: 'T1', participants: [P('u-ana'), P('u-gersom'), P('u-bia')] };
  const db = mkDb(banco);
  DB.db = db;
  // cópia ATRASADA: foi lida antes de o Gersom entrar
  const stale = { id: 'T1', participants: [P('u-ana'), P('u-bia')] };
  await DB.saveTournament(stale);
  const w = db._gravado();
  const uids = (w.participants || []).map(p => p.uid).sort();
  ok(uids.includes('u-gersom'), 'o inscrito ausente do save atrasado é RESTAURADO (era isto que sumia)');
  ok(uids.length === 3, 'ninguém foi duplicado nem perdido: 3 inscritos');
}

// ── (2) remoção DECLARADA continua funcionando ────────────────────────────────
{
  const banco = { id: 'T1', participants: [P('u-ana'), P('u-gersom'), P('u-bia')] };
  const db = mkDb(banco); DB.db = db;
  const semGersom = { id: 'T1', participants: [P('u-ana'), P('u-bia')] };
  await DB.saveTournament(semGersom, { allowRosterRemoval: true });
  const uids = (db._gravado().participants || []).map(p => p.uid);
  ok(!uids.includes('u-gersom'), 'com allowRosterRemoval a desinscrição REMOVE de verdade');
  ok(uids.length === 2, 'sobram 2');
}

// ── (3) o guard NÃO congela o elenco: campos continuam editáveis ──────────────
{
  const banco = { id: 'T1', participants: [P('u-ana'), P('u-gersom')] };
  const db = mkDb(banco); DB.db = db;
  const comCategoria = { id: 'T1', participants: [P('u-ana', { category: 'Masc C' }), P('u-gersom', { category: 'Masc C' })] };
  await DB.saveTournament(comCategoria);
  const w = db._gravado().participants;
  ok(w.length === 2, 'sem restauração indevida quando ninguém foi removido');
  ok(w.every(p => p.category === 'Masc C'), 'atribuir categoria a todos continua funcionando');
}

// ── (4) DUPLA: o uid do parceiro conta (senão o guard perde metade da dupla) ──
{
  const dupla = { p1Uid: 'u-x', p2Uid: 'u-y', p1Name: 'X', p2Name: 'Y' };
  const banco = { id: 'T1', participants: [P('u-ana'), dupla] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] });
  const w = db._gravado().participants;
  ok(w.length === 2, 'a dupla inteira é restaurada como UMA entrada');
  ok(w.some(p => p.p1Uid === 'u-x' && p.p2Uid === 'u-y'), 'restaurada com os DOIS uids intactos');
}

// ── (5) o sorteio transforma solos em duplas — NÃO pode disparar restauração ──
// Os uids continuam presentes, só que dentro de p1Uid/p2Uid. Se o guard olhasse
// entradas em vez de uids, ele duplicaria todo mundo a cada sorteio.
{
  const banco = { id: 'T1', participants: [P('u-x'), P('u-y')] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [{ p1Uid: 'u-x', p2Uid: 'u-y', p1Name: 'X', p2Name: 'Y' }] });
  const w = db._gravado().participants;
  ok(w.length === 1, 'sorteio que forma dupla dos mesmos uids NÃO restaura nada (1 entrada)');
}

// ── (6) fictício sem uid: limitação conhecida, declarada ──────────────────────
{
  const banco = { id: 'T1', participants: [{ displayName: 'Jogador X' }, P('u-ana')] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] });
  const w = db._gravado().participants;
  ok(w.length === 1, 'entrada SEM uid não é protegida (não há identidade estável pra casar)');
}

console.log(pass + ' asserts OK, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
