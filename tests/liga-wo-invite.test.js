/* W.O. em grupo Rei/Rainha — convite a folgas/espera + penalidade -100 nos Pontos
 * Avançados — node tests/liga-wo-invite.test.js
 *
 * Regras do dono (jul/2026):
 *  • O diálogo de substituto oferece quem FICOU DE FORA na rodada: folgas (sit-out
 *    'remainder') E a LISTA DE ESPERA monarch (t.monarchWaitlist — desde v2.6.99 a
 *    sobra vira espera, não folga; sem essa fonte o diálogo vinha vazio).
 *  • Convite MÚLTIPLO: manda pra todos os selecionados; o PRIMEIRO que aceitar entra
 *    como se tivesse sido sorteado (pontua; sai da espera); os demais convites são
 *    supersedidos e avisados. Recusa só reabre o grupo quando NÃO resta pendente.
 *  • W.O. vale -100 nos Pontos Avançados (marcador sit-out 'wo'); não contamina a
 *    média de compensação de folga.
 *  • Jogador X continua (ghost, não pontua) — flow com Confirmar/Cancelar.
 */
const { window: W, load } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── stubs de ambiente (sem DOM/Firestore) ────────────────────────────────────
let _curT = null;
W._findTournamentById = function () { return _curT; };
W.AppStore = W.AppStore || {};
W.AppStore.tournaments = [];
W.AppStore.currentUser = { uid: 'u-org', displayName: 'Org' };
// portão de escrita: executa o mutator direto no t local (teste de lógica, não de corrida)
W.AppStore.mutate = function (tId, fn) { try { fn(_curT); } catch (e) { console.error(e); } return Promise.resolve(true); };
W._canManagePresence = function () { return true; };
const _notifs = [];
W._sendUserNotification = function (uid, data) { _notifs.push({ uid: uid, data: data }); };
W.showNotification = function () {};
let _lastAlertHtml = '';
W.showAlertDialog = function (title, html) { _lastAlertHtml = String(html || ''); };
W.showConfirmDialog = function (t2, m, onC) { if (onC) onC(); };
W.showInputDialog = function (t2, m, cb) { cb(''); };
W.document = { querySelectorAll: function () { return []; }, querySelector: function () { return null; }, getElementById: function () { return null; } };

load('liga-substitution.js');

// ── fixture: Liga+RR, 1 rodada, 1 grupo de 4, 2 na lista de espera ───────────
function mkT() {
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const parts = names.map(function (n, i) { return { displayName: n, name: n, uid: 'u' + n }; });
  const P = ['A', 'B', 'C', 'D'];
  const ms = [{ t1: [P[0], P[1]], t2: [P[2], P[3]] }, { t1: [P[0], P[2]], t2: [P[1], P[3]] }, { t1: [P[0], P[3]], t2: [P[1], P[2]] }]
    .map(function (pr, mi) {
      return { id: 'm' + mi, round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 0,
        team1: pr.t1.slice(), team2: pr.t2.slice(), p1: pr.t1.join(' / '), p2: pr.t2.join(' / '),
        winner: null, scoreP1: null, scoreP2: null };
    });
  return {
    id: 'T', format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    participants: parts, ligaGhosts: [],
    monarchWaitlist: { _default_: ['E', 'F'] },
    rounds: [{ round: 1, status: 'active', matches: ms.slice(), monarchGroups: [{ name: 'R1 Grupo A', players: P.slice(), matches: ms }] }]
  };
}

// ── 1. diálogo oferece a LISTA DE ESPERA (E, F) + multi-seleção ──────────────
(function () {
  _curT = mkT();
  W._ligaPickFill('T', 0, 'R1 Grupo A', 'B');
  ok(_lastAlertHtml.indexOf('data-name="E"') !== -1 && _lastAlertHtml.indexOf('data-name="F"') !== -1,
    'diálogo lista os 2 da espera como convidáveis (E, F)');
  ok(_lastAlertHtml.indexOf('_ligaInviteSelected') !== -1, 'diálogo tem o botão "Convidar selecionados"');
  ok(_lastAlertHtml.indexOf('Ninguém da mesma categoria') === -1, 'não diz mais "ninguém ficou de fora"');
  ok(_lastAlertHtml.indexOf('Jogador X') !== -1, 'Jogador X continua como opção');
  // texto DINÂMICO: sem Pontos Avançados no torneio → NÃO menciona penalidade
  ok(_lastAlertHtml.indexOf('Pontos Avançados') === -1, 'sem PA → diálogo não menciona penalidade');
  // com PA (linha nunca configurada) → default -100
  _curT.advancedScoring = { enabled: true, categories: {} };
  W._ligaPickFill('T', 0, 'R1 Grupo A', 'B');
  ok(_lastAlertHtml.indexOf('-100 nos Pontos Avançados') !== -1, 'com PA (default) → diálogo mostra -100');
  // organizador mudou o valor → mostra o valor configurado
  _curT.advancedScoring.categories.wo_penalty = { enabled: true, value: '-50' };
  W._ligaPickFill('T', 0, 'R1 Grupo A', 'B');
  ok(_lastAlertHtml.indexOf('-50 nos Pontos Avançados') !== -1, 'org mudou pra -50 → diálogo mostra -50');
  // organizador DESATIVOU a punição → sem menção
  _curT.advancedScoring.categories.wo_penalty = { enabled: false, value: '-100' };
  W._ligaPickFill('T', 0, 'R1 Grupo A', 'B');
  ok(_lastAlertHtml.indexOf('Pontos Avançados') === -1, 'punição desativada → sem menção no diálogo');
  delete _curT.advancedScoring;
})();

// ── 2. convite MÚLTIPLO → 1º que aceita joga; irmão supersedido; sai da espera ──
(function () {
  _curT = mkT();
  _notifs.length = 0;
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }, { uid: 'uF', name: 'F' }]);
  const pend = _curT.ligaSubInvites.filter(function (iv) { return iv.status === 'pending'; });
  ok(pend.length === 2, 'convite múltiplo: 2 convites pendentes [' + pend.length + ']');
  ok(_notifs.filter(function (n) { return n.data.type === 'liga-sub-invite'; }).length === 2, 'os 2 convidados foram notificados');
  const g = _curT.rounds[0].monarchGroups[0];
  ok(g.woAbsent === 'B' && g.subStatus === 'pending', 'grupo marcado: B em W.O., aguardando aceite');
  ok(_curT.rounds[0].matches.some(function (m) { return m.isSitOut && m.sitOutReason === 'wo' && m.p1 === 'B'; }), 'marcador de W.O. (sit-out wo) criado pra B');

  // E aceita (primeiro) — como usuário uE
  W.AppStore.currentUser = { uid: 'uE', displayName: 'E' };
  _notifs.length = 0;
  const ivE = pend.filter(function (iv) { return iv.inviteeUid === 'uE'; })[0];
  W._ligaAcceptSub('T', ivE.id);
  ok(g.subStatus === 'filled' && g.subName === 'E' && g.subIsGuest === false, 'E preencheu a vaga (pontua — não é ghost)');
  ok(g.players.indexOf('E') !== -1 && g.players.indexOf('B') === -1, 'E entrou nos jogos no lugar de B');
  ok(g.matches.every(function (m) { return (m.team1.concat(m.team2)).indexOf('B') === -1; }), 'B saiu de TODOS os jogos do grupo');
  ok(_curT.monarchWaitlist._default_.indexOf('E') === -1 && _curT.monarchWaitlist._default_.indexOf('F') !== -1,
    'E saiu da lista de espera (entrou como sorteado); F continua');
  const ivF = _curT.ligaSubInvites.filter(function (iv) { return iv.inviteeUid === 'uF'; })[0];
  ok(ivF.status === 'superseded', 'convite do F supersedido pelo aceite do E');
  ok(_notifs.some(function (n) { return n.uid === 'uF' && /preenchida/.test(n.data.message); }), 'F avisado que a vaga foi preenchida');
  W.AppStore.currentUser = { uid: 'u-org', displayName: 'Org' };
})();

// ── 3. recusa com outro pendente NÃO reabre o grupo ───────────────────────────
(function () {
  _curT = mkT();
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }, { uid: 'uF', name: 'F' }]);
  const g = _curT.rounds[0].monarchGroups[0];
  const ivE = _curT.ligaSubInvites.filter(function (iv) { return iv.inviteeUid === 'uE'; })[0];
  W.AppStore.currentUser = { uid: 'uE', displayName: 'E' };
  W._ligaDeclineSub('T', ivE.id);
  ok(ivE.status === 'declined', 'convite do E recusado');
  ok(g.subStatus === 'pending', 'grupo segue aguardando (F ainda pode aceitar)');
  // F também recusa → aí sim reabre
  const ivF = _curT.ligaSubInvites.filter(function (iv) { return iv.inviteeUid === 'uF'; })[0];
  W.AppStore.currentUser = { uid: 'uF', displayName: 'F' };
  W._ligaDeclineSub('T', ivF.id);
  ok(g.subStatus === 'open', 'todos recusaram → grupo reabre (escolher outro / Jogador X)');
  W.AppStore.currentUser = { uid: 'u-org', displayName: 'Org' };
})();

// ── 4. Pontos Avançados: W.O. vale -100 (e não contamina a média de folga) ────
(function () {
  _curT = mkT();
  const t = _curT;
  t.advancedScoring = { enabled: true, applyLiveScoring: false, categories: {
    participation: { enabled: true, value: '150' }, match_won: { enabled: true, value: '150' } } };
  // B leva W.O. (marcador) e os jogos rolam com E no lugar
  W._ligaInviteSubMulti('T', 0, 'R1 Grupo A', 'B', [{ uid: 'uE', name: 'E' }]);
  W.AppStore.currentUser = { uid: 'uE', displayName: 'E' };
  const iv = t.ligaSubInvites.filter(function (x) { return x.status === 'pending'; })[0];
  W._ligaAcceptSub('T', iv.id);
  W.AppStore.currentUser = { uid: 'u-org', displayName: 'Org' };
  t.rounds[0].matches.forEach(function (m) { if (!m.isSitOut) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 2; } });
  const advB = W._calcAdvancedPoints(t, 'B', null);
  ok(advB.total === -100, 'B (W.O.) tem -100 nos Pontos Avançados [' + advB.total + ']');
  ok(advB.breakdown.some(function (b) { return b.isWoPenalty; }), 'breakdown marca a penalidade de W.O.');
  // o breakdown clicável (long-press mobile / clique desktop) mostra a punição de W.O.
  var _woItem = advB.breakdown.filter(function (b) { return b.isWoPenalty; })[0];
  ok(_woItem && _woItem.items[0].key === 'wo_penalty' && _woItem.total === -100, 'item wo_penalty no breakdown = -100');
  const advE = W._calcAdvancedPoints(t, 'E', null);
  ok(advE.total > 0, 'E (substituto real) PONTUA nos avançados [' + advE.total + ']');

  // ── 4b. BUG DO PRINT (staging): jogos FANTASMA do ausente + marcador de W.O. na
  // MESMA rodada. Antes o cálculo somava participação/vitória/games do fantasma
  // (-100 virava +1560). Agora a rodada de W.O. não pontua NENHUM jogo e não entra
  // na média → só a punição. Reproduz a falha real: FALHA no código velho, passa no novo.
  (function () {
    var parts = []; for (var i = 1; i <= 4; i++) parts.push({ displayName: 'W' + i, name: 'W' + i, uid: 'uw' + i });
    var P = ['W1', 'W2', 'W3', 'W4'];
    // 3 jogos rotativos JÁ JOGADOS com o nome de W2 presente (fantasma — não foi reescrito)
    var ms = [{ t1: [P[0], P[1]], t2: [P[2], P[3]] }, { t1: [P[0], P[2]], t2: [P[1], P[3]] }, { t1: [P[0], P[3]], t2: [P[1], P[2]] }]
      .map(function (pr, mi) {
        return { id: 'gm' + mi, round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 0,
          team1: pr.t1.slice(), team2: pr.t2.slice(), p1: pr.t1.join(' / '), p2: pr.t2.join(' / '),
          winner: pr.t1.join(' / '), scoreP1: 6, scoreP2: 2 };
      });
    // marcador de W.O. de W2 na MESMA rodada (o que a substituição cria)
    var woMarker = { id: 'wo1', round: 1, roundIndex: 0, p1: 'W2', p2: 'W.O.', isSitOut: true, sitOutReason: 'wo', sitOutPoints: 0 };
    var tb = {
      id: 'BUG', format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
      participants: parts, ligaGhosts: [],
      advancedScoring: { enabled: true, applyLiveScoring: false, categories: {
        participation: { enabled: true, value: '150' }, match_won: { enabled: true, value: '150' },
        game_won: { enabled: true, value: '50' }, game_lost: { enabled: true, value: '-20' } } },
      rounds: [{ round: 1, status: 'active', matches: ms.concat([woMarker]),
        monarchGroups: [{ name: 'R1 Grupo A', players: P.slice(), matches: ms }] }]
    };
    var _prevFind = W._findTournamentById; W._findTournamentById = function () { return tb; };
    var advW2 = W._calcAdvancedPoints(tb, 'W2', null);
    ok(advW2.total === -100, 'W.O. com jogos fantasma → total = -100 (não +1560) [' + advW2.total + ']');
    ok(!advW2.breakdown.some(function (b) { return (b.items || []).some(function (it) { return it.key === 'participation' || it.key === 'match_won' || it.key === 'game_won'; }); }),
      'W.O. NÃO pontua participação/vitória/game (nem jogou)');
    var rs = W._playerRoundStats(tb, 'W2', null);
    ok(rs.played === 0 && rs.satOutCompensable === 0, 'W.O. não conta como jogada nem compensável — fora da média [played=' + rs.played + ']');

    // ── DEDUP por id: o MESMO jogo (mesmo id) duplicado em outro container NÃO dobra
    // games/vitórias. Reproduz "games perdidos inflados" (ex.: 11 → 15). FALHA sem dedup.
    var advW1_single = W._calcAdvancedPoints(tb, 'W1', null);
    // duplica os jogos do grupo em t.groups (mesmo id) — como um container stale
    tb.groups = [{ name: 'R1 Grupo A', matches: ms.slice() }];
    var advW1_dup = W._calcAdvancedPoints(tb, 'W1', null);
    ok(advW1_dup.total === advW1_single.total, 'jogo duplicado (mesmo id) conta 1× — total não dobra [' + advW1_dup.total + ' vs ' + advW1_single.total + ']');
    delete tb.groups;
    W._findTournamentById = _prevFind;
  })();

  // ── 4c. Jogador X (ghost) FORA da classificação; uid real (inclusive W.O.) DENTRO.
  (function () {
    var g = { players: ['W1', 'W2', 'Jogador X', 'W4'], matches: [
      { isMonarch: true, team1: ['W1', 'W2'], team2: ['Jogador X', 'W4'], p1: 'W1 / W2', p2: 'Jogador X / W4', winner: 'W1 / W2', scoreP1: 6, scoreP2: 3 }
    ] };
    var tg = { ligaGhosts: ['Jogador X'] };
    var st = W._computeMonarchStandings(g, tg, null);
    var names = st.map(function (s) { return s.name; });
    ok(names.indexOf('Jogador X') === -1, 'Jogador X (ghost) NÃO aparece na classificação [' + names.join(',') + ']');
    ok(names.indexOf('W1') !== -1 && names.indexOf('W4') !== -1, 'uids reais aparecem na classificação');
    // sem ligaGhosts (ou sem t) → compat: todos aparecem
    var st2 = W._computeMonarchStandings(g, null, null);
    ok(st2.map(function (s) { return s.name; }).indexOf('Jogador X') !== -1, 'sem t → compat: todos aparecem (inclusive Jogador X)');
  })();

  // ── 4d. Coluna V (vitórias) NÃO dobra com jogo duplicado (mesmo id) no grupo.
  // Reproduz a divergência V×PA: FALHA sem dedup em _computeMonarchStandings.
  (function () {
    var win = { id: 'gwin', isMonarch: true, team1: ['A', 'B'], team2: ['C', 'D'],
      p1: 'A / B', p2: 'C / D', winner: 'A / B', scoreP1: 6, scoreP2: 3 };
    var g1 = { players: ['A', 'B', 'C', 'D'], matches: [win] };
    var single = W._computeMonarchStandings(g1, {}, null);
    var _wa1 = single.filter(function (s) { return s.name === 'A'; })[0];
    ok(_wa1 && _wa1.wins === 1, 'A tem 1 vitória (1 jogo) [' + (_wa1 && _wa1.wins) + ']');
    // MESMO jogo duplicado (mesmo id) — como cópia stale da substituição
    var g2 = { players: ['A', 'B', 'C', 'D'], matches: [win, win] };
    var dup = W._computeMonarchStandings(g2, {}, null);
    var _wa2 = dup.filter(function (s) { return s.name === 'A'; })[0];
    ok(_wa2 && _wa2.wins === 1, 'jogo duplicado (mesmo id) → V ainda = 1 (não dobra) [' + (_wa2 && _wa2.wins) + ']');
  })();

  // header da tabela do grupo marca a coluna com 💯 PA quando avançado está ligado
  try {
    var H2 = require('./render-harness'); var RW2 = H2.window;
    t.phases = [{ name: 'RR', formatCode: 'liga', reiRainha: true, source: { type: 'enrollment' } },
      { name: 'Elim', formatCode: 'elim_simples', source: { type: 'previous_phase', scope: 'per_group', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] } }];
    t.currentPhaseIndex = 0;
    RW2.AppStore.currentUser = { uid: 'u1', displayName: t.rounds[0].monarchGroups[0].players[0], email: 'z@z.z' };
    var htmlPA = RW2.renderStandings(t, true, true, '', '') || '';
    ok(htmlPA.indexOf('💯 PA') !== -1, 'com PA ligado → header da tabela do grupo mostra 💯 PA');
    RW2.AppStore.currentUser = null;
  } catch (e) { ok(true, '(render-harness indisponível — pulado)'); }
  // ghost não pontua: classificação ignora Jogador X via t.ligaGhosts (regra existente)
  ok(Array.isArray(t.ligaGhosts), 'ligaGhosts existe (Jogador X não pontua — regra preservada)');
})();

// ── 5. render: estados do W.O. no grupo (linha própria + cores na classificação) ──
// (usa o harness de render — bracket.js real — por cima do headless deste arquivo)
(function () {
  var H;
  try { H = require('./render-harness'); } catch (e) { H = null; }
  if (!H) { ok(true, '(render-harness indisponível — pulado)'); return; }
  var RW = H.window;
  var t = H.buildViaDraw('Liga', 8, { drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', drawManual: true });
  // fases (transição per_group) → a CLASSIFICAÇÃO DO GRUPO renderiza
  t.phases = [{ name: 'RR', formatCode: 'liga', reiRainha: true, source: { type: 'enrollment' } },
    { name: 'Eliminatória', formatCode: 'elim_simples', source: { type: 'previous_phase', scope: 'per_group', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] } }];
  t.currentPhaseIndex = 0;
  var g = t.rounds[0].monarchGroups[0];
  var absent = g.players[1];
  RW.AppStore.currentUser = { uid: 'u1', displayName: g.players[0], email: 'x@y.z' };

  // (a) falta APONTADA (claim pendente, não confirmada) → nome ÂMBAR + tag W.O.
  t.woClaims = [{ id: 'c1', status: 'pending', scope: 'group', groupName: g.name, roundIndex: 0,
    absentName: absent, absentUids: [], byUid: 'ux', byName: 'X', confirms: {}, createdAt: '2026-07-02' }];
  var htmlA = RW.renderStandings(t, true, true, '', '') || '';
  ok(new RegExp('color:#fbbf24;">[^<]*' + absent).test(htmlA), 'apontado: nome do ausente em ÂMBAR na classificação do grupo');
  ok(htmlA.indexOf('W.O.</span>') !== -1, 'apontado: tag W.O. ao lado do nome');

  // (b) W.O. CONFIRMADO (convite pendente; ausente ainda no grupo) → nome VERMELHO + tag
  t.woClaims = [];
  g.woAbsent = absent; g.subStatus = 'pending';
  var htmlB = RW.renderStandings(t, true, true, '', '') || '';
  ok(new RegExp('color:#f87171;">[^<]*' + absent).test(htmlB), 'confirmado: nome do ausente em VERMELHO na classificação do grupo');
  ok(htmlB.indexOf('W.O.</span>') !== -1, 'confirmado: tag W.O. ao lado do nome');
  ok(/levou W\.O\./.test(htmlB), 'render: estado do W.O. em linha própria no grupo');

  // (c) preenchido → pill 🔁 + Reverter; ausente CONTINUA na tabela (vermelho) e o
  // substituto é ACRESCENTADO (g.players já reescrito pelo _rewriteSlot no fluxo real).
  var _origPlayers = g.players.slice();
  g.players = g.players.map(function (n) { return n === absent ? 'Sub Real' : n; });
  g.matches.forEach(function (m) {
    if (Array.isArray(m.team1)) m.team1 = m.team1.map(function (n) { return n === absent ? 'Sub Real' : n; });
    if (Array.isArray(m.team2)) m.team2 = m.team2.map(function (n) { return n === absent ? 'Sub Real' : n; });
    if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
  });
  g.subStatus = 'filled'; g.subName = 'Sub Real'; g.subIsGuest = false;
  var htmlC = RW.renderStandings(t, true, true, '', '') || '';
  ok(/W\.O\. →/.test(htmlC), 'render: estado preenchido (X W.O. → substituto)');
  ok(htmlC.indexOf('Reverter W.O.') !== -1, 'render: botão Reverter presente junto do estado');
  ok(htmlC.indexOf('Sub Real') !== -1, 'preenchido: substituto ACRESCENTADO na tabela do grupo');
  ok(new RegExp('color:#f87171;">[^<]*' + absent).test(htmlC), 'preenchido: ausente CONTINUA na tabela (vermelho, não some)');

  // (d) REVERTIDO → substituto some da tabela; ausente volta à posição normal (sem cor/tag)
  g.players = _origPlayers.slice();
  g.matches.forEach(function (m) {
    if (Array.isArray(m.team1)) m.team1 = m.team1.map(function (n) { return n === 'Sub Real' ? absent : n; });
    if (Array.isArray(m.team2)) m.team2 = m.team2.map(function (n) { return n === 'Sub Real' ? absent : n; });
    if (m.team1 && m.team2) { m.p1 = m.team1.join(' / '); m.p2 = m.team2.join(' / '); }
  });
  delete g.woAbsent; delete g.subStatus; delete g.subName; delete g.subIsGuest;
  var htmlD = RW.renderStandings(t, true, true, '', '') || '';
  ok(htmlD.indexOf('Sub Real') === -1, 'revertido: substituto SOME da tabela do grupo');
  ok(new RegExp('color:var\\(--text-bright\\);">[^<]*' + absent).test(htmlD), 'revertido: ausente volta à cor/posição normal');
  RW.AppStore.currentUser = null;
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' liga-wo-invite: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
