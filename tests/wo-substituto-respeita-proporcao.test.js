/* W.O. — O SUPLENTE RESPEITA A PROPORÇÃO DE GÊNERO (v1.8.45)
 * node tests/wo-substituto-respeita-proporcao.test.js
 *
 * Ordem do dono (13/ago/2026), dando W.O. na Glauce Assunção do R1 Grupo R do Confra:
 *   _"deve buscar garantir a proporção de 25/75. como nesse grupo não há nenhum homem,
 *    o homem na lista de espera passa na frente das mulheres e vai compor um grupo que
 *    estava 0/100 para virar 25/75."_
 *
 * O CENÁRIO É O REAL, MEDIDO EM PRODUÇÃO (tour_1780009816637, 13/ago):
 *   · R1 Grupo R: Betsy, Glauce, Julia, Fabi2401@ — 4 mulheres (gênero no PERFIL).
 *   · Fila: Fabiana Ferre (F, 15:06) → Nathalya Calil (F, 15:51) → Rodrigo Godinho
 *     (M, 16:04). O homem é o TERCEIRO da fila.
 *   · O doc NÃO tem `genderRatio` nem `wlGenderRatio` — a proporção do Confra é o
 *     DEFAULT 25/75 de `_ratioForPhase` (_drawBalanceMode: 'equilibrado').
 *
 * CONTRA A 1.8.44 ESTE ARQUIVO FICA VERMELHO (rodado com o código anterior: 18 falhas):
 *   (a) `_ligaNextSuplente` era "primeiro da fila que atende a categoria" — colocaria a
 *       Fabiana (F) num grupo que ficaria 0/100 de novo;
 *   (b) a régua de proporção do `_ligaPickFill` (v1.7.90) estava MORTA: lia
 *       `t.wlGenderRatio || t.genderRatio` cru (campos que não existem no Confra) e
 *       chamava `_genderForUid(t, u)` / `_pGender(t, p)` com assinatura errada — gênero
 *       sempre resolvia vazio. Um defeito escondia o outro.
 *
 * O QUE TAMBÉM ESTÁ TRAVADO (o que NÃO pode quebrar com a regra nova):
 *   · a proporção decide POR NECESSIDADE, não "homem primeiro": grupo que já tem seu
 *     homem prefere MULHER, mesmo com homem na frente da fila;
 *   · grupo já fora da proporção (4 mulheres) com fila só de mulheres → a primeira
 *     ASSUME mesmo assim (troca neutra) — régua booleana teria travado a vaga;
 *   · empate de distância → a ordem de chegada segue mandando;
 *   · gênero não-resolvível → ordem pura da fila (regra até a v1.8.44), nunca bloqueio;
 *   · categoria de INSCRIÇÃO com prefixo ("Fem D"/"Masc C") vale como declaração de
 *     gênero quando o perfil não está no cache.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

// window base (waitlist-core, gender-ratio-core, identity-core…) via o shim do servidor.
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

const LIGA_SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');

// ── perfis REAIS (displayName + gênero, como em users/{uid}) ────────────────
const U = {
  betsy:   'Ol1GJbdVnmRQIjeV405ZKhn1Xoa2',
  glauce:  'nWPV2jiAgUe39F6kF4AdL9uX1N73',
  julia:   'zqd1iQ3qK3ZlRuArh5upiy1Q8tq1',
  fabi:    '7ZPh05PXOgXl82gjBpERZUZQMvv2',
  fabiana: 'zoSoQsXOIzZKd9VB5lV6ByjEnJw2',
  nathalya:'ufIkpAo880X3LRWSxaOgXZS0Aph2',
  rodrigo: 'I8CGdscAaVTesX0juGfictd8WEv1',
};
const PROFILES = {};
PROFILES[U.betsy]    = { displayName: 'Betsy Emma Betsabe Blasco', gender: 'feminino' };
PROFILES[U.glauce]   = { displayName: 'Glauce Assunção',           gender: 'feminino' };
PROFILES[U.julia]    = { displayName: 'Julia Seligmann',           gender: 'feminino' };
PROFILES[U.fabi]     = { displayName: 'Fabi2401@',                 gender: 'feminino' }; // perfil real é "Dani Bataglia"; o grupo guarda o rótulo da época
PROFILES[U.fabiana]  = { displayName: 'Fabiana Ferre',             gender: 'feminino' };
PROFILES[U.nathalya] = { displayName: 'Nathalya Calil',            gender: 'feminino' };
PROFILES[U.rodrigo]  = { displayName: 'Rodrigo Godinho',           gender: 'masculino' };

let LAST_DIALOG = null;   // { title, html }
function loadLiga(t, profiles) {
  const P = profiles || {};
  const store = {
    tournaments: [t],
    currentUser: { uid: 'uid_organizador', displayName: 'Organizador' },
    mutate: (tid, fn) => { fn(t); return Promise.resolve(true); },
    isOrganizer: () => true,
  };
  win.AppStore = store;
  win._findTournamentById = (id) => (String(t.id) === String(id) ? t : null);
  win._canManagePresence = () => true;
  win.showNotification = () => {};
  win.showAlertDialog = (title, html) => { LAST_DIALOG = { title: title, html: html }; };
  win.showConfirmDialog = () => {};
  win.showInputDialog = () => {};
  win._safeHtml = (s) => String(s == null ? '' : s);
  win._sendUserNotification = () => {};
  win._softRefreshView = () => {};
  win._rerenderBracket = () => {};
  // helpers que no navegador vêm do store.js (NÃO vendorado) — o teste os fornece com o
  // MESMO contrato: gênero/nome pelo uid via cache de perfis.
  win._genderForUid = (uid) => (P[uid] && P[uid].gender) || '';
  win._nameForUid = (uid) => (P[uid] && P[uid].displayName) || '';
  win._pName = (e, fb) => {
    if (!e || typeof e !== 'object') return String(e || fb || '');
    const u = e.uid;
    return (u && P[u] && P[u].displayName) || e.displayName || e.name || fb || '';
  };
  win._participantUids = (e) => {
    if (!e || typeof e !== 'object') return [];
    const out = [];
    [e.uid, e.p1Uid, e.p2Uid].forEach((u) => { if (u && out.indexOf(u) === -1) out.push(u); });
    return out;
  };
  win._preloadUserProfiles = () => Promise.resolve();
  win._buildNameToUid = (tt) => {
    const m = {};
    const put = (u) => { const n = win._nameForUid(u); if (u && n && !m[n]) m[n] = u; };
    ((tt && tt.participants) || []).forEach((p) => { if (p) { put(p.uid); if (p.displayName && p.uid) m[p.displayName] = p.uid; } });
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

// ── fixture: o R1 Grupo R REAL + a fila REAL (entradas STRIPPADAS, como no doc) ──
const PLAYERS = ['Betsy Emma Betsabe Blasco', 'Glauce Assunção', 'Julia Seligmann', 'Fabi2401@'];
const PUIDS = [U.betsy, U.glauce, U.julia, U.fabi];
function grupoR() {
  const jogos = [
    { id: 'g17-0', team1: [PLAYERS[0], PLAYERS[1]], team1Uids: [PUIDS[0], PUIDS[1]], team2: [PLAYERS[2], PLAYERS[3]], team2Uids: [PUIDS[2], PUIDS[3]], p1: PLAYERS[0] + ' / ' + PLAYERS[1], p2: PLAYERS[2] + ' / ' + PLAYERS[3], round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 17, winner: null, scoreP1: null, scoreP2: null },
    { id: 'g17-1', team1: [PLAYERS[0], PLAYERS[2]], team1Uids: [PUIDS[0], PUIDS[2]], team2: [PLAYERS[1], PLAYERS[3]], team2Uids: [PUIDS[1], PUIDS[3]], p1: PLAYERS[0] + ' / ' + PLAYERS[2], p2: PLAYERS[1] + ' / ' + PLAYERS[3], round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 17, winner: null, scoreP1: null, scoreP2: null },
    { id: 'g17-2', team1: [PLAYERS[0], PLAYERS[3]], team1Uids: [PUIDS[0], PUIDS[3]], team2: [PLAYERS[1], PLAYERS[2]], team2Uids: [PUIDS[1], PUIDS[2]], p1: PLAYERS[0] + ' / ' + PLAYERS[3], p2: PLAYERS[1] + ' / ' + PLAYERS[2], round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 17, winner: null, scoreP1: null, scoreP2: null },
  ];
  return {
    g: { name: 'R1 Grupo R', players: PLAYERS.slice(), playersUids: PUIDS.slice(), matches: jogos, rosterAt: 1786392993723 },
    jogos: jogos,
  };
}
function novoT(opts) {
  opts = opts || {};
  const { g, jogos } = grupoR();
  const fila = opts.fila || [
    { uid: U.fabiana,  category: 'Fem D',  categories: ['Fem D'],  ligaActive: true, selfEnrolled: true, addedAt: '2026-08-13T15:06:42.232Z' },
    { uid: U.nathalya, category: 'Fem D',  categories: ['Fem D'],  ligaActive: true, selfEnrolled: true, addedAt: '2026-08-13T15:51:07.905Z' },
    { uid: U.rodrigo,  category: 'Masc C', categories: ['Masc C'], ligaActive: true, selfEnrolled: true, addedAt: '2026-08-13T16:04:10.864Z' },
  ];
  return {
    id: 'tour_1780009816637', name: 'Confra BT', format: 'Liga', status: 'active',
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', woScope: 'individual',
    // como no doc real: SEM genderRatio/wlGenderRatio — a proporção é o DEFAULT 25/75
    _drawBalanceMode: 'equilibrado', wlGroupBalance: 'equilibrado', balanceBy: 'individual',
    combinedCategories: [], genderCategories: [], skillCategories: [], ageCategories: [],
    creatorUid: 'uid_organizador', allowSelfDeactivation: true,
    // elenco STRIPPADO como em produção (só uid + campos do torneio; nome/gênero no perfil)
    participants: [
      { uid: U.betsy,  category: 'C',     categories: ['C'],     ligaActive: true },
      { uid: U.glauce, category: 'Misto', categories: ['Misto'], ligaActive: false },
      { uid: U.julia,  category: 'Fem D', categories: ['Fem D'], ligaActive: true },
      { uid: U.fabi,   category: 'D',     categories: ['D'],     ligaActive: true },
    ],
    standbyParticipants: fila,
    waitlist: [], monarchWaitlist: { _default_: [], Masc_C: [] },
    rounds: [{ round: 1, roundIndex: 0, status: 'active', format: 'rei_rainha', monarchGroups: [g], matches: jogos.slice() }],
    matches: [], groups: [],
  };
}

// ── 1. O CASO DO DONO: grupo 0/100, o homem (3º da fila) passa na frente ────
sec(function () {
  const t = novoT();
  loadLiga(t, PROFILES);
  ok(typeof win._ligaNextSuplente === 'function', 'falta window._ligaNextSuplente');
  const sub = win._ligaNextSuplente(t, t.rounds[0].monarchGroups[0], 'Glauce Assunção');
  ok(!!sub && sub.uid === U.rodrigo,
    'o suplente devia ser o Rodrigo Godinho (M — grupo 0/100 vira 25/75), veio ' + (sub && (win._pName(sub, '') || sub.uid)));
});

// ── 2. Empate de distância → a ordem de chegada segue mandando ──────────────
sec(function () {
  // sem homem na fila: as duas mulheres têm a MESMA distância → a 1ª (Fabiana) assume
  const t = novoT({ fila: [
    { uid: U.fabiana,  category: 'Fem D', categories: ['Fem D'], ligaActive: true },
    { uid: U.nathalya, category: 'Fem D', categories: ['Fem D'], ligaActive: true },
  ] });
  loadLiga(t, PROFILES);
  const sub = win._ligaNextSuplente(t, t.rounds[0].monarchGroups[0], 'Glauce Assunção');
  ok(!!sub && sub.uid === U.fabiana,
    'sem homem na fila, a PRIMEIRA mulher assume (ordem de chegada) — veio ' + (sub && sub.uid));
  // e isto também trava a régua booleana: 3F + 1F = 4F NÃO atende 25/75, mas a troca
  // neutra tem que acontecer — vaga aberta por proporção seria pior que o grupo que já era
});

// ── 3. A proporção decide POR NECESSIDADE — não é "homem primeiro" ──────────
sec(function () {
  // grupo 1M/3F (Rodrigo no lugar da Betsy); sai uma MULHER (Julia) → restam 1M/2F.
  // Fila: homem primeiro, mulher depois. Entrar OUTRO homem daria 2M/2F (dist 1);
  // a mulher dá 1M/3F (dist 0) → a MULHER fura a fila do homem.
  const t = novoT({ fila: [
    { uid: 'uid_homem2',  category: 'Masc C', categories: ['Masc C'], ligaActive: true },
    { uid: U.fabiana,     category: 'Fem D',  categories: ['Fem D'],  ligaActive: true },
  ] });
  const g = t.rounds[0].monarchGroups[0];
  g.players[0] = 'Rodrigo Godinho'; g.playersUids[0] = U.rodrigo;
  const P = Object.assign({}, PROFILES);
  P['uid_homem2'] = { displayName: 'Outro Homem', gender: 'masculino' };
  loadLiga(t, P);
  const sub = win._ligaNextSuplente(t, g, 'Julia Seligmann');
  ok(!!sub && sub.uid === U.fabiana,
    'grupo que JÁ tem seu homem prefere MULHER (1M/3F), mesmo com homem na frente da fila — veio ' + (sub && sub.uid));
});

// ── 4. Gênero não-resolvível → ordem PURA da fila (nunca bloqueio) ──────────
sec(function () {
  // perfis fora do cache E categorias sem prefixo de gênero ("C"/"D"/"Misto"): o grupo
  // não é medível → a proporção não decide nada e vale a regra de sempre (1º da fila).
  const t = novoT({ fila: [
    { uid: U.fabiana, category: 'D', categories: ['D'], ligaActive: true, displayName: 'Fabiana Ferre' },
    { uid: U.rodrigo, category: 'C', categories: ['C'], ligaActive: true, displayName: 'Rodrigo Godinho' },
  ] });
  loadLiga(t, {});   // cache de perfis VAZIO
  const sub = win._ligaNextSuplente(t, t.rounds[0].monarchGroups[0], 'Glauce Assunção');
  ok(!!sub && sub.uid === U.fabiana,
    'sem gênero medível a fila NÃO é reordenada (nem travada) — veio ' + (sub && sub.uid));
});

// ── 5. Prefixo da categoria de inscrição declara gênero pra FILA ────────────
sec(function () {
  // perfis da FILA existem mas SEM o campo gênero (a pessoa nunca preencheu) — o
  // prefixo da categoria de inscrição ("Fem D"/"Masc C", escolhida por alguém) declara,
  // e o Rodrigo passa na frente do mesmo jeito. Não é presunção: é declaração.
  const P = {};
  [U.betsy, U.glauce, U.julia, U.fabi].forEach((u) => { P[u] = PROFILES[u]; });
  P[U.fabiana]  = { displayName: 'Fabiana Ferre',  gender: '' };
  P[U.nathalya] = { displayName: 'Nathalya Calil', gender: '' };
  P[U.rodrigo]  = { displayName: 'Rodrigo Godinho', gender: '' };
  const t = novoT();
  loadLiga(t, P);
  const sub = win._ligaNextSuplente(t, t.rounds[0].monarchGroups[0], 'Glauce Assunção');
  ok(!!sub && sub.uid === U.rodrigo,
    'perfil sem gênero preenchido: o prefixo "Masc C" da inscrição declara — veio ' + (sub && sub.uid));
});

// ── 6. O diálogo "Confirmar W.O.?" DIZ que alguém furou a fila (e por quê) ──
sec(function () {
  const t = novoT();
  loadLiga(t, PROFILES);
  LAST_DIALOG = null;
  win._ligaWoConfirm(t.id, 0, 'R1 Grupo R', 'Glauce Assunção');
  ok(!!LAST_DIALOG && /QUEM ASSUME A VAGA/.test(LAST_DIALOG.html || ''), 'o diálogo de confirmação não abriu');
  ok(/Rodrigo Godinho/.test(LAST_DIALOG.html || ''), 'o diálogo devia nomear o Rodrigo como quem assume');
  ok(/na frente da fila/.test(LAST_DIALOG.html || '') && /25\/75/.test(LAST_DIALOG.html || ''),
    'quem foi passado pra trás vai perguntar — o diálogo tem que dizer que ele entra NA FRENTE DA FILA pela proporção 25/75');
});

// ── 7. Sem fura-fila, o texto continua o de sempre ──────────────────────────
sec(function () {
  const t = novoT({ fila: [
    { uid: U.fabiana,  category: 'Fem D', categories: ['Fem D'], ligaActive: true },
    { uid: U.nathalya, category: 'Fem D', categories: ['Fem D'], ligaActive: true },
  ] });
  loadLiga(t, PROFILES);
  LAST_DIALOG = null;
  win._ligaWoConfirm(t.id, 0, 'R1 Grupo R', 'Glauce Assunção');
  ok(!!LAST_DIALOG && /Fabiana Ferre/.test(LAST_DIALOG.html || ''), 'a Fabiana devia assumir');
  ok(/Primeiro da lista de espera/.test(LAST_DIALOG.html || ''), 'sem fura-fila o texto é o de sempre');
  ok(!/na frente da fila/.test(LAST_DIALOG.html || ''), 'não pode alegar fura-fila quando não houve');
});

// ── 8. O diálogo "Substituto" (_ligaPickFill): ordem, pré-marca e tag ───────
sec(function () {
  const t = novoT();
  loadLiga(t, PROFILES);
  LAST_DIALOG = null;
  win._ligaPickFill(t.id, 0, 'R1 Grupo R', 'Glauce Assunção');
  ok(!!LAST_DIALOG && LAST_DIALOG.title === 'Substituto', 'o diálogo Substituto não abriu');
  const html = (LAST_DIALOG && LAST_DIALOG.html) || '';
  // ordem na tela: Rodrigo PRIMEIRO (dist 0), depois as mulheres na ordem de chegada
  const ordem = [];
  html.replace(/data-name="([^"]+)"/g, (m, n) => { ordem.push(n); return m; });
  ok(ordem[0] === 'Rodrigo Godinho', 'o Rodrigo devia vir PRIMEIRO na lista, veio: ' + ordem.join(' | '));
  ok(ordem.indexOf('Fabiana Ferre') === 1 && ordem.indexOf('Nathalya Calil') === 2,
    'as mulheres seguem atrás, na ordem de chegada: ' + ordem.join(' | '));
  // pré-marcado nasce UM só, e é o Rodrigo
  const marcados = [];
  html.replace(/data-on="1"[^>]*data-name="([^"]+)"/g, (m, n) => { marcados.push(n); return m; });
  ok(marcados.length === 1 && marcados[0] === 'Rodrigo Godinho',
    'pré-marcado devia ser SÓ o Rodrigo, veio: ' + (marcados.join(' | ') || '(ninguém)'));
  // quem quebraria a proporção NÃO some — vem com a tag
  ok(/quebra 25\/75/.test(html), 'quem quebra a proporção vem MARCADO ("quebra 25/75"), nunca escondido');
});

// ── 9. Ponta a ponta: Aplicar W.O. na Glauce → o Rodrigo assume de verdade ──
sec(function () {
  const t = novoT();
  loadLiga(t, PROFILES);
  win._ligaApplyWo(t.id, 0, 'R1 Grupo R', 'Glauce Assunção');
  const g = t.rounds[0].monarchGroups[0];
  // o grupo virou 1M/3F, com o uid do slot certo
  ok(g.players.includes('Rodrigo Godinho'), 'Rodrigo devia estar no grupo, players=' + g.players.join('|'));
  ok(!g.players.includes('Glauce Assunção'), 'Glauce não pode continuar no grupo');
  ok(g.playersUids[g.players.indexOf('Rodrigo Godinho')] === U.rodrigo, 'o uid do slot tem que ser o do Rodrigo');
  ok(g.subStatus === 'filled' && g.subName === 'Rodrigo Godinho' && g.subUid === U.rodrigo, 'grupo devia ficar filled com o Rodrigo (nome + uid)');
  ok(g.woAbsent === 'Glauce Assunção' && g.woAbsentUid === U.glauce, 'o grupo registra quem levou o W.O., com uid');
  // os 3 jogos trocaram Glauce→Rodrigo
  const jogos = t.rounds[0].matches.filter((m) => !m.isSitOut);
  ok(jogos.length === 3 && jogos.every((m) => !(m.team1 || []).includes('Glauce Assunção') && !(m.team2 || []).includes('Glauce Assunção')), 'sobrou Glauce em algum jogo');
  ok(jogos.every((m) => (m.team1 || []).includes('Rodrigo Godinho') || (m.team2 || []).includes('Rodrigo Godinho')), 'Rodrigo tinha que estar nos 3 jogos');
  // Glauce DESATIVADA no elenco (nunca na fila); Rodrigo ENTROU no elenco e SAIU da fila
  const ge = t.participants.filter((p) => p && p.uid === U.glauce)[0];
  ok(!!ge && ge.ligaActive === false && !!ge.woDeactivatedAt, 'Glauce fica no elenco DESATIVADA (woDeactivatedAt)');
  ok(t.participants.some((p) => p && p.uid === U.rodrigo), 'Rodrigo entra no ELENCO — é o que o faz jogar até o fim do torneio');
  const fila = win._getWaitlist(t).map((e) => e.uid);
  ok(fila.indexOf(U.rodrigo) === -1, 'quem assumiu sai da fila');
  ok(fila.indexOf(U.fabiana) === 0 && fila.indexOf(U.nathalya) === 1,
    'quem NÃO assumiu continua na fila, na MESMA ordem de chegada: ' + fila.join(' | '));
});

// ── 10. A régua pura: _ratioDistance ────────────────────────────────────────
sec(function () {
  ok(typeof win._ratioDistance === 'function', 'falta window._ratioDistance (gender-ratio-core)');
  const F = { gender: 'feminino' }, M = { gender: 'masculino' };
  ok(win._ratioDistance([M, F, F, F], '25/75') === 0, '1M/3F atende 25/75 (dist 0)');
  ok(win._ratioDistance([F, F, F, F], '25/75') === 1, '4F em 25/75 = 1 além da cota');
  ok(win._ratioDistance([M, M, F, F], '25/75') === 1, '2M/2F em 25/75 = 1 homem além da cota');
  ok(win._ratioDistance([M, F, F, { gender: '' }], '25/75') === null, 'alguém sem gênero → não dá pra medir (null)');
  ok(win._ratioDistance([M, F, F, { wildcard: true }], '25/75') === 0, 'VAGA tapa o buraco de qualquer lado (não conta excesso)');
  ok(win._ratioDistance([M, F, F, F], 'nada') === null, 'proporção inválida → null');
});

console.log('\nwo-substituto-respeita-proporcao: ' + pass + ' ok / ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
