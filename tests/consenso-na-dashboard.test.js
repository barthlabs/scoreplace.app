/* CONFIRMAR/CONTESTAR SEM IR AO TORNEIO — o consenso na tela inicial.
 *   node tests/consenso-na-dashboard.test.js
 *
 * ORDEM DO DONO (21/ago/2026, com o print de "📣 Novidades no seu torneio"):
 *   _"aqui nas novidades não temos os botões para os participantes aprovarem/contestarem
 *   os placares lançados. Elas têm que ir para o torneio para fazer isso. Alguns não
 *   entendem isso. Em vez de ficar explicando, melhor colocar os botões também aqui para
 *   que os participantes e organizadores possam fazer isso já na dashboard sem precisar
 *   ir ao torneio."_
 *
 * ⚠️ ESTA É UMA REGRA QUE MUDOU, e o histórico importa: a v1.8.67 tinha CALADO todos os
 * botões do feed (`{readOnly:true}`) porque `canEnterResult=false` não alcançava os
 * botões de pendência/disputa/W.O., que têm gate próprio por PAPEL — o organizador via
 * "✏️ Editar" e o clique caía em `_editPendingResult`, que mexe em `score-p1-<id>`, id
 * que só existe na tela da chave. O feed continua somente-leitura para TUDO; a única
 * exceção é a linha de consenso, e ela sai por `data-pending-action` — o despachante que
 * a dashboard já tinha para a seção "Aguardando sua aprovação", que no Editar carimba
 * `sp_pendingEdit` e NAVEGA em vez de mexer no DOM que não está ali.
 *
 * O que este teste trava:
 *   1) organizador vê o Confirmar no jogo pendente de outras pessoas (é o caso do print);
 *   2) quem NÃO pode homologar não ganha botão nenhum (participante alheio ao jogo);
 *   3) jogo EM DISPUTA continua sem botão — o organizador resolve pelo painel da chave;
 *   4) o botão carrega torneio + jogo (o despachante age por id, nunca por posição);
 *   5) nada de onclick pras funções da chave, e W.O./ao vivo seguem fora.
 */
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const AGORA = Date.now();

function jogo(id, label, a1, a2, b1, b2, extra) {
  return Object.assign({
    id: id, label: label, isMonarch: true, round: 0,
    p1: a1 + ' / ' + a2, p2: b1 + ' / ' + b2, team1: [a1, a2], team2: [b1, b2]
  }, extra || {});
}

// o torneio do print: um jogo de OUTRAS pessoas com placar lançado e pendente
function confra(opts) {
  opts = opts || {};
  const pend = {
    scoreP1: 1, scoreP2: 6, winner: 'Cynthia / Arnaldo Menezes', kind: 'inline',
    proposedByName: 'Cynthia', proposedBy: 'u-cy', proposedByEmail: 'cy@x.com',
    proposedAt: AGORA - 60000
  };
  if (opts.disputado) { pend.disputed = true; pend.disputedBy = 'u-mar'; pend.disputedAt = AGORA - 30000; }
  return {
    id: 'tour_confra', name: 'Confra BT Alta da Clínica 2026', format: 'Liga',
    ligaRoundFormat: 'rei_rainha', status: 'active', sport: 'Beach Tennis',
    resultEntry: 'players', creatorUid: opts.creatorUid || 'u-rb',
    participants: [
      { uid: 'u-rb', displayName: 'Rodrigo Barth' },
      { uid: 'u-cy', displayName: 'Cynthia' },
      { uid: 'u-mar', displayName: 'Marjorie CILONE' }
    ],
    rounds: [{ matches: [
      jogo('m-L36', 'R1 Grupo L • Jogo 36', 'Marjorie CILONE', 'Mariana Ciocci', 'Cynthia', 'Arnaldo Menezes',
        { pendingResult: pend }),
      // um confirmado, pra a seção existir mesmo quando o pendente não rende botão
      jogo('m-L35', 'R1 Grupo L • Jogo 35', 'Vanessa Bianchini', 'Bruna Arilla', 'Luciana Marinho', 'Adriana Zalaf',
        { scoreP1: 6, scoreP2: 3, resultAt: AGORA - 3 * 3600000, winner: 'Vanessa Bianchini / Bruna Arilla' })
    ] }]
  };
}

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
function extraiBuildMyResults(src) {
  const i = src.indexOf('function _buildMyResultsHtml() {');
  if (i < 0) throw new Error('_buildMyResultsHtml não encontrada em dashboard.js');
  const marca = 'return _upHtml + _novHtml + html;';
  const j = src.indexOf(marca, i);
  if (j < 0) throw new Error('fim de _buildMyResultsHtml não encontrado (o return mudou?)');
  return src.slice(i, src.indexOf('}', j + marca.length) + 1);
}
const _store = {};
W.localStorage = W.localStorage || {
  getItem: function (k) { return (k in _store) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};

function render(tours, user) {
  W.AppStore.tournaments = tours;
  W.AppStore.currentUser = user;
  W.AppStore.isOrganizer = function (t) { return !!(t && t.creatorUid === user.uid); };
  W.localStorage.setItem('scoreplace_collapse_novidades', '0');
  const body = extraiBuildMyResults(SRC);
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + body + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, tours);
  return fn();
}
function secaoNovidades(html) {
  const i = html.indexOf('id="novidades-section"');
  if (i < 0) return '';
  const j = html.indexOf('id="meus-resultados-section"', i);
  return j > i ? html.slice(i, j) : html.slice(i);
}
const contar = (s, sub) => s.split(sub).length - 1;

const ORG = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com' };
const ZE  = { uid: 'u-ze', displayName: 'Zé Ninguém', email: 'ze@x.com' };

// ─── 1) ORGANIZADOR: o Confirmar chega na tela inicial ─────────────────────────────────
(function () {
  const NOV = secaoNovidades(render([confra()], ORG));
  ok(NOV.length > 0, '[pré] a seção Novidades existe pro organizador');
  ok(contar(NOV, 'data-pending-action="approve"') === 1 && contar(NOV, 'data-pending-action="contest"') === 1,
     '[org] o jogo pendente traz o PAR ❌ Contestar + ✅ Confirmar — got approve=' + contar(NOV, 'data-pending-action="approve"') + ' contest=' + contar(NOV, 'data-pending-action="contest"'));
  ok(NOV.indexOf('data-tid="tour_confra"') > -1 && NOV.indexOf('data-mid="m-L36"') > -1,
     '[org] o botão carrega torneio + jogo (o despachante age por id, nunca por posição)');
  ok(NOV.indexOf('✅ Confirmar') > -1, '[org] com o rótulo do app');
})();

// ─── 2) QUEM NÃO PODE HOMOLOGAR NÃO GANHA BOTÃO ────────────────────────────────────────
(function () {
  // torneio de outra pessoa, e o Zé não joga este jogo: nem adversário, nem organizador
  const NOV = secaoNovidades(render([confra({ creatorUid: 'u-outro' })], ZE));
  ok(NOV.length > 0, '[pré] o Zé também vê a seção (ele é do torneio)');
  ok(contar(NOV, 'data-pending-action') === 0,
     '[alheio] nenhum botão de consenso — a régua de papel decide, não a seção — got ' + contar(NOV, 'data-pending-action'));
})();

// ─── 3) EM DISPUTA: ninguém age pelo feed ──────────────────────────────────────────────
(function () {
  const NOV = secaoNovidades(render([confra({ disputado: true })], ORG));
  // conta só o consenso: o jogo CONFIRMADO do mesmo fixture traz o ✏️ Editar (goedit),
  // que é outra coisa e tem teste próprio.
  ok(contar(NOV, 'data-pending-action="approve"') + contar(NOV, 'data-pending-action="contest"') === 0,
     '[disputa] jogo contestado não ganha Confirmar/Contestar no feed — quem organiza resolve pelo painel da chave');
})();

// ─── 4) O FEED SEGUE SOMENTE-LEITURA PRO RESTO ─────────────────────────────────────────
(function () {
  const NOV = secaoNovidades(render([confra()], ORG));
  ok(NOV.indexOf('onclick="window._approveResult') === -1, '[como] nada de onclick pras funções da chave (aprovar)');
  ok(NOV.indexOf('onclick="window._editPendingResult') === -1, '[como] nem pra edição in-place (o clique que procurava ids da chave)');
  ok(NOV.indexOf('_woClaim') === -1, '[escopo] W.O. segue fora do feed');
  ok(NOV.indexOf('_liveScore') === -1, '[escopo] placar ao vivo segue fora do feed');
  ok(NOV.indexOf('_replay') === -1 || NOV.indexOf('data-pending-action') > -1, '[escopo] o resto do card não voltou junto');
})();

// ─── 5) O DESPACHANTE EXISTE E COBRE O FEED ────────────────────────────────────────────
(function () {
  ok(/container\.querySelectorAll\('\[data-pending-action\]'\)/.test(SRC),
     'o despachante da dashboard varre TODO o container — inclusive os cards do feed');
  const i = SRC.indexOf("action === 'edit'");
  ok(i > -1 && SRC.slice(i, i + 400).indexOf('sp_pendingEdit') > -1,
     'e no Editar ele carimba `sp_pendingEdit` e navega (fora da chave não há DOM pra editar)');
})();

// ─── 6) A RÉGUA POR PAPEL, no card (a mesma da chave, sem o Editar) ────────────────────
// ⚠️ uids NOS SLOTS: é o uid que diz "este jogo é seu" ([[project_uid_identity_canon_locked]]).
// Sem `team*Uids` no fixture, adversário e proponente somem da conta e o teste mediria outra
// coisa — foi o que aconteceu na primeira rodada desta suíte.
(function () {
  const AG = Date.now();
  function mk(pend) {
    return {
      id: 'tour_confra', name: 'Confra', format: 'Liga', ligaRoundFormat: 'rei_rainha',
      status: 'active', sport: 'Beach Tennis', resultEntry: 'players', creatorUid: 'u-rb',
      participants: [{ uid: 'u-rb' }, { uid: 'u-cy' }, { uid: 'u-mar' }, { uid: 'u-ari' }, { uid: 'u-mci' }],
      rounds: [{ matches: [{
        id: 'm-L36', label: 'R1 Grupo L • Jogo 36', isMonarch: true, round: 0,
        p1: 'Marjorie CILONE / Mariana Ciocci', p2: 'Cynthia / Arnaldo Menezes',
        team1: ['Marjorie CILONE', 'Mariana Ciocci'], team2: ['Cynthia', 'Arnaldo Menezes'],
        team1Uids: ['u-mar', 'u-mci'], team2Uids: ['u-cy', 'u-ari'],
        pendingResult: pend
      }] }]
    };
  }
  const base = { scoreP1: 1, scoreP2: 6, winner: 'Cynthia / Arnaldo Menezes', kind: 'inline',
    proposedByName: 'Cynthia', proposedBy: 'u-cy', proposedAt: AG - 60000 };
  function botoes(uid, pend) {
    const t = mk(pend);
    W.AppStore.tournaments = [t];
    W.AppStore.currentUser = { uid: uid };
    W.AppStore.isOrganizer = function (x) { return !!(x && x.creatorUid === uid); };
    const card = W.renderMatchCard(t.rounds[0].matches[0], false, t.id, 36, false, null, { readOnly: true, dashConsensus: true });
    return (card.match(/data-pending-action="(\w+)"/g) || []).map(function (x) { return x.replace(/[^=]*="|"/g, ''); });
  }
  const j = function (a) { return a.join('+') || '(nenhum)'; };
  ok(j(botoes('u-rb', base)) === 'contest+approve', '[papel] ORGANIZADOR → Contestar + Confirmar — got ' + j(botoes('u-rb', base)));
  ok(j(botoes('u-mar', base)) === 'contest+approve', '[papel] ADVERSÁRIO → Contestar + Confirmar — got ' + j(botoes('u-mar', base)));
  ok(j(botoes('u-cy', base)) === '(nenhum)', '[papel] PROPONENTE não homologa a própria proposta');
  ok(j(botoes('u-ze', base)) === '(nenhum)', '[papel] quem não é do jogo nem organiza não ganha botão');
  ok(j(botoes('u-rb', Object.assign({}, base, { disputed: true }))) === '(nenhum)', '[papel] EM DISPUTA: ninguém age pelo feed');
  const contra = Object.assign({}, base, { isCounterProposal: true, proposedBy: 'u-mar', proposedByName: 'Marjorie' });
  ok(j(botoes('u-cy', contra)) === 'contest+approve', '[papel] CONTRA-PROPOSTA → Contestar + Confirmar (vermelho à esquerda) — got ' + j(botoes('u-cy', contra)));
  ok(botoes('u-rb', base)[0] === 'contest', '[ordem] vermelho à ESQUERDA, verde à direita ([[feedback_button_order_confirm_right]])');
  // enquanto PENDE, editar não é opção pra ninguém — a ordem do dono é "o editar tem que
  // vir depois de confirmado". As saídas do pendente são aceitar ou não aceitar.
  ['u-rb', 'u-mar', 'u-cy', 'u-ze'].forEach(function (u) {
    ok(botoes(u, base).join('+').indexOf('edit') === -1, '[edit] nada de editar no jogo PENDENTE (uid ' + u + ')');
  });

  // ─── e DEPOIS de confirmado: o ✏️ Editar, só pra quem tem poder ────────────────────
  function mkDecidido(resultEntry) {
    const t = mk(base);
    const m = t.rounds[0].matches[0];
    delete m.pendingResult;
    m.scoreP1 = 1; m.scoreP2 = 6; m.winner = 'Cynthia / Arnaldo Menezes'; m.resultAt = AG - 3600000;
    if (resultEntry) t.resultEntry = resultEntry;
    return t;
  }
  function botoesDecidido(uid, resultEntry) {
    const t = mkDecidido(resultEntry);
    W.AppStore.tournaments = [t];
    W.AppStore.currentUser = { uid: uid };
    W.AppStore.isOrganizer = function (x) { return !!(x && x.creatorUid === uid); };
    const card = W.renderMatchCard(t.rounds[0].matches[0], false, t.id, 36, false, null, { readOnly: true, dashConsensus: true });
    return (card.match(/data-pending-action="(\w+)"/g) || []).map(function (x) { return x.replace(/[^=]*="|"/g, ''); });
  }
  ok(j(botoesDecidido('u-rb')) === 'goedit', '[confirmado] ORGANIZADOR ganha o ✏️ Editar — got ' + j(botoesDecidido('u-rb')));
  ok(j(botoesDecidido('u-mar')) === 'goedit', '[confirmado] quem JOGOU também, quando o torneio deixa jogadores lançarem');
  ok(j(botoesDecidido('u-mar', 'organizer')) === '(nenhum)', '[confirmado] se só quem organiza lança, o jogador NÃO edita');
  ok(j(botoesDecidido('u-ze')) === '(nenhum)', '[confirmado] quem não jogou nem organiza não edita');
  // e o editar do feed NAVEGA — nunca abre a edição in-place na tela inicial
  ok(/data-pending-action="goedit"/.test(SRC) === false, '[como] o `goedit` nasce no card, não no HTML da dashboard');
  const iGo = SRC.indexOf("action === 'goedit'");
  ok(iGo > -1 && SRC.slice(iGo, iGo + 1200).indexOf("window.location.hash = '#bracket/'") > -1,
     '[como] e o despachante LEVA pro torneio (a edição in-place é da tela da chave)');
})();

// ─── 7) CONFIRMOU → A TELA MUDA (o defeito relatado pelo dono) ────────────────────────
// _"quando confirma os botões devem desaparecer e dar lugar ao editar e não continuar na
// tela"_. A aprovação termina em `_rerenderBracket`, que na dashboard chamava
// `_softRefreshView` — e ele é GATED pela assinatura de CONJUNTO (`_dashDataSigFor` =
// quantos + quais torneios). Aprovar placar não muda torneio de lugar → assinatura igual →
// "nada mudou" → o card seguia com Confirmar/Contestar DEPOIS de confirmado.
// ⚠️ A assinatura não pode virar de conteúdo (já foi, e repintava a dashboard a cada placar
// de qualquer pessoa: "pisca tela preta", "clicar 2x") — o que muda é a ORIGEM: ação do
// dedo nesta tela pede repintura direto. [[project_dashboard_no_rerender]]
(function () {
  const uiSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
  const i = uiSrc.indexOf('function _rerenderBracket');
  const ramo = uiSrc.slice(i, i + 2200);
  const corpo = ramo.split('\n').filter(function (l) { return l.trim().indexOf('//') !== 0; }).join('\n');
  ok(/_dashPedirRepintura|_dashRerender/.test(corpo),
     'na dashboard, a ação no card PEDE a repintura (não fica na mão do gate de assinatura)');
  ok(corpo.indexOf('_dashPedirRepintura') < corpo.indexOf('_softRefreshView'),
     'e ela vem ANTES do _softRefreshView — que só serviria se o CONJUNTO de torneios mudasse');
  // o gate de conjunto continua de pé pro snapshot da rede (a proteção contra repintura
  // que ninguém pediu): a assinatura NÃO pode ter virado de conteúdo.
  const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  const j = storeSrc.indexOf('window._dashDataSigFor');
  ok(/arr\.length \+ '\|'/.test(storeSrc.slice(j, j + 400)) && storeSrc.slice(j, j + 400).indexOf('updatedAt') === -1,
     'a assinatura do snapshot segue de CONJUNTO (sem updatedAt/placar) — senão volta o "pisca tela preta"');
  // e o card, depois de confirmado, entrega o Editar no lugar dos dois botões
  const AG2 = Date.now();
  const m = {
    id: 'm-L36', label: 'R1 Grupo L • Jogo 36', isMonarch: true, round: 0,
    p1: 'Marjorie CILONE / Mariana Ciocci', p2: 'Cynthia / Arnaldo Menezes',
    team1: ['Marjorie CILONE', 'Mariana Ciocci'], team2: ['Cynthia', 'Arnaldo Menezes'],
    team1Uids: ['u-mar', 'u-mci'], team2Uids: ['u-cy', 'u-ari'],
    scoreP1: 1, scoreP2: 6, winner: 'Cynthia / Arnaldo Menezes', resultAt: AG2 - 1000
  };
  const t = {
    id: 'tour_confra', name: 'Confra', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    status: 'active', sport: 'Beach Tennis', resultEntry: 'players', creatorUid: 'u-rb',
    participants: [{ uid: 'u-rb' }, { uid: 'u-cy' }, { uid: 'u-mar' }, { uid: 'u-ari' }, { uid: 'u-mci' }],
    rounds: [{ matches: [m] }]
  };
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: 'u-rb' };
  W.AppStore.isOrganizer = function (x) { return !!(x && x.creatorUid === 'u-rb'); };
  const card = W.renderMatchCard(m, false, t.id, 36, false, null, { readOnly: true, dashConsensus: true });
  ok(card.indexOf('data-pending-action="approve"') === -1 && card.indexOf('data-pending-action="contest"') === -1,
     '[depois] confirmado: Confirmar e Contestar somem');
  ok(card.indexOf('data-pending-action="goedit"') > -1, '[depois] e o ✏️ Editar toma o lugar');
})();

console.log('\n✅ consenso-na-dashboard: ' + pass + ' asserções, ' + fail + ' falha(s)');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
