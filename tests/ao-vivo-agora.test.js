/* AO VIVO AGORA — a vitrine dos placares em andamento (1.9.36).
 *
 * O que este teste protege, que é o que o dono pediu em palavras:
 *   • "só aparece quando tem alguma partida usando o placar ao vivo" → sem doc fresco a
 *     lista é vazia, e quem fechou o app no meio SAI sozinho (sinal velho ≠ ao vivo);
 *   • "placares de torneios em que a pessoa participa ou de amigos aparecem no topo";
 *   • "apenas assiste, nao edita" → o cartão só sabe ABRIR o espectador; nenhuma ação de
 *     placar sai daqui;
 *   • "notificação para todos os inscritos (mesmo que em lista de espera ou inativo ou
 *     wo)" → o convite varre elenco + espera + organização, e nunca o próprio autor.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

// sandbox mínimo: o módulo é DOM-livre nas partes que decidem (id, frescor, ordem, alvos)
const sandbox = { console, Date, Math, JSON, setTimeout, clearTimeout, setInterval, clearInterval, Promise };
sandbox.window = sandbox;
sandbox.document = { getElementById: function () { return null; }, createElement: function () { return {}; }, head: { appendChild: function () {} } };
sandbox._safeHtml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
sandbox.AppStore = { currentUser: { uid: 'eu', friends: ['amiga'] }, tournaments: [] };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'live-now.js'), 'utf8'), sandbox, { filename: 'live-now.js' });
const W = sandbox;

console.log('\n== ao vivo agora ==');

// ── 1. id determinístico (reabrir o mesmo jogo NÃO cria um segundo "ao vivo") ──
ok(W._liveNowId('tournament', 'tour_1', 'm9') === W._liveNowId('tournament', 'tour_1', 'm9'), 'mesmo jogo → mesmo id');
ok(W._liveNowId('tournament', 'tour_1', 'm9') !== W._liveNowId('tournament', 'tour_1', 'm8'), 'jogos diferentes → ids diferentes');
ok(W._liveNowId('casual', 'abc/def').indexOf('/') === -1, 'id de documento nunca leva "/" (o Firestore recusa)');

// ── 2. "ao vivo" exige STATUS e SINAL RECENTE ─────────────────────────────────
const agora = 1787000000000;
ok(W._liveNowIsFresh({ status: 'live', lastActivityAt: agora - 5000 }, agora) === true, 'batendo agora → ao vivo');
ok(W._liveNowIsFresh({ status: 'live', lastActivityAt: agora - (4 * 60 * 1000) }, agora) === false,
  'sem sinal há 4 min → sai da vitrine sozinho (fechou o app no meio)');
ok(W._liveNowIsFresh({ status: 'finished', lastActivityAt: agora }, agora) === false, 'encerrada não é "ao vivo"');

// ── 2b. A JANELA DE FRESCOR E O HEARTBEAT ANDAM JUNTOS (1.9.37) ──────────────
// O dono cortou os 3 min ("tempo demais"). O piso é o heartbeat: janela menor que a
// batida faria um jogo EM ANDAMENTO piscar pra fora da lista. Este teste existe pra
// que encurtar um sem olhar o outro não passe batido.
const lnSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'live-now.js'), 'utf8');
const hbMatch = lnSrc.match(/HEARTBEAT_MS\s*=\s*(\d+)\s*\*\s*1000/);
ok(!!hbMatch, 'heartbeat declarado no módulo');
const hbMs = hbMatch ? Number(hbMatch[1]) * 1000 : 0;
ok(W._LIVE_STALE_MS === 60 * 1000, 'sem sinal por 1 min → sai da vitrine (got ' + W._LIVE_STALE_MS + 'ms)');
ok(W._LIVE_STALE_MS >= hbMs * 2, 'a janela tolera DUAS batidas perdidas (rede de quadra cai) — ' +
  W._LIVE_STALE_MS + 'ms vs heartbeat ' + hbMs + 'ms');
ok(W._liveNowIsFresh({ status: 'live', lastActivityAt: agora - 40000 }, agora) === true, '40s sem ponto ainda é ao vivo (o heartbeat segura)');
ok(W._liveNowIsFresh({ status: 'live', lastActivityAt: agora - 70000 }, agora) === false, '70s sem sinal nenhum → sumiu');

// ── 2c. PRIVADO SÓ PRA QUEM ESTÁ NELE ────────────────────────────────────────
// A plateia mora no DOC (`audience`), porque é ela que a REGRA lê e é por ela que a
// consulta filtra. Filtrar só na tela deixaria o doc legível por quem soubesse o id.
const publicados = [];
W.FirestoreDB = { db: { collection: function () { return { doc: function (id) { return {
  set: function (payload) { publicados.push({ id: id, payload: payload }); return Promise.resolve(); }
}; } }; } } };
W._liveNowPublish({ id: 'x1', kind: 'casual', p1Players: ['A'], p2Players: ['B'] });
ok(publicados.length === 1 && JSON.stringify(publicados[0].payload.audience) === '["*"]',
  'casual/público → plateia "*" (qualquer um assiste)');
W._liveNowPublish({ id: 'x2', kind: 'tournament', audience: ['u1', 'u2'], p1Players: ['A'], p2Players: ['B'] });
ok(publicados.length === 2 && publicados[1].payload.audience.join(',') === 'u1,u2',
  'torneio privado → plateia é a lista de quem está nele');
const bui0 = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
ok(/isCasual \|\| !t \|\| t\.isPublic !== false\) return \['\*'\]/.test(bui0),
  'quem monta a plateia lê `t.isPublic` do torneio (privado = elenco + espera + organização)');
ok(/audience', 'array-contains-any'/.test(lnSrc), 'a CONSULTA pede só o que a regra deixaria ler');

// ── 2d. A VITRINE COMEÇA NO 1º PONTO, NÃO NA ABERTURA ────────────────────────
ok(/_pontos\s*=\s*\(state && Array\.isArray\(state\.pointLog\)\)[\s\S]{0,120}if \(!_lnPub && _pontos < 1\) return;/.test(bui0),
  'abrir o placar (conferir config, escolher sacador) não publica nem avisa ninguém');

// ── 3. a ordem que o dono pediu ───────────────────────────────────────────────
W.AppStore.tournaments = [{ id: 'meuTour', memberUids: ['eu', 'outro'] }];
const ordenada = W._liveNowRank([
  { id: 'd', tournamentId: 'zzz', playerUids: ['ninguem'], lastActivityAt: agora - 1000 },
  { id: 'c', tournamentId: 'zzz', playerUids: ['amiga'], lastActivityAt: agora - 9000 },
  { id: 'b', tournamentId: 'meuTour', playerUids: ['outro'], lastActivityAt: agora - 9000 },
  { id: 'a', tournamentId: 'zzz', playerUids: ['eu'], lastActivityAt: agora - 90000 }
]);
ok(ordenada.map(function (x) { return x.id; }).join('') === 'abcd',
  'ordem: eu jogando → meu torneio → amigo em quadra → o resto (got ' + ordenada.map(function (x) { return x.id; }).join('') + ')');
const empate = W._liveNowRank([
  { id: 'velho', playerUids: [], lastActivityAt: agora - 60000 },
  { id: 'novo', playerUids: [], lastActivityAt: agora - 1000 }
]);
ok(empate[0].id === 'novo', 'empate de peso → o mais recente primeiro');

// ── 4. o cartão só ABRE o espectador — nenhuma ação de placar mora nele ───────
const card = W._liveNowCardHtml({
  id: 't_1__m9', kind: 'tournament', tournamentName: 'Confra', title: 'Grupo Q · Jogo 3',
  p1Players: ['Ana', 'Bia'], p2Players: ['Cris', 'Dan'], playerUids: ['eu'], _peso: 4,
  startedAt: agora - 600000, lastActivityAt: agora,
  state: { sets: [{ p1: 6, p2: 4 }], currentGameP1: 40, currentGameP2: 30, serveOrder: [{ team: 1, name: 'Ana' }], totalGamesPlayed: 10 }
});
ok(card.indexOf('_openLiveSpectator') !== -1, 'o cartão abre o espectador');
ok(!/_liveScorePoint|_liveScoreUndo|_liveScoreFinish|_liveScoreReset/.test(card), 'o cartão NÃO carrega nenhuma ação de placar (assiste, não edita)');
ok(card.indexOf('Ana / Bia') !== -1 && card.indexOf('Cris / Dan') !== -1, 'mostra quem está em quadra');
ok(card.indexOf('VS') !== -1, 'usa a gramática do card da chave (linha de time · VS · linha de time)');
ok(card.indexOf('40') !== -1, 'mostra o ponto do game corrente');

// ── 4b. A TRAVA DE "SÓ ASSISTE" É ESTRUTURAL, E FICA NO CÓDIGO ───────────────
// O espectador abre a MESMA tela do placar (ordem do dono). Então a garantia não pode
// ser "o botão não aparece": tem que ser porta fechada nas funções que mudam a partida.
// Se alguém acrescentar um mutador novo sem a guarda, este teste cai.
const bui = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
ok(/function _addPoint\(player\) \{\s*\n\s*if \(_spectate\) return;/.test(bui),
  '_addPoint (a porta única do ponto) sai na 1ª linha quando é espectador');
ok(/function _saveResult\([^)]*\) \{[\s\S]{0,400}?if \(_spectate\) return;/.test(bui),
  '_saveResult não grava a partida dos outros no histórico de quem assiste');
['_liveScoreFinish', '_liveScoreMinus', '_liveScoreUndoLastPoint', '_liveScoreReset', '_liveScoreRestart', '_liveScoreGoToSetup'].forEach(function (fn) {
  const re = new RegExp('window\\.' + fn + ' = function[^\\n]*\\n\\s*if \\(_spectate\\) return;');
  ok(re.test(bui), fn + ' tem guarda de espectador');
});
ok(/_spectate\) return;\s*\/\/ espectador NÃO publica/.test(bui) || /if \(_spectate\) return;[\s\S]{0,120}_liveNowPublish/.test(bui),
  'quem assiste não publica de volta na vitrine (senão o espectador vira emissor)');

// ── 5. o convite alcança QUEM ESTÁ FORA DO ELENCO também ─────────────────────
const avisados = [];
W._sendUserNotification = function (uid, nd) { avisados.push({ uid: uid, tipo: nd.type, liveId: nd.liveId }); return Promise.resolve(); };
W._participantUids = function (p) { return p && p.uid ? [p.uid] : (p && p.p1Uid ? [p.p1Uid, p.p2Uid].filter(Boolean) : []); };
W._getWaitlist = function () { return [{ uid: 'naEspera' }]; };
W.FirestoreDB = { db: {} };
const torneio = {
  id: 'tour_1', name: 'Confra', creatorUid: 'org',
  participants: [{ uid: 'eu' }, { uid: 'ativo' }, { uid: 'desativado', ligaActive: false }, { uid: 'levouWo' }],
  coHosts: [{ uid: 'coorg', status: 'active' }, { uid: 'coorgSaiu', status: 'removed' }]
};
const info = { id: 't_tour_1__m9', title: 'Grupo Q', p1Players: ['Ana'], p2Players: ['Bia'] };

W._liveNowNotifyEnrolled(torneio, info).then(function () {
  const uids = avisados.map(function (a) { return a.uid; }).sort().join(',');
  ok(uids.indexOf('naEspera') !== -1, 'quem está na LISTA DE ESPERA é convidado');
  ok(uids.indexOf('desativado') !== -1, 'quem está DESATIVADO é convidado');
  ok(uids.indexOf('levouWo') !== -1, 'quem levou W.O. é convidado');
  ok(uids.indexOf('org') !== -1 && uids.indexOf('coorg') !== -1, 'organizador e co-organizador também');
  ok(uids.indexOf('coorgSaiu') === -1, 'co-organizador removido NÃO');
  ok(uids.indexOf('eu') === -1, 'quem abriu o placar não recebe convite pra assistir a si mesmo');
  ok(avisados.every(function (a) { return a.tipo === 'live_score_started' && a.liveId === info.id; }),
    'o aviso carrega o tipo e o id do jogo (é ele que abre o espectador)');

  // 2ª chamada não repete o convite
  const antes = avisados.length;
  W._liveNowNotifyEnrolled(torneio, info).then(function () {
    ok(avisados.length === antes, 'o convite sai UMA vez por partida, não a cada re-render');
    console.log((fail ? '❌' : '✅') + ' ao-vivo-agora: ' + pass + ' asserções, ' + fail + ' falha(s)');
    process.exit(fail ? 1 : 0);
  });
});
