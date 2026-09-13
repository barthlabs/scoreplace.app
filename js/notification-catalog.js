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
  // v1.6.79: torneio abandonado (CF sweepAbandonedTournaments). O aviso sai 48h ANTES e diz
  // o que resolve: preencher as datas. Os dois são fundamentais — é o torneio DELE parando.
  tournament_auto_close_warning: { level: 'fundamental', icon: '⏳', color: '#f59e0b' },
  tournament_auto_closed:        { level: 'fundamental', icon: '⏸️', color: '#f59e0b' },
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
  // v1.3.17: convite pro grupo oficial de WhatsApp do torneio/jogo — link direto.
  // fundamental: todo inscrito precisa ver pra entrar no grupo de comunicações.
  wa_group:                    { level: 'fundamental', icon: '💬', color: '#25D366' },

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
  casual_link_rejected:        { level: 'all',         icon: '❌', color: 'var(--text-muted)' },

  // 🔴 1.9.36 — um placar ao vivo COMEÇOU num torneio em que a pessoa está inscrita
  // (inclusive espera, desativado e W.O.). É convite pra ASSISTIR, não pedido de ação:
  // quem não quiser desliga em Perfil → "Avisar quando um placar ao vivo começar".
  live_score_started:          { level: 'all',         icon: '🔴', color: 'var(--danger-color, #ef4444)' },

  // 📱 1.9.97 — CAMADA 3 do celular: o ORGANIZADOR registrou o contato da pessoa.
  // É 'important' de propósito: alguém escreveu um telefone no perfil dela. A pessoa
  // TEM que saber — é o que separa "registro com procedência" de "mexeram no meu
  // cadastro sem avisar", e é a chance dela corrigir se o número estiver errado.
  contact_phone_set:           { level: 'important',   icon: '📱', color: '#f59e0b' }
};

// v1.2.9: NOTIF_WHATSAPP_POLICY + _waPolicy REMOVIDOS. A política de entrega por
// WhatsApp (imediato/agrupado/nenhum) não tem mais canal pra reger — número banido,
// apelação negada, portfólio Meta morto. Ver project_whatsapp_meta_2fa_block.


/* ⛔ O NÍVEL DO AVISO DE PLACAR DEPENDE DE QUEM RECEBE — não é constante do tipo.
 *
 * Relato do dono (12/set/2026, e-mail do Confra): _"aqui quem lançou foi o organizador e só é
 * fundamental para os participantes desse jogo. para os demais é geral. para o organizador
 * importante"_. O e-mail chegava marcado 🔴 Fundamental para ele, que é o ORGANIZADOR e não
 * joga aquele jogo.
 *
 * O nível era `result`/`match-pending-approval` = 'fundamental' na tabela acima, igual para
 * todo mundo — e o e-mail ainda lia a TABELA, não o aviso (`_dispatchChannels` usava
 * `NOTIF_CATALOG[type].level` e o `_sendUserNotification` até apagava `level` do template).
 * Resultado: nível nenhum sobrevivia até o e-mail, e a janela do digest (5/15/30 min) saía
 * pelo nível errado também.
 *
 * A REGRA, para os avisos de PLACAR:
 *   • quem JOGA aquele jogo  → fundamental (é a partida dele, precisa ver)
 *   • organizador/co-org     → importante  (é a competição dele, mas não é a partida dele)
 *   • qualquer outro         → geral
 * Para todo o resto do catálogo, nada muda: vale o nível da tabela.
 *
 * ⚠️ PURA de propósito: recebe o que precisa por parâmetro (nenhum acesso a `window`), então
 * o portão a executa sem montar meia aplicação. Quem resolve "joga este jogo?" e "é
 * organizador?" continua sendo a régua canônica por UID de quem chama.
 */
window._TIPOS_DE_PLACAR = { 'result': 1, 'match-pending-approval': 1, 'match-rejected': 1 };

window._nivelDoAviso = function (tipo, papel, nivelBase) {
  var _cat = (window.NOTIF_CATALOG && window.NOTIF_CATALOG[tipo]) || null;
  var base = nivelBase || (_cat && _cat.level) || 'all';
  if (!window._TIPOS_DE_PLACAR[tipo]) return base;
  if (papel === 'jogador') return 'fundamental';
  if (papel === 'organizador') return 'important';
  return 'all';
};
