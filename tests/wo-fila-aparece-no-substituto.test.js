/* O DIÁLOGO "SUBSTITUTO" TEM QUE MOSTRAR A LISTA DE ESPERA
 * node tests/wo-fila-aparece-no-substituto.test.js
 *
 * BUG AO VIVO (Confra, 02/ago/2026, com o dono operando): ele deu W.O. na Thereza e o
 * diálogo respondeu _"Ninguém da mesma categoria ficou de fora nesta rodada para
 * convidar"_ — com DUAS pessoas na lista de espera (Sandra e Paulo, medidas no doc).
 * Só sobrava "Jogador X", que é opção válida mas não era a que ele queria.
 *
 * DUAS CAUSAS, as duas em _ligaPickFill:
 *  (a) lia a espera SÓ de t.monarchWaitlist (via _getMonarchWaitlist). A espera vive em
 *      TRÊS storages e as duas pessoas estavam em standbyParticipants — _getWaitlist é a
 *      única leitura correta, e é literalmente o que o cânone da espera manda usar.
 *  (b) resolvia identidade por NOME (uidMap[nm]). Quem tem perfil tem o nome STRIPPADO no
 *      doc (v1.3.52): displayName vem null. Lookup por nome não acha ninguém.
 * E a CATEGORIA escondia quem não atende, em vez de deixar o organizador decidir — o que
 * transformava um defeito de leitura numa frase que culpava a categoria.
 *
 * O fixture reproduz o doc REAL: as entradas da espera SEM displayName (só uid), a
 * Thereza com category 'D', e a fila em standbyParticipants.
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

// perfis "vivos" — é daqui que o nome tem que sair, já que o doc não guarda mais
const PERFIL = { uid_sandra: 'Sandra Bighetto', uid_paulo: 'Paulo Oriente', uid_thereza: 'Thereza' };

function novoT(opts) {
  opts = opts || {};
  const jogos = [
    { id: 'g22-0', team1: ['Thereza', 'FABIANA VIEIRA'], team1Uids: ['uid_thereza', 'uid_fabiana'], team2: ['Flávia Barchetta', 'Suely'], team2Uids: ['uid_flavia', 'uid_suely'], p1: 'Thereza / FABIANA VIEIRA', p2: 'Flávia Barchetta / Suely', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 22, category: opts.semCategoria ? undefined : 'D', winner: null },
  ];
  const g = { name: 'R1 Grupo W', players: ['Thereza', 'FABIANA VIEIRA', 'Flávia Barchetta', 'Suely'], playersUids: ['uid_thereza', 'uid_fabiana', 'uid_flavia', 'uid_suely'], matches: jogos, category: opts.semCategoria ? undefined : 'D' };
  return {
    id: 'confra', name: 'Confra', format: 'Liga', ligaRoundFormat: 'rei_rainha', creatorUid: 'org',
    combinedCategories: opts.semCategoria ? [] : ['D'],
    participants: [
      // como está no banco: quem tem perfil NÃO guarda nome no doc
      { uid: 'uid_thereza', enrollSeq: 14, ligaActive: true, category: 'D', categories: ['D'] },
      { uid: 'uid_fabiana', ligaActive: true }, { uid: 'uid_flavia', ligaActive: true }, { uid: 'uid_suely', ligaActive: true },
    ],
    // A FILA REAL — sem displayName, exatamente como o doc guarda hoje
    standbyParticipants: opts.filaVazia ? [] : [{ uid: 'uid_sandra', ligaActive: true }, { uid: 'uid_paulo', ligaActive: true }],
    waitlist: [], monarchWaitlist: { _default_: [] },
    rounds: [{ round: 1, roundIndex: 0, monarchGroups: [g], matches: jogos.slice() }], matches: [], groups: [],
  };
}

let CAP = null;
function abrirSubstituto(t) {
  CAP = null;
  win.AppStore = { tournaments: [t], currentUser: { uid: 'org' }, mutate: (i, f) => { f(t); return Promise.resolve(true); }, isOrganizer: () => true };
  win._findTournamentById = () => t;
  win._canManagePresence = () => true;
  win.showAlertDialog = (title, html) => { CAP = { title, html }; };
  win.showNotification = () => {};
  win._safeHtml = (s) => String(s == null ? '' : s);
  // nome resolve por UID (perfil vivo) — é assim que o app faz
  win._pName = (e, fb) => {
    if (!e) return fb || '';
    if (typeof e === 'string') return e;
    const u = e.uid || (e.p1Uid) || '';
    return PERFIL[u] || e.displayName || e.name || fb || '';
  };
  win._displayNameForUid = (u, fb) => PERFIL[u] || fb || '';
  win._participantInCategory = (e, cat) => {
    const cats = (e && e.categories) || (e && e.category ? [e.category] : []);
    return cats.indexOf(cat) !== -1;
  };
  win._displayCategoryName = (c) => c;
  win._buildNameToUid = () => ({});
  win._softRefreshView = () => {};
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  new Function('window', 'document', LIGA_SRC)(win, globalThis.document);
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  return CAP ? CAP.html : '';
}

// ── 1. O BUG: a fila TEM que aparecer ───────────────────────────────────────
sec(function () {
  const html = abrirSubstituto(novoT());
  ok(html.indexOf('Sandra Bighetto') !== -1, 'a Sandra tinha que aparecer no diálogo (está na lista de espera)');
  ok(html.indexOf('Paulo Oriente') !== -1, 'o Paulo tinha que aparecer no diálogo');
  ok(html.indexOf('Ninguém da mesma categoria') === -1, 'a frase que culpava a categoria não pode mais existir com gente na fila');
  ok(html.indexOf('data-uid="uid_sandra"') !== -1, 'o candidato tem que carregar o UID (identidade), não só o nome');
  ok(html.indexOf('data-uid="uid_paulo"') !== -1, 'idem pro Paulo');
});

// ── 2. Ordem: a FILA na ordem dela, quem atende a categoria primeiro ────────
sec(function () {
  const html = abrirSubstituto(novoT());
  ok(html.indexOf('Sandra Bighetto') < html.indexOf('Paulo Oriente'), 'a ordem da fila tem que ser preservada (Sandra entrou antes)');
});

// ── 3. Categoria não ESCONDE: marca ──────────────────────────────────────────
sec(function () {
  const html = abrirSubstituto(novoT());
  // Sandra/Paulo não têm categoria e o grupo é 'D' → aparecem MARCADOS, não sumidos
  ok(html.indexOf('fora da categoria') !== -1, 'quem não atende a categoria tem que vir MARCADO, não sumido');
  ok(html.indexOf('lista de espera') !== -1, 'a origem (lista de espera) tem que ficar visível');
});

// ── 4. Quem atende a categoria vem ANTES de quem não atende ─────────────────
sec(function () {
  const t = novoT();
  t.standbyParticipants = [{ uid: 'uid_paulo', ligaActive: true }, { uid: 'uid_sandra', ligaActive: true, categories: ['D'] }];
  const html = abrirSubstituto(t);
  ok(html.indexOf('Sandra Bighetto') < html.indexOf('Paulo Oriente'),
    'quem atende a categoria sobe na frente de quem não atende (sem esconder ninguém)');
});

// ── 5. Jogador X CONTINUA — é opção válida (ordem do dono) ──────────────────
sec(function () {
  const html = abrirSubstituto(novoT());
  ok(html.indexOf('Jogador X') !== -1, 'Jogador X não pode ter sumido — é opção válida');
  ok(html.indexOf('_ligaFillGuestPrompt') !== -1, 'o botão do Jogador X tem que continuar funcional');
});

// ── 6. Fila REALMENTE vazia: a frase só então é dita ────────────────────────
sec(function () {
  const html = abrirSubstituto(novoT({ filaVazia: true }));
  ok(html.indexOf('lista de espera está vazia') !== -1, 'com a fila vazia o texto tem que dizer isso');
  ok(html.indexOf('Jogador X') !== -1, 'e o Jogador X segue disponível');
});

// ── 7. Torneio SEM categoria: todo mundo entra limpo ────────────────────────
sec(function () {
  const html = abrirSubstituto(novoT({ semCategoria: true }));
  ok(html.indexOf('Sandra Bighetto') !== -1 && html.indexOf('Paulo Oriente') !== -1, 'sem categoria, a fila inteira aparece');
  ok(html.indexOf('fora da categoria') === -1, 'sem categoria não existe marca de categoria');
});

// ── 8. Não lê mais SÓ o monarchWaitlist ─────────────────────────────────────
sec(function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
  const i = src.indexOf('window._ligaPickFill = function');
  const corpo = src.slice(i, src.indexOf('\n};', i));
  ok(corpo.indexOf('_getWaitlist') !== -1, '_ligaPickFill tem que ler a espera por _getWaitlist (os 3 storages)');
  // a CHAMADA (o comentário que explica o bug pode — e deve — mencionar o nome)
  ok(corpo.indexOf('window._getMonarchWaitlist(') === -1, 'não pode voltar a CHAMAR o monarchWaitlist como fonte única');
});

console.log((fail === 0 ? '✅' : '❌') + ' wo-fila-aparece-no-substituto: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
