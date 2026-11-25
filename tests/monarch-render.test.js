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

(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 16, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  t.scheduleWindow = { days:[{ day:'2026-11-29', startTime:'08:00', endTime:'18:00' }] };
  ['B2', 'A2', 'B1', 'A1'].forEach((code, i) => { t.groups[i].name = 'Grupo ' + code; });
  t.groups.reverse();
  t.groups.forEach((g, i) => g.matches.forEach((m) => {
    m.scheduledAt = '2026-11-29T08:00:00-03:00';
    m.court = 'Quadra ' + (i + 1);
    m.scheduledGameNumber = [13, 1, 16, 4][i];
    m.category = i % 2 ? 'Zulu' : 'Alfa';
  }));
  const previousWoChip = W._woClaimChip;
  W._woClaimChip = (_t, ctx) => '<button data-test-wo="' + ctx.matchId + '">W.O.</button>';
  const html = W._renderMonarchStage(t, true, false) || '';
  W._woClaimChip = previousWoChip;
  const firstInDraw = t.groups.map(g => html.indexOf('id="card-' + g.matches[0].id + '"'));
  ok(firstInDraw.every(i => i >= 0) && firstInDraw[1] < firstInDraw[3] && firstInDraw[3] < firstInDraw[0] && firstInDraw[0] < firstInDraw[2],
    'horários iguais seguem os números 1, 4, 13, 16 da programação: ' + firstInDraw);
  ok((html.match(/id="card-/g) || []).length === 12, 'cada grupo agendado mantém seus três cards de jogo');
  ok((html.match(/data-test-wo=/g) || []).length === 12, 'cada jogo do grupo oferece W.O. conforme a permissão canônica');
  t.matches = t.groups.flatMap((g, i) => g.matches.map(m => ({ ...m, phaseIndex:1, groupName:g.name, groupIdx:i, bracket:'monarch' })));
  t.phases = [{}, { name:'Segunda fase' }];
  t.currentPhaseIndex = 1;
  const phaseHtml = W._renderPhaseBracket(t, false, '') || '';
  const firstCards = t.groups.map(g => phaseHtml.indexOf('id="card-' + g.matches[0].id + '"'));
  ok(firstCards.every(i => i >= 0) && firstCards[1] < firstCards[3] && firstCards[3] < firstCards[0] && firstCards[0] < firstCards[2],
    'reconstrução da segunda fase usa a mesma sequência oficial: ' + firstCards);
  ok(/max-width:380px/.test(html), 'grupo usa a largura do card operacional');
})();

(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 8, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  const before = W._renderMonarchStage(t, false, false, { standingsOnly: true }) || '';
  const game = (t.groups[0].matches || [])[0];
  game.scoreP1 = 6; game.scoreP2 = 3; game.winner = game.p1; game.resultAt = Date.now();
  const after = W._renderMonarchStage(t, false, false, { standingsOnly: true }) || '';
  ok(before !== after && /\+3/.test(after), 'classificação parcial do grupo reflete o jogo confirmado no fragmento local');
  ok(!/id="card-/.test(after), 'recalcular a classificação não reconstrói os cards dos jogos');
})();

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
  const t = { superEight: true };
  const row = { name: 'Kelly', played: 3, wins: 3, losses: 0 };
  ok(W._reiRainhaInvictoCrown(t, [row], row, { groupDone: true }) === '',
    'Super 8: três vitórias não exibem coroa nem bola 8');
  row.played = 6; row.wins = 6;
  ok(W._reiRainhaInvictoCrown(t, [row], row, { groupDone: true }) === '',
    'Super 8: seis vitórias ainda não dão conquista');
  row.played = 7; row.wins = 7;
  var badge = W._reiRainhaInvictoCrown(t, [row], row, { groupDone: false });
  ok(badge.includes('🎱') && !badge.includes('Rei') && !badge.includes('Rainha'),
    'Super 8: sete vitórias exibem só a bola 8');
  row.losses = 1; row.wins = 6;
  ok(W._reiRainhaInvictoCrown(t, [row], row, { groupDone: true }) === '',
    'Super 8: sete partidas com derrota não dão conquista');
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
  if (typeof W._idMapSet === 'function') { t.checkedIn = t.checkedIn || {}; W._idMapSet(t, t.checkedIn, p0, Date.now()); }
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
  // v1.8.71: o rótulo virou "Aplicar W.O." (verbo) — "W.O." pelado lia como
  // SELO de estado, que é o que a tabela do grupo usa ao lado de quem levou.
  // O invariante desta asserção (QUANTOS botões aparecem e pra quem) não mudou.
  const nWo = (html.match(/>Aplicar<br>W\.O\.<\/button>/g) || []).length;
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

  // (b) ORGANIZADOR (não joga): sem agenda operacional, W.O. no grupo inteiro.
  W.AppStore.currentUser = { uid: 'u-org', displayName: 'Organizador', email: 'org@x.z' };
  const prevMng = W._canManagePresence;
  W._canManagePresence = function () { return true; };
  const htmlOrg = W.renderStandings(t, true, true, '', '') || '';
  W._canManagePresence = prevMng;
  const nWoOrg = (htmlOrg.match(/>Aplicar<br>W\.O\.<\/button>/g) || []).length;
  ok(nWoOrg === 2, 'organizador: W.O. em cada grupo (2) — got ' + nWoOrg);
  ok((htmlOrg.match(/📍 Cheguei/g) || []).length === 0, 'organizador (não joga): sem botão Cheguei');
  W.AppStore.currentUser = prev;
})();

(function configuredColumns() {
  const assert=require('node:assert/strict'), crypto=require('node:crypto');
  const t=hydrateMonarchGroups(buildViaDraw('Liga',8,{ligaRoundFormat:'rei_rainha',drawMode:'rei_rainha',drawManual:true}));
  t.superEight=true;t.rankingPrimary='games_diff';t.tiebreakers=['saldo_games','vitorias','confronto_direto'];
  const render=()=>W._renderMonarchStage(t,false,false,{standingsOnly:true});
  // Baseline captured before changing bracket.js, from the same deterministic fixture.
  assert.equal(crypto.createHash('sha256').update(render()).digest('hex'),'bf42195cbeff08bc3fd1f9ba6ecdbff89775b6364872565226cc454f7f646203');
  t.rankingPrimary='wins';t.tiebreakers=['saldo_games','confronto_direto','sorteio'];
  const headings=html=>Array.from(html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g),m=>m[1].replace(/<[^>]+>/g,''));
  assert.deepEqual(headings(render()).slice(0,6),['#','Jogador','V','D','Saldo','%']);
  t.scoring={type:'gsm'};t.advancedScoring={enabled:true};
  assert.deepEqual(headings(render()).slice(0,6),['#','Jogador','V','D','Saldo','%']);
  const html=render();
  for(const table of html.match(/<table\b[\s\S]*?<\/table>/g)||[]) {
    const count=headings(table).length;
    for(const row of table.match(/<tr\b[\s\S]*?<\/tr>/g)||[])
      if(row.includes('<td'))assert.equal((row.match(/<td\b/g)||[]).length,count);
  }
  delete t.tiebreakers;assert.deepEqual(headings(render()).slice(0,5),['#','Jogador','V','D','%']);
  t.tiebreakers=['pontos_avancados','saldo_sets'];
  assert.deepEqual(headings(render()).slice(0,7),['#','Jogador','V','D','💯 PA','Saldo','%']);
  t._phaseMaterialized=1;
  assert.deepEqual(headings(render()).slice(0,4),['#','Jogador','V','Saldo']);
  assert.deepEqual(headings(W._renderMonarchStage(t,false,false,{standingsOnly:true,showHistoricalFullStandings:true})).slice(0,7),['#','Jogador','V','D','💯 PA','Saldo','%']);
  delete t._phaseMaterialized;t.rankingPrimary='points';delete t.advancedScoring;
  assert(headings(render()).includes('Pts'));
})();

// Sports groups span all seven rounds, irrespective of technical monarchGroup IDs.
(function () {
  const assert = require('node:assert/strict');
  const categories=['Categoria B','Categoria C'];
  const t={id:'eight-standings',format:'Liga',ligaRoundFormat:'rei_rainha',currentPhaseIndex:0,
    rankingPrimary:'wins',tiebreakers:['saldo_games','confronto_direto','sorteio'],scoring:{type:'simple'},
    phases:[{kind:'classification',classification:{partnerRotation:'groups',rotationCategoryRules:categories.map(category=>({category,groupFormation:{mode:'size',value:8}}))}},
      {kind:'elimination',source:{scope:'per_group',qualifyTopN:2,mapping:[{dest:'main',rankFrom:1,rankTo:2}],qualificationCategoryRules:categories.map((category,i)=>({category,perGroup:i?2:4}))}}],matches:[]};
  ['A','B','C','D','E','F'].forEach((label,g)=>{
    const category=categories[g<2?0:1], groupIdx=g<2?g:g-2;
    for(let round=1;round<=7;round++)for(let lane=0;lane<2;lane++) {
      const slots=Array.from({length:4},(_,i)=>(lane*4+i+round-1)%8);
      const names=slots.map(i=>label+' atleta '+i), ids=slots.map(i=>'manual:'+label+'-'+i);
      t.matches.push({id:label+'-'+round+'-'+lane,phaseIndex:0,isMonarch:true,bracket:'monarch',round,groupIdx,monarchGroup:t.matches.length,
        category,scheduledAt:'2026-11-29T'+String(7+round).padStart(2,'0')+':00:00-03:00',scheduledGroupLabel:label,_gameNum:t.matches.length+1,team1:names.slice(0,2),team2:names.slice(2),
        p1:names.slice(0,2).join(' / '),p2:names.slice(2).join(' / '),team1Uids:[null,null],team2Uids:[null,null],team1SlotIds:ids.slice(0,2),team2SlotIds:ids.slice(2)});
    }
  });
  t.scheduleWindow={days:[{day:'2026-11-29',startTime:'08:00',endTime:'18:00'}]};
  const stored=W.AppStore.tournaments,active=W._currentBracketTournament;W.AppStore.tournaments=[t];W._currentBracketTournament=t;
  const baseline=JSON.stringify(t), groups=W._super8StandingsGroups(t);
  assert.equal(groups.length,6);assert(groups.every(g=>g.players.length===8&&g.matches.length===14));
  assert.equal(JSON.stringify(t),baseline,'projection does not rewrite draw or identifiers');
  const game=t.matches[0];game.winner='p1';game.scoreP1=7;game.scoreP2=0;
  const rows=()=>W._computeMonarchStandings(W._super8StandingsGroups(t)[0],t,categories[0]);
  let r=rows();assert.equal(r.length,8);assert.equal(r.filter(s=>s.wins===1&&s.gamesWon-s.gamesLost===7&&s.played===1).length,2);
  assert.equal(r.filter(s=>s.losses===1&&s.gamesWon-s.gamesLost===-7).length,2);assert.equal(r.filter(s=>s.played===0).length,4);
  assert.equal(r[0].wins,1);assert.equal(r[1].wins,1);
  const later=t.matches[2];later.winner='p2';later.scoreP1=3;later.scoreP2=7;
  r=rows();assert.equal(r.reduce((n,s)=>n+s.wins,0),4);assert.equal(r.reduce((n,s)=>n+s.losses,0),4);
  assert.equal(r.reduce((n,s)=>n+s.gamesWon-s.gamesLost,0),0);
  assert(r.some(s=>s.played===2&&s.wins===1&&s.losses===1),'mixed results accumulate for the same athlete');
  assert(W._computeMonarchStandings(groups[1],t,categories[0]).every(s=>s.played===0),'other group untouched');
  game.scoreP1=6;game.scoreP2=4;r=rows();assert.equal(r.find(s=>s.manualParticipantId==='A-0').gamesWon,6,'score correction recomputes instead of adding');
  assert.equal(W._phaseClassifiedCount(t,8,categories[0],0),4);assert.equal(W._phaseClassifiedCount(t,8,categories[1],0),2);
  const fallback=JSON.parse(JSON.stringify(t));fallback.phases[1].source.qualificationCategoryRules.pop();assert.equal(W._phaseClassifiedCount(fallback,8,categories[1],0),2);
  delete fallback.phases[1].source.qualificationCategoryRules;assert.equal(W._phaseClassifiedCount(fallback,8,categories[0],0),2);
  const html=W._renderMonarchStage(t,false,false);
  for(const route of [W.renderStandings(t,false,false,'',''),W._renderPhaseBracket(t,false,'',0)]) {
    assert.equal((route.match(/sp-monarch-standings-name/g)||[]).length,48,'both production routes render every athlete once');
    assert.equal((route.match(/id="card-/g)||[]).length,84);
  }
  if(process.env.SP_CAPTURE_EIGHT_BRACKET)require('node:fs').writeFileSync(process.env.SP_CAPTURE_EIGHT_BRACKET,JSON.stringify({t,html}));
  assert.equal((html.match(/data-group-box="1"/g)||[]).length,6,'one block for each eight-player group');
  assert.equal((html.match(/id="card-/g)||[]).length,84,'all fourteen games per group remain available');
  assert.equal((html.match(/<tbody>/g)||[]).length,6);assert.equal((html.match(/sp-monarch-standings-name/g)||[]).length,48);
  assert(!/>Pts<|>PA</.test(html));assert(html.includes('faixa de avanço: 4')&&html.includes('faixa de avanço: 2'));
  const phase1=JSON.parse(JSON.stringify(t));phase1.currentPhaseIndex=1;phase1.phases.unshift({kind:'classification'});phase1.matches.forEach(m=>m.phaseIndex=1);
  assert.equal((W._renderPhaseBracket(phase1,false,'',1).match(/sp-monarch-standings-name/g)||[]).length,48,'later phases retain eight-player groups');
  assert.equal((W.renderStandings(phase1,false,false,'','').match(/sp-monarch-standings-name/g)||[]).length,48,'later-phase standings route also retains eight-player groups');
  const fragment=W._renderMonarchStage(t,false,false,{standingsOnly:true,targetGroupLabel:W._grpKey(groups[0].name)});
  assert.equal((fragment.match(/sp-monarch-standings-name/g)||[]).length,8,'in-place update covers all eight athletes');
  const homo=JSON.parse(JSON.stringify(t));homo.matches.forEach(m=>{if(m.scheduledGroupLabel==='A'){m.team1=m.team1.map(()=> 'Mesmo nome');m.team2=m.team2.map(()=> 'Mesmo nome');}});
  assert.equal(W._super8StandingsGroups(homo)[0].players.length,8,'manual slot identity separates homonyms');
  const other=JSON.parse(JSON.stringify(t));other.phases[0].classification.rotationCategoryRules.forEach(r=>r.groupFormation.value=4);
  assert.equal(W._super8StandingsGroups(other).length,0,'size four does not activate eight-player projection');
  assert(W._computeMonarchStandings(groups[0],other,categories[0]).every(s=>s.gamesWon===0&&s.gamesLost===0),'other formats retain simple scoring behavior');
  const server=require('../functions-autodraw/draw-core')._window;
  assert.deepEqual(JSON.parse(JSON.stringify(server._computeMonarchStandings(groups[0],t,categories[0]))),JSON.parse(JSON.stringify(rows())),'fresh server vendor and client standings agree');
  W.AppStore.tournaments=stored;W._currentBracketTournament=active;
  ok(true,'Super8: six groups, eight manual athletes, accumulated scores, category cutoff and server parity');
})();

console.log(pass + ' ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
