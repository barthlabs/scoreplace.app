'use strict';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(t, HttpsError) {
  const fail = message => { throw new HttpsError('invalid-argument', message); };
  const schedule = t && t.scheduleWindow;
  if (schedule == null) return [];
  // Documentos legados sem modo nem janelas preservam a leitura anterior.
  if (schedule.mode === undefined && schedule.categoryWindows === undefined) return [];
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule) ||
      Object.keys(schedule).some(key => !['version', 'mode', 'days', 'categoryWindows', 'interleavedPlan', 'phaseCallOrder'].includes(key))) fail('Agenda de jogos inválida.');
  if (schedule.mode !== undefined && !['organizer', 'participants'].includes(schedule.mode)) fail('Modo de horários inválido.');
  if (schedule.mode === 'participants' && ((Array.isArray(schedule.days) && schedule.days.length) ||
      (Array.isArray(schedule.categoryWindows) && schedule.categoryWindows.length) || schedule.interleavedPlan)) fail('Jogos combinados pelos participantes não podem ter grade fixa.');
  if (schedule.mode === 'organizer' && (!Array.isArray(schedule.days) || !schedule.days.length)) fail('Informe ao menos um dia com jogos.');
  if (schedule.mode === 'organizer') {
    const phaseStart = String(t.startDate || '').slice(0, 10), phaseEnd = String(t.endDate || '').slice(0, 10);
    if (!DATE.test(phaseStart) || !DATE.test(phaseEnd) || phaseStart > phaseEnd) fail('Datas da fase inválidas.');
    const seen = new Set();
    schedule.days.forEach(day => {
      if (!day || typeof day !== 'object' || Array.isArray(day) ||
          !DATE.test(day.day) || day.day < phaseStart || day.day > phaseEnd || seen.has(day.day) ||
          !TIME.test(day.startTime) || !TIME.test(day.endTime) || day.startTime >= day.endTime) fail('Dia da agenda inválido.');
      seen.add(day.day);
    });
  }
  const windows = schedule.categoryWindows;
  if (windows === undefined) return [];
  if (!Array.isArray(windows) || windows.length > 200) fail('Horários por categoria inválidos.');
  if (!windows.length) return [];
  const categories = new Set((Array.isArray(t.combinedCategories) ? t.combinedCategories : [])
    .map(value => String(value || '').trim()).filter(Boolean));
  const days = new Map();
  if (!Array.isArray(schedule.days)) fail('Dias da agenda inválidos.');
  schedule.days.forEach(day => {
    if (!day || typeof day !== 'object' || Array.isArray(day) ||
        Object.keys(day).some(key => !['day', 'startTime', 'endTime', 'categoryFlow'].includes(key)) ||
        !DATE.test(day.day) || !TIME.test(day.startTime) || !TIME.test(day.endTime) ||
        day.startTime >= day.endTime || days.has(day.day)) fail('Dia da agenda inválido.');
    days.set(day.day, day);
  });
  if (!categories.size || !days.size) {
    const first = windows[0] || {};
    fail('A faixa de ' + String(first.category || '').slice(0, 80) + ' em ' + String(first.day || '').slice(0, 10) +
      ' exige uma categoria existente e um dia geral configurado.');
  }
  const phaseStart = String(t.startDate || '').slice(0, 10);
  const phaseEnd = String(t.endDate || '').slice(0, 10);
  if (!DATE.test(phaseStart) || !DATE.test(phaseEnd) || phaseStart > phaseEnd) {
    const first = windows[0] || {};
    fail('A faixa de ' + String(first.category || '').slice(0, 80) + ' em ' + String(first.day || '').slice(0, 10) +
      ' exige datas de início e término da fase válidas.');
  }
  const used = new Set();
  windows.forEach(window => {
    if (!window || typeof window !== 'object' || Array.isArray(window) ||
        Object.keys(window).some(key => !['category', 'day', 'startTime', 'endTime'].includes(key))) fail('Horário de categoria inválido.');
    const category = String(window.category || '').trim(), day = days.get(window.day);
    if (!categories.has(category) || !day || window.day < phaseStart || window.day > phaseEnd ||
        !TIME.test(window.startTime) || !TIME.test(window.endTime) ||
        window.startTime >= window.endTime || window.startTime < day.startTime || window.endTime > day.endTime) {
      fail('A faixa de ' + category.slice(0, 80) + ' em ' + String(window.day || '').slice(0, 10) + ' precisa caber no dia geral e pertencer a uma categoria existente.');
    }
    const key = category + '\u0000' + window.day;
    if (used.has(key)) fail('Há dois horários para a mesma categoria no mesmo dia.');
    used.add(key);
  });
  return windows;
}

function assessGenerated(t, estimate, HttpsError) {
  if (!t || !t.scheduleWindow || t.scheduleWindow.categoryWindows === undefined) return null;
  try { validate(t, HttpsError); }
  catch (error) { return { pulou: 'agenda-categoria-invalida', error }; }
  if (!Array.isArray(t.scheduleWindow.categoryWindows) || !t.scheduleWindow.categoryWindows.length) return null;
  const estimated = typeof estimate === 'function' ? estimate(t) : null;
  return estimated && estimated.cabe === true ? null : { pulou: 'agenda-categoria-nao-cabe' };
}

module.exports = { validate, assessGenerated };
