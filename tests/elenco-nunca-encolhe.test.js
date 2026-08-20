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

// ── (6) fictício sem uid: A LIMITAÇÃO CAIU (v1.9.87) ─────────────────────────
// Era declarada assim: "não há identidade estável pra casar". Verdade só pela
// METADE — e o preço apareceu no emulador (tests/concurrency, ALVO 9), a partir
// da pergunta do dono sobre a aba esquecida: um save de doc inteiro vindo de
// cópia velha APAGAVA o jogador fictício da lista de espera. Gente sem conta é
// gente do mesmo jeito: é o organizador que digita, e some sem rastro.
// A saída é o próprio gate deste guard: remover DE PROPÓSITO já exige
// `allowRosterRemoval`, então casar por NOME aqui dentro não desfaz ato nenhum
// do organizador — só repõe o que um save atrasado deixou cair. Homônimo exato
// continua sendo o limite conhecido, e é risco menor que apagar quem espera.
{
  const banco = { id: 'T1', participants: [{ displayName: 'Jogador X' }, P('u-ana')] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] });
  const w = db._gravado().participants;
  ok(w.length === 2, 'entrada SEM uid (fictício) AGORA é protegida — casa por nome dentro do guard');
  ok(w.some(function (x) { return x && x.displayName === 'Jogador X'; }),
     'e é o fictício certo que voltou');
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

// ── (17-18) REVISADAS DE PROPÓSITO em v1.7.98 ────────────────────────────────
// Aqui havia duas seções exigindo que `saveTournament` escrevesse no espelho
// (`tournaments/{id}/participants/{uid}`): "quem entra ganha doc próprio" e "quem sai é
// marcado como left". Elas passavam porque o Firestore FALSO deste harness aceita
// qualquer escrita — e o Firestore de VERDADE nega: **não existe regra pra essa
// subcoleção** (`grep -c 'match /participants'` no firestore.rules = 0), então toda
// escrita do cliente voltava `permission-denied` desde a 1.7.29. Era um teste verde em
// cima de código que nunca funcionou em produção — a armadilha do
// [[feedback_green_tests_still_broken]].
//
// O invariante que elas defendiam (existir prova por pessoa) NÃO foi abandonado: quem
// espelha é a CF `enrollParticipant`, no mesmo ponto em que grava a inscrição. O que
// mudou é QUEM escreve — cânone do dono: tudo roda na CF, o cliente só dispara.
//
// No lugar delas, a garantia que importa agora: o cliente NÃO PODE voltar a escrever ali.
{
  const banco = { id: 'T1', participants: [P('u-ana')] };
  const e = mkDbEspelho(banco);
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] });
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana'), P('u-nova')] });
  await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] }, { allowRosterRemoval: true });
  ok(Object.keys(e.subdocs).length === 0,
     'o cliente NÃO escreve na subcoleção do espelho — nem ao entrar, nem ao sair (é CF-only)');
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
  ok(!/this\._mirrorRoster|self\._mirrorRoster/.test(fonte),
     'e nenhuma chamada a _mirrorRoster voltou ao firebase-db.js');
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

// ── (23) ACEITE de co-organização não volta a "pendente" ────────────────────
// MEDIDO no Confra: um save atrasado devolvia status 'active' → 'pending' e apagava o
// acceptedAt. A pessoa aceita e horas depois o convite está pendente de novo. Já houve
// um caso desse sintoma ao vivo (Raquel, jul/2026), atribuído na época a outra causa.
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  coHosts: [{ uid: 'u-co', type: 'cohost', status: 'active', acceptedAt: '2026-07-30T12:06:00Z' }] };
  const db = mkDb(banco); DB.db = db;
  // save atrasado: cópia de ANTES do aceite
  await DB.saveTournament({ id: 'T1', name: 'editado', participants: [P('u-a')],
                            coHosts: [{ uid: 'u-co', type: 'cohost', status: 'pending' }] });
  const co = db._gravado().coHosts[0];
  ok(co.status === 'active', 'aceite de co-organização NÃO volta pra pendente');
  ok(co.acceptedAt === '2026-07-30T12:06:00Z', 'e o acceptedAt não é perdido');
  ok(db._gravado().name === 'editado', 'a edição que o organizador queria PASSA');
}

// ── (24) ACEITAR continua funcionando (é o caminho normal) ──────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  coHosts: [{ uid: 'u-co', type: 'cohost', status: 'pending' }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            coHosts: [{ uid: 'u-co', type: 'cohost', status: 'active', acceptedAt: 'AGORA' }] });
  const co = db._gravado().coHosts[0];
  ok(co.status === 'active' && co.acceptedAt === 'AGORA', 'aceitar o convite passa normalmente');
}

// ── (25) CANCELAR o convite continua livre — a regra é só anti-REGRESSÃO ────
// Cancelar REMOVE a entrada. Se o guard exigisse a presença dela, o organizador
// perderia o botão de cancelar; por isso a regra trava só aceito→pendente.
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  coHosts: [{ uid: 'u-co', type: 'cohost', status: 'active', acceptedAt: 'X' },
                            { uid: 'u-c2', type: 'cohost', status: 'pending' }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            coHosts: [{ uid: 'u-co', type: 'cohost', status: 'active', acceptedAt: 'X' }] });
  const chs = db._gravado().coHosts;
  ok(chs.length === 1 && chs[0].uid === 'u-co', 'cancelar convite pendente continua funcionando');
}

// ════════ v1.7.32 · a CHAVE não encolhe ═══════════════════════════════════
// MEDIDO no doc real do Confra: o save atrasado do organizador destruía CINCO coisas —
// a rodada recém-criada, o jogo de entrada tardia, o link do grupo de WhatsApp, o
// horário combinado e a substituição por W.O. As 4 primeiras estão travadas aqui.

// ── (26) RODADA criada por outro cliente não some ────────────────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [
    { round: 1, matches: [M('m1', 6, 3, 'A')] },
    { round: 2, matches: [M('n1', null, null), M('n2', null, null)] } ] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', name: 'editado', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [M('m1', 6, 3, 'A')] }] });  // cópia de ANTES
  const g = db._gravado();
  // null-safe de propósito: sem isso, a regressão ABORTA a suíte em vez de relatar
  ok(g.rounds.length === 2, 'rodada criada por outro cliente NÃO some num save atrasado');
  ok(((g.rounds[1] || {}).matches || []).length === 2, 'e os jogos dela vêm junto');
  ok((g.rounds[0] || {}).round === 1 && (g.rounds[1] || {}).round === 2, 'as rodadas voltam NA ORDEM');
}

// ── (27) RE-SORTEIO (zerar) continua livre — é a forma que distingue ─────────
// Reset manda `rounds: []` (ZERO); save atrasado manda MENOS, nunca zero. Sem isso eu
// teria que plugar bandeira em 6 pontos de reset espalhados pelo motor.
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [
    { round: 1, matches: [M('m1', null, null)] }, { round: 2, matches: [M('n1', null, null)] } ] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], rounds: [] });
  ok((db._gravado().rounds || []).length === 0, 're-sorteio/reset (rounds: []) continua zerando');
}

// ── (28) W.O. apaga o marcador de FOLGA — não pode ser ressuscitado ─────────
// `_removeSitOut` (liga-substitution) e `_isRem` (bracket-logic) apagam só isSitOut.
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [
    M('m1', null, null),
    { id: 'folga-1', p1: 'Fulana', p2: null, isSitOut: true, sitOutReason: 'folga' } ] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [M('m1', null, null)] }] });
  const ms = db._gravado().rounds[0].matches;
  ok(ms.length === 1 && !ms.some(m => m.id === 'folga-1'), 'W.O. segue apagando o marcador de folga');
}

// ── (29) JOGO de entrada tardia (sem placar) não some ───────────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [
    M('m1', null, null), { id: 'tardio-1', p1: 'X', p2: 'Y', scoreP1: null, scoreP2: null } ] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [M('m1', null, null)] }] });
  const ms = db._gravado().rounds[0].matches;
  ok(ms.some(m => m.id === 'tardio-1'), 'jogo de entrada tardia volta mesmo SEM placar');
}

// ── (30) MOTOR reescrevendo a chave: o guard sai de cena ────────────────────
// Re-sorteio/repescagem/chaves-adapter apagam jogo E geram outro. Save atrasado só
// PERDE, nunca traz id novo — é esse o sinal.
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [
    M('velho-1', null, null), M('velho-2', null, null) ] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [M('novo-1', null, null)] }] });
  const ms = db._gravado().rounds[0].matches;
  ok(ms.length === 1 && ms[0].id === 'novo-1', 'motor que ACRESCENTA jogo reescreve livre — guard não interfere');
}

// ── (31) link do grupo e horário combinado não somem ────────────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [
    Object.assign(M('m1', null, null), { waGroup: { link: 'https://chat.whatsapp.com/X' },
                                         scheduledAt: '2026-08-13T19:00', scheduledBy: 'u-a' }) ] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', name: 'editado', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [M('m1', null, null)] }] });
  const m = db._gravado().rounds[0].matches[0];
  ok(m.waGroup && m.waGroup.link === 'https://chat.whatsapp.com/X', 'link do grupo de WhatsApp sobrevive');
  ok(m.scheduledAt === '2026-08-13T19:00', 'horário combinado sobrevive');
  ok(m.scheduledBy === 'u-a', 'e quem combinou também');
}

// ── (32) trocar o link/horário continua livre (chega COM valor) ─────────────
{
  const banco = { id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [
    Object.assign(M('m1', null, null), { scheduledAt: '2026-08-13T19:00' }) ] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [
    Object.assign(M('m1', null, null), { scheduledAt: '2026-08-14T20:00' }) ] }] });
  ok(db._gravado().rounds[0].matches[0].scheduledAt === '2026-08-14T20:00', 'remarcar o horário vence o banco');
}

// ════════ v1.7.33 · TROCA DE JOGADOR: o mais NOVO vence ═══════════════════
// Caso 5 da medição — o suplente entra pelo W.O. e um save atrasado desfaz. Resolvido
// por carimbo (`rosterAt`) que nasce no próprio ponto de gravação: nenhum dos 10 call
// sites que mexem em slot precisa saber que ele existe.
const R = (id, t1, t1u) => ({ id, p1: t1.join(' / '), p2: 'C / D',
                              team1: t1, team1Uids: t1u, team2: ['C','D'], team2Uids: ['u-c','u-d'],
                              scoreP1: null, scoreP2: null, winner: null });

// ── (33) substituição por W.O. NÃO é desfeita por save atrasado ─────────────
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  rounds: [{ round: 1, matches: [R('m1', ['AUSENTE','B'], ['u-aus','u-b'])] }] };
  const db = mkDb(banco); DB.db = db;
  // passo 1 — o app aplica a troca e SALVA (o carimbo nasce aqui)
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [R('m1', ['SUPLENTE','B'], ['u-sup','u-b'])] }] });
  const pos = db._gravado();
  ok(typeof pos.rounds[0].matches[0].rosterAt === 'number', 'a troca legítima é CARIMBADA no save');
  // passo 2 — organizador salva a cópia lida ANTES da troca
  const db2 = mkDb(pos); DB.db = db2;
  await DB.saveTournament({ id: 'T1', name: 'editado', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [R('m1', ['AUSENTE','B'], ['u-aus','u-b'])] }] });
  const m = db2._gravado().rounds[0].matches[0];
  ok(m.team1Uids[0] === 'u-sup', 'save atrasado NÃO desfaz a substituição por W.O.');
  ok(m.team1[0] === 'SUPLENTE', 'e o nome no card acompanha');
  ok(db2._gravado().name === 'editado', 'a edição que o organizador queria PASSA');
}

// ── (34) DUAS trocas legítimas em sequência passam as duas ─────────────────
// Quem leu DEPOIS da primeira carrega o carimbo dela — não é confundido com atrasado.
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  rounds: [{ round: 1, matches: [R('m1', ['A','B'], ['u-a2','u-b'])] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [R('m1', ['SUP1','B'], ['u-s1','u-b'])] }] });
  const pos1 = db._gravado();
  const db2 = mkDb(pos1); DB.db = db2;
  const segunda = { id: 'T1', participants: [P('u-a')],
                    rounds: [{ round: 1, matches: [Object.assign(R('m1', ['SUP2','B'], ['u-s2','u-b']),
                                                   { rosterAt: pos1.rounds[0].matches[0].rosterAt })] }] };
  await DB.saveTournament(segunda);
  ok(db2._gravado().rounds[0].matches[0].team1Uids[0] === 'u-s2', 'segunda troca legítima também passa');
}

// ── (35) escalação IGUAL não perde o carimbo ───────────────────────────────
// Sem isso, um save que não mexe em slot apagaria o carimbo e o guard ficaria cego.
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  rounds: [{ round: 1, matches: [Object.assign(R('m1', ['A','B'], ['u-a2','u-b']), { rosterAt: 111 })] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', name: 'x', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [R('m1', ['A','B'], ['u-a2','u-b'])] }] });
  ok(db._gravado().rounds[0].matches[0].rosterAt === 111, 'save que não mexe em slot preserva o carimbo');
}

// ── (36) MOTOR reescrevendo (traz id novo): carimbo não atrapalha ──────────
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  rounds: [{ round: 1, matches: [Object.assign(R('m1', ['A','B'], ['u-a2','u-b']), { rosterAt: 999 })] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], rounds: [{ round: 1, matches: [
    R('m1', ['NOVO','B'], ['u-novo','u-b']), R('m2', ['E','F'], ['u-e','u-f']) ] }] });
  const ms = db._gravado().rounds[0].matches;
  ok(ms.find(m => m.id === 'm1').team1Uids[0] === 'u-novo', 'motor que gera jogo novo reescreve slot livre');
}

// ── (37) PRIMEIRA troca da vida (banco sem carimbo) é aceita ───────────────
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  rounds: [{ round: 1, matches: [R('m1', ['A','B'], ['u-a2','u-b'])] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')],
                            rounds: [{ round: 1, matches: [R('m1', ['Z','B'], ['u-z','u-b'])] }] });
  ok(db._gravado().rounds[0].matches[0].team1Uids[0] === 'u-z', 'banco sem carimbo: a troca passa (e vira o carimbo)');
}

// ════════ v1.7.34 · o 3º storage da espera, W.O. reivindicado e enquete ═══
// A espera vive em TRÊS storages. O guard de 1.7.26 pegou os dois que são ARRAY com uid
// e deixou o `monarchWaitlist` (MAPA categoria→NOMES) de fora — ou seja, o bug do Gersom
// seguia aberto por ali. MEDIDO no doc real: o Renato Oshima existe SÓ nesse mapa.

// ── (38) nome que entrou na fila pelo 3º storage não some ───────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  monarchWaitlist: { _default_: [], Masc_C: ['Renato Oshima', 'Outro'] } };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', name: 'editado', participants: [P('u-a')],
                            monarchWaitlist: { _default_: [], Masc_C: ['Outro'] } });  // cópia de ANTES
  const q = db._gravado().monarchWaitlist.Masc_C;
  ok(q.indexOf('Renato Oshima') >= 0, 'nome do 3º storage da espera NÃO some num save atrasado');
  ok(q.length === 2 && q.indexOf('Outro') >= 0, 'e quem já estava continua');
}

// ── (39) categoria inteira que sumiu do save volta ──────────────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')], monarchWaitlist: { Fem_D: ['Fulana'] } };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], monarchWaitlist: {} });
  ok(((db._gravado().monarchWaitlist || {}).Fem_D || []).indexOf('Fulana') >= 0,
     'categoria inteira ausente do save é reconstruída');
}

// ── (40) o MOTOR tira da fila ao sortear — não pode ser desfeito ────────────
// Todos os `_setMonarchWaitlist` que ENCOLHEM estão em bracket-logic (o sorteio tirando
// da fila quem entrou num grupo), e o sorteio sempre gera jogo com id novo.
{
  const banco = { id: 'T1', participants: [P('u-a')], monarchWaitlist: { Masc_C: ['Renato Oshima'] },
                  rounds: [{ round: 1, matches: [M('m1', null, null)] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], monarchWaitlist: { Masc_C: [] },
                            rounds: [{ round: 1, matches: [M('m1', null, null), M('grupo-novo', null, null)] }] });
  ok((db._gravado().monarchWaitlist.Masc_C || []).length === 0,
     'sorteio que forma grupo tira da fila livre — guard não interfere');
}

// ── (41) tirar da fila DECLARADO continua livre ─────────────────────────────
{
  const banco = { id: 'T1', participants: [P('u-a')], monarchWaitlist: { Masc_C: ['Renato Oshima'] } };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], monarchWaitlist: { Masc_C: [] } },
                          { allowRosterRemoval: true });
  ok((db._gravado().monarchWaitlist.Masc_C || []).length === 0, 'allowRosterRemoval tira da fila de verdade');
}

// ── (42) W.O. reivindicado e enquete não somem (nada no app os remove) ──────
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  woClaims: [{ id: 'wo_1', absentName: 'Thereza' }, { id: 'wo_2', absentName: 'Thereza' }],
                  polls: [{ id: 'p1', votes: { 'u-1': 'a', 'u-2': 'b' } }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', name: 'editado', participants: [P('u-a')],
                            woClaims: [{ id: 'wo_1', absentName: 'Thereza' }], polls: [] });
  const g = db._gravado();
  ok((g.woClaims || []).length === 2, 'W.O. reivindicado no meio tempo não some');
  ok((g.polls || []).length === 1 && Object.keys(g.polls[0].votes).length === 2, 'enquete e seus votos não somem');
}

// ════════ v1.7.35 · PRESENÇA ("Cheguei") não some ════════════════════════
// Eu tinha deixado de fora achando que DESMARCAR passaria por aqui. Fui ler o
// `_toggleCheckIn`: desmarcar vai por `setPresenceFields` (campo a campo) ou pela
// TRANSAÇÃO — nunca por `saveTournament`. Então proteger aqui não prende ninguém.

// ── (43) check-in feito na quadra não some num save do organizador ──────────
{
  const banco = { id: 'T1', participants: [P('u-a')],
                  checkedIn: { 'u-a': 111, 'u-b': 222 }, checkedInConfirmed: { 'u-c': 333 },
                  absent: { 'u-d': 444 }, vips: { 'u-e': 1 } };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', name: 'editado', participants: [P('u-a')],
                            checkedIn: {}, checkedInConfirmed: {}, absent: {}, vips: {} });
  const g = db._gravado();
  ok(Object.keys(g.checkedIn).length === 2, 'quem deu "Cheguei" continua presente');
  ok(g.checkedInConfirmed['u-c'] === 333, 'presença confirmada remotamente sobrevive');
  ok(g.absent['u-d'] === 444, 'ausente marcado sobrevive');
  ok(g.vips['u-e'] === 1, 'VIP sobrevive');
}

// ── (44) o SORTEIO limpa a presença de propósito — não pode ser desfeito ────
// Regra do dono: "acabou de sortear, ninguém está presente". O sorteio traz jogo novo.
{
  const banco = { id: 'T1', participants: [P('u-a')], checkedIn: { 'u-a': 111, 'u-b': 222 },
                  rounds: [{ round: 1, matches: [M('m1', null, null)] }] };
  const db = mkDb(banco); DB.db = db;
  await DB.saveTournament({ id: 'T1', participants: [P('u-a')], checkedIn: {},
                            rounds: [{ round: 1, matches: [M('m1', null, null), M('sorteio-novo', null, null)] }] });
  ok(Object.keys(db._gravado().checkedIn || {}).length === 0, 'sorteio limpa a presença livre');
}

console.log(pass + ' asserts OK, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
