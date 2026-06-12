// ========================================
// scoreplace.app — Notification Event Catalog
// Single source of truth: event_type → {level, icon, color}
// ========================================

window.NOTIF_CATALOG = {
  // Enrollment events
  enrollment_new:              { level: 'all',         icon: '✅', color: 'var(--success-color)' },
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

  // Draw / rounds
  draw:                        { level: 'fundamental', icon: '🎲', color: 'var(--primary-color)' },
  new_round:                   { level: 'fundamental', icon: '🔄', color: 'var(--primary-color)' },

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

  // Polls
  poll:                        { level: 'important',   icon: '🗳️', color: 'var(--primary-color)' },

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
