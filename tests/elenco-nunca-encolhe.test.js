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

// ── (7) A FILA também não some ────────────────────────────────────────────────
// Depois do sorteio é onde as pessoas esperam (v1.6.86) — e some sem ninguém notar,
// porque quem está na fila não tem jogo pra sentir falta. É onde o Gersom está.
{
  const banco = { id: 'T1', participants: [P('u-ana')],
                  standbyParticipants: [P('u-gersom'), P('u-bia')] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-bia')] });
  const f = (db._gravado().standbyParticipants || []).map(p => p.uid);
  ok(f.includes('u-gersom'), 'quem está na FILA é restaurado quando some de um save atrasado');
  ok(f.length === 2, 'fila com 2, sem duplicar');
}

// ── (8) PROMOÇÃO esvazia a fila legitimamente — não pode restaurar ────────────
// É o caso que mais poderia quebrar: W.O./formação de grupo tiram da fila e põem no
// elenco. Se o guard não reconhecesse isso, a pessoa voltaria pra fila estando em jogo.
{
  const banco = { id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-gersom')] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana'), P('u-gersom')], standbyParticipants: [] });
  const w = db._gravado();
  ok((w.standbyParticipants || []).length === 0, 'promovido SAI da fila (não é restaurado)');
  ok((w.participants || []).map(p => p.uid).includes('u-gersom'), 'e está no elenco');
}

// ── (9) save que NÃO traz elenco ainda protege a fila ─────────────────────────
// O guard antigo aninhava a fila dentro do bloco de participants: um save só de fila
// passava direto. Este caso trava essa regressão.
{
  const banco = { id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-gersom')] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', standbyParticipants: [] });
  ok((db._gravado().standbyParticipants || []).map(p => p.uid).includes('u-gersom'),
     'save SEM participants continua protegendo a fila');
}

// ── (10) o incidente deixa RASTRO, e o histórico não some ────────────────────
// Reconstruir o caso do Gersom levou uma tarde porque não havia registro nenhum.
// O histórico vive no mesmo doc e sofre do mesmo save atrasado — se ele encolher,
// o rastro do incidente é apagado pelo próprio incidente.
{
  const banco = { id: 'T1', participants: [P('u-ana'), P('u-gersom')],
                  history: [{ date: '2026-06-01T00:00:00Z', message: 'linha antiga' }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')], history: [] });
  const h = db._gravado().history || [];
  ok(h.some(e => e.message === 'linha antiga'), 'linha de histórico do banco NÃO some num save atrasado');
  ok(h.some(e => /Protecao automatica/.test(e.message || '')), 'a restauração deixa RASTRO no histórico');
  ok((db._gravado().participants || []).map(p => p.uid).includes('u-gersom'), 'e a pessoa voltou');
}

// ── (11) reescrever a mesma linha de histórico não duplica ───────────────────
{
  const linha = { date: '2026-06-01T00:00:00Z', message: 'linha antiga' };
  const banco = { id: 'T1', participants: [P('u-ana')], history: [linha] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')], history: [linha] });
  const h = db._gravado().history || [];
  ok(h.filter(e => e.message === 'linha antiga').length === 1, 'histórico unido por (date+message): sem duplicata');
}

// ══ TRANSAÇÃO (commitTournamentTx) — o caminho por onde passam W.O. e substituição ══
function mkTx(doc) {
  let gravado = null;
  DB.db = {
    runTransaction: async (fn) => fn({
      get: async () => ({ exists: true, data: () => JSON.parse(JSON.stringify(doc)) }),
      set: (_ref, d) => { gravado = d; }
    }),
    collection: () => ({ doc: () => ({}) })
  };
  return () => gravado;
}

// ── (12) W.O.: tira do ELENCO e põe na FILA — NÃO pode ser desfeito ───────────
// A primeira versão do guard exigia permanência no elenco e teria quebrado o W.O.
// com o torneio já sorteado. O invariante certo é "não sumir das DUAS listas".
{
  const doc = { id: 'T1', participants: [P('u-ana'), P('u-gersom')], standbyParticipants: [] };
  const ler = mkTx(doc);
  await DB.mutateTournament('T1', (d) => {
    d.participants = d.participants.filter(p => p.uid !== 'u-gersom');
    d.standbyParticipants.push(P('u-gersom'));           // W.O. → fim da fila
  });
  const w = ler();
  ok(!(w.participants || []).some(p => p.uid === 'u-gersom'), 'W.O. TIRA do elenco (guard não desfaz)');
  ok((w.standbyParticipants || []).some(p => p.uid === 'u-gersom'), 'e a pessoa está na fila');
}

// ── (13) PROMOÇÃO: da fila pro elenco — também não pode ser desfeita ──────────
{
  const doc = { id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-gersom')] };
  const ler = mkTx(doc);
  await DB.mutateTournament('T1', (d) => {
    d.standbyParticipants = [];
    d.participants.push(P('u-gersom'));
  });
  const w = ler();
  ok((w.participants || []).some(p => p.uid === 'u-gersom'), 'promoção põe no elenco');
  ok((w.standbyParticipants || []).length === 0, 'e esvazia a fila (guard não desfaz)');
}

// ── (14) MUTATOR COM BUG: some das DUAS listas → restaurado ──────────────────
{
  const doc = { id: 'T1', participants: [P('u-ana'), P('u-gersom')], standbyParticipants: [] };
  const ler = mkTx(doc);
  await DB.mutateTournament('T1', (d) => {
    d.participants = d.participants.filter(p => p.uid !== 'u-gersom');   // some e não vai pra lugar nenhum
  });
  const w = ler();
  ok((w.participants || []).some(p => p.uid === 'u-gersom'), 'quem some de TODAS as listas é restaurado');
  ok((w.history || []).some(e => /Protecao automatica \(transacao\)/.test(e.message || '')), 'com rastro no histórico');
}

// ── (15) remoção declarada na transação continua removendo ───────────────────
{
  const doc = { id: 'T1', participants: [P('u-ana'), P('u-gersom')], standbyParticipants: [] };
  const ler = mkTx(doc);
  await DB.mutateTournament('T1', (d) => {
    d.participants = d.participants.filter(p => p.uid !== 'u-gersom');
  }, { allowRosterRemoval: true });
  ok(!(ler().participants || []).some(p => p.uid === 'u-gersom'), 'allowRosterRemoval remove de verdade também na transação');
}

// ══ ESCRITA DUPLA (subcoleção participants/{uid}) — passo 1 da migração ══
function mkDbEspelho(banco) {
  const subdocs = {};
  let gravado = null;
  DB._rosterMirrorCache = {};
  DB.db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => banco }),
        set: async (d) => { gravado = d; },
        collection: () => ({ doc: (u) => ({ set: (d) => { subdocs[u] = Object.assign(subdocs[u] || {}, d); } }) })
      })
    })
  };
  return { subdocs, gravado: () => gravado };
}

// ── (16) primeiro save da sessão NÃO escreve 111 docs ────────────────────────
// Sem isto, cada clique num torneio grande viraria 111 escritas e derrubaria a quota.
{
  const banco = { id: 'T1', participants: [P('u-ana'), P('u-bia')] };
  const e = mkDbEspelho(banco);
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana'), P('u-bia')] });
  ok(Object.keys(e.subdocs).length === 0, 'primeiro save só memoriza — não dispara escrita em massa');
}

// ── (17) quem ENTRA ganha doc próprio ────────────────────────────────────────
{
  const banco = { id: 'T1', participants: [P('u-ana')] };
  const e = mkDbEspelho(banco);
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] });          // memoriza
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana'), P('u-nova')] });
  ok(e.subdocs['u-nova'] && e.subdocs['u-nova'].status === 'enrolled', 'quem entra ganha doc próprio');
  ok(!e.subdocs['u-ana'], 'quem já estava não é reescrito (só o delta)');
}

// ── (18) quem SAI é MARCADO, não apagado ─────────────────────────────────────
// O histórico de quem saiu é exatamente o que faltou pra reconstruir o incidente.
{
  const banco = { id: 'T1', participants: [P('u-ana'), P('u-vai')] };
  const e = mkDbEspelho(banco);
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana'), P('u-vai')] });
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] }, { allowRosterRemoval: true });
  ok(e.subdocs['u-vai'] && e.subdocs['u-vai'].status === 'left', 'quem sai é MARCADO como left (não apagado)');
  ok(!!e.subdocs['u-vai'].leftAt, 'com a hora da saída');
}

// ══ PLACAR não é apagado por save que não é de placar (v1.7.30) ══════════════
const M = (id, a, b, w) => ({ id, p1: 'A', p2: 'B', scoreP1: a, scoreP2: b, winner: w || null });

// ── (19) o caso medido: organizador salva edição com cópia anterior ao placar ─
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [M('m1', 6, 3, 'A'), M('m2', null, null)] }] };
  const db = mkDb(banco); DB.db = db;
  const stale = { id: 'T1', name: 'editado', participants: [P('u-a')],
                  rounds: [{ round: 1, matches: [M('m1', null, null), M('m2', null, null)] }] };
  await DB.saveTournament(stale);
  const m1 = db._gravado().rounds[0].matches.find(m => m.id === 'm1');
  ok(m1.scoreP1 === 6 && m1.scoreP2 === 3, 'placar já lançado NÃO é apagado por save de outra coisa');
  ok(m1.winner === 'A', 'e o vencedor volta junto');
  ok(db._gravado().name === 'editado', 'a edição que o organizador queria PASSA (só o placar é blindado)');
}

// ── (20) CORRIGIR placar continua livre — é o que não pode quebrar ───────────
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [M('m1', 6, 3, 'A')] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [M('m1', 6, 4, 'A')] }] });
  const m1 = db._gravado().rounds[0].matches[0];
  ok(m1.scoreP2 === 4, 'corrigir placar (chega COM valor) vence o que está no banco');
}

// ── (21) apagar de propósito exige declaração ────────────────────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [M('m1', 6, 3, 'A')] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [M('m1', null, null)] }] },
                          { allowScoreClear: true });
  ok(db._gravado().rounds[0].matches[0].scoreP1 === null, 'allowScoreClear apaga de verdade');
}

// ── (22) casa por ID, não por posição — sorteio e rodada extra reordenam ─────
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [M('m1', 6, 3, 'A'), M('m2', 6, 1, 'A')] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [M('m2', null, null), M('m1', null, null)] }] });  // ordem trocada
  const g = db._gravado().rounds[0].matches;
  ok(g.find(m => m.id === 'm1').scoreP1 === 6 && g.find(m => m.id === 'm2').scoreP2 === 1,
     'ordem trocada não confunde: cada placar volta pro jogo certo');
}

console.log(pass + ' asserts OK, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
