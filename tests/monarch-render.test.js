/* Rei/Rainha — saída OBSERVÁVEL (grupos de 4, parceiros rotativos, standings individuais
 * renderizados, coroa do invicto). Rei/Rainha é MODO de sorteio, NÃO formato
 * (project_rei_rainha_is_drawmode_not_format) — o shape é o CANÔNICO que o create grava:
 * format='Liga' + ligaRoundFormat/drawMode='rei_rainha'. Sorteado pelo motor canônico via
 * generateDrawFunction REAL; render por _renderMonarchStage REAL.
 */
const H = require('./render-harness');
const W = H.window, buildViaDraw = H.buildViaDraw, hydrateMonarchGroups = H.hydrateMonarchGroups, simulate = H.simulateRounds;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== Rei/Rainha — saída observável ==');

// modelo NOVO (campanha kill-monarch-format): jogos monarca moram em t.rounds[].matches
// (motor league incremental) — nada em t.matches.
function monMatches(t) {
  var out = [];
  (t.rounds || []).forEach(function (r) { ((r && r.matches) || []).forEach(function (m) { if (m.isMonarch) out.push(m); }); });
  return out;
}
function pairKey(arr) { return (arr || []).slice().sort().join('+'); }

// ---------- 1. ESTRUTURA: grupos de 4, 3 jogos, PARCEIROS ROTATIVOS (AB/CD, AC/BD, AD/BC) ----------
(function () {
  const t = buildViaDraw('Liga', 8, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true });
  ok(t._canonicalDraw === true, 'sorteado pelo motor canônico (_canonicalDraw)');
  ok(W._isMonarchFormat(t) === true, '_isMonarchFormat(t) = true (é MODO, detectado)');
  const ms = monMatches(t);
  ok(ms.length === 6, '8 jogadores → 6 jogos monarch (2 grupos × 3) — got ' + ms.length);
  const groups = {};
  ms.forEach(function (m) { var g = m.monarchGroup; (groups[g] = groups[g] || []).push(m); });
  const gk = Object.keys(groups);
  ok(gk.length === 2, '2 grupos (got ' + gk.length + ')');
  let rotOk = true, sizeOk = true;
  gk.forEach(function (g) {
    const arr = groups[g];
    if (arr.length !== 3) sizeOk = false;
    // jogadores do grupo
    const players = {};
    arr.forEach(function (m) { (m.team1 || []).concat(m.team2 || []).forEach(function (p) { players[p] = 1; }); });
    if (Object.keys(players).length !== 4) sizeOk = false;
    // parcerias: 3 jogos × 2 duplas = 6 pares distintos = TODAS as C(4,2)=6 combinações
    const pairs = {};
    arr.forEach(function (m) { pairs[pairKey(m.team1)] = 1; pairs[pairKey(m.team2)] = 1; });
    if (Object.keys(pairs).length !== 6) rotOk = false; // parceiro rotativo: cada dupla é única
  });
  ok(sizeOk, 'cada grupo: 4 jogadores, 3 jogos');
  ok(rotOk, 'parceiros ROTATIVOS: as 6 duplas de cada grupo são todas distintas (AB/CD, AC/BD, AD/BC)');
})();

// ---------- 2. RENDER: tabela de classificação individual + marcador CLASSIF. ----------
// A marcação CLASSIF vem SÓ da transição de fases (mapping.rankTo da próxima fase) —
// como todo formato (fim do campo legado por-fase). Fixture: fase 0 rei/rainha
// com uma fase 1 puxando os 2 melhores de cada grupo (Rei+Vice).
(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 8, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  t.currentPhaseIndex = 0;
  t.phases = [
    { name: 'Rei/Rainha' },
    { name: 'Eliminatória', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] } }
  ];
  const html = W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
  ok(html.length > 100, '_renderMonarchStage produz HTML');
  ok(/<table/.test(html), 'render tem tabela de classificação');
  // v4.4.117: a marcação de "quem classifica" é a TARJA VERDE na linha (rgba(34,197,94,0.10)),
  // não mais o texto "CLASSIF." (removido). Vem da transição de fase (format2 mapping.rankTo)
  // via _phaseClassifiedCount — 100% canônico. Antes o teste checava a string velha e falhava.
  ok(/rgba\(34,\s*197,\s*94,\s*0\.1/.test(html), 'render marca os classificados (tarja verde, via format2)');
})();

// ---------- 3. COROA DO INVICTO: standings individuais + coroa quando alguém vence tudo ----------
(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 8, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  simulate(t); // winner=p1 sempre → em cada grupo um jogador fica invicto (parceiro rotativo)
  const st = W._computeMonarchStandings({ players: t.groups[0].players, matches: t.groups[0].matches });
  ok(st.length === 4, 'standings do grupo = 4 jogadores');
  ok(st[0].wins === 3 && st[0].losses === 0 && st[0].played === 3, '1º do grupo é INVICTO (3V 0D)');
  const html = W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
  ok(/Rei invicto|Rainha invicta/.test(html), 'render mostra a COROA do invicto (SVG "Rei/Rainha invicta")');
})();

// ---------- 4. VARREDURA: 8/12/16 jogadores → sempre grupos de 4, 3 jogos, sem sobra ----------
(function () {
  let sweepFail = 0;
  [8, 12, 16].forEach(function (n) {
    const t = buildViaDraw('Liga', n, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true });
    const ms = monMatches(t);
    const groups = {};
    ms.forEach(function (m) { (groups[m.monarchGroup] = groups[m.monarchGroup] || []).push(m); });
    const gs = Object.keys(groups);
    if (gs.length !== n / 4) { sweepFail++; console.log('    n=' + n + ' grupos=' + gs.length + ' (esperado ' + (n / 4) + ')'); }
    gs.forEach(function (g) { if (groups[g].length !== 3) { sweepFail++; console.log('    n=' + n + ' grupo com ' + groups[g].length + ' jogos'); } });
  });
  ok(sweepFail === 0, 'varredura 8/12/16: grupos de 4 com 3 jogos, sem sobra');
})();

// ---------- 5. PRESENÇA: 1 botão "Cheguei" no header do grupo pro jogador logado ----------
// Regressão: o botão sumia porque gateava em _participantsSelfPresence (resultEntry). Presença
// é ORTOGONAL a quem lança placar → sempre visível pro jogador do grupo (toggle Cheguei/Presente).
(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 8, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  const p0 = t.groups[0].players[0];
  const prevUser = W.AppStore.currentUser;
  W.AppStore.currentUser = { uid: 'u-cheguei', displayName: p0, email: 'p0@x.z' };
  t.memberUids = ['u-cheguei'];
  // resultEntry 'organizer' de propósito: o botão NÃO pode depender disso.
  t.resultEntry = 'organizer';
  const html = W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
  ok(/Cheguei/.test(html) && /_toggleCheckIn/.test(html), 'header do grupo tem "Cheguei" (mesmo com resultEntry=organizer)');
  // marca presente → vira "Presente" (toggle)
  if (typeof W._idMapSet === 'function') { t.checkedIn = t.checkedIn || {}; W._idMapSet(t, t.checkedIn, p0, true); }
  const html2 = W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
  ok(!/Presente/.test(html) && /Presente/.test(html2), 'ausente→"Cheguei", presente→"Presente" (toggle)');
  W.AppStore.currentUser = prevUser;
})();

// ---------- 6. PONTOS AVANÇADOS: standings do Rei/Rainha aplicam advancedScoring ----------
// Regressão: _computeMonarchStandings ignorava advancedScoring (Pts = soma de games).
// Com o motor de pontos avançados ligado, o total avançado vira a métrica de classificação
// (participação/vitória/games/TB) — a MESMA da Liga — e a coluna "Pts" mostra isso.
(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 8, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  t.advancedScoring = { enabled: true, applyLiveScoring: false, categories: {
    participation: { enabled: true, value: '150' }, match_won: { enabled: true, value: '150' },
    game_won: { enabled: true, value: '50' }, game_lost: { enabled: true, value: '-20' },
    tiebreak_point: { enabled: true, value: '2' } } };
  simulate(t);
  const g = t.groups[0];
  const simple = W._computeMonarchStandings({ players: g.players, matches: g.matches });          // sem t
  const adv = W._computeMonarchStandings({ players: g.players, matches: g.matches }, t, null);     // com t
  ok(simple.every(function (s) { return s.points == null; }), 'sem t → pontos simples (sem campo points)');
  ok(adv.every(function (s) { return typeof s.points === 'number'; }), 'com advancedScoring → cada jogador tem points avançado');
  ok(adv[0].points >= adv[adv.length - 1].points, 'ordenado por pontos avançados (desc)');
  ok(adv[0].points > 1000, 'total avançado reflete participação/vitória/games (não a soma crua de games)');
  const html = W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
  ok(/💯 PA/.test(html), 'render marca a coluna de pontos avançados como "💯 PA"');
  ok(/_paTouchStart|_paClick/.test(html), 'célula de PA é clicável / long-press (abre o detalhamento)');
})();

// ---------- 7. GRUPO DO VISITANTE NO TOPO: cada usuário vê o próprio grupo em 1º ----------
(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 8, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  const gB = t.groups[1], meB = gB.players[0];
  const prev = W.AppStore.currentUser;
  W.AppStore.currentUser = { uid: 'u-top', displayName: meB, email: 'top@x.z' };
  t.memberUids = ['u-top'];
  const html = W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
  ok(html.indexOf(gB.name) > -1 && html.indexOf(gB.name) < html.indexOf(t.groups[0].name),
    'grupo do visitante (B) renderiza ANTES do A');
  W.AppStore.currentUser = null;
  const html2 = W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
  ok(html2.indexOf(t.groups[0].name) < html2.indexOf(gB.name), 'sem login → ordem original (A antes de B)');
  W.AppStore.currentUser = prev;
})();

// ---------- 8. HEADER DO GRUPO na rota Liga (t.rounds[].monarchGroups) ----------
// Regressão (staging 4.1.80): o grupo monarca da rota Liga mostrava "Faltou alguém?"
// + "Combinar jogos" no header e um "Cheguei" POR JOGO. Pedido do dono: no grupo do
// usuário → [W.O.] [Cheguei] [Combinar jogos] (1 Cheguei só); nos demais grupos só o
// W.O., visível a membros do grupo + organizador (nunca a membros de outros grupos).
(function () {
  var HL = require('./headless');
  HL.load('liga-substitution.js');
  HL.load('wo-claim.js');
  const t = buildViaDraw('Liga', 8, { drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', drawManual: true });
  ok(Array.isArray(t.rounds) && t.rounds[0] && (t.rounds[0].monarchGroups || []).length === 2, 'Liga+RR: sorteio gerou 2 grupos em t.rounds[0].monarchGroups');
  const gA = t.rounds[0].monarchGroups[0];
  const meName = gA.players[0];
  const prev = W.AppStore.currentUser;

  // (a) JOGADOR do grupo A (não-org): 1 Cheguei (header do grupo dele), 1 W.O. (só o
  // grupo dele), label padrão W.O. (sem "Faltou alguém?"). Identidade é uid-first
  // (_canManageGroup): o currentUser usa o uid REAL do inscrito (buildViaDraw = 'u'+i).
  W.AppStore.currentUser = { uid: 'u' + String(meName).replace(/^J/, ''), displayName: meName, email: 'hdr@x.z' };
  const html = W.renderStandings(t, false, true, '', '') || '';
  ok(html.length > 100, 'renderStandings (rota Liga) produz HTML');
  const nCheguei = (html.match(/📍 Cheguei/g) || []).length;
  ok(nCheguei === 1, 'jogador: exatamente 1 "Cheguei" (header do grupo dele) — got ' + nCheguei);
  ok(html.indexOf('Faltou alguém') === -1, 'label antigo "Faltou alguém?" não aparece (virou W.O.)');
  const nWo = (html.match(/>W\.O\.<\/button>/g) || []).length;
  ok(nWo === 1, 'jogador: botão W.O. só no PRÓPRIO grupo (não vê o dos outros) — got ' + nWo);
  // header do grupo: SEU GRUPO presente (grupo do usuário) e SEM o badge
  // "Em andamento" (removido pra todos — pedido do dono).
  ok(html.indexOf('SEU GRUPO') !== -1, 'header: badge SEU GRUPO no grupo do usuário');
  ok(html.indexOf('Em andamento') === -1, 'header: badge "Em andamento" removido');
  // âncoras do auto-scroll de entrada: grupo marcado ([data-group-box]) e card do
  // usuário PENDENTE marcado ([data-my-pending="1"]) — o scroll da entrada mira o
  // topo do grupo quando o próximo jogo mora num grupo.
  ok((html.match(/data-group-box="1"/g) || []).length === 2, 'âncora de grupo (data-group-box) nos 2 grupos');
  ok(/data-my-match="1" data-my-pending="1"/.test(html), 'card pendente do usuário marcado (data-my-pending=1)');

  // (b) ORGANIZADOR (não joga): W.O. em TODOS os grupos, nenhum Cheguei.
  W.AppStore.currentUser = { uid: 'u-org', displayName: 'Organizador', email: 'org@x.z' };
  const prevMng = W._canManagePresence;
  W._canManagePresence = function () { return true; };
  const htmlOrg = W.renderStandings(t, true, true, '', '') || '';
  W._canManagePresence = prevMng;
  const nWoOrg = (htmlOrg.match(/>W\.O\.<\/button>/g) || []).length;
  ok(nWoOrg === 2, 'organizador: W.O. em cada grupo (2) — got ' + nWoOrg);
  ok((htmlOrg.match(/📍 Cheguei/g) || []).length === 0, 'organizador (não joga): sem botão Cheguei');
  W.AppStore.currentUser = prev;
})();

console.log(pass + ' ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
