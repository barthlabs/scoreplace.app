/* W.O. DO ORGANIZADOR — O PRIMEIRO DA FILA ASSUME A VAGA
 * node tests/wo-destino-e-suplente.test.js
 *
 * ⚠️ REVISADO NA v1.7.59 — A ESCOLHA DE DESTINO FOI REVOGADA PELO DONO.
 * A regra da v1.6.88/v1.6.90 era: _"o organizador pode escolher entre mandar o W.O. para
 * a lista de desativados ou para a lista de espera (no fim da lista)"_. Em 06/ago/2026,
 * depois do caso da Eliane Cinelli (levou W.O. e foi parar NA FILA, porque o default do
 * diálogo era 'waitlist'), o dono cortou a escolha: **W.O. desativa, sempre; e é o
 * próprio participante, religando o toggle, quem entra na lista de espera.**
 *
 * O QUE ESTE ARQUIVO AINDA PROTEGE (e por isso não foi apagado): a ordem da fila, o
 * primeiro da fila assumindo a vaga, o slot com o uid certo, os 3 jogos reescritos, o
 * marcador de 0 pts, o suplente ficando até o fim do torneio e a fila vazia. As asserções
 * que exigiam o destino 'waitlist' foram reescritas pro desfecho único — o novo caminho
 * inteiro (os 4 pontos de aplicação + o religar) vive em `tests/wo-sempre-desativa.test.js`.
 * Escopo: SÓ o W.O. dado pelo ORGANIZADOR. O W.O. reivindicado por participante
 * (wo-claim.js) segue inalterado — ordem explícita do dono.
 *
 * O QUE FALTAVA ANTES: o W.O. marcava 0 pts na rodada e a pessoa CONTINUAVA no elenco
 * ativo (re-sorteada na rodada seguinte como se nada tivesse acontecido), enquanto o
 * substituto entrava só naquele grupo — some no sorteio seguinte, porque em Liga cada
 * rodada é sorteada a partir de t.participants. As duas metades ficavam soltas.
 *
 * Este teste carrega o liga-substitution.js REAL (a IIFE inteira) num window de teste e
 * roda _ligaApplyWo contra o grupo REAL do Confra — R1 Grupo W: Thereza, FABIANA
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

// ── 2. W.O. → DESATIVADO, e o primeiro da fila assume ──────────────────────
// v1.7.59: as 3 asserções (a) exigiam o destino 'waitlist' — REVISADAS de propósito.
// O invariante que elas defendiam de verdade ("quem levou W.O. sai do elenco ATIVO e não
// fura a fila de quem já esperava") continua travado: ele agora é ligaActive:false.
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo W', 'Thereza');

  // (a) a Thereza CONTINUA no elenco, desativada — e NÃO entra na fila por conta do W.O.
  const _th = t.participants.filter((p) => p.displayName === 'Thereza')[0];
  ok(!!_th && _th.ligaActive === false, 'Thereza tinha que ficar no elenco DESATIVADA');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), 'o W.O. NÃO pode empurrar ninguém pra fila (bug da Eliane)');
  ok(nomes(win._getWaitlist(t)).includes('Paulo Oriente'), 'quem já esperava continua na fila');

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

// ── 3. A marca do W.O. é woDeactivatedAt — e só ela ────────────────────────
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo W', 'Thereza');

  const th = t.participants.filter((p) => p.displayName === 'Thereza')[0];
  ok(!!th, 'quem leva W.O. CONTINUA no elenco');
  ok(th.ligaActive === false, 'e fica inativa');
  ok(!!th.woDeactivatedAt, 'com a marca woDeactivatedAt — é dela que o religar depende');
  ok(!th.woSentToWaitlistAt, 'e NUNCA com woSentToWaitlistAt: essa marca é do toggle da própria pessoa');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), 'quem foi pros desativados NÃO entra na fila agora (só ao reativar)');
  // e a vaga é ocupada
  ok(t.rounds[0].monarchGroups[0].players.includes('Sandra'), 'a Sandra assume a vaga');
  ok(nomes(t.participants).includes('Sandra'), 'e entra no elenco');
});

// ── 4. Desativado por W.O. que REATIVA → ÚLTIMA posição da fila ────────────
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo W', 'Thereza');
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
  win._ligaApplyWo(t.id, 0, 'R1 Grupo W', 'Thereza');
  const g = t.rounds[0].monarchGroups[0];
  ok(g.woAbsent === 'Thereza', 'o W.O. tem que valer mesmo sem suplente');
  ok(g.subStatus === 'open', 'sem fila, a vaga fica ABERTA (convite/Jogador X continuam disponíveis)');
  ok(g.players.includes('Thereza') === false || g.subName == null, 'sem suplente ninguém entra no lugar');
  // v1.7.59 REVISADA: antes esperava a Thereza NA fila. Fila vazia + W.O. = fila vazia —
  // o W.O. não cria fila; quem cria é a pessoa, religando o toggle.
  ok(win._getWaitlist(t).length === 0, 'a fila continua VAZIA — o W.O. não põe ninguém nela');
});

// ── 6. O suplente FICA — a rodada seguinte sorteia a partir do elenco ──────
sec(function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo W', 'Thereza');
  // "ocupa a posição até o final do torneio" = está em participants ATIVO, que é a fonte
  // do próximo sorteio da Liga (_getActiveLigaPlayers lê participants e pula ligaActive
  // === false). Sem isso o substituto sumiria na R2, porque cada rodada é sorteada de novo.
  const ativos = (t.participants || []).filter((p) => p && p.ligaActive !== false);
  const nomesAtivos = ativos.map((p) => (p.displayName || p.name));
  ok(nomesAtivos.includes('Sandra'), 'a Sandra tem que entrar no sorteio da rodada seguinte, ativos=' + nomesAtivos.join('|'));
  ok(!nomesAtivos.includes('Thereza'), 'quem levou W.O. NÃO pode ser sorteada na rodada seguinte');
  ok(ativos.length === 4, 'o elenco ativo continua com 4 (uma sai, uma entra), tem ' + ativos.length);
  const sub = t.participants.filter((p) => p.displayName === 'Sandra')[0];
  ok(sub && sub.woSubstituteFor === 'Thereza', 'o substituto guarda de quem assumiu a vaga (rastro do W.O.)');
});

// ── 7. Escopo: o W.O. do PARTICIPANTE não foi tocado ───────────────────────
sec(function () {
  const claim = fs.readFileSync(path.join(ROOT, 'js', 'views', 'wo-claim.js'), 'utf8');
  ok(claim.indexOf('_ligaApplyWo(') === -1 && claim.indexOf('_ligaWoConfirm') === -1,
    'wo-claim.js (W.O. do participante) NÃO pode chamar o fluxo novo — ordem explícita do dono');
});

// ── O SUPLENTE GUARDA O UID, não só o nome (v1.7.63) ────────────────────────────
// Regra do dono: "por uid sempre. nunca nome, email ou qualquer outro dado" — com a
// ressalva "se o usuário digitar participantes sem uid aí tem que considerar por nome
// apenas esses".
//
// O ausente já gravava `woAbsentUid` desde a v1.7.21; o SUPLENTE ficou pra trás com
// `subName` puro. Rótulo ENVELHECE: quem troca o displayName depois vira um `subName`
// que não resolve pra ninguém — foi exatamente esse defeito que a v1.7.46 corrigiu na
// classificação ("Fabi2401@" × "Dani Bataglia", a MESMA pessoa em duas telas).
(() => {
  // os QUATRO caminhos que preenchem a vaga gravam o uid junto…
  const escritas = (LIGA_SRC.match(/g\.subName\s*=/g) || []).length;
  const uids = (LIGA_SRC.match(/g\.subUid\s*=|delete g\.subUid/g) || []).length;
  ok(escritas >= 4, 'os 4 caminhos que preenchem a vaga continuam existindo, achei ' + escritas);
  ok(uids >= escritas, 'TODO caminho que grava subName decide o subUid junto (' + uids + ' × ' + escritas + ')');

  // …e cada um usa a fonte de uid que tem em mãos, nunca resolvendo por nome
  ok(/if \(_sub && _sub\.uid\) g\.subUid/.test(LIGA_SRC), 'suplente da fila: uid vem da ENTRADA da espera');
  ok(/if \(subUid\) g\.subUid/.test(LIGA_SRC), 'substituição direta: uid vem do parâmetro (já era recebido)');
  ok(/if \(_subEntry && _subEntry\.uid\) g\.subUid/.test(LIGA_SRC), 'convite aceito: uid vem da entrada do convidado');

  // A RESSALVA: Jogador X não tem conta — ali o nome É a identidade e não há uid a gravar.
  const jx = LIGA_SRC.slice(LIGA_SRC.indexOf("g.subIsGuest = true"));
  ok(/delete g\.subUid/.test(jx.slice(0, 200)), 'Jogador X (sem conta) NÃO ganha subUid — o nome é a identidade dele');

  // Nada pode voltar a resolver o suplente por nome pra decidir identidade.
  ok(!/g\.subUid\s*=\s*[^;]*_nameUidMap/.test(LIGA_SRC), 'o subUid nunca é resolvido por mapa de nome');
})();

// ── O comentário do renderer não pode mentir sobre o schema ─────────────────────
// Ele afirmava "não existe `woAbsentUid`" — falso desde a v1.7.21, e o código logo
// abaixo já lia o uid. Comentário que mente manda o próximo leitor consertar o lugar errado.
(() => {
  const BR = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
  ok(BR.indexOf('não existe `woAbsentUid`') === -1,
     'o comentário do box não pode mais afirmar que woAbsentUid não existe');
  // 2.0.53: o append virou lista (_ligaGroupWoList, uid-first) — a âncora acompanha,
  // o invariante é o mesmo: o uid do ausente decide antes de qualquer nome.
  ok(BR.indexOf('_ligaGroupWoList') !== -1 && BR.indexOf("var _absUid = _par.absentUid || ''") !== -1,
     'e o renderer continua lendo o uid ANTES de qualquer nome');
})();

// ── woClaims guarda o UID de quem está no contexto, não só o nome (v1.7.66) ──────
// Última ponta por nome do W.O.: `woClaims[].players` é um snapshot de NOMES, e toda a
// resolução de identidade depois dependia de casar esse nome (`g.players.indexOf`,
// `team1.indexOf`). Nome ENVELHECE — quem troca o displayName some das buscas e o
// apontamento perde a pessoa. O doc já tinha `absentUids` e `byUid`; faltava o resto.
(() => {
  const WO = fs.readFileSync(path.join(ROOT, 'js', 'views', 'wo-claim.js'), 'utf8');
  ok(/playerUids: playerUids/.test(WO), 'o contexto resolvido carrega playerUids');
  ok(/c\.playerUids = rc\.playerUids/.test(WO), 'o claim GRAVADO leva os uids junto');
  ok(/playerUids: c\.playerUids/.test(WO), 'e reconstruir o contexto a partir do claim traz os uids de volta');
  // a ordem importa: o uid gravado tem que ser consultado ANTES de qualquer casamento por nome
  const fn = WO.slice(WO.indexOf('function _ctxUidsFor'), WO.indexOf('function _allCtxUids'));
  const iUid = fn.indexOf('ctx.playerUids');
  const iNome = fn.indexOf('g.players.indexOf(name)');
  ok(iUid !== -1 && iNome !== -1 && iUid < iNome,
     'o uid gravado é consultado ANTES do casamento por nome (senão o nome trocado ganha)');
  // quem não tem conta continua valendo pelo nome — a ressalva do dono
  ok(/\? String\(mb\.uids\[0\]\) : ''/.test(WO),
     'quem não tem conta fica com uid vazio na lista — o nome continua sendo a identidade dele');
})();

console.log((fail === 0 ? '✅' : '❌') + ' wo-destino-e-suplente: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
