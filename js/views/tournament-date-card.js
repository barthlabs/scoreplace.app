/* Formatos de data aprovados para os cards do torneio. Sem horário ou entre anos,
   a tela conserva a apresentação anterior. */
(function (root) {
  'use strict';
  var DEFAULTS = Object.freeze({ background:'#216b96', text:'#ffffff', day:'#ffffff', month:'#ffc400', time:'#e5f4fc' });
  var KEYS = Object.keys(DEFAULTS);
  function colors(value) {
    var input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var out = {};
    KEYS.forEach(function (key) { out[key] = /^#[0-9a-f]{6}$/i.test(input[key] || '') ? input[key] : DEFAULTS[key]; });
    return out;
  }
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== KEYS.length ||
        Object.keys(value).some(function (key) { return KEYS.indexOf(key) < 0 || typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key]); })) {
      throw new Error('Escolha cinco cores válidas para a data.');
    }
    return value;
  }
  function parts(raw) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/.exec(String(raw || ''));
    if (!m) return null;
    var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (date.getFullYear() !== Number(m[1]) || date.getMonth() + 1 !== Number(m[2]) || date.getDate() !== Number(m[3])) return null;
    return { year:m[1], month:Number(m[2]), day:Number(m[3]), time:m[4] ? m[4] + ':' + m[5] : '' };
  }
  function model(startRaw, endRaw) {
    var start = parts(startRaw), end = parts(endRaw);
    if (!start || !start.time || (endRaw && !end)) return null;
    if (end && !end.time) {
      if (end.year === start.year && end.month === start.month && end.day === start.day) end = null;
      else return null;
    }
    if (end && (end.year !== start.year || (end.month < start.month) || (end.month === start.month && end.day < start.day))) return null;
    var kind = !end ? 'start-only' : end.month === start.month && end.day === start.day ? 'one-day' : end.month === start.month ? 'same-month' : 'cross-month';
    return { kind:kind, start:start, end:end };
  }
  var MONTHS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  function escapeAttribute(value) {
    return String(value).replace(/[&"'<>]/g, function (char) {
      return { '&':'&amp;', '"':'&quot;', "'":'&#39;', '<':'&lt;', '>':'&gt;' }[char];
    });
  }
  function render(startRaw, endRaw, customColors) {
    var m = model(startRaw, endRaw);
    if (!m) return '';
    var c = colors(customColors);
    var css = '--sp-date-bg:' + c.background + ';--sp-date-text:' + c.text + ';--sp-date-day:' + c.day + ';--sp-date-month:' + c.month + ';--sp-date-time:' + c.time + ';';
    var dateLine = '', monthLine = '';
    if (m.kind === 'one-day' || m.kind === 'start-only') {
      dateLine = '<span class="sp-date-day">' + m.start.day + '</span>';
      monthLine = '<span class="sp-date-month">' + MONTHS[m.start.month - 1] + '</span>';
    } else {
      dateLine = '<span class="sp-date-day">' + m.start.day + '</span><span class="sp-date-join">a</span><span class="sp-date-day">' + m.end.day + '</span>';
      monthLine = m.kind === 'same-month'
        ? '<span class="sp-date-month">' + MONTHS[m.start.month - 1] + '</span>'
        : '<span class="sp-date-months"><span class="sp-date-month">' + MONTHS[m.start.month - 1] + '</span><span class="sp-date-month">' + MONTHS[m.end.month - 1] + '</span></span>';
    }
    var time = m.start.time + (m.end ? ' — ' + m.end.time : '');
    var spoken = m.start.day + ' de ' + MONTHS[m.start.month - 1] + (m.end ? ' a ' + m.end.day + ' de ' + MONTHS[m.end.month - 1] : '') + ', ' + time;
    return '<div class="sp-date-card sp-date-card--' + m.kind + '" style="' + css + '" aria-label="' + escapeAttribute(spoken) + '"><div class="sp-date-days">' + dateLine + '</div><div class="sp-date-month-line">' + monthLine + '</div><div class="sp-date-time">' + time + '</div></div>';
  }
  var api = { DEFAULTS:DEFAULTS, colors:colors, validate:validate, model:model, render:render };
  root.ScorePlaceDateCard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
