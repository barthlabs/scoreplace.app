// result-core.js — LANÇAMENTO DE RESULTADO no servidor, com as MESMAS funções do cliente.
//
// Contrato do dono: "os cânones rodam em CF, disparados pelo app".
//   ESCOLHA/INTERPRETAÇÃO = cliente (lê os inputs, aplica a regra de GSM/tie-break do
//                                    torneio e monta o `payload`)
//   AUTORIZAÇÃO + APLICAÇÃO = CF (este arquivo) sobre o doc FRESCO, dentro da transação
//
// POR QUE ISTO EXISTE (v1.7): hoje quem decide se você PODE lançar o placar daquele jogo
// é o cliente. `t.resultEntry` ('organizer' | 'players' | 'all'), o lado em que você está
// e a fase da negociação (proposta → contraproposta → contestação) são checados só no
// navegador — e as firestore.rules deixam qualquer PARTICIPANTE escrever `matches`/`rounds`/
// `groups` (é o que permite salvar placar). Ou seja: a regra existe, mas não é aplicada por
// ninguém com autoridade. Aqui ela passa a ser.
//
// NÃO REIMPLEMENTA NADA: `_applyResultToTournament`, `_resultNeedsApproval`,
// `_userTeamInMatch`, `_isUserOrgOrCoHost`, `_findMatch` e `_slotUids` vêm do VENDOR
// (cópias exatas de js/views/*, sincronizadas no predeploy por copy-vendor.js). Reescrever
// qualquer uma delas aqui criaria a segunda versão que a canonização existe pra matar.
// Ver [[project_result_launch_cf_evaluation]] e [[feedback_functions_must_mirror_app]].

// Monta o `window` e carrega o vendor inteiro (draw-core já faz isso e é idempotente:
// require em Node é cacheado, então isto NÃO recarrega nem duplica o vendor).
const drawCore = require('./draw-core.js');
const g = globalThis;
const win = g.window;

// ── _effectiveResultEntry: PORTADO de js/store.js (~4399) ────────────────────────────
// store.js NÃO é vendorável (é o app inteiro: DOM, listeners, Firebase do cliente), então
// esta é a única função deste arquivo que é cópia. Sem ela, o servidor cairia no
// `t.resultEntry` TOP-LEVEL e ignoraria a config POR FASE — um torneio cuja fase
// eliminatória é 'organizer' aceitaria lançamento de participante. Fica travada por teste
// (test-result-core.js compara os dois lados). Se store.js mudar, o teste fica vermelho.
if (typeof win._effectiveResultEntry !== 'function') {
  win._effectiveResultEntry = function (t, match) {
    if (!t || !Array.isArray(t.phases) || !t.phases.length) return (t && t.resultEntry) || 'organizer';
    var ph = t.phases[(match && match.phaseIndex) || 0] || t.phases[0] || {};
    return (ph.resultEntry != null) ? ph.resultEntry : 'organizer';
  };
}

// Participantes podem lançar nesta fase? Mesma leitura do _resultNeedsApproval.
function playersMaySubmit(t, m) {
  const re = win._effectiveResultEntry(t, m);
  return re === 'players' || re === 'all' || (Array.isArray(re) && re.indexOf('players') !== -1);
}

// ── REABERTURA CANÔNICA ───────────────────────────────────────────────────────────────
// Estas transições existiam em bracket-ui.js e gravavam o torneio inteiro no navegador.
// Resultado, avanço de chave e ausência são um único fato: por isso a reabertura também
// passa por esta CF, na mesma transação, recibo de auditoria e caixa de saída.
function organizerOnly(t, m, actor) {
  if (!t || !m) return { ok: false, reason: 'match-not-found' };
  if (!actor || !actor.uid) return { ok: false, reason: 'no-actor' };
  if (!(typeof win._isUserOrgOrCoHost === 'function' && win._isUserOrgOrCoHost(t, actor))) {
    return { ok: false, reason: 'organizer-only' };
  }
  return { ok: true };
}

function winnerSide(m) {
  return (typeof win._matchWinnerSide === 'function') ? win._matchWinnerSide(m) : 0;
}

function clearResultFields(m) {
  delete m.pendingResult; delete m.winner; delete m.draw;
  delete m.scoreP1; delete m.scoreP2;
  delete m.sets; delete m.setsWonP1; delete m.setsWonP2;
  delete m.totalGamesP1; delete m.totalGamesP2;
  delete m.fixedSet;
}

function undoAdvancement(t, m) {
  const side = winnerSide(m);
  const prevWinner = m.winner;
  const oldLoser = side === 1 ? m.p2 : m.p1;
  if (m.nextMatchId) {
    const next = win._findMatch(t, m.nextMatchId);
    if (next && !next.winner) {
      if (next.p1 === prevWinner) { next.p1 = 'TBD'; delete next.p1FromBye; }
      if (next.p2 === prevWinner) { next.p2 = 'TBD'; delete next.p2FromBye; }
    }
  }
  if (m.loserMatchId) {
    const loserMatch = win._findMatch(t, m.loserMatchId);
    if (loserMatch && !loserMatch.winner) {
      if (loserMatch.p1 === oldLoser) loserMatch.p1 = 'TBD';
      if (loserMatch.p2 === oldLoser) loserMatch.p2 = 'TBD';
    }
  }
  if (t.classification) {
    delete t.classification[prevWinner];
    delete t.classification[oldLoser];
  }
}

function hasRealPlay(m) {
  if (!m || typeof m !== 'object') return false;
  if (m.liveScored === true || m.startedAt || m.resultAt) return true;
  if (Array.isArray(m.sets) && m.sets.length > 0) return true;
  const numeric = v => typeof v === 'number' && v > 0;
  return (numeric(m.scoreP1) || numeric(m.scoreP2)) && !m.wo;
}

function clearAbsenceAndWoHistory(t, side) {
  if (!side || side === 'TBD' || side === 'BYE') return;
  const names = String(side).indexOf(' / ') !== -1 ? String(side).split(' / ')
    : (String(side).indexOf('/') !== -1 ? String(side).split('/') : [side]);
  names.forEach(raw => {
    const name = String(raw || '').trim();
    if (!name) return;
    if (typeof win._idMapDel === 'function') win._idMapDel(t, t.absent, name);
    if (!t.woHistory) return;
    const key = (typeof win._idMapKey === 'function') ? win._idMapKey(t, name) : { name };
    if (key.uid && t.woHistory[key.uid] != null) delete t.woHistory[key.uid];
    if (key.name && t.woHistory[key.name] != null) delete t.woHistory[key.name];
  });
}

function reopenMatch(t, m, action) {
  if (action === 'reset-match') {
    clearResultFields(m);
  } else {
    undoAdvancement(t, m);
    clearResultFields(m);
  }
  if (typeof win._propagateMatchUpdate === 'function') win._propagateMatchUpdate(t, m);
}

// ── AUTORIZAÇÃO ───────────────────────────────────────────────────────────────────────
// Devolve { ok, reason, isAdmin, side }. `side` é 1/2 (time do ator) ou 0.
// Identidade SÓ por uid — `_userTeamInMatch` lê `_slotUids`, nunca casa nome
// ([[project_uid_identity_canon_locked]], [[project_match_slot_uid_identity]]).
function authorize(t, m, actor) {
  if (!t || !m) return { ok: false, reason: 'match-not-found', isAdmin: false, side: 0 };
  if (!actor || !actor.uid) return { ok: false, reason: 'no-actor', isAdmin: false, side: 0 };

  const isAdmin = !!(typeof win._isUserOrgOrCoHost === 'function' && win._isUserOrgOrCoHost(t, actor));
  const side = (typeof win._userTeamInMatch === 'function') ? win._userTeamInMatch(t, m, actor) : 0;

  // Organizador/co-org: pode sempre. É a autoridade do torneio.
  if (isAdmin) return { ok: true, reason: '', isAdmin: true, side: side };

  // Não-admin: a fase precisa permitir participante E ele precisa estar NO JOGO.
  if (!playersMaySubmit(t, m)) return { ok: false, reason: 'organizer-only', isAdmin: false, side: side };
  if (side === 0) return { ok: false, reason: 'not-in-match', isAdmin: false, side: 0 };

  // Em DISPUTA, participante está bloqueado — só o organizador resolve (fase 4 do fluxo,
  // ver [[project_resultado_participantes]]). Mesma regra do _resultNeedsApproval.
  if (m.pendingResult && m.pendingResult.disputed) {
    return { ok: false, reason: 'disputed-organizer-only', isAdmin: false, side: side };
  }

  // TRAVA DE LÓGICA (incidente 18/jul, portada do _saveResultInline): com proposta aberta
  // do OUTRO lado, este lado não sobrescreve — tem que Confirmar/Editar/Contestar. Sem
  // isto, um 2º lançamento do lado oposto (view velha / mini-card) clobberava a proposta.
  const pend = m.pendingResult;
  if (pend && !pend.disputed && pend.proposedBy) {
    const propSide = win._userTeamInMatch(t, m, { uid: pend.proposedBy });
    if (side > 0 && propSide > 0 && side !== propSide) {
      return { ok: false, reason: 'pending-other-side', isAdmin: false, side: side };
    }
  }
  return { ok: true, reason: '', isAdmin: false, side: side };
}

// ── APLICAÇÃO ─────────────────────────────────────────────────────────────────────────
// Muta `t` e devolve { ok, outcome, reason }.
//   outcome 'applied'  → placar valeu (winner definido, avanço/standings pelo motor)
//   outcome 'pending'  → virou proposta aguardando o outro lado
// Não faz I/O, não notifica, não navega: quem grava é o caller (a CF, dentro da txn).
function applyResult(t, opts) {
  const o = opts || {};
  const matchId = o.matchId;
  const payload = o.payload || {};
  const actor = o.actor || {};

  if (!matchId) return { ok: false, reason: 'no-match-id' };
  const m = (typeof win._findMatch === 'function') ? win._findMatch(t, matchId) : null;
  if (!m) return { ok: false, reason: 'match-not-found' };

  // Reabrir, refazer e reverter W.O. são operações administrativas. Elas não podem
  // depender de uma tela que ainda tenha o vencedor/ausência em memória: a CF usa o
  // jogo lido no documento fresco e devolve o torneio já reconciliado.
  if (payload.action === 'reset-match' || payload.action === 'reopen-result' || payload.action === 'revert-wo') {
    const admin = organizerOnly(t, m, actor);
    if (!admin.ok) return admin;
    if (payload.action === 'revert-wo') {
      if (!m.wo) return { ok: false, reason: 'not-a-wo' };
      if (hasRealPlay(m)) return { ok: false, reason: 'wo-has-real-play' };
      undoAdvancement(t, m);
      delete m.wo; delete m.woAbsentSide;
      clearResultFields(m);
      clearAbsenceAndWoHistory(t, m.p1);
      clearAbsenceAndWoHistory(t, m.p2);
      if (m.roundIndex !== undefined && Array.isArray(t.rounds) && t.rounds[m.roundIndex]) {
        t.rounds[m.roundIndex].status = 'active';
      }
      if (typeof win._poeStandings === 'function' && Array.isArray(t.rounds) && t.rounds.length) {
        try { win._poeStandings(t); } catch (e) { /* derived standings never block a safe reopen */ }
      }
      if (t.status === 'finished') { t.status = 'active'; delete t.finishedAt; }
      if (typeof win._propagateMatchUpdate === 'function') win._propagateMatchUpdate(t, m);
      if (o.logMessage) pushHistory(t, o.logMessage, o.now);
      return { ok: true, outcome: 'wo-reverted', reason: '' };
    }
    reopenMatch(t, m, payload.action);
    if (o.logMessage) pushHistory(t, o.logMessage, o.now);
    return { ok: true, outcome: payload.action === 'reset-match' ? 'match-reset' : 'result-reopened', reason: '' };
  }

  // Aprovação é uma transição própria: o navegador só pede, e a CF relê a
  // proposta atual antes de aplicá-la. Assim não existe payload velho apagando ou
  // alterando o placar que está pendente no documento canônico.
  if (payload.action === 'approve-pending') {
    const pending = m.pendingResult;
    if (!pending) return { ok: false, reason: 'no-pending-result' };
    const isAdmin = !!(typeof win._isUserOrgOrCoHost === 'function' && win._isUserOrgOrCoHost(t, actor));
    const actorSide = (typeof win._userTeamInMatch === 'function') ? win._userTeamInMatch(t, m, actor) : 0;
    const proposerSide = (typeof win._userTeamInMatch === 'function')
      ? win._userTeamInMatch(t, m, { uid: pending.proposedBy }) : 0;
    if (!isAdmin && (!actorSide || !proposerSide || actorSide === proposerSide)) {
      return { ok: false, reason: 'not-allowed-to-approve' };
    }
    const approved = (typeof win._applyApprovedResult === 'function')
      ? win._applyApprovedResult(t, matchId, pending) : null;
    if (!approved || !approved.ok) return { ok: false, reason: 'approve-failed' };
    if (o.logMessage) pushHistory(t, o.logMessage, o.now);
    return { ok: true, outcome: 'applied', reason: '' };
  }

  // Contra-proposta é uma transição diferente de "lançar": há uma proposta fresca
  // que pertence ao outro lado e a regra comum deliberadamente a protege de overwrite.
  // A CF, porém, pode trocá-la de forma controlada, preservando o registro original.
  if (payload.action === 'counter-pending') {
    const pending = m.pendingResult;
    if (!pending || pending.disputed) return { ok: false, reason: 'no-open-pending-result' };
    const isAdmin = !!(typeof win._isUserOrgOrCoHost === 'function' && win._isUserOrgOrCoHost(t, actor));
    const actorSide = (typeof win._userTeamInMatch === 'function') ? win._userTeamInMatch(t, m, actor) : 0;
    const proposerSide = (typeof win._userTeamInMatch === 'function')
      ? win._userTeamInMatch(t, m, { uid: pending.proposedBy }) : 0;
    if (isAdmin || !playersMaySubmit(t, m) || !actorSide || !proposerSide || actorSide === proposerSide) {
      return { ok: false, reason: 'not-allowed-to-counter' };
    }
    const original = pending.originalProposal || {
      proposedBy: pending.proposedBy || null,
      proposedByName: pending.proposedByName || '',
      scoreP1: pending.scoreP1,
      scoreP2: pending.scoreP2,
      sets: Array.isArray(pending.sets) ? pending.sets : null
    };
    m.pendingResult = Object.assign({}, payload.pending || {}, {
      proposedBy: actor.uid || null,
      proposedByEmail: actor.email || null,
      proposedByName: actor.name || actor.email || 'Jogador',
      proposedAt: (typeof o.now === 'number') ? o.now : Date.now(),
      isCounterProposal: true,
      originalProposal: original
    });
    if (typeof win._propagateMatchUpdate === 'function') win._propagateMatchUpdate(t, m);
    if (o.logMessage) pushHistory(t, o.logMessage, o.now);
    return { ok: true, outcome: 'pending', reason: '' };
  }

  // Contestação não recebe placar do cliente: a CF relê a proposta e apenas marca
  // a transição de consenso. Proponente não pode contestar a própria proposta.
  if (payload.action === 'contest-pending') {
    const pending = m.pendingResult;
    if (!pending || pending.disputed) return { ok: false, reason: 'no-open-pending-result' };
    const isAdmin = !!(typeof win._isUserOrgOrCoHost === 'function' && win._isUserOrgOrCoHost(t, actor));
    const actorSide = (typeof win._userTeamInMatch === 'function') ? win._userTeamInMatch(t, m, actor) : 0;
    const proposerSide = (typeof win._userTeamInMatch === 'function')
      ? win._userTeamInMatch(t, m, { uid: pending.proposedBy }) : 0;
    const isProposer = String(pending.proposedBy || '') === String(actor.uid || '');
    if (isProposer || (!isAdmin && (!actorSide || !proposerSide || actorSide === proposerSide))) {
      return { ok: false, reason: 'not-allowed-to-contest' };
    }
    pending.disputed = true;
    pending.disputedBy = actor.uid || null;
    pending.disputedByName = actor.name || actor.email || 'Jogador';
    pending.disputedAt = (typeof o.now === 'number') ? o.now : Date.now();
    if (typeof win._propagateMatchUpdate === 'function') win._propagateMatchUpdate(t, m);
    if (o.logMessage) pushHistory(t, o.logMessage, o.now);
    return { ok: true, outcome: 'disputed', reason: '' };
  }

  const authz = authorize(t, m, actor);
  if (!authz.ok) return { ok: false, reason: authz.reason };

  // ⭐ JOGO EM ANDAMENTO (melhor de 3 / melhor de 5) NÃO PEDE APROVAÇÃO.
  // O que a aprovação do adversário protege é o RESULTADO — quem venceu a partida. Um set
  // confirmado no meio do jogo não decide nada: não há vencedor, não há avanço, não há
  // ponto na classificação (o ramo `setsInProgress` do _applyResultToTournament sai antes
  // de tudo isso). Mandar cada set pra fila de aprovação travaria a partida no meio,
  // esperando o outro lado confirmar um placar que ainda vai mudar. A aprovação continua
  // valendo, inteira, no set que FECHA o jogo — aí sim há resultado.
  // ⚠️ A AUTORIZAÇÃO ACIMA (`authorize`) continua valendo: quem não pode lançar nesta fase,
  // ou não está no jogo, segue barrado. O que este ramo dispensa é a NEGOCIAÇÃO, não o
  // controle de acesso.
  if (payload && payload.setsInProgress) {
    const applied0 = win._applyResultToTournament(t, matchId, payload);
    if (!applied0) return { ok: false, reason: 'apply-failed' };
    if (o.logMessage) pushHistory(t, o.logMessage, o.now);
    return { ok: true, outcome: 'in-progress', reason: '' };
  }

  // Precisa de aprovação do adversário? A função é a MESMA do cliente — inclusive o caso
  // "adversário sem uid (informal) → auto-aprova, não há quem aprove".
  const needsApproval = !!(typeof win._resultNeedsApproval === 'function' &&
    win._resultNeedsApproval(t, m, actor));

  if (needsApproval && !o.forceApply) {
    m.pendingResult = Object.assign({}, payload.pending || {}, {
      proposedBy: actor.uid || null,
      proposedByEmail: actor.email || null,
      proposedByName: actor.name || actor.email || 'Jogador',
      proposedAt: (typeof o.now === 'number') ? o.now : Date.now()
    });
    if (typeof win._propagateMatchUpdate === 'function') win._propagateMatchUpdate(t, m);
    if (o.logMessage) pushHistory(t, o.logMessage, o.now);
    return { ok: true, outcome: 'pending', reason: '' };
  }

  // Caminho definitivo: a MESMA mutação do cliente, re-aplicada sobre o doc FRESCO.
  const applied = win._applyResultToTournament(t, matchId, payload);
  if (!applied) return { ok: false, reason: 'apply-failed' };
  if (o.logMessage) pushHistory(t, o.logMessage, o.now);
  return { ok: true, outcome: 'applied', reason: '' };
}

function pushHistory(t, message, now) {
  if (!Array.isArray(t.history)) t.history = [];
  t.history.push({
    date: new Date((typeof now === 'number') ? now : Date.now()).toISOString(),
    message: String(message)
  });
}

module.exports = { authorize, applyResult, playersMaySubmit, _window: win, _drawCore: drawCore };
