/* W.O. DESATIVA — SEMPRE. E RELIGAR O TOGGLE É QUE MANDA PRA FILA.
 * node tests/wo-sempre-desativa.test.js
 *
 * ORDEM DO DONO (06/ago/2026), depois do caso REAL da Eliane Cinelli no Confra:
 *   1. dar W.O. a um participante → ele fica com status W.O. **e desativado** (toggle off);
 *   2. se ele se reativar manualmente (toggle on) → aí sim vai pra **lista de espera**;
 *   3. vale pra TODOS que receberem W.O.
 *
 * ⚠️ ISTO REVOGA A ESCOLHA 1×2 DA v1.6.88/v1.6.90 (desativados × fim da fila). Não é o
 * default que mudou: o caminho "W.O. → fila" DEIXOU DE EXISTIR.
 *
 * O BUG, MEDIDO EM PRODUÇÃO (tour_1780009816637, 06/ago 22:00:55Z):
 *   • grupo "R1 Grupo Z": woAbsent="Eliane Cinelli", woDest="waitlist", subName="Renato Oshima";
 *   • Eliane em standbyParticipants[4] com woSentToWaitlistAt — NA FILA, não desativada.
 * Causa: `_ligaReadDest()` tinha default 'waitlist' e o botão 2 já vinha marcado
 * (data-on="1") no diálogo. Ninguém escolheu a fila: ela era o caminho de menor esforço.
 *
 * O teste roda a IIFE REAL do liga-substitution.js — os QUATRO caminhos que aplicavam o
 * desfecho (aplicar direto, substituição direta, convite, Jogador X) — e a função REAL
 * _toggleLigaActive extraída do tournaments-enrollment.js.
 *
 * Contra o código da v1.7.58 este arquivo fica VERMELHO: lá os 4 caminhos mandavam pra
 * fila por default e `_isPlayingCurrentPhase` podia segurar o reativado no elenco.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(nome, fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção "' + nome + '" estourou:', e && e.message); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

const LIGA_SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
const ENROLL_SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');

let LAST_TOAST = null;
let CAP_HTML = '';

function loadLiga(t) {
  win.AppStore = {
    tournaments: [t],
    currentUser: { uid: 'uid_organizador', displayName: 'Organizador' },
    mutate: (tid, fn) => { fn(t); return Promise.resolve(true); },
    isOrganizer: () => true,
    syncImmediate: () => Promise.resolve(true),
  };
  win._findTournamentById = (id) => (String(t.id) === String(id) ? t : null);
  win._canManagePresence = () => true;
  win.showNotification = (a, b) => { LAST_TOAST = a + ' — ' + b; };
  win.showAlertDialog = (title, html) => { CAP_HTML = String(html || ''); };
  win.showConfirmDialog = (title, html, onYes) => { if (typeof onYes === 'function') onYes(); };
  win.showInputDialog = (title, msg, cb) => { if (typeof cb === 'function') cb('Jogador X'); };
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
  // DOM mínimo: os candidatos marcados no diálogo "Substituto".
  let cands = [];
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (sel) => (String(sel).indexOf('liga-fill-cands') !== -1 ? cands : []),
  };
  win.document = globalThis.document;
  new Function('window', 'document', LIGA_SRC)(win, globalThis.document);
  return {
    marcar: (lista) => {
      cands = lista.map((c) => ({ getAttribute: (k) => (k === 'data-uid' ? c.uid : (k === 'data-name' ? c.name : '')) }));
    },
  };
}

// ── fixture: grupo de Rei/Rainha com 4 pessoas + fila de 2 ──────────────────
function novoT() {
  const jogos = [
    { id: 'gz-0', team1: ['Eliane Cinelli', 'Juliana  Penha'], team1Uids: ['uid_eliane', 'uid_juliana'], team2: ['Katia', 'Thais Kawano'], team2Uids: ['uid_katia', 'uid_thais'], p1: 'Eliane Cinelli / Juliana  Penha', p2: 'Katia / Thais Kawano', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 25, winner: null },
    { id: 'gz-1', team1: ['Eliane Cinelli', 'Katia'], team1Uids: ['uid_eliane', 'uid_katia'], team2: ['Juliana  Penha', 'Thais Kawano'], team2Uids: ['uid_juliana', 'uid_thais'], p1: 'Eliane Cinelli / Katia', p2: 'Juliana  Penha / Thais Kawano', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 25, winner: null },
    { id: 'gz-2', team1: ['Eliane Cinelli', 'Thais Kawano'], team1Uids: ['uid_eliane', 'uid_thais'], team2: ['Juliana  Penha', 'Katia'], team2Uids: ['uid_juliana', 'uid_katia'], p1: 'Eliane Cinelli / Thais Kawano', p2: 'Juliana  Penha / Katia', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 25, winner: null },
  ];
  const g = {
    name: 'R1 Grupo Z',
    players: ['Eliane Cinelli', 'Juliana  Penha', 'Katia', 'Thais Kawano'],
    playersUids: ['uid_eliane', 'uid_juliana', 'uid_katia', 'uid_thais'],
    matchIds: jogos.map((m) => m.id),
    matches: jogos,
  };
  return {
    id: 'confra_wo59', name: 'Confra BT Alta da Clínica 2026', format: 'Liga', status: 'active',
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', woScope: 'individual',
    combinedCategories: [], genderCategories: [], skillCategories: [], ageCategories: [],
    creatorUid: 'uid_organizador', allowSelfDeactivation: true,
    participants: [
      { uid: 'uid_eliane', displayName: 'Eliane Cinelli', name: 'Eliane Cinelli', ligaActive: true },
      { uid: 'uid_juliana', displayName: 'Juliana  Penha', name: 'Juliana  Penha', ligaActive: true },
      { uid: 'uid_katia', displayName: 'Katia', name: 'Katia', ligaActive: true },
      { uid: 'uid_thais', displayName: 'Thais Kawano', name: 'Thais Kawano', ligaActive: true },
    ],
    standbyParticipants: [
      { uid: 'uid_renato', displayName: 'Renato Oshima', name: 'Renato Oshima', ligaActive: true },
      { uid: 'uid_vini', displayName: 'Vini', name: 'Vini', ligaActive: true },
    ],
    waitlist: [], monarchWaitlist: { _default_: [] }, ligaSubInvites: [],
    rounds: [{ round: 1, roundIndex: 0, status: 'active', format: 'rei_rainha', monarchGroups: [g], matches: jogos.slice() }],
    matches: [], groups: [],
  };
}
const nomes = (arr) => (arr || []).map((p) => (typeof p === 'string' ? p : (p.displayName || p.name)));
const acha = (arr, n) => (arr || []).filter((p) => (p.displayName || p.name) === n)[0];
const naFila = (t, n) => nomes(win._getWaitlist(t)).indexOf(n) !== -1;

// ═══ 1. O CASO DA ELIANE, byte a byte: aplicar W.O. → DESATIVADA ═══════════
sec('caso real', function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');

  const el = acha(t.participants, 'Eliane Cinelli');
  ok(!!el, 'Eliane CONTINUA no elenco (não sai pra fila) — era exatamente o bug de produção');
  ok(el && el.ligaActive === false, 'Eliane fica DESATIVADA (ligaActive:false)');
  ok(el && !!el.woDeactivatedAt, 'a marca do W.O. é woDeactivatedAt');
  ok(el && !el.woSentToWaitlistAt, 'NÃO pode ficar com woSentToWaitlistAt — foi essa marca que apareceu no doc real');
  ok(!naFila(t, 'Eliane Cinelli'), 'Eliane NÃO está na lista de espera');
  ok(t.rounds[0].monarchGroups[0].woDest === 'inactive', 'o grupo grava woDest "inactive"');

  // o resto do ciclo continua igual: 0 pts e o primeiro da fila assume
  const wo = (t.rounds[0].matches || []).filter((m) => m.isSitOut && m.sitOutReason === 'wo' && m.p1 === 'Eliane Cinelli')[0];
  ok(!!wo, 'o marcador de W.O. da rodada é criado (0 pts)');
  ok(t.rounds[0].monarchGroups[0].players.indexOf('Renato Oshima') !== -1, 'o primeiro da fila assume a vaga no grupo');
  ok(nomes(t.participants).indexOf('Renato Oshima') !== -1, 'e entra no ELENCO (fica até o fim do torneio)');
  ok(!naFila(t, 'Renato Oshima'), 'quem assumiu sai da fila');
  ok(nomes(win._getWaitlist(t)).indexOf('Vini') !== -1, 'quem não assumiu continua na fila');
});

// ═══ 2. Fila VAZIA: o W.O. desativa do mesmo jeito ═════════════════════════
sec('fila vazia', function () {
  const t = novoT();
  t.standbyParticipants = [];
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');
  const el = acha(t.participants, 'Eliane Cinelli');
  ok(el && el.ligaActive === false && !!el.woDeactivatedAt, 'sem suplente, quem levou W.O. é desativado igual');
  ok(t.rounds[0].monarchGroups[0].subStatus === 'open', 'a vaga fica aberta pra convite / Jogador X');
});

// ═══ 3. Os OUTROS TRÊS caminhos desativam também ═══════════════════════════
sec('substituição direta', function () {
  const t = novoT();
  loadLiga(t);
  win._ligaSubstituteNow(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli', 'uid_renato', 'Renato Oshima');
  const el = acha(t.participants, 'Eliane Cinelli');
  ok(el && el.ligaActive === false && !!el.woDeactivatedAt, 'substituição direta do organizador → desativada');
  ok(!naFila(t, 'Eliane Cinelli'), 'substituição direta NÃO manda pra fila');
  ok(t.rounds[0].monarchGroups[0].woDest === 'inactive', 'woDest "inactive" na substituição direta');
});

sec('convite', function () {
  const t = novoT();
  const dom = loadLiga(t);
  dom.marcar([{ uid: 'uid_renato', name: 'Renato Oshima' }, { uid: 'uid_vini', name: 'Vini' }]);
  win._ligaInviteSelected(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');
  const el = acha(t.participants, 'Eliane Cinelli');
  ok(el && el.ligaActive === false && !!el.woDeactivatedAt, 'ao convidar, o W.O. já vale e desativa');
  ok(!naFila(t, 'Eliane Cinelli'), 'convite NÃO manda o ausente pra fila');
  ok((t.ligaSubInvites || []).length === 2, 'os 2 convites foram criados');
});

sec('jogador X', function () {
  const t = novoT();
  loadLiga(t);
  win._ligaFillGuest(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli', 'Jogador X');
  const el = acha(t.participants, 'Eliane Cinelli');
  ok(el && el.ligaActive === false && !!el.woDeactivatedAt, 'Jogador X → o ausente é desativado');
  ok(!naFila(t, 'Eliane Cinelli'), 'Jogador X NÃO manda o ausente pra fila');
});

// ═══ 4. A ESCOLHA SUMIU DA TELA ════════════════════════════════════════════
sec('sem escolha na tela', function () {
  const t = novoT();
  loadLiga(t);
  win._ligaWoConfirm(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');
  ok(CAP_HTML.indexOf('pra onde vai') === -1, 'o diálogo NÃO pergunta mais "pra onde vai" — não há escolha');
  ok(CAP_HTML.indexOf('data-dest=') === -1, 'nenhum botão de destino no diálogo');
  ok(/vai para os Desativados/i.test(CAP_HTML), 'o diálogo DIZ que a pessoa vai para os Desativados');
  ok(!/fica desativad[oa]/i.test(CAP_HTML), 'e sem adjetivo com gênero — o app não presume o gênero de ninguém');
  ok(/lista de espera/i.test(CAP_HTML), 'e explica que religar o toggle a leva pra lista de espera');
  ok(CAP_HTML.indexOf('_ligaApplyWo(') !== -1, 'e o botão aplica o W.O. sem parâmetro de destino');

  CAP_HTML = '';
  win._ligaPickFill(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');
  ok(CAP_HTML.indexOf('data-dest=') === -1, 'o diálogo "Substituto" também perdeu a escolha 1×2');
});

// ═══ 5. VARREDURA: nenhum caminho do W.O. pode mandar pra fila ═════════════
sec('varredura de código', function () {
  ok(LIGA_SRC.indexOf('_ligaReadDest') === -1, 'a leitura da escolha (_ligaReadDest) foi REMOVIDA, não neutralizada');
  ok(LIGA_SRC.indexOf('_ligaSetWoDest') === -1, '_ligaSetWoDest (o clique na escolha) foi removido');
  ok(LIGA_SRC.indexOf('_ligaApplyDest') === -1, '_ligaApplyDest (o aplicador com destino) foi removido');
  ok(LIGA_SRC.indexOf("woSentToWaitlistAt = ") === -1,
    'nenhum caminho do W.O. grava woSentToWaitlistAt — a fila só vem do toggle do próprio participante');
  ok(LIGA_SRC.indexOf('_ligaWoDeactivate') !== -1, 'existe um PONTO ÚNICO de desfecho (_ligaWoDeactivate)');
  // ninguém pode empurrar o ausente pra fila por dentro do fluxo de W.O.
  const push = (LIGA_SRC.match(/_waitlistPushBack/g) || []).length;
  ok(push === 0, 'liga-substitution.js não chama mais _waitlistPushBack (achou ' + push + ')');
});

// ═══ 6. A SEGUNDA METADE: religar o toggle manda pra FILA ══════════════════
// Roda a _toggleLigaActive REAL, extraída do tournaments-enrollment.js.
function loadToggle(t, user) {
  const ini = ENROLL_SRC.indexOf('window._toggleLigaActive = function');
  ok(ini !== -1, 'achou _toggleLigaActive no tournaments-enrollment.js');
  const fim = ENROLL_SRC.indexOf('\n};', ini);
  const src = ENROLL_SRC.slice(ini, fim + 3);
  win.AppStore = {
    tournaments: [t], currentUser: user,
    isOrganizer: () => false,
    syncImmediate: () => Promise.resolve(true),
  };
  win.FirestoreDB = { saveTournament: () => Promise.resolve(true) };
  win._userMatchesParticipant = (u, p) => !!(u && p && u.uid && p.uid && u.uid === p.uid);
  win.showNotification = (a, b) => { LAST_TOAST = a + ' — ' + b; };
  win._warn = () => {};
  win._t = (k) => k;
  globalThis.renderTournaments = () => {};
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  new Function('window', 'document', 'renderTournaments', src)(win, globalThis.document, () => {});
}

sec('religar manda pra fila', function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');   // desativada, Renato assumiu

  loadToggle(t, { uid: 'uid_eliane', displayName: 'Eliane Cinelli' });
  win._toggleLigaActive(t.id, true);

  ok(!acha(t.participants, 'Eliane Cinelli'), 'ao religar, Eliane SAI do elenco');
  ok(naFila(t, 'Eliane Cinelli'), 'e ENTRA na lista de espera — a segunda metade da regra');
  const q = nomes(win._getWaitlist(t));
  ok(q[q.length - 1] === 'Eliane Cinelli', 'entra no FIM da fila, atrás de quem já esperava (fila: ' + q.join(' → ') + ')');
  const el = win._getWaitlist(t).filter((p) => (p.displayName || p.name) === 'Eliane Cinelli')[0];
  ok(el && el.ligaActive === true, 'na fila ela consta como disponível');
  ok(el && !!el.woSentToWaitlistAt, 'a marca acompanha a lista: agora é woSentToWaitlistAt');
  ok(el && !el.woDeactivatedAt, 'e a marca de desativado sai — senão o card diria os dois estados');
});

// ═══ 7. Fila VAZIA no W.O.: o nome fica no grupo, e religar AINDA vai pra fila
// Este é o caso que _isPlayingCurrentPhase sozinho deixaria passar: sem suplente,
// ninguém reescreve o slot, então a pessoa continua nos players do grupo e o teste
// "está jogando?" diria SIM — devolvendo ao elenco ativo quem tem um W.O. lançado.
sec('religar com o nome ainda no grupo', function () {
  const t = novoT();
  t.standbyParticipants = [];
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');
  ok(t.rounds[0].monarchGroups[0].players.indexOf('Eliane Cinelli') !== -1,
    'sem suplente, o nome dela CONTINUA no grupo (é o que arma a armadilha)');
  ok(win._isPlayingCurrentPhase(t, acha(t.participants, 'Eliane Cinelli')) === true,
    'e _isPlayingCurrentPhase diria "está jogando"');

  loadToggle(t, { uid: 'uid_eliane', displayName: 'Eliane Cinelli' });
  win._toggleLigaActive(t.id, true);
  ok(naFila(t, 'Eliane Cinelli'), 'mesmo assim, religar manda pra FILA — a marca de W.O. decide, não o resíduo no grupo');
  ok(!acha(t.participants, 'Eliane Cinelli'), 'e ela sai do elenco');
});

// ═══ 8. Quem NUNCA levou W.O. não muda de comportamento ═══════════════════
sec('sem W.O. o fluxo antigo segue', function () {
  const t = novoT();
  loadLiga(t);
  // Katia joga a rodada e apenas se desativa/reativa: continua no elenco.
  const k = acha(t.participants, 'Katia');
  k.ligaActive = false;
  loadToggle(t, { uid: 'uid_katia', displayName: 'Katia' });
  win._toggleLigaActive(t.id, true);
  ok(!!acha(t.participants, 'Katia'), 'quem está JOGANDO a fase e reativa volta ao elenco, não à fila');
  ok(!naFila(t, 'Katia'), 'e não entra na lista de espera');
});

// ═══ 9. Ciclo completo: desligar de volta restaura W.O. + desativado ══════
sec('desligar na fila volta a desativado', function () {
  const t = novoT();
  loadLiga(t);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo Z', 'Eliane Cinelli');
  loadToggle(t, { uid: 'uid_eliane', displayName: 'Eliane Cinelli' });
  win._toggleLigaActive(t.id, true);    // → fila
  win._toggleLigaActive(t.id, false);   // → desativado de novo
  const el = acha(t.participants, 'Eliane Cinelli');
  ok(!!el && el.ligaActive === false, 'desligar estando na fila devolve ao elenco como desativado');
  ok(el && !!el.woDeactivatedAt && !el.woSentToWaitlistAt, 'e a marca volta a ser woDeactivatedAt (estado único)');
  ok(!naFila(t, 'Eliane Cinelli'), 'e ela sai da fila');
});

console.log((fail === 0 ? '✅' : '❌') + ' wo-sempre-desativa: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
