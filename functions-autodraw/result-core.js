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

  const authz = authorize(t, m, actor);
  if (!authz.ok) return { ok: false, reason: authz.reason };

  // Precisa de aprovação do adversário? A função é a MESMA do cliente — inclusive o caso
  // "adversário sem uid (informal) → auto-aprova, não há quem aprove".
  const needsApproval = !!(typeof win._resultNeedsApproval === 'function' &&
    win._resultNeedsApproval(t, m, actor));

  if (needsApproval && !o.forceApply) {
    m.pendingResult = Object.assign({}, payload.pending || {}, {
      proposedBy: actor.uid || null,
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
