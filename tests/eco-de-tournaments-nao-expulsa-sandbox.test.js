/* O ECO DE `tournaments` NÃO EXPULSA SANDBOX DA MEMÓRIA        (FIX.SANDBOX.P4)
 * node tests/eco-de-tournaments-nao-expulsa-sandbox.test.js
 *
 * ⛔ O DEFEITO, reproduzido em produção (somente leitura) com os ouvintes REAIS e o
 * documento REAL, antes de mexer: o ouvinte de `sandboxes` montava o sandbox certinho —
 * 152 inscritos, 115 jogos, 35/35 grupos religados, fase concluída, 1 atalho nas
 * Ferramentas e 1 botão contextual. Aí chegava UM eco comum de `tournaments` (qualquer
 * placar salvo por qualquer participante) e:
 *   • o id do sandbox caía em `_removedIds` — porque `_prevIds` saía de `store.tournaments`,
 *     que desde a 2.1.87 é UMA lista alimentada por DOIS ouvintes de DUAS coleções, e um
 *     snapshot de `tournaments` nunca pode conter um documento de `sandboxes`;
 *   • quem estava vendo o sandbox era jogado pro `#dashboard` com o aviso FALSO
 *     "Torneio removido — foi removido pelo organizador";
 *   • `store.tournaments = tournaments` descartava o objeto montado.
 * O documento seguia INTACTO no banco: era expulsão de MEMÓRIA, não remoção.
 *
 * ⛔ E reabrir não curava: fora da memória, `renderTournaments` caía na porta
 * `_tRef(id).get()`, que empurrava o documento CRU e MAGRO na lista sem marcar, sem
 * agendar montagem e sem religar os grupos. A ficha abria com as Ferramentas mas com
 * 0 inscritos, 0 jogos e SEM o atalho — estado ESTÁVEL, porque nada ali ia buscar o resto.
 * Sandbox não ecoa (ninguém mais escreve nele), então "esperar o próximo snapshot" é
 * esperar o que não vem.
 *
 * ⚠️ ESTE TESTE NÃO INJETA TORNEIO MONTADO. O banco de mentira guarda o que o Firestore
 * guarda: documento MAGRO (`dividir` + `_foldMonarchGroups`) e as partes em subcoleção. Quem
 * monta é `_montaPesadosQueFaltam` pela porta real, e quem entrega os snapshots é o ouvinte
 * REAL (`AppStore.startRealtimeListener`), pego pelo `onSnapshot` de um `db` de mentira que
 * só faz o papel da REDE. No HEAD c094737e ele falha exatamente na expulsão do item ④.
 */
'use strict';
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
const S = require('../js/views/tournament-split-core.js');
W._isRemoteFirestoreSnapshot = (snap) => !(snap && snap.metadata && snap.metadata.fromCache === true);

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };
const tick = () => new Promise((r) => setTimeout(r, 5));
const esperar = async (n) => { for (let i = 0; i < n; i++) await tick(); };

const DONO = { uid: 'uDono', email: 'rstbarth@hotmail.com', displayName: 'Dono', _profileLoaded: true };

/* ── O FIXTURE EQUIVALENTE AO CONFRA: 35 grupos, 115 jogos, 152 inscritos ───────────── */
function jogo(id, a, b, c, d, gB) {
  return { id: id, isMonarch: true, p1: a + ' / ' + b, p2: c + ' / ' + d,
    team1: [a, b], team1Uids: ['u-' + a, 'u-' + b], team2: [c, d], team2Uids: ['u-' + c, 'u-' + d],
    scoreP1: 6, scoreP2: gB, winner: a + ' / ' + b, sets: [{ gamesP1: 6, gamesP2: gB }], resultAt: 1000 };
}
function grupo(gi, nJogos) {
  const P = [0, 1, 2, 3].map((k) => 'G' + gi + 'p' + k);
  const ms = [jogo('m' + gi + '-1', P[0], P[1], P[2], P[3], gi % 5),
              jogo('m' + gi + '-2', P[0], P[2], P[1], P[3], (gi + 1) % 5),
              jogo('m' + gi + '-3', P[0], P[3], P[1], P[2], (gi + 2) % 5)];
  // 10 grupos jogam uma quarta rodada — é o que faz 25×3 + 10×4 = 115, como no Confra
  if (nJogos === 4) ms.push(jogo('m' + gi + '-4', P[1], P[2], P[0], P[3], (gi + 3) % 5));
  return { name: 'R1 Grupo ' + (gi + 1), players: P.slice(), playersUids: P.map((n) => 'u-' + n), matches: ms };
}
function torneio(o) {
  o = o || {};
  const gs = [];
  for (let i = 0; i < 35; i++) gs.push(grupo(i, i < 10 ? 4 : 3));
  const ms = []; gs.forEach((g) => g.matches.forEach((m) => ms.push(m)));
  const parts = [];
  gs.forEach((g) => g.players.forEach((n) => parts.push({ uid: 'u-' + n, name: n, displayName: n, ligaActive: true })));
  // 12 inscritos fora dos grupos (folga/W.O.) → 140 + 12 = 152, como no original
  for (let k = 0; k < 12; k++) parts.push({ uid: 'u-fora' + k, name: 'F' + k, displayName: 'F' + k, ligaActive: false });
  if (o.concluida === false) gs.forEach((g) => g.matches.forEach((m) => { delete m.winner; delete m.resultAt; }));
  const t = {
    id: o.id, name: 'Confra equivalente', sport: 'Beach Tennis', status: 'in_progress',
    format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawFirstDate: '2026-08-02',
    organizerEmail: DONO.email, creatorUid: o.creatorUid || DONO.uid, adminUids: [o.creatorUid || DONO.uid],
    memberUids: [DONO.uid], currentPhaseIndex: 0, teamSize: 2, participants: parts, matches: [],
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', reiRainha: true, drawMode: 'rei_rainha', rounds: 1 },
      { name: 'Ouro/Prata', formatCode: 'elim_simples', fixedPairs: true, pairingStrategy: 'top',
        source: { type: 'previous_phase', scope: 'per_group', mapping: [
          { dest: 'upper', rankFrom: 1, rankTo: 999, label: 'Ouro' },
          { dest: 'lower', rankFrom: 1, rankTo: 999, label: 'Prata' }] } }],
    rounds: [{ round: 1, format: 'liga', status: 'complete', matches: ms, monarchGroups: gs }]
  };
  if (o.sandbox) { t.isSandbox = true; t.sbState = 'ready'; t.sandboxOf = 'real'; t.sandboxOwnerUid = o.sandbox; }
  return t;
}

/* ── O BANCO DE MENTIRA guarda o que o Firestore guarda: MAGRO + partes em subcoleção ── */
const PARTES_FORA = ['matches', 'participants', 'opponentHistory'];   // igual ao Confra
const BANCO = { tournaments: {}, tournaments_summary: {}, sandboxes: {} };
const PARTES = {};
function guardar(colecao, t) {
  const partes = S.dividir(t, PARTES_FORA);
  PARTES[String(t.id)] = partes;
  const magro = JSON.parse(JSON.stringify(partes.config));
  magro._semPesados = PARTES_FORA.slice();
  magro._nPartes = {};
  PARTES_FORA.forEach((n) => { magro._nPartes[n] = (partes[n] || []).length; });
  W._foldMonarchGroups(magro);
  BANCO[colecao][String(t.id)] = magro;
  return magro;
}
const torneioReal = torneio({ id: 'real' });
torneioReal.testModeEnabled = true;
const magroReal = guardar('tournaments', torneioReal);
const magroSb = guardar('sandboxes', torneio({ id: 'sb', sandbox: DONO.uid }));
const magroAlheio = guardar('sandboxes', torneio({ id: 'sb-alheio', sandbox: 'uOutro', creatorUid: 'uOutro' }));
BANCO.tournaments_summary.real = { id: 'real', _resumo: true, name: 'Confra equivalente', memberUids: [DONO.uid], isSandbox: false };

/* ── o `db` de mentira: só a REDE. `onSnapshot` guarda o callback do ouvinte REAL ────── */
const CB = {};
const CB_ROOT = {};
const CB_ERROR = {};
const CB_QUERY = {};
const snapDe = (colecao, ids) => {
  const docs = ids.map((id) => ({ id: String(id), exists: true, data: () => JSON.parse(JSON.stringify(BANCO[colecao][String(id)])) }));
  return { docs: docs, size: docs.length, forEach(f) { docs.forEach(f); }, docChanges() { return docs.map((d) => ({ type: 'added', doc: d })); } };
};
const q = (nome) => ({
  filters: [],
  where(field, op, value) { this.filters.push([field, op, value]); return this; }, limit() { return this; }, orderBy() { return this; },
  onSnapshot(opts, cb, err) {
    const receber = typeof opts === 'function' ? opts : cb;
    (CB[nome] = CB[nome] || []).push(receber);
    const sig = nome + '|' + this.filters.map((x) => x.join(':')).join('|');
    (CB_QUERY[sig] = CB_QUERY[sig] || []).push(receber);
    (CB_ERROR[sig] = CB_ERROR[sig] || []).push(typeof opts === 'function' ? cb : err);
    return function () {};
  },
  get() { return Promise.resolve(snapDe(nome, [])); },
  doc(id) { return { get: () => Promise.resolve({ exists: false, data: () => null }), collection: () => q(nome) }; }
});
let leituras = 0;
W.FirestoreDB = W.FirestoreDB || {};
W.FirestoreDB.db = { collection: (nome) => q(nome) };
W._isTestIdentity = () => true;
W.FirestoreDB._ehSandbox = function (idOuT) {
  if (idOuT && typeof idOuT === 'object') return idOuT.isSandbox === true;
  const id = String(idOuT || '');
  if (W._sbIdsConhecidos && W._sbIdsConhecidos[id]) return true;
  return ((W.AppStore && W.AppStore.tournaments) || []).some((t) => String(t.id) === id && t.isSandbox === true);
};
W.FirestoreDB._tRef = function (idOuT) {
  const id = String((idOuT && idOuT.id) || idOuT || '');
  const col = W.FirestoreDB._ehSandbox(idOuT) ? 'sandboxes' : 'tournaments';
  const doc = BANCO[col][id];
  return {
    get: () => Promise.resolve({ exists: !!doc, data: () => (doc ? JSON.parse(JSON.stringify(doc)) : null) }),
    onSnapshot(opts, cb) { const receber = typeof opts === 'function' ? opts : cb; (CB_ROOT[id] = CB_ROOT[id] || []).push(receber); return function () {}; }
  };
};
W.FirestoreDB._montaDeSubcolecoes = function (id, config) {
  return W._tSplit.montarDoBanco(config, async function (colecao) {
    const p = PARTES[String(id)];
    const nome = Object.keys(p).find((k) => S.colecaoDaParte(k) === colecao) || colecao;
    const arr = (p[nome] || []).map((r) => JSON.parse(JSON.stringify(r)));
    leituras += arr.length;
    return arr;
  });
};

const avisos = [];
W.showNotification = (t, c) => avisos.push(String(t) + ' — ' + String(c || '').slice(0, 60));
W.location = W.location || {};
function caixa() {
  return { innerHTML: '', style: {}, dataset: {}, appendChild() {}, querySelector: () => null,
    querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {}, contains: () => false } };
}
const avancos = (s) => (s.match(/<button[^>]*_advanceMultiPhase[^>]*>[\s\S]*?<\/button>/g) || []);
function foto(id) {
  const t = (W.AppStore.tournaments || []).find((x) => String(x.id) === String(id));
  const c = caixa(); try { W.renderTournaments(c, String(id)); } catch (e) {}
  const cb = caixa(); try { W.renderBracket(cb, String(id)); } catch (e) {}
  const r0 = t ? ((t.rounds || [])[0] || {}) : {};
  return {
    naLista: !!t, t: t,
    inscritos: t ? (t.participants || []).length : 0,
    jogos: (r0.matches || []).length,
    religados: (r0.monarchGroups || []).filter((g) => (g.matches || []).length).length,
    grupos: (r0.monarchGroups || []).length,
    completa: t ? W._phasesPhaseComplete(t) : false,
    organizador: t ? W.AppStore.isOrganizer(t) : false,
    atalho: avancos(c.innerHTML || '').length,
    contextual: avancos(cb.innerHTML || '').length,
    bytes: (c.innerHTML || '').length
  };
}

(async () => {
console.log('──── o eco de `tournaments` não expulsa sandbox da memória ────');

console.log('\n── ① o banco guarda MAGRO (senão o teste mede um fixture, não o app) ──');
ok('o documento do sandbox não traz elenco nem jogos', (magroSb.participants || []).length === 0 &&
  (((magroSb.rounds || [])[0] || {}).matches || []).length === 0);
ok('e os 35 grupos guardam só matchIds', (((magroSb.rounds || [])[0] || {}).monarchGroups || []).length === 35 &&
  (((magroSb.rounds || [])[0] || {}).monarchGroups || []).every((g) => Array.isArray(g.matchIds) && !(g.matches || []).length));
ok('os marcadores prometem 152 inscritos e 115 jogos',
  magroSb._nPartes.participants === 152 && magroSb._nPartes.matches === 115,
  JSON.stringify(magroSb._nPartes));

console.log('\n── ② login estabilizando: o ouvinte REAL sobe e chega o 1º eco de `tournaments` ──');
W.AppStore.tournaments = [];
W.AppStore.currentUser = DONO;
W._sbIdsConhecidos = {};
['_montandoPesados', '_ultimaMontagem', '_tentativasDePartes', '_retentandoPartes', '_partesEmErro']
  .forEach((m) => { W.AppStore[m] = {}; });
W.AppStore.startRealtimeListener();
const cbT = (CB.tournaments || [])[0];
const cbSummary = CB.tournaments_summary || [];
const cbSb = (CB.sandboxes || [])[0];
ok('os dois feeds de resumos abriram', cbSummary.length === 2);
ok('o feed privado de teste abriu', typeof cbT === 'function');
ok('o ouvinte de `sandboxes` abriu (é outro, em outra coleção)', typeof cbSb === 'function');
cbSummary[0](snapDe('tournaments_summary', ['real']));
await esperar(10);
ok('a lista atual aparece sem esperar o feed secundário de árbitros',
  W.AppStore.tournaments.some((t) => String(t.id) === 'real'));
// Um cartão conhecido apenas pelo feed de árbitros não pode desaparecer nem
// disparar navegação/aviso falso enquanto o snapshot secundário ainda está pendente.
const refPendente = { id: 'ref-pendente', name: 'Torneio arbitrado', _resumo: true };
W.AppStore.tournaments.push(refPendente);
W.AppStore.tournaments.push({ id: 'sb-pendente', name: 'Sandbox conhecido', isSandbox: true, sbState: 'ready' });
W.location.hash = '#tournaments/ref-pendente';
avisos.length = 0;
cbSummary[0](snapDe('tournaments_summary', ['real']));
await esperar(10);
ok('feed principal não remove cartão cuja fonte secundária ainda está pendente',
  W.AppStore.tournaments.some((t) => String(t.id) === 'ref-pendente'));
ok('sandbox conhecido não duplica durante a pendência do feed secundário',
  W.AppStore.tournaments.filter((t) => String(t.id) === 'sb-pendente').length === 1);
ok('feed pendente não redireciona nem avisa remoção falsa',
  W.location.hash === '#tournaments/ref-pendente' && avisos.length === 0,
  'hash=' + W.location.hash + ' avisos=' + JSON.stringify(avisos));
BANCO.tournaments_summary['ref-pendente'] = {
  id: 'ref-pendente', _resumo: true, name: 'Torneio arbitrado', memberUids: [],
  refereeUids: [DONO.uid], isSandbox: false
};
cbSummary[1](snapDe('tournaments_summary', ['real', 'ref-pendente']));
cbT(snapDe('tournaments', ['real']));
await esperar(40);
ok('o torneio real montou sozinho', foto('real').jogos === 115);
ok('a fonte secundária atualiza o torneio sem duplicá-lo',
  W.AppStore.tournaments.filter((t) => String(t.id) === 'ref-pendente').length === 1);

console.log('\n── ③ snapshot de `sandboxes` → montagem das partes ──');
cbSb(snapDe('sandboxes', ['sb']));
await esperar(60);
const f3 = foto('sb');
ok('⭐ 152 inscritos', f3.inscritos === 152, 'veio ' + f3.inscritos);
ok('⭐ 115 jogos', f3.jogos === 115, 'veio ' + f3.jogos);
ok('⭐ 35/35 grupos religados', f3.religados === 35 && f3.grupos === 35, f3.religados + '/' + f3.grupos);
ok('⭐ fase concluída', f3.completa === true);
ok('⭐ EXATAMENTE um atalho nas Ferramentas', f3.atalho === 1, 'veio ' + f3.atalho);
ok('⭐ EXATAMENTE um botão contextual na chave', f3.contextual === 1, 'veio ' + f3.contextual);

console.log('\n── ④ ECO COMUM de `tournaments`, com a rota do sandbox ABERTA ──');
/* ⛔ É AQUI QUE O HEAD c094737e FALHA: o eco tratava o sandbox como removido. */
W.location.hash = '#tournaments/sb';
avisos.length = 0;
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', ['real'])));
cbT(snapDe('tournaments', ['real']));
await esperar(20);
const f4 = foto('sb');
ok('⭐⭐ o sandbox continua na memória', f4.naLista === true);
ok('⭐⭐ NÃO navegou pro dashboard', W.location.hash === '#tournaments/sb', 'hash=' + W.location.hash);
ok('⭐⭐ NÃO avisou "Torneio removido"', avisos.length === 0, JSON.stringify(avisos));
ok('⭐ inscritos, jogos e grupos religados intactos',
  f4.inscritos === 152 && f4.jogos === 115 && f4.religados === 35,
  f4.inscritos + '/' + f4.jogos + '/' + f4.religados);
ok('⭐ segue organizador, fase concluída, 1 atalho e 1 contextual',
  f4.organizador === true && f4.completa === true && f4.atalho === 1 && f4.contextual === 1,
  'org=' + f4.organizador + ' completa=' + f4.completa + ' atalho=' + f4.atalho + ' ctx=' + f4.contextual);
ok('  → e o torneio real seguiu inteiro', foto('real').jogos === 115);

console.log('\n── ⑤ reabrir a rota do sandbox FORA da memória — sem novo snapshot do ouvinte ──');
/* ⚠️ Nenhum `cbSb` é chamado neste bloco: se a hidratação dependesse do ouvinte, ela não
 * aconteceria — que é exatamente o que acontecia antes. */
W.AppStore.tournaments = W.AppStore.tournaments.filter((t) => String(t.id) !== 'sb');
ok('controle: o sandbox saiu da memória', !W.AppStore.tournaments.some((t) => String(t.id) === 'sb'));
const c5 = caixa();
W.renderTournaments(c5, 'sb');
await esperar(60);
const f5 = foto('sb');
ok('⭐⭐ voltou HIDRATADO sozinho: 152 inscritos e 115 jogos',
  f5.inscritos === 152 && f5.jogos === 115, f5.inscritos + '/' + f5.jogos);
ok('⭐⭐ 35/35 grupos religados', f5.religados === 35);
ok('⭐⭐ fase concluída e UM atalho nas Ferramentas', f5.completa === true && f5.atalho === 1,
  'completa=' + f5.completa + ' atalho=' + f5.atalho);
ok('  → e UM contextual', f5.contextual === 1);

console.log('\n── ⑥ outro eco de `tournaments` depois de reabrir ──');
avisos.length = 0;
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', ['real'])));
cbT(snapDe('tournaments', ['real']));
await esperar(20);
const f6 = foto('sb');
ok('⭐⭐ intacto: 152/115/35, fase concluída, 1 atalho, 1 contextual',
  f6.inscritos === 152 && f6.jogos === 115 && f6.religados === 35 && f6.completa === true &&
  f6.atalho === 1 && f6.contextual === 1);
ok('⭐⭐ sem dashboard e sem aviso', W.location.hash === '#tournaments/sb' && avisos.length === 0);

console.log('\n── ⑥b marcador de resumo: hidrata o canônico e nunca vira cartão ──');
BANCO.tournaments_summary.fallback = { id: 'fallback', _resumo: true, requiresFullRead: true,
  name: 'Resumo incompleto', memberUids: [DONO.uid], isSandbox: false };
let fullReadCalls = 0;
W.FirestoreDB._loadCompleteTournamentFromServer = async function (id) {
  fullReadCalls++;
  return { id, name: 'Resumo incompleto', memberUids: [DONO.uid], creatorUid: DONO.uid,
    isSandbox: false, testModeEnabled: false, matches: [{ id: 'canonical-match' }] };
};
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', ['real', 'fallback'])));
await esperar(20);
const hidrReal = (W.AppStore.tournaments || []).find((t) => String(t.id) === 'fallback');
ok('marcador nunca aparece como cartão/resumo', !hidrReal || hidrReal.requiresFullRead !== true);
ok('resumo incompleto é substituído pelo documento canônico', fullReadCalls === 1 && !!hidrReal && hidrReal._resumo !== true && Array.isArray(hidrReal.matches) && hidrReal.matches[0].id === 'canonical-match', 'loads=' + fullReadCalls + ' encontrou=' + !!hidrReal);
// An unchanged marker echo must reuse the canonical hydration rather than start
// another large read or remove the hydrated card from the list.
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', ['real', 'fallback'])));
await esperar(20);
const hidrEco = (W.AppStore.tournaments || []).find((t) => String(t.id) === 'fallback');
ok('eco repetido mantém a ficha hidratada e não relê o documento', fullReadCalls === 1 && !!hidrEco && hidrEco._resumo !== true,
  'loads=' + fullReadCalls + ' encontrou=' + !!hidrEco);

// Hydrated marker entries still need the canonical realtime root listener when
// their detail route opens; leaving that route must not restore the index marker.
BANCO.tournaments.fallback = { id: 'fallback', name: 'Canônico inicial', creatorUid: DONO.uid,
  memberUids: [DONO.uid], isSandbox: false, testModeEnabled: false, matches: [] };
W.AppStore.ouvirTorneioAberto('fallback');
const rootCb = (CB_ROOT.fallback || [])[0];
ok('ficha hidratada abre listener canônico', typeof rootCb === 'function');
if (rootCb) rootCb({ exists: true, data: () => Object.assign({}, BANCO.tournaments.fallback, { name: 'Canônico atualizado' }) });
await esperar(10);
const rootAtualizado = (W.AppStore.tournaments || []).find((t) => String(t.id) === 'fallback');
ok('eco do documento aberto atualiza o cartão em tempo real', !!rootAtualizado && rootAtualizado.name === 'Canônico atualizado');
W.AppStore.pararDeOuvirTorneioAberto();
const aposSair = (W.AppStore.tournaments || []).find((t) => String(t.id) === 'fallback');
ok('sair da ficha não restaura o marcador como cartão', !!aposSair && aposSair._resumo !== true && aposSair.requiresFullRead !== true);
ok('sair da ficha conserva o último eco canônico', !!aposSair && aposSair.name === 'Canônico atualizado');
W.AppStore.ouvirTorneioAberto('fallback');
ok('reabrir ficha hidratada recria listener canônico', (CB_ROOT.fallback || []).length === 2);
W.AppStore.pararDeOuvirTorneioAberto();
delete BANCO.tournaments_summary.fallback;

console.log('\n── ⑥c fallback: falha do feed secundário de árbitros não bloqueia a lista ──');
let fallbackLoadCalls = 0;
W.AppStore.loadFromFirestore = function () { fallbackLoadCalls++; };
const summaryMemberSig = 'tournaments_summary|memberUids:array-contains:' + DONO.uid;
const summaryMemberError = (CB_ERROR[summaryMemberSig] || []).filter(Boolean)[0];
if (summaryMemberError) summaryMemberError(new Error('simulated summary query denial'));
const fullMemberSig = 'tournaments|memberUids:array-contains:' + DONO.uid;
const fullRefereeSig = 'tournaments|refereeUids:array-contains:' + DONO.uid;
const fullMemberCb = (CB_QUERY[fullMemberSig] || []).slice(-1)[0];
const fullRefereeError = (CB_ERROR[fullRefereeSig] || []).filter(Boolean).slice(-1)[0];
if (fullMemberCb) fullMemberCb(snapDe('tournaments', ['real']));
if (fullRefereeError) fullRefereeError(new Error('simulated legacy referee query denial'));
await esperar(10);
ok('fallback completo inicia com o feed de membros sem aguardar árbitros', typeof fullMemberCb === 'function');
ok('falha do feed opcional de árbitros não chama recuperação global', fallbackLoadCalls === 0,
  'loadFromFirestore=' + fallbackLoadCalls);
ok('lista mantém o torneio trazido pelo feed principal', W.AppStore.tournaments.some((t) => String(t.id) === 'real'));

console.log('\n── ⑦ remoção VERDADEIRA de sandbox: quem remove é o ouvinte de `sandboxes` ──');
avisos.length = 0;
cbSb(snapDe('sandboxes', []));            // o sandbox saiu do snapshot do dono
await esperar(10);
ok('⭐ o sandbox saiu da memória', !W.AppStore.tournaments.some((t) => String(t.id) === 'sb'));
ok('  → e o torneio real NÃO foi tocado', foto('real').jogos === 115);

console.log('\n── ⑧ sandbox de OUTRO dono: nem poder, nem varrido pelo ouvinte deste dono ──');
W._sbIdsConhecidos['sb-alheio'] = true;
const c8 = caixa();
W.renderTournaments(c8, 'sb-alheio');     // chega por link direto, não pelo ouvinte
await esperar(60);
const f8 = foto('sb-alheio');
ok('entrou na lista e montou', f8.naLista === true && f8.jogos === 115);
ok('⭐ NÃO sou organizador dele', f8.organizador === false && W._souDonoDoSandbox(f8.t) === false);
ok('⭐ nenhum atalho de organizador', f8.atalho === 0);
cbSb(snapDe('sandboxes', []));            // varredura do ouvinte DESTE dono
await esperar(10);
ok('⭐⭐ e o ouvinte deste dono NÃO o removeu (não é assunto dele)',
  W.AppStore.tournaments.some((t) => String(t.id) === 'sb-alheio'));

console.log('\n── ⑨ remoção VERDADEIRA de torneio real: ainda remove, navega e avisa ──');
W.location.hash = '#tournaments/real';
avisos.length = 0;
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', [])));
cbT(snapDe('tournaments', []));            // o torneio real sumiu do snapshot
await esperar(10);
ok('⭐ saiu da memória', !W.AppStore.tournaments.some((t) => String(t.id) === 'real'));
ok('⭐ navegou pro dashboard', W.location.hash === '#dashboard', 'hash=' + W.location.hash);
ok('⭐ e avisou', avisos.length === 1 && /Torneio removido/.test(avisos[0]), JSON.stringify(avisos));

console.log('\n── ⑩ CONTROLE VERMELHO: desligadas as portas, o defeito volta ──');
/* ⚠️ Não é leitura de fonte nem réplica: são as MESMAS portas do código, neutralizadas em
 * tempo de execução pra devolver exatamente o comportamento de antes (`_prevIds` de tudo e
 * rebuild sem preservar). Se elas deixarem de ser chamadas, este item para de reproduzir o
 * defeito e falha — que é o alarme certo. */
const _idsReal = W._idsDaColecaoTorneios, _presReal = W._preservaSandboxes;
W._idsDaColecaoTorneios = function (lista) { return (lista || []).map(function (t) { return String(t.id); }); };
W._preservaSandboxes = function (novos) { return (novos || []).slice(); };
W.AppStore.tournaments = [];
W._sbIdsConhecidos = {};
['_montandoPesados', '_ultimaMontagem', '_tentativasDePartes', '_retentandoPartes', '_partesEmErro']
  .forEach((m) => { W.AppStore[m] = {}; });
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', ['real'])));
cbT(snapDe('tournaments', ['real']));
cbSb(snapDe('sandboxes', ['sb']));
await esperar(60);
ok('controle: com as portas desligadas o sandbox ainda monta', foto('sb').jogos === 115);
W.location.hash = '#tournaments/sb';
avisos.length = 0;
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', ['real'])));
cbT(snapDe('tournaments', ['real']));
await esperar(20);
const fr = foto('sb');
ok('⛔ REPRODUZIDO: o eco expulsou o sandbox da memória', fr.naLista === false);
ok('⛔ REPRODUZIDO: navegou pro dashboard', W.location.hash === '#dashboard');
ok('⛔ REPRODUZIDO: com o aviso falso "Torneio removido"',
  avisos.length === 1 && /Torneio removido/.test(avisos[0]), JSON.stringify(avisos));
W._idsDaColecaoTorneios = _idsReal; W._preservaSandboxes = _presReal;

console.log('\n── ⑪ callback atrasado após encerrar a sessão ──');
W.AppStore.stopRealtimeListener();
const stoppedGeneration = W.AppStore._realtimeGeneration;
W.AppStore.tournaments = [{ id: 'session-sentinel' }];
cbSummary.forEach((cb) => cb(snapDe('tournaments_summary', ['real'])));
cbT(snapDe('tournaments', ['real']));
await esperar(10);
ok('snapshot da sessão anterior não substitui os torneios da sessão atual',
  W.AppStore._realtimeGeneration === stoppedGeneration && W.AppStore.tournaments.some((t) => t.id === 'session-sentinel') &&
    !W.AppStore.tournaments.some((t) => t.id === 'real'),
  'generation=' + W.AppStore._realtimeGeneration + ' ids=' + (W.AppStore.tournaments || []).map((t) => t.id).join(','));

console.log(falhas === 0
  ? '\n✅ eco-de-tournaments-nao-expulsa-sandbox: OK'
  : '\n❌ eco-de-tournaments-nao-expulsa-sandbox: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO no teste:', (e && e.stack) || e); process.exit(1); });
