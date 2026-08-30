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
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
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
//
// ⚠️ UMA ASSERÇÃO REVISADA em 07/ago/2026 (v1.7.72). Ela exigia que na fila o controle
// mostrasse "Desativado" — "ligá-lo é o gesto de voltar". Isso era verdade na v1.6.93,
// quando ligar na fila DEVOLVIA a pessoa ao elenco. A v1.7.38 mudou o destino de
// propósito: com a fase sorteada, ligar MANTÉM a pessoa na fila (é de lá que ela é
// chamada). O gesto que o rótulo prometia deixou de existir — e o rótulo virou o
// segundo motor do "ativa mas ele desativa sozinho" que a Ana Ribeiro filmou: ela liga,
// a fixture aqui embaixo confirma que ela fica `ligaActive:true` na fila, e a tela
// mostrava "Desativado" na cara dela.
// O invariante que esta seção protege — quem está na fila TEM que ver o controle, senão
// não há caminho de volta — segue travado, e ganhou o rótulo correto por estado.
// Ver tests/reativar-nao-desativa-sozinho.test.js (os 4 estados) e o histórico do doc
// tour_1780009816637, que gravou as 4 restaurações indevidas nos segundos do vídeo.
sec(function () {
  const t = novoT(); carrega(t, 'uid_th');
  const html = win._buildLigaActiveToggleHtml(t);
  ok(!!html, 'quem está na lista de espera TEM que ver o controle (senão não há volta)');
  ok(/>Ativado</.test(html),
     'na fila com ligaActive:true o controle mostra "Ativado" — o rótulo segue o DADO, não a lista');
  ok(html.indexOf('lista de espera') !== -1, 'e o título explica que ele está na fila');
});

// ── 2. LIGAR estando na fila: o destino depende de a fase JÁ ter sido sorteada ──
//
// ⚠️ ASSERÇÕES REVISADAS em 05/ago/2026 (v1.7.38). Antes esta seção exigia que ligar SEMPRE
// devolvesse ao elenco — inclusive com a fase já sorteada. Era exatamente o que produzia o
// INSCRITO FANTASMA: duas regras se contradiziam e a errada vencia.
//   • v1.6.93: quem levou W.O. precisa de caminho de volta → ligar devolve ao elenco.
//   • v1.6.86: reativar com a fase sorteada manda pra fila, senão a pessoa fica no elenco
//     sem grupo — inscrita, fora dos jogos e fora da espera.
// A primeira vencia porque marcava `_vindoDaFila`, e o guard da segunda começa com
// `if (!_vindoDaFila ...)`. MEDIDO no Confra: Mari Telles, Ana Carolina Cilone e
// danielacsimao caíram no limbo, cada uma minutos depois de se inscrever — na fila a pessoa
// aparece como "Desativado", então ela liga o toggle pra jogar e sai do único lugar onde
// alguém a chamaria.
// O que as asserções protegiam (ter caminho de volta) continua travado no caso SEM sorteio.

// (a) SEM sorteio → volta pro elenco e entra no sorteio (regra da v1.6.93, intacta)
sec(function () {
  const t = novoT(); t.rounds = []; carrega(t, 'uid_th');
  win._toggleLigaActive('T', true);
  ok(nomes(t.participants).includes('Thereza'), 'sem sorteio: volta pro elenco — entra no sorteio');
  ok(t.participants.find((p) => p.uid === 'uid_th').ligaActive === true, '  → e volta ATIVA');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), '  → sai da fila');
});

// (b) COM a fase sorteada → FICA na fila, ativa. É de lá que ela é chamada.
sec(function () {
  const t = novoT(); carrega(t, 'uid_th');   // fixture já tem rounds = fase sorteada
  win._toggleLigaActive('T', true);
  ok(nomes(win._getWaitlist(t)).includes('Thereza'), 'fase sorteada: PERMANECE na fila');
  ok(!nomes(t.participants).includes('Thereza'),
    '  → NÃO vai pro elenco (seria o inscrito fantasma: sem grupo e fora da espera)');
  const naFila = win._getWaitlist(t).find((p) => p.uid === 'uid_th');
  ok(naFila && naFila.ligaActive === true, '  → mas fica marcada como ATIVA (quer jogar)');
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
  const wbox = _R.ateOFim(src, iW);
  ok(wbox.indexOf('data-players=') !== -1, 'os chips da LISTA DE ESPERA também precisam de data-players');
  ok(wbox.indexOf('if (_wlNames.length)') !== -1 && wbox.indexOf('Lista de espera (') !== -1,
    'havendo pelo menos um nome na fila, a seção Lista de espera é renderizada no box da rodada');
  // o filtro continua sendo o mesmo (não duplicamos lógica de busca)
  ok(src.indexOf("querySelectorAll('[data-players]')") !== -1, 'o filtro segue varrendo [data-players] — uma lógica só');
});

console.log((fail === 0 ? '✅' : '❌') + ' wo-volta-e-busca: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
