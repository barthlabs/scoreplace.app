/* W.O. DO ORGANIZADOR — DESTINO DO AUSENTE + O PRIMEIRO DA FILA ASSUME
 * node tests/wo-destino-e-suplente.test.js
 *
 * REGRA DO DONO (ago/2026), textual: _"o organizador pode escolher entre mandar o W.O.
 * para a lista de desativados ou para a lista de espera (no fim da lista). Assume a
 * posição o primeiro da lista de espera (suplente) e ocupa a posição até o final do
 * torneio (caso não haja W.O. dessa pessoa). Se o W.O. for para desativados, passa para
 * última posição da lista de espera ao se reativar."_
 * Escopo: SÓ o W.O. dado pelo ORGANIZADOR. O W.O. reivindicado por participante
 * (wo-claim.js) segue inalterado — ordem explícita do dono.
 *
 * O QUE FALTAVA ANTES: o W.O. marcava 0 pts na rodada e a pessoa CONTINUAVA no elenco
 * ativo (re-sorteada na rodada seguinte como se nada tivesse acontecido), enquanto o
 * substituto entrava só naquele grupo — some no sorteio seguinte, porque em Liga cada
 * rodada é sorteada a partir de t.participants. As duas metades ficavam soltas.
 *
 * Este teste carrega o liga-substitution.js REAL (a IIFE inteira) num window de teste e
 * roda _ligaApplyWoWithDest contra o grupo REAL do Confra — R1 Grupo W: Thereza, FABIANA
 * VIEIRA, Flávia Barchetta, Suely — com a fila real de 2 pessoas.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

// window base (waitlist-core, identity-core, bracket-logic…) via o shim do servidor.
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

// ── monta o ambiente e carrega a IIFE REAL do liga-substitution.js ───────────
const LIGA_SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
let LAST_TOAST = null;
function loadLiga(t) {
  const store = {
    tournaments: [t],
    currentUser: { uid: 'uid_organizador', displayName: 'Organizador' },
    mutate: (tid, fn) => { fn(t); return Promise.resolve(true); },
    isOrganizer: () => true,
  };
  win.AppStore = store;
  win._findTournamentById = (id) => (String(t.id) === String(id) ? t : null);
  win._canManagePresence = () => true;
  win.showNotification = (a, b) => { LAST_TOAST = a + ' — ' + b; };
  win.showAlertDialog = () => {};
  win.showConfirmDialog = () => {};
  win.showInputDialog = () => {};
  win._safeHtml = (s) => String(s == null ? '' : s);
  win._sendUserNotification = () => {};
  win._softRefreshView = () => {};
  win._rerenderBracket = () => {};
  win._buildNameToUid = (tt) => {
    const m = {};
    ((tt && tt.participants) || []).forEach((p) => { if (p && p.uid) m[String(p.displayName || p.name || '')] = p.uid; });
    ((tt && tt.standbyParticipants) || []).forEach((p) => { if (p && p.uid) m[String(p.displayName || p.name || '')] = p.uid; });
    ((tt && tt.rounds) || []).forEach((r) => (r.monarchGroups || []).forEach((g) => {
      (g.players || []).forEach((n, i) => { if ((g.playersUids || [])[i]) m[n] = g.playersUids[i]; });
    }));
    return m;
  };
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  win.document = globalThis.document;
  new Function('window', 'document', LIGA_SRC)(win, globalThis.document);
}

// ── fixture: o R1 Grupo W REAL do Confra + a fila real ──────────────────────
const GRUPO = {
  name: 'R1 Grupo W',
  players: ['Thereza', 'FABIANA VIEIRA', 'Flávia Barchetta', 'Suely'],
  playersUids: ['uid_thereza', 'uid_fabiana', 'uid_flavia', 'uid_suely'],
};
function novoT() {
  const jogos = [
    { id: 'g22-0', team1: ['Thereza', 'FABIANA VIEIRA'], team1Uids: ['uid_thereza', 'uid_fabiana'], team2: ['Flávia Barchetta', 'Suely'], team2Uids: ['uid_flavia', 'uid_suely'], p1: 'Thereza / FABIANA VIEIRA', p2: 'Flávia Barchetta / Suely', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 22, winner: null, scoreP1: null, scoreP2: null },
    { id: 'g22-1', team1: ['Thereza', 'Flávia Barchetta'], team1Uids: ['uid_thereza', 'uid_flavia'], team2: ['FABIANA VIEIRA', 'Suely'], team2Uids: ['uid_fabiana', 'uid_suely'], p1: 'Thereza / Flávia Barchetta', p2: 'FABIANA VIEIRA / Suely', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 22, winner: null, scoreP1: null, scoreP2: null },
    { id: 'g22-2', team1: ['Thereza', 'Suely'], team1Uids: ['uid_thereza', 'uid_suely'], team2: ['FABIANA VIEIRA', 'Flávia Barchetta'], team2Uids: ['uid_fabiana', 'uid_flavia'], p1: 'Thereza / Suely', p2: 'FABIANA VIEIRA / Flávia Barchetta', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 22, winner: null, scoreP1: null, scoreP2: null },
  ];
  const g = JSON.parse(JSON.stringify(GRUPO));
  g.matches = jogos;                      // no app é o MESMO objeto de round.matches
  return {
    id: 'confra_wo', name: 'Confra', format: 'Liga', status: 'active',
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', woScope: 'individual',
    combinedCategories: [], genderCategories: [], skillCategories: [], ageCategories: [],
    creatorUid: 'uid_organizador', allowSelfDeactivation: true,
    participants: [
      { uid: 'uid_thereza', displayName: 'Thereza', name: 'Thereza', ligaActive: true },
      { uid: 'uid_fabiana', displayName: 'FABIANA VIEIRA', name: 'FABIANA VIEIRA', ligaActive: true },
      { uid: 'uid_flavia', displayName: 'Flávia Barchetta', name: 'Flávia Barchetta', ligaActive: true },
      { uid: 'uid_suely', displayName: 'Suely', name: 'Suely', ligaActive: true },
    ],
    // A FILA, na ordem real: Sandra entrou primeiro, Paulo depois.
    standbyParticipants: [
      { uid: 'uid_sandra', displayName: 'Sandra', name: 'Sandra', ligaActive: true },
      { uid: 'uid_paulo', displayName: 'Paulo Oriente', name: 'Paulo Oriente', ligaActive: true },
    ],
    waitlist: [], monarchWaitlist: { _default_: [] },
    rounds: [{ round: 1, roundIndex: 0, status: 'active', format: 'rei_rainha', monarchGroups: [g], matches: jogos.slice() }],
    matches: [], groups: [],
  };
}
const nomes = (arr) => (arr || []).map((p) => (typeof p === 'string' ? p : (p.displayName || p.name)));

// ── 1. A FILA tem ordem, e é ela que decide ─────────────────────────────────
sec(function () {
  const t = novoT();
  ok(typeof win._waitlistFirst === 'function', 'falta window._waitlistFirst');
  ok(typeof win._waitlistPushBack === 'function', 'falta window._waitlistPushBack');
  const p = win._waitlistFirst(t);
  ok(p && (p.displayName === 'Sandra'), 'o primeiro da fila devia ser a Sandra, veio ' + (p && p.displayName));
  // push back entra no FIM, nunca no começo
  win._waitlistPushBack(t, { uid: 'uid_novo', displayName: 'Novo', name: 'Novo' });
  ok(nomes(win._getWaitlist(t)).join('|') === 'Sandra|Paulo Oriente|Novo', 'entrou fora do fim: ' + nomes(win._getWaitlist(t)).join('|'));
  // idempotente: não duplica nem promove
  ok(win._waitlistPushBack(t, { uid: 'uid_sandra', displayName: 'Sandra' }) === false, 'pushBack devia recusar quem já está na fila');
  ok(nomes(win._getWaitlist(t)).join('|') === 'Sandra|Paulo Oriente|Novo', 'pushBack repetido mexeu na fila');
});

// ── 2. W.O. → FIM DA LISTA DE ESPERA (a escolha do organizador) ─────────────
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWoWithDest(t.id, 0, 'R1 Grupo W', 'Thereza', 'waitlist');

  // (a) a Thereza SAIU do elenco e está no FIM da fila — atrás de quem já esperava
  ok(!nomes(t.participants).includes('Thereza'), 'Thereza tinha que sair do elenco ativo');
  const fila = nomes(win._getWaitlist(t));
  ok(fila[fila.length - 1] === 'Thereza', 'Thereza tinha que entrar no FIM da fila, fila=' + fila.join('|'));
  ok(fila.indexOf('Paulo Oriente') < fila.indexOf('Thereza'), 'quem já esperava não pode ficar atrás de quem acabou de levar W.O.');

  // (b) a Sandra (primeira da fila) ASSUMIU — no grupo E no elenco
  const g = t.rounds[0].monarchGroups[0];
  ok(g.players.includes('Sandra'), 'Sandra devia estar no grupo, players=' + g.players.join('|'));
  ok(!g.players.includes('Thereza'), 'Thereza não pode continuar no grupo');
  ok(g.playersUids[g.players.indexOf('Sandra')] === 'uid_sandra', 'o uid do slot tem que ser o da Sandra [[project_match_slot_uid_identity]]');
  ok(nomes(t.participants).includes('Sandra'), 'Sandra tinha que ENTRAR no elenco — é isso que a faz jogar até o fim do torneio');
  ok(!nomes(win._getWaitlist(t)).includes('Sandra'), 'quem assumiu sai da fila');
  ok(g.subStatus === 'filled' && g.subName === 'Sandra', 'grupo devia ficar filled com a Sandra');
  ok(g.woAbsent === 'Thereza', 'o grupo devia registrar quem levou o W.O.');

  // (c) os 3 jogos do grupo trocaram Thereza→Sandra, com o uid junto
  const jogos = t.rounds[0].matches.filter((m) => !m.isSitOut);
  ok(jogos.length === 3, 'os 3 jogos do grupo têm que continuar existindo, achei ' + jogos.length);
  ok(jogos.every((m) => !(m.team1 || []).includes('Thereza') && !(m.team2 || []).includes('Thereza')), 'sobrou Thereza em algum jogo');
  ok(jogos.every((m) => (m.team1 || []).includes('Sandra') || (m.team2 || []).includes('Sandra')), 'Sandra tinha que estar nos 3 jogos');
  ok(jogos.every((m) => m.p1 === (m.team1 || []).join(' / ') && m.p2 === (m.team2 || []).join(' / ')), 'p1/p2 têm que ser reconstruídos dos times');
  const comUid = jogos.filter((m) => (m.team1Uids || []).includes('uid_sandra') || (m.team2Uids || []).includes('uid_sandra'));
  ok(comUid.length === 3, 'o uid da Sandra tinha que entrar nos 3 slots, entrou em ' + comUid.length);
  ok(!JSON.stringify(jogos).includes('uid_thereza'), 'o uid da Thereza não pode sobrar em slot nenhum');

  // (d) o marcador de W.O. da rodada (0 pts) existe
  const wo = t.rounds[0].matches.filter((m) => m.isSitOut && m.sitOutReason === 'wo');
  ok(wo.length === 1 && wo[0].p1 === 'Thereza', 'devia existir 1 marcador de W.O. da Thereza');
  ok(wo[0].sitOutPoints === 0, 'W.O. é 0 pts');
});

// ── 3. W.O. → DESATIVADOS (a outra escolha) ────────────────────────────────
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWoWithDest(t.id, 0, 'R1 Grupo W', 'Thereza', 'inactive');

  const th = t.participants.filter((p) => p.displayName === 'Thereza')[0];
  ok(!!th, 'no destino "desativados" a Thereza CONTINUA no elenco');
  ok(th.ligaActive === false, 'e fica inativa');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), 'quem foi pros desativados NÃO entra na fila agora (só ao reativar)');
  // e a vaga foi ocupada do mesmo jeito
  ok(t.rounds[0].monarchGroups[0].players.includes('Sandra'), 'a Sandra assume a vaga nos dois destinos');
  ok(nomes(t.participants).includes('Sandra'), 'e entra no elenco nos dois destinos');
});

// ── 4. Desativado por W.O. que REATIVA → ÚLTIMA posição da fila ────────────
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWoWithDest(t.id, 0, 'R1 Grupo W', 'Thereza', 'inactive');
  // fila agora: Paulo (a Sandra assumiu). Reativa a Thereza pelo caminho real.
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const i = src.indexOf('window._toggleLigaActive = function');
  const body = src.slice(i, src.indexOf('\n};', i) + 3);
  win.AppStore.currentUser = { uid: 'uid_thereza', displayName: 'Thereza' };
  win._userMatchesParticipant = (u, p) => !!(p && p.uid && u && u.uid && p.uid === u.uid);
  win.FirestoreDB = { saveTournament: () => Promise.resolve() };
  win._warn = () => {};
  win.renderTournaments = () => {};
  win._t = (k) => k;
  new Function('window', 'document', '_t', 'renderTournaments',
    'with (window) { ' + body + ' }')(win, globalThis.document, win._t, win.renderTournaments);
  win._toggleLigaActive(t.id, true);

  ok(!nomes(t.participants).includes('Thereza'), 'ao reativar, sai dos inativos (deixa participants)');
  const fila = nomes(win._getWaitlist(t));
  ok(fila.includes('Thereza'), 'ao reativar, entra na fila — fila=' + fila.join('|'));
  ok(fila[fila.length - 1] === 'Thereza', 'tem que entrar na ÚLTIMA posição, fila=' + fila.join('|'));
  ok(fila[0] === 'Paulo Oriente', 'quem já esperava continua na frente');
});

// ── 5. Fila VAZIA: o W.O. acontece, mas ninguém assume ─────────────────────
sec(function () {
  const t = novoT();
  t.standbyParticipants = [];
  loadLiga(t);
  win._ligaApplyWoWithDest(t.id, 0, 'R1 Grupo W', 'Thereza', 'waitlist');
  const g = t.rounds[0].monarchGroups[0];
  ok(g.woAbsent === 'Thereza', 'o W.O. tem que valer mesmo sem suplente');
  ok(g.subStatus === 'open', 'sem fila, a vaga fica ABERTA (convite/Jogador X continuam disponíveis)');
  ok(g.players.includes('Thereza') === false || g.subName == null, 'sem suplente ninguém entra no lugar');
  ok(nomes(win._getWaitlist(t)).join('|') === 'Thereza', 'a Thereza é quem está na fila agora');
});

// ── 6. O suplente FICA — a rodada seguinte sorteia a partir do elenco ──────
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWoWithDest(t.id, 0, 'R1 Grupo W', 'Thereza', 'waitlist');
  // "ocupa a posição até o final do torneio" = está em participants ATIVO, que é a fonte
  // do próximo sorteio da Liga (_getActiveLigaPlayers lê participants e pula ligaActive
  // === false). Sem isso o substituto sumiria na R2, porque cada rodada é sorteada de novo.
  const ativos = (t.participants || []).filter((p) => p && p.ligaActive !== false);
  const nomesAtivos = ativos.map((p) => (p.displayName || p.name));
  ok(nomesAtivos.includes('Sandra'), 'a Sandra tem que entrar no sorteio da rodada seguinte, ativos=' + nomesAtivos.join('|'));
  ok(!nomesAtivos.includes('Thereza'), 'quem levou W.O. e foi pra fila NÃO pode ser sorteada na rodada seguinte');
  ok(ativos.length === 4, 'o elenco ativo continua com 4 (uma sai, uma entra), tem ' + ativos.length);
  const sub = t.participants.filter((p) => p.displayName === 'Sandra')[0];
  ok(sub && sub.woSubstituteFor === 'Thereza', 'o substituto guarda de quem assumiu a vaga (rastro do W.O.)');
});

// ── 7. Escopo: o W.O. do PARTICIPANTE não foi tocado ───────────────────────
sec(function () {
  const claim = fs.readFileSync(path.join(ROOT, 'js', 'views', 'wo-claim.js'), 'utf8');
  ok(claim.indexOf('_ligaApplyWoWithDest') === -1 && claim.indexOf('_ligaWoDestination') === -1,
    'wo-claim.js (W.O. do participante) NÃO pode chamar o fluxo novo — ordem explícita do dono');
});

console.log((fail === 0 ? '✅' : '❌') + ' wo-destino-e-suplente: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
