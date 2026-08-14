/* A notificação de placar pendente segue o JOGO, não o retrato do envio.
 *
 * Relato do dono (print de 14/ago, três cards seguidos com "Confirmar" em
 * placares já resolvidos): "essas notificações precisavam ser dinâmicas. na
 * medida em que já foram aprovadas, não deveria mais ter o confirmar ou
 * contestar (apenas o editar)."
 *
 * A notificação é um RETRATO do instante em que foi criada; o jogo continua
 * andando. Oferecer "Confirmar" pra um placar já aprovado pede uma decisão que
 * não existe mais — e promete uma ação que a chave vai recusar.
 *
 * Este teste roda o `renderNotifications` REAL (js/views/notifications-view.js)
 * com um Firestore falso e um AppStore com torneios de verdade em memória, e
 * exige que os botões sigam a MESMA régua do card da chave:
 *     pendente = tem `pendingResult` E ainda não tem `winner`.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── notificacao-de-placar-segue-o-jogo ────');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'notifications-view.js'), 'utf8');

// Render REAL, com o mínimo de cromo em volta (nada aqui decide botão).
function render(tournaments, notifs) {
  const container = { innerHTML: '' };
  // O render monta o cabeçalho no container e SÓ ENTÃO preenche o #notif-list
  // (a lista chega por promessa). Sem esse elemento ele retorna cedo — e o
  // teste ficaria verde por vácuo, que é o pior desfecho possível.
  const listDiv = { innerHTML: '' };
  const win = {
    // i18n: devolve o TEXTO como no app (o stub devolvendo a chave fez os regex
    // não casarem e deu 6 falhas fantasma na 1ª rodada — artefato do teste).
    _t: (k) => ({ 'notif.confirm': 'Confirmar', 'notif.editContest': 'Editar / Contestar' }[k] || k),
    _safeHtml: (s) => String(s == null ? '' : s),
    _timeAgo: () => 'ontem',
    _renderBackHeader: () => '',
    NOTIF_CATALOG: { 'match-pending-approval': { icon: '⏳', level: 'fundamental' } },
    AppStore: { currentUser: { uid: 'u-eu' }, tournaments: tournaments },
    // a régua do "jogo ainda pendente" usa o localizador CANÔNICO do app
    _findMatch: (t, id) => (t.matches || []).find(m => String(m.id) === String(id)) || null,
    FirestoreDB: {
      getNotifications: () => Promise.resolve(notifs),
      // o badge do sininho é agendado por timer e dispara depois do teste
      getUnreadNotificationCount: () => Promise.resolve(0)
    },
    location: { hash: '' }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.document = {
    getElementById: (id) => (id === 'notif-list' ? listDiv : null),
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    body: { appendChild() {} }
  };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.console = { log() {}, warn() {}, error() {} };
  vm.runInContext(SRC, ctx);
  ctx.renderNotifications(container);
  return new Promise(r => setTimeout(() => r(listDiv.innerHTML), 20));
}

const NOTIF = (id, matchId) => ({
  _id: id, type: 'match-pending-approval', read: false,
  tournamentId: 't1', matchId: matchId,
  message: 'Luciana lançou:\nA / B 5\nvs\nC / D 5',
  createdAt: Date.now()
});
const TOUR = (matches) => [{ id: 't1', name: 'Confra', matches: matches }];

(async () => {
  // ⚠️ BLINDAGEM ANTI-VÁCUO: as asserções negativas ("não tem Confirmar") passam
  // sozinhas se o render devolver vazio — foi exatamente o que aconteceu na 1ª
  // rodada deste teste (6 verdes com HTML vazio). Toda leitura passa por aqui.
  const temCard = (html) => /match|Editar|Confirmar|lançou/.test(html) && html.length > 200;

  // ── 1. PENDENTE: os dois botões, como sempre ──────────────────────────────
  const pend = await render(
    TOUR([{ id: 'm1', p1: 'A / B', p2: 'C / D', pendingResult: { scoreP1: 5, scoreP2: 5 } }]),
    [NOTIF('n1', 'm1')]);
  ok(temCard(pend), 'pré-condição: o card do cenário pendente foi REALMENTE montado (senão o teste passaria por vácuo)');
  ok(/Confirmar/.test(pend), 'placar PENDENTE mantém o Confirmar');
  ok(/Editar \/ Contestar|notif\.editContest/.test(pend), 'placar pendente mantém o Editar / Contestar');
  ok(!/Resultado já confirmado/.test(pend), 'pendente NÃO diz que já foi confirmado');

  // ── 2. JÁ APROVADO: some o Confirmar; sobra só Editar (o pedido do dono) ──
  const apr = await render(
    TOUR([{ id: 'm1', p1: 'A / B', p2: 'C / D', winner: 'A / B', scoreP1: 6, scoreP2: 4 }]),
    [NOTIF('n1', 'm1')]);
  ok(temCard(apr), 'pré-condição: o card do cenário aprovado foi REALMENTE montado (senão o teste passaria por vácuo)');
  ok(!/Confirmar/.test(apr),
     '🔒 placar JÁ APROVADO não oferece mais Confirmar (era o print do dono)');
  ok(!/Contestar/.test(apr),
     '🔒 …nem Contestar — não há mais o que contestar depois de aprovado');
  ok(/✏️ Editar/.test(apr),
     '🔒 …e o Editar FICA: corrigir resultado continua sendo possível');
  ok(/Resultado já confirmado/.test(apr),
     'o card diz por que os botões sumiram (senão vira um botão solto sem explicação)');

  // ── 3. pendingResult + winner (aprovado, campo pendente ainda no doc) ─────
  // O card da chave usa `!!pendingResult && !winner` — quem tem winner está
  // decidido mesmo que o pendente não tenha sido limpo. As duas telas têm que
  // ler igual, senão a notificação volta a mentir por outro caminho.
  const amb = await render(
    TOUR([{ id: 'm1', winner: 'A / B', pendingResult: { scoreP1: 6, scoreP2: 4 } }]),
    [NOTIF('n1', 'm1')]);
  ok(!/Confirmar/.test(amb),
     '🔒 com vencedor definido o jogo está DECIDIDO, mesmo com pendingResult sobrando (mesma régua do card da chave)');

  // ── 4. "NÃO SEI" mantém o comportamento antigo ───────────────────────────
  const semTorneio = await render([], [NOTIF('n1', 'm1')]);
  ok(/Confirmar/.test(semTorneio),
     '🔒 torneio não carregado → mantém os dois botões (não some com ação por falta de dado)');
  const semMatchId = await render(
    TOUR([{ id: 'm1', winner: 'A / B' }]),
    [Object.assign(NOTIF('n1', 'm1'), { matchId: null })]);
  ok(/Confirmar/.test(semMatchId),
     'notificação antiga (sem matchId) mantém os dois botões — nada regride pra quem já tinha');
  const jogoSumiu = await render(
    TOUR([{ id: 'm9', winner: 'X' }]),
    [NOTIF('n1', 'm1')]);
  ok(/Confirmar/.test(jogoSumiu),
     'jogo que sumiu (re-sorteio) não decide nada — mantém os dois botões');

  // ── 5. cada card decide por SI (a lista é heterogênea) ───────────────────
  const mista = await render(
    TOUR([
      { id: 'm1', winner: 'A / B' },                                   // resolvido
      { id: 'm2', pendingResult: { scoreP1: 5, scoreP2: 5 } }          // pendente
    ]),
    [NOTIF('n1', 'm1'), NOTIF('n2', 'm2')]);
  ok(temCard(mista), 'pré-condição: o card do cenário lista mista foi REALMENTE montado (senão o teste passaria por vácuo)');
  ok((mista.match(/Confirmar/g) || []).length === 1,
     '🔒 numa lista com um resolvido e um pendente, só o PENDENTE mostra Confirmar · achado: ' +
     (mista.match(/Confirmar/g) || []).length);
  ok((mista.match(/✏️ Editar/g) || []).length === 2, 'os dois cards mantêm o Editar');

  // ── 6. varredura: a régua não foi reimplementada aqui ────────────────────
  const trecho = SRC.slice(SRC.indexOf('function _resultStillPending'),
                           SRC.indexOf('function _renderNotifCard'));
  ok(/pendingResult && !m\.winner/.test(trecho),
     '🔒 a régua é a MESMA do card da chave (pendingResult && !winner) — uma frase, não duas versões');
  ok(/window\._findMatch/.test(trecho),
     'usa o localizador canônico de jogo (_findMatch), não uma busca própria');

  console.log('notificacao-de-placar-segue-o-jogo:', pass, 'ok,', fail, 'falhas');
  if (fail > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
