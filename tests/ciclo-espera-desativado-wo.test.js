/* O CICLO INTEIRO DA ESPERA — inscrever · desativar · reativar · W.O. · reverter · formar
 * node tests/ciclo-espera-desativado-wo.test.js
 *
 * REGRA DO DONO (06/ago/2026), na íntegra:
 *   _"a pessoa se inscrevendo tem que ir e aparecer na lista de espera para todos; se
 *   desativar, precisa ir para desativado; se reativar, tem que voltar para a lista de
 *   espera (no fim da lista); se tomar wo, vai para a lista de wo; se reverter wo ou
 *   reativar, volta pro fim da lista de espera. isso tem que acontecer e aparecer para
 *   todos, sem erro. juntando a proporcao, forma novo grupo automaticamente. nao tem
 *   genero fica na lista sem presumir nada."_
 *
 * Cada transição já tinha dono (1.6.86 · 1.6.88 · 1.6.90 · 1.7.38 · 1.7.55), mas ninguém
 * rodava o CICLO INTEIRO de ponta a ponta — e é entre uma transição e a seguinte que
 * some gente (Gersom, Mari Telles, danielacsimao, Dėbora Castello). Este arquivo roda o
 * ciclo completo pelo código REAL, incluindo "aparece pra todos" (memberUids: sem estar
 * lá, a pessoa não enxerga o próprio torneio — o listener é array-contains).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(nome, fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ [' + nome + '] estourou:', e && e.message); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const { computeEnroll } = require(path.join(ROOT, 'functions', 'enroll-core.js'));

// ── o _toggleLigaActive REAL, extraído do arquivo (nada de réplica) ────────────
let salvo = null;
function carregaToggle(t) {
  win.AppStore = {
    tournaments: [t],
    currentUser: { uid: 'x' },
    isOrganizer: () => false,
    mutate: (i, f) => { f(t); return Promise.resolve(true); },
  };
  win._userMatchesParticipant = (u, p) => {
    if (!u || !p) return false;
    const us = [p.uid, p.p1Uid, p.p2Uid].filter(Boolean);
    return us.indexOf(u.uid) !== -1;
  };
  win.FirestoreDB = { saveTournament: (x) => { salvo = x; return Promise.resolve(); } };
  win.showNotification = () => {};
  win._warn = () => {};
  win._t = (k) => k;
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const marca = 'window._toggleLigaActive = function';
  const i = src.indexOf(marca);
  const corpo = src.slice(i, src.indexOf('\n};', i) + 3);
  new Function('window', 'document', '_t', 'renderTournaments', 'with (window) { ' + corpo + ' }')(
    win, globalThis.document, (k) => k, () => {});
}

const PERFIS = {
  u_ana: 'feminino', u_bia: 'feminino', u_cris: 'feminino', u_dani: 'feminino',
  u_paulo: 'masculino', u_pedro: 'masculino', u_semg: '',
};
function torneio() {
  const t = {
    id: 'T', format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    status: 'active', ligaOpenEnrollment: true, lateEnrollment: 'expand',
    allowSelfDeactivation: true, wlGroupBalance: 'equilibrado', genderRatio: '25/75',
    startDate: '2026-08-02T19:00', endDate: '2026-08-31T23:00',
    participants: [{ uid: 'u_jaJoga', displayName: 'Já Joga', ligaActive: true }],
    standbyParticipants: [], waitlist: [], monarchWaitlist: {},
    memberUids: ['u_jaJoga'], checkedIn: {}, absent: {}, matches: [], groups: [],
    rounds: [{ round: 1, roundIndex: 0,
      monarchGroups: [{ gi: 0, players: ['A', 'B', 'C', 'D'], playersUids: ['ua', 'ub', 'uc', 'ud'] }],
      matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', round: 1 }] }],
  };
  return t;
}
const naFila = (t) => (win._getWaitlist(t) || []).map((e) => e.uid || e.displayName);
const noElenco = (t) => (t.participants || []).map((p) => p.uid);
const entrada = (t, uid) => (t.participants || []).concat(t.standbyParticipants || [], t.waitlist || [])
  .filter((p) => p && p.uid === uid)[0];

// Inscreve pelo MESMO núcleo que a Cloud Function usa.
// `cat` é a categoria gravada NA INSCRIÇÃO — no Confra real elas divergem entre si
// ("Masc C", "Fem D", nenhuma) enquanto a RODADA não tem categoria nenhuma. É essa
// divergência que partia a fila em três e travava a formação (v1.7.55); sem ela no
// fixture, este arquivo passaria também no código quebrado e não protegeria nada.
function inscreve(t, uid, gender, cat) {
  const p = { uid: uid, displayName: uid, gender: gender, ligaActive: true, selfEnrolled: true };
  if (cat) { p.category = cat; p.categories = [cat]; }
  const r = computeEnroll(t, p, null);
  if (r.updateData) Object.keys(r.updateData).forEach((k) => { t[k] = r.updateData[k]; });
  return r;
}

// ── 1. INSCREVEU COM A FASE SORTEADA → LISTA DE ESPERA, e aparece PRA TODOS ─────
sec('inscrição', function () {
  const t = torneio();
  const r = inscreve(t, 'u_ana', 'feminino');
  ok(r.outcome === 'waitlisted', 'inscrição pós-sorteio vai pra ESPERA, deu "' + r.outcome + '"');
  ok(naFila(t).indexOf('u_ana') !== -1, 'e ela aparece na lista de espera');
  ok(noElenco(t).indexOf('u_ana') === -1, 'não entra no elenco (seria inscrito fantasma)');
  // "aparecer para todos" = estar em memberUids; sem isso ela nem vê o próprio torneio
  ok((t.memberUids || []).indexOf('u_ana') !== -1,
     'entra em memberUids — é o que faz o torneio aparecer pra ela e a fila pros outros');
});

// ── 2. DESATIVAR estando na fila → DESATIVADO ──────────────────────────────────
sec('desativar', function () {
  const t = torneio();
  inscreve(t, 'u_ana', 'feminino');
  carregaToggle(t);
  win.AppStore.currentUser = { uid: 'u_ana' };
  win._toggleLigaActive('T', false);
  ok(naFila(t).indexOf('u_ana') === -1, 'sai da lista de espera');
  ok(noElenco(t).indexOf('u_ana') !== -1, 'e vai pro elenco como DESATIVADO');
  ok(entrada(t, 'u_ana') && entrada(t, 'u_ana').ligaActive === false, 'com ligaActive:false');
});

// ── 3. REATIVAR → volta pro FIM da lista de espera ─────────────────────────────
sec('reativar', function () {
  const t = torneio();
  inscreve(t, 'u_ana', 'feminino');
  inscreve(t, 'u_bia', 'feminino');
  carregaToggle(t);
  win.AppStore.currentUser = { uid: 'u_ana' };
  win._toggleLigaActive('T', false);          // ana → desativada
  inscreve(t, 'u_cris', 'feminino');          // chega mais gente enquanto ela está fora
  win._toggleLigaActive('T', true);           // ana reativa
  const fila = naFila(t);
  ok(fila.indexOf('u_ana') !== -1, 'volta para a lista de espera');
  ok(noElenco(t).indexOf('u_ana') === -1, 'e sai dos desativados');
  ok(fila[fila.length - 1] === 'u_ana',
     'no FIM da fila (quem esperou mais tempo não perde a vez), ficou: ' + fila.join(' · '));
  ok(entrada(t, 'u_ana') && entrada(t, 'u_ana').ligaActive === true, 'e marcada como disponível');
});

// ── 4. W.O. → vai pro destino escolhido; e o caminho de volta ──────────────────
sec('W.O.', function () {
  // destino DESATIVADOS: fica no elenco, inativo, com o rastro do W.O.
  const t = torneio();
  t.participants.push({ uid: 'u_paulo', displayName: 'Paulo', ligaActive: true });
  t.memberUids.push('u_paulo');
  const p = entrada(t, 'u_paulo');
  p.ligaActive = false; p.woDeactivatedAt = new Date().toISOString();   // o que _ligaApplyDest grava
  carregaToggle(t);
  win.AppStore.currentUser = { uid: 'u_paulo' };
  win._toggleLigaActive('T', true);            // reativa depois do W.O.
  const fila = naFila(t);
  ok(fila.indexOf('u_paulo') !== -1, 'reativar depois de um W.O. devolve à lista de espera');
  ok(fila[fila.length - 1] === 'u_paulo', 'no FIM dela');

  // destino FILA: sai do elenco e entra no fim — e não perde o torneio de vista
  const t2 = torneio();
  t2.participants.push({ uid: 'u_pedro', displayName: 'Pedro', ligaActive: true });
  t2.memberUids.push('u_pedro');
  inscreve(t2, 'u_ana', 'feminino');
  const pe = entrada(t2, 'u_pedro');
  t2.participants = t2.participants.filter((x) => x.uid !== 'u_pedro');
  pe.ligaActive = true; pe.woSentToWaitlistAt = new Date().toISOString();
  win._waitlistPushBack(t2, pe);
  const f2 = naFila(t2);
  ok(f2[f2.length - 1] === 'u_pedro', 'W.O. com destino FILA põe a pessoa no fim, ficou: ' + f2.join(' · '));
  ok(f2.indexOf('u_ana') < f2.indexOf('u_pedro'), 'atrás de quem já esperava');
  ok(win._waitlistPushBack(t2, pe) === false, 'e é idempotente — não duplica nem promove');
});

// ── 5. JUNTANDO A PROPORÇÃO, FORMA GRUPO AUTOMATICAMENTE ──────────────────────
sec('formação', function () {
  const t = torneio();
  // categorias de inscrição DIVERGENTES e rodada SEM categoria — o cenário exato do Confra
  inscreve(t, 'u_paulo', 'masculino', 'Masc C');
  inscreve(t, 'u_ana', 'feminino', 'Fem D');
  inscreve(t, 'u_bia', 'feminino');
  ok(win._expandMonarchFromWaitlist(t) === 0, 'com 3 na fila não forma (falta gente)');
  inscreve(t, 'u_cris', 'feminino', 'Fem C');
  const n = win._expandMonarchFromWaitlist(t);
  ok(n === 1, 'ao juntar 1 homem + 3 mulheres (25/75), forma sozinho — formou ' + n);
  const g = t.rounds[0].monarchGroups.slice(-1)[0];
  ok((g.players || []).length === 4 && (g.matches || []).length === 3, 'com 4 pessoas e 3 jogos');
  ok((g.playersUids || []).every(Boolean), 'e nenhum uid nulo');
  ok(naFila(t).length === 0, 'quem entrou sai da fila');
  ok(noElenco(t).indexOf('u_ana') !== -1, 'e vira INSCRITO (senão joga sem estar no roster)');
});

// ── 6. SEM GÊNERO FICA NA LISTA — nada é presumido ────────────────────────────
sec('sem gênero', function () {
  const t = torneio();
  inscreve(t, 'u_paulo', 'masculino', 'Masc C');
  inscreve(t, 'u_ana', 'feminino', 'Fem D');
  inscreve(t, 'u_bia', 'feminino', 'Fem C');
  inscreve(t, 'u_semg', '');                 // sem gênero declarado
  ok(win._expandMonarchFromWaitlist(t) === 0,
     'não forma grupo usando quem não tem gênero — nem como homem, nem como mulher');
  ok(naFila(t).indexOf('u_semg') !== -1, 'e a pessoa CONTINUA na fila (não perde o lugar)');
  // chega uma 3ª mulher: agora forma sem ela, e ela segue esperando
  inscreve(t, 'u_cris', 'feminino', 'Fem D');
  ok(win._expandMonarchFromWaitlist(t) === 1, 'com 3 mulheres declaradas + 1 homem, forma');
  const g = t.rounds[0].monarchGroups.slice(-1)[0];
  ok((g.playersUids || []).indexOf('u_semg') === -1, 'sem quem não tem gênero');
  ok(naFila(t).indexOf('u_semg') !== -1, 'que permanece na fila esperando o organizador definir');
});

console.log((fail === 0 ? '✅' : '❌') + ' ciclo-espera-desativado-wo: ' + pass + ' asserções, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
