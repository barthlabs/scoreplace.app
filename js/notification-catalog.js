// ========================================
// scoreplace.app — Notification Event Catalog
// Single source of truth: event_type → {level, icon, color}
// ========================================

window.NOTIF_CATALOG = {
  // Enrollment events
  enrollment_new:              { level: 'all',         icon: '✅', color: 'var(--success-color)' },
  pair_invite:                 { level: 'fundamental', icon: '🤝', color: '#f59e0b' },
  enrollment_confirm:          { level: 'all',         icon: '🎉', color: 'var(--success-color)' },
  enrollment_cancelled:        { level: 'important',   icon: '🛑', color: 'var(--danger-color, #ef4444)' },
  enrollment_cancelled_confirm:{ level: 'important',   icon: '🛑', color: 'var(--danger-color, #ef4444)' },
  enrollments_closed:          { level: 'important',   icon: '🔒', color: '#f59e0b' },
  enrollments_reopened:        { level: 'important',   icon: '🔓', color: 'var(--success-color)' },

  // Tournament lifecycle
  tournament_created:          { level: 'all',         icon: '🏆', color: 'var(--primary-color)' },
  tournament_deleted:          { level: 'fundamental', icon: '🗑️', color: 'var(--danger-color, #ef4444)' },
  tournament_update:           { level: 'fundamental', icon: '📢', color: '#f59e0b' },
  // Alias — create-tournament.js dispara com 'tournament_updated' (forma verbal
  // passada) em vez de 'tournament_update'. Mantemos as duas chaves pra não
  // quebrar notificações já persistidas em Firestore.
  tournament_updated:          { level: 'fundamental', icon: '📢', color: '#f59e0b' },
  tournament_finished:         { level: 'important',   icon: '🏆', color: '#a78bfa' },
  tournament_invite:           { level: 'all',         icon: '🏆', color: 'var(--primary-color)' },

  // Enquete do organizador (todos os inscritos precisam responder)
  poll:                        { level: 'fundamental', icon: '📊', color: '#8b5cf6' },

  // Draw / rounds
  draw:                        { level: 'fundamental', icon: '🎲', color: 'var(--primary-color)' },
  new_round:                   { level: 'fundamental', icon: '🔄', color: 'var(--primary-color)' },
  // Construtor de fases: torneio avançou pra próxima fase (chaves materializadas).
  new_phase:                   { level: 'fundamental', icon: '🏆', color: 'var(--primary-color)' },

  // Match events
  result:                      { level: 'fundamental', icon: '🏅', color: '#a78bfa' },
  // v0.17.1: aprovação de placar pelo time adversário
  // v1.8.2-beta: level → 'fundamental' (jogador precisa ver mesmo com notify filtrado)
  'match-pending-approval':    { level: 'fundamental', icon: '⏳', color: '#fbbf24' },
  'match-rejected':            { level: 'fundamental', icon: '❌', color: 'var(--danger-color, #ef4444)' },

  // Reminders
  tournament_reminder:         { level: 'fundamental', icon: '⏰', color: '#f59e0b' },
  tournament_nearby:           { level: 'all',         icon: '📍', color: 'var(--primary-color)' },
  // v2.3.92: inscrição pendente — perfil incompleto pra encaixar em categoria.
  'category-data-request':     { level: 'fundamental', icon: '👤', color: '#f59e0b' },
  // v2.4.28: participante mudou habilidade no perfil → organizador precisa aprovar.
  'category-change-request':   { level: 'fundamental', icon: '🔼', color: '#f59e0b' },
  // v2.4.28: resultado da aprovação/recusa da mudança de categoria (pro participante).
  'category-change-result':    { level: 'all',         icon: '🏷️', color: 'var(--primary-color)' },
  // v2.4.30: convite pra substituir num grupo de Liga (W.O.) + resultado do convite.
  'liga-sub-invite':           { level: 'fundamental', icon: '📨', color: '#10b981' },
  'liga-sub-result':           { level: 'all',         icon: '🔁', color: 'var(--primary-color)' },
  // v2.4.41: mensagem de um inscrito/visitante pro organizador do torneio.
  'player_to_organizer':       { level: 'fundamental', icon: '💬', color: '#3b82f6' },

  // Organizer actions
  org_communication:           { level: 'important',   icon: '📣', color: '#f59e0b' },
  // Alias — tournaments-organizer.js dispara com 'organizer_communication'.
  // Ambas as chaves apontam pro mesmo ícone/cor; resolve o fallback genérico
  // 🔔 que estava aparecendo no inbox.
  organizer_communication:     { level: 'important',   icon: '📣', color: '#f59e0b' },
  participant_removed:         { level: 'fundamental', icon: '🚫', color: 'var(--danger-color, #ef4444)' },

  // Host/cohost
  cohost_invite:               { level: 'fundamental', icon: '⭐', color: '#fbbf24' },
  host_transfer_invite:        { level: 'fundamental', icon: '⭐', color: '#fbbf24' },
  cohost_invite_sent:          { level: 'all',         icon: '📨', color: '#fbbf24' },
  host_transfer_sent:          { level: 'all',         icon: '📨', color: '#fbbf24' },
  host_invite_accepted:        { level: 'important',   icon: '✅', color: 'var(--success-color)' },
  host_invite_rejected:        { level: 'important',   icon: '❌', color: 'var(--danger-color, #ef4444)' },
  cohost_removed:              { level: 'important',   icon: '🚫', color: 'var(--danger-color, #ef4444)' },

  // Social
  friend_request:              { level: 'all',         icon: '👋', color: '#f59e0b' },
  friend_accepted:             { level: 'all',         icon: '🤝', color: 'var(--success-color)' },

  // (v3.0.x) chave 'poll' duplicada REMOVIDA daqui — ela sobrescrevia a definição
  // canônica lá em cima (level:'fundamental', 📊) fazendo a enquete virar 'important',
  // e quem filtra "só fundamentais" deixava de receber. Ver bloco "Enquete do organizador".

  // Category
  category_assignment:         { level: 'all',         icon: '🏷️', color: 'var(--primary-color)' },

  // Presence (disparada por _notifyFriendsOfPlan quando amigo planeja ida
  // num local — v0.14.70). Antes caía no fallback 🔔 porque não havia
  // entrada no catálogo; agora exibe com ícone de calendário verde.
  presence_plan:               { level: 'all',         icon: '🗓️', color: 'var(--success-color)' },

  // Check-in imediato (v0.15.13) — "Fulano chegou no local pra jogar agora".
  // Mais urgente que plan; nível 'all' igual, mas ícone vermelho-radar pra
  // distinguir visualmente.
  presence_checkin:            { level: 'all',         icon: '📡', color: 'var(--danger-color, #ef4444)' },

  // Convite pra partida casual (v0.15.21) — "Fulano começou uma partida
  // casual de X, entra junto". Ícone ⚡ ciano pra bater com a identidade
  // visual da Partida Casual (gradient ciano na dashboard).
  casual_invite:               { level: 'all',         icon: '⚡', color: '#38bdf8' },

  // v1.3.33-beta: pedido de vínculo de jogador "guest" → user real numa
  // partida casual. "Fulano sugere que você jogou esta partida — confirma?"
  // Ao confirmar, dados da partida ficam atribuídos ao perfil do user.
  casual_link_request:         { level: 'all',         icon: '🤝', color: '#fbbf24' },
  // Confirmação chega de volta pra quem solicitou.
  casual_link_accepted:        { level: 'all',         icon: '✅', color: 'var(--success-color)' },
  casual_link_rejected:        { level: 'all',         icon: '❌', color: 'var(--text-muted)' }
};

// ========================================
// Política de entrega por WhatsApp por tipo — DECISÃO DO APP (nunca config de
// usuário/organizador). O que a pessoa controla é SÓ notifyWhatsApp (liga/desliga)
// e notifyLevel. AQUI decide-se COMO cada tipo chega:
//   'imediato' (default, ausente) = manda na hora
//   'agrupado'                     = resumo de 1h (flushWhatsAppDigest)
//   'nenhum'                        = não vai por WhatsApp (só e-mail + in-app)
// Login/verificação por WhatsApp NÃO passa por aqui (é o seguro contra e-mail/SMS
// falharem) — segue sempre imediato no fluxo de auth.
// ========================================
window.NOTIF_WHATSAPP_POLICY = {
  // Inscrição de terceiros → resumo de 1h pro organizador (não 1 msg por inscrito)
  enrollment_new:                'agrupado',
  enrollment_cancelled:          'agrupado',
  // Baixa urgência → só e-mail + in-app (não gasta WhatsApp)
  enrollment_confirm:            'nenhum',
  enrollment_cancelled_confirm:  'nenhum',
  enrollments_closed:            'nenhum',
  enrollments_reopened:          'nenhum',
  tournament_created:            'nenhum',
  tournament_update:             'nenhum',
  tournament_updated:            'nenhum',
  tournament_finished:           'nenhum',
  tournament_invite:             'nenhum',
  tournament_reminder:           'nenhum',
  tournament_nearby:             'nenhum',
  tournament_deleted:            'nenhum',
  result:                        'nenhum',
  'category-data-request':       'nenhum',
  'category-change-request':     'nenhum',
  'category-change-result':      'nenhum',
  category_assignment:           'nenhum',
  participant_removed:           'nenhum',
  host_invite_accepted:          'nenhum',
  host_invite_rejected:          'nenhum',
  cohost_invite_sent:            'nenhum',
  host_transfer_sent:            'nenhum',
  cohost_removed:                'nenhum',
  friend_request:                'nenhum',
  friend_accepted:               'nenhum',
  'liga-sub-result':             'nenhum',
  casual_link_request:           'nenhum',
  casual_link_accepted:          'nenhum',
  casual_link_rejected:          'nenhum'
  // Resto = 'imediato' (default): draw, new_round, new_phase, match-pending-approval,
  // match-rejected, liga-sub-invite, poll, presence_checkin, presence_plan (amigo no
  // local = urgente), casual_invite, org_communication, pair_invite, cohost_invite.
};
window._waPolicy = function (type) {
  var p = window.NOTIF_WHATSAPP_POLICY && window.NOTIF_WHATSAPP_POLICY[type];
  return (p === 'agrupado' || p === 'nenhum') ? p : 'imediato';
};
