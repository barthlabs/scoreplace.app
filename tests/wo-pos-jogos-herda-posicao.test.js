/* W.O. PÓS-JOGOS: PLACAR FICA, SUPLENTE HERDA VAGA E POSIÇÃO (2.0.50)
 * node tests/wo-pos-jogos-herda-posicao.test.js
 *
 * Ordem do dono (24/ago/2026, W.O. disciplinar por atitude antidesportiva):
 *   _"preciso do botao do WO mesmo depois das partidas realizadas. os placares e
 *    resultados continuam ali, mas a suplente toma o lugar de quem teve o WO decretado.
 *    A sistematica vai ser igual aquela que foi substituida por lesao Juliana Reis."_
 *
 * A sistemática da 2.0.15 (caso Juliana Reis → Erika Muller, R1 Grupo M do Confra):
 *   · PASSADO (jogo com placar) é de quem jogou — nome e placar imutáveis;
 *   · FUTURO (vaga no grupo, posição na classificação) é de quem entra — a Juliana era
 *     a 4ª, a Erika virou a 4ª.
 *
 * CONTRA A 2.0.49 ESTE ARQUIVO FICA VERMELHO em três pontos:
 *   (a) `_ligaGroupControlsHtml` escondia o botão de W.O. quando o grupo terminava
 *       (`manage && !gDone`) — o organizador ficava sem como decretar o W.O.;
 *   (b) `_rewriteSlot` trocava o elenco mas NÃO o retrato `classifCongelada` — a
 *       suplente caía pro FIM da tabela (ordem 9999) em vez de herdar a posição
 *       ([[project_classificacao_publicada_congela]]);
 *   (c) `_monWoApply` (rota canônica Rei/Rainha) renomeava o ausente também nos jogos
 *       JÁ DISPUTADOS — o resultado de quem jogou seria creditado ao substituto.
 *
 * O QUE TAMBÉM ESTÁ TRAVADO:
 *   · pós-jogos o botão é SÓ do organizador (`_canManagePresence`) — jogador do grupo
 *     não decreta W.O. disciplinar;
 *   · com o grupo EM ANDAMENTO nada muda (regra de sempre, `_canManageGroup`);
 *   · o diálogo de confirmação AVISA que os jogos disputados não mudam.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const LIGA_SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');

// ── perfis FICTÍCIOS (4 do grupo + 1 suplente na fila) ──────────────────────
const U = { ana: 'uid_ana', bia: 'uid_bia', duda: 'uid_duda', gal: 'uid_gal', sup: 'uid_sup' };
const PROFILES = {
  uid_ana:  { displayName: 'Ana Um',       gender: 'feminino' },
  uid_bia:  { displayName: 'Bia Dois',     gender: 'feminino' },
  uid_duda: { displayName: 'Duda Tres',    gender: 'feminino' },
  uid_gal:  { displayName: 'Gal Quatro',   gender: 'feminino' },
  uid_sup:  { displayName: 'Sula Suplente', gender: 'feminino' },
};

let LAST_DIALOG = null;
function loadLiga(t, opts) {
  opts = opts || {};
  const P = PROFILES;
  win.AppStore = {
    tournaments: [t],
    currentUser: opts.currentUser || { uid: 'uid_organizador', displayName: 'Organizador' },
    mutate: (tid, fn) => { fn(t); return Promise.resolve(true); },
    isOrganizer: () => true,
  };
  win._findTournamentById = (id) => (String(t.id) === String(id) ? t : null);
  win._canManagePresence = () => ('org' in opts ? !!opts.org : true);
  win._isLigaFormat = () => true;
  win._woBtnHtml = (onclick) => '<button class="wo-btn" onclick="' + onclick + '">Aplicar W.O.</button>';
  win.showNotification = () => {};
  win.showAlertDialog = (title, html) => { LAST_DIALOG = { title, html }; };
  win.showConfirmDialog = (t2, m, cb) => { if (cb) cb(); };
  win.showInputDialog = () => {};
  win._safeHtml = (s) => String(s == null ? '' : s);
  win._sendUserNotification = () => {};
  win._softRefreshView = () => {};
  win._rerenderBracket = () => {};
  win._genderForUid = (uid) => (P[uid] && P[uid].gender) || '';
  win._nameForUid = (uid) => (P[uid] && P[uid].displayName) || '';
  win._pName = (e, fb) => {
    if (!e || typeof e !== 'object') return String(e || fb || '');
    return (e.uid && P[e.uid] && P[e.uid].displayName) || e.displayName || e.name || fb || '';
  };
  win._participantUids = (e) => {
    if (!e || typeof e !== 'object') return [];
    const out = [];
    [e.uid, e.p1Uid, e.p2Uid].forEach((u) => { if (u && out.indexOf(u) === -1) out.push(u); });
    return out;
  };
  win._memberUidByName = (tt, nm) => {
    for (const k of Object.keys(P)) if (P[k].displayName === nm) return k;
    return '';
  };
  win._preloadUserProfiles = () => Promise.resolve();
  win._buildNameToUid = (tt) => {
    const m = {};
    const put = (u) => { const n = win._nameForUid(u); if (u && n && !m[n]) m[n] = u; };
    ((tt && tt.participants) || []).forEach((p) => { if (p) put(p.uid); });
    ((tt && tt.standbyParticipants) || []).forEach((p) => { if (p) put(p.uid); });
    ((tt && tt.rounds) || []).forEach((r) => (r.monarchGroups || []).forEach((g) => {
      (g.players || []).forEach((n, i) => { if ((g.playersUids || [])[i]) m[n] = g.playersUids[i]; });
    }));
    return m;
  };
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  new Function('window', 'document', LIGA_SRC)(win, globalThis.document);
}

// ── fixture: grupo TERMINADO (3 jogos com placar) + retrato congelado ────────
const PLAYERS = ['Ana Um', 'Bia Dois', 'Duda Tres', 'Gal Quatro'];
const PUIDS = [U.ana, U.bia, U.duda, U.gal];
function jogoFeito(id, i1, i2, j1, j2, s1, s2) {
  return {
    id, round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 0,
    team1: [PLAYERS[i1], PLAYERS[i2]], team1Uids: [PUIDS[i1], PUIDS[i2]],
    team2: [PLAYERS[j1], PLAYERS[j2]], team2Uids: [PUIDS[j1], PUIDS[j2]],
    p1: PLAYERS[i1] + ' / ' + PLAYERS[i2], p2: PLAYERS[j1] + ' / ' + PLAYERS[j2],
    scoreP1: s1, scoreP2: s2, winner: s1 > s2 ? 'p1' : 'p2', resultAt: '2026-08-23T18:00:00.000Z',
  };
}
function novoT() {
  const jogos = [
    jogoFeito('g0-0', 0, 1, 2, 3, 6, 3),
    jogoFeito('g0-1', 0, 2, 1, 3, 6, 4),
    jogoFeito('g0-2', 0, 3, 1, 2, 2, 6),
  ];
  const g = {
    name: 'R1 Grupo A', players: PLAYERS.slice(), playersUids: PUIDS.slice(), matches: jogos,
    // ordem PUBLICADA (o retrato): Bia 1ª, Ana 2ª, Duda 3ª, Gal 4ª
    classifCongelada: [
      { name: 'Bia Dois', uid: U.bia }, { name: 'Ana Um', uid: U.ana },
      { name: 'Duda Tres', uid: U.duda }, { name: 'Gal Quatro', uid: U.gal },
    ],
    classifCongeladaAt: '2026-08-23T19:00:00.000Z',
  };
  return {
    t: {
      id: 'tour_teste_wo_pos', name: 'Teste', format: 'Liga', status: 'active',
      ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', woScope: 'individual',
      creatorUid: 'uid_organizador',
      participants: [
        { uid: U.ana, ligaActive: true }, { uid: U.bia, ligaActive: true },
        { uid: U.duda, ligaActive: true }, { uid: U.gal, ligaActive: true },
      ],
      standbyParticipants: [
        { uid: U.sup, ligaActive: true, selfEnrolled: true, addedAt: '2026-08-20T10:00:00.000Z' },
      ],
      waitlist: [],
      rounds: [{ round: 1, roundIndex: 0, status: 'active', monarchGroups: [g], matches: jogos.slice() }],
      matches: [], groups: [],
    },
    g, jogos,
  };
}

// ── 1. o botão APARECE pro organizador com o grupo TERMINADO ────────────────
sec(function () {
  const { t, g } = novoT();
  loadLiga(t, { org: true });
  const html = win._ligaGroupControlsHtml(t, 0, g) || '';
  ok(html.indexOf('_ligaAbsentFlow') !== -1, 'grupo terminado: o organizador devia ver o botão de Aplicar W.O.');
});

// ── 2. e NÃO aparece pra jogador do grupo (pós-jogos é ato do organizador) ──
sec(function () {
  const { t, g } = novoT();
  loadLiga(t, { org: false, currentUser: { uid: U.ana, displayName: 'Ana Um' } });
  const html = win._ligaGroupControlsHtml(t, 0, g) || '';
  ok(html.indexOf('_ligaAbsentFlow') === -1, 'grupo terminado: jogador do grupo NÃO devia ver o botão');
});

// ── 3. o diálogo de confirmação AVISA que os jogos disputados não mudam ─────
sec(function () {
  const { t } = novoT();
  loadLiga(t, { org: true });
  LAST_DIALOG = null;
  win._ligaWoConfirm(t.id, 0, 'R1 Grupo A', 'Duda Tres');
  ok(!!LAST_DIALOG && String(LAST_DIALOG.html).indexOf('não mudam') !== -1,
    'o diálogo devia avisar que os jogos disputados não mudam');
});

// ── 4. APLICAR: placar fica, suplente herda elenco E posição no retrato ─────
sec(function () {
  const { t, g, jogos } = novoT();
  loadLiga(t, { org: true });
  const antes = JSON.parse(JSON.stringify(jogos));
  win._ligaApplyWo(t.id, 0, 'R1 Grupo A', 'Duda Tres');

  // (a) os 3 jogos disputados estão INTACTOS — nome, placar, winner
  jogos.forEach(function (m, i) {
    ok(m.p1 === antes[i].p1 && m.p2 === antes[i].p2, 'jogo ' + m.id + ': nomes mudaram (era "' + antes[i].p1 + '" × "' + antes[i].p2 + '", virou "' + m.p1 + '" × "' + m.p2 + '")');
    ok(m.scoreP1 === antes[i].scoreP1 && m.scoreP2 === antes[i].scoreP2 && m.winner === antes[i].winner,
      'jogo ' + m.id + ': placar/winner mudou');
  });

  // (b) o ELENCO trocou: a Sula está no lugar da Duda, mesmo índice
  const gi = g.players.indexOf('Sula Suplente');
  ok(gi === 2, 'Sula devia ocupar o índice 2 do elenco (o da Duda), está em ' + gi);
  ok(g.players.indexOf('Duda Tres') === -1, 'Duda não devia mais estar no elenco do grupo');
  ok((g.playersUids || [])[2] === U.sup, 'playersUids[2] devia ser o uid da Sula');

  // (c) o RETRATO herdou a posição: Sula é a 3ª (índice 2), com o uid DELA
  const cong = g.classifCongelada || [];
  ok(cong[2] && cong[2].name === 'Sula Suplente' && cong[2].uid === U.sup,
    'retrato: a 3ª posição devia ser da Sula (herdada da Duda), está ' + JSON.stringify(cong[2]));
  ok(cong[0] && cong[0].uid === U.bia && cong[3] && cong[3].uid === U.gal,
    'retrato: as demais posições não podiam mudar');

  // (d) a marca do W.O. existe (folga sintética sitOutReason:'wo' da Duda)
  const r = t.rounds[0];
  const woM = (r.matches || []).filter(function (m) { return m.isSitOut && m.sitOutReason === 'wo' && m.p1 === 'Duda Tres'; });
  ok(woM.length === 1, 'devia existir 1 marcador de W.O. da Duda na rodada, achei ' + woM.length);
  ok(g.woAbsent === 'Duda Tres' && g.woAbsentUid === U.duda && g.subName === 'Sula Suplente' && g.subUid === U.sup,
    'estado do grupo (woAbsent/subName/uids) errado: ' + JSON.stringify({ a: g.woAbsent, au: g.woAbsentUid, s: g.subName, su: g.subUid }));

  // (e) a Duda foi DESATIVADA e a Sula entrou no elenco do torneio, fora da fila
  const duda = (t.participants || []).find(function (p) { return p && p.uid === U.duda; });
  ok(!!duda && duda.ligaActive === false && !!duda.woDeactivatedAt, 'Duda devia estar desativada no elenco');
  const sula = (t.participants || []).find(function (p) { return p && p.uid === U.sup; });
  ok(!!sula && sula.ligaActive === true && sula.woSubstituteFor === 'Duda Tres', 'Sula devia estar no elenco, ativa, com o rastro do W.O.');
  ok(!(t.standbyParticipants || []).some(function (p) { return p && p.uid === U.sup; }), 'Sula devia ter saído da fila');
});

// ── 5. rota canônica Rei/Rainha: jogo com placar NÃO é renomeado ────────────
sec(function () {
  const t2 = {
    id: 'tour_mon', name: 'Mon', format: 'Liga', status: 'active',
    ligaRoundFormat: 'rei_rainha',
    creatorUid: 'uid_organizador',
    participants: [
      { uid: U.ana, displayName: 'Ana Um' }, { uid: U.bia, displayName: 'Bia Dois' },
      { uid: U.duda, displayName: 'Duda Tres' }, { uid: U.gal, displayName: 'Gal Quatro' },
      { uid: U.sup, displayName: 'Sula Suplente' },
    ],
    matches: [
      { id: 'm1', bracket: 'monarch', isMonarch: true, monarchGroup: 0, groupName: 'Grupo K', phaseIndex: 0, round: 1,
        team1: ['Ana Um', 'Duda Tres'], team1Uids: [U.ana, U.duda], team2: ['Bia Dois', 'Gal Quatro'], team2Uids: [U.bia, U.gal],
        p1: 'Ana Um / Duda Tres', p2: 'Bia Dois / Gal Quatro', scoreP1: 6, scoreP2: 2, winner: 'p1', resultAt: '2026-08-23T18:00:00.000Z' },
      { id: 'm2', bracket: 'monarch', isMonarch: true, monarchGroup: 0, groupName: 'Grupo K', phaseIndex: 0, round: 1,
        team1: ['Ana Um', 'Bia Dois'], team1Uids: [U.ana, U.bia], team2: ['Duda Tres', 'Gal Quatro'], team2Uids: [U.duda, U.gal],
        p1: 'Ana Um / Bia Dois', p2: 'Duda Tres / Gal Quatro', scoreP1: null, scoreP2: null, winner: null },
    ],
    rounds: [], groups: [], history: [],
  };
  loadLiga(t2, { org: true });
  win._monWoApply(t2.id, 0, 'Grupo K', 'Duda Tres', 'Sula Suplente', false);
  const m1 = t2.matches.find(function (m) { return m.id === 'm1'; });
  const m2 = t2.matches.find(function (m) { return m.id === 'm2'; });
  ok(m1.p1 === 'Ana Um / Duda Tres' && m1.scoreP1 === 6 && m1.winner === 'p1',
    'jogo COM placar foi alterado na rota canônica: ' + m1.p1);
  ok(m2.p2 === 'Sula Suplente / Gal Quatro' && (m2.team2Uids || [])[0] === U.sup,
    'jogo SEM placar devia receber a Sula no lugar da Duda: ' + m2.p2);
  const wm = t2.matches.find(function (m) { return m.isSitOut && m.sitOutReason === 'wo'; });
  ok(!!wm && wm.p1 === 'Duda Tres' && wm.woReplacedBy === 'Sula Suplente', 'marcador de W.O. canônico ausente/errado');

  // e o botão pós-done: organizador vê, jogador não
  const htmlOrg = win._monWoControlHtml(t2.id, 0, 'Grupo K', true) || '';
  ok(htmlOrg.indexOf('_monWoFlow') !== -1, 'rota canônica: organizador devia ver o botão com o grupo terminado');
  loadLiga(t2, { org: false, currentUser: { uid: U.ana, displayName: 'Ana Um' } });
  const htmlJog = win._monWoControlHtml(t2.id, 0, 'Grupo K', true) || '';
  ok(htmlJog.indexOf('_monWoFlow') === -1, 'rota canônica: jogador não devia ver o botão com o grupo terminado');
});

console.log('\nwo-pos-jogos-herda-posicao: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
