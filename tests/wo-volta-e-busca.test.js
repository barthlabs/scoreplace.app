/* QUEM LEVOU W.O. TEM CAMINHO DE VOLTA + A BUSCA ACHA QUEM ESTÁ DE FORA
 * node tests/wo-volta-e-busca.test.js
 *
 * REGRA DO DONO (ago/2026): _"para onde quer que o W.O. vá, ele precisa ter o poder de se
 * reativar em rodadas futuras, e a barra de busca/filtro deve encontrar quem estiver em
 * desativados / lista de espera / W.O. SEMPRE."_
 *
 * DOIS BURACOS REAIS:
 *  (a) o toggle "Ativado/Desativado" só procurava a pessoa em t.participants. Quem foi
 *      mandado pro FIM DA FILA sai de participants — e o controle SUMIA: a pessoa ficava
 *      sem nenhum caminho de volta, dependendo do organizador lembrar dela.
 *  (b) o filtro da chave varre `[data-players]`, e os chips dos boxes "Desativados",
 *      "Lista de espera", "W.O." e "Sem grupo" NÃO tinham o atributo. Buscar por alguém
 *      que só existe ali não achava nada — e, pior, escondia o box inteiro (o filtro sobe
 *      pelos ancestrais), deixando a tela vazia.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

function novoT() {
  return {
    id: 'T', format: 'Liga', status: 'active', allowSelfDeactivation: true,
    participants: [{ uid: 'uid_a', displayName: 'Ana', ligaActive: true }],
    standbyParticipants: [{ uid: 'uid_th', displayName: 'Thereza', ligaActive: true }],
    waitlist: [], monarchWaitlist: { _default_: [] },
    rounds: [{ round: 1, roundIndex: 0, monarchGroups: [], matches: [{ id: 'm', p1: 'Ana', p2: 'X', team1Uids: ['uid_a'] }] }],
    matches: [], groups: [],
  };
}
function carrega(t, quemSou) {
  win.AppStore = { tournaments: [t], currentUser: { uid: quemSou }, isOrganizer: () => false,
    mutate: (i, f) => { f(t); return Promise.resolve(true); } };
  win._userMatchesParticipant = (u, p) => !!(p && p.uid && u && u.uid && p.uid === u.uid);
  win._pName = (e, fb) => (e && (e.displayName || e.name)) || fb || '';
  win._safeHtml = (s) => String(s == null ? '' : s);
  win.FirestoreDB = { saveTournament: () => Promise.resolve() };
  win.showNotification = () => {};
  win._warn = () => {};
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  ['window._buildLigaActiveToggleHtml = function', 'window._toggleLigaActive = function'].forEach((marca) => {
    const i = src.indexOf(marca);
    const body = src.slice(i, src.indexOf('\n};', i) + 3);
    new Function('window', 'document', '_t', 'renderTournaments', 'with (window) { ' + body + ' }')(
      win, globalThis.document, (k) => k, () => {});
  });
}
const nomes = (a) => (a || []).map((p) => p.displayName || p.name);

// ── 1. O CONTROLE APARECE PRA QUEM ESTÁ NA FILA ─────────────────────────────
sec(function () {
  const t = novoT(); carrega(t, 'uid_th');
  const html = win._buildLigaActiveToggleHtml(t);
  ok(!!html, 'quem está na lista de espera TEM que ver o controle (senão não há volta)');
  ok(html.indexOf('Desativado') !== -1, 'na fila o controle mostra "Desativado" — ligá-lo é o gesto de voltar');
  ok(html.indexOf('lista de espera') !== -1, 'e o título explica que ele está na fila');
});

// ── 2. LIGAR estando na fila devolve aos SORTEIOS ───────────────────────────
sec(function () {
  const t = novoT(); carrega(t, 'uid_th');
  win._toggleLigaActive('T', true);
  ok(nomes(t.participants).includes('Thereza'), 'volta pro elenco — é o que a põe no sorteio da próxima rodada');
  ok(t.participants.find((p) => p.uid === 'uid_th').ligaActive === true, 'e volta ATIVA');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), 'sai da fila');
  // e NÃO pode ser re-empurrada pra fila pelo ramo de reativação
  ok(nomes(t.participants).includes('Thereza'), 'não pode voltar pra fila no mesmo clique');
});

// ── 3. DESLIGAR estando na fila vira desativado (não some) ──────────────────
sec(function () {
  const t = novoT(); carrega(t, 'uid_th');
  win._toggleLigaActive('T', false);
  const p = t.participants.find((x) => x.uid === 'uid_th');
  ok(!!p && p.ligaActive === false, 'sai da fila e vira DESATIVADA no elenco — nunca desaparece');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), 'e sai da fila');
});

// ── 4. Quem está em participants segue como era ─────────────────────────────
sec(function () {
  const t = novoT(); carrega(t, 'uid_a');
  const html = win._buildLigaActiveToggleHtml(t);
  ok(html.indexOf('Ativado') !== -1, 'quem está ativo no elenco continua vendo "Ativado"');
});

// ── 5. A BUSCA acha quem está nos boxes de fora ─────────────────────────────
sec(function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
  // chips de Desativados / W.O. / Sem grupo
  const iRow = src.indexOf('var _renderRow = function');
  const row = src.slice(iRow, src.indexOf('};', src.indexOf("'</div>';", iRow)));
  ok(row.indexOf('data-players=') !== -1, 'os chips de Desativados/W.O./Sem grupo precisam de data-players (é o que a busca varre)');
  ok(row.indexOf('data-my-match="1"') !== -1, 'e de data-my-match=1 — "Só meus jogos" filtra JOGOS, não pode sumir com quem está de fora');
  // chips da lista de espera
  const iW = src.indexOf('_waitBoxHtml = ');
  const wbox = src.slice(iW, iW + 3000);
  ok(wbox.indexOf('data-players=') !== -1, 'os chips da LISTA DE ESPERA também precisam de data-players');
  // o filtro continua sendo o mesmo (não duplicamos lógica de busca)
  ok(src.indexOf("querySelectorAll('[data-players]')") !== -1, 'o filtro segue varrendo [data-players] — uma lógica só');
});

console.log((fail === 0 ? '✅' : '❌') + ' wo-volta-e-busca: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
