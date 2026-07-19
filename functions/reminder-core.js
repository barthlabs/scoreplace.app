// Núcleo PURO do lembrete de torneio (item 7). Espelha EXATAMENTE as janelas do cliente
// (_checkTournamentReminders em js/views/tournaments-organizer.js): 7 dias antes (nível 'all'),
// 2 dias ('important'), no dia (0, 'fundamental'). Data-only em BRT (UTC-3), igual ao cliente,
// que usa a meia-noite local do jogador. Isolado pra ser testável (functions/test-reminder-core.js).
// A CF sendTournamentReminders usa isto pra decidir; a entrega (notif + e-mail) mora na CF.
// Ver [[project_tournament_reminder_cf]].

// Data BRT (YYYY-MM-DD) de um instante ms. BRT = UTC-3 → data BRT = data UTC de (ms - 3h).
function brtDateStr(ms) {
  return new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Retorna a janela de lembrete devida HOJE pra um startDate, ou null.
// { days: 7|2|0, level, key } — key é o campo de dedup em t.remindersSent.
function reminderWindowFor(startDate, nowMs) {
  if (!startDate) return null;
  var startStr = String(startDate).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) return null;
  var todayStr = brtDateStr(nowMs);
  var diffDays = Math.round(
    (Date.parse(startStr + 'T00:00:00Z') - Date.parse(todayStr + 'T00:00:00Z')) / 86400000);
  if (diffDays === 7) return { days: 7, level: 'all', key: 'r7d' };
  if (diffDays === 2) return { days: 2, level: 'important', key: 'r2d' };
  if (diffDays === 0) return { days: 0, level: 'fundamental', key: 'r0d' };
  return null;
}

// Mensagem do lembrete (pt-BR), espelhando org.reminder7d/2d/0d do cliente.
function reminderMessage(win, tournamentName) {
  var nm = tournamentName || 'seu torneio';
  if (win.days === 7) return 'Falta 1 semana para o torneio "' + nm + '". Prepare-se!';
  if (win.days === 2) return 'Faltam 2 dias para o torneio "' + nm + '". Confirme sua presença!';
  return 'É hoje! O torneio "' + nm + '" começa hoje. Boa sorte!';
}

// Filtro de nível (espelha _notifLevelAllowed do cliente/sendOrgCommunication).
function notifLevelAllowed(userLevel, notifLevel) {
  if (!userLevel || userLevel === 'todas') return true;
  if (userLevel === 'none') return false;
  if (userLevel === 'importantes') return notifLevel === 'fundamental' || notifLevel === 'important';
  if (userLevel === 'fundamentais') return notifLevel === 'fundamental';
  return true;
}

module.exports = { brtDateStr, reminderWindowFor, reminderMessage, notifLevelAllowed };
