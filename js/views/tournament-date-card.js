/* Formatos de data aprovados para os cards do torneio. Sem horário ou entre anos,
   a tela conserva a apresentação anterior. */
(function (root) {
  'use strict';
  var DEFAULTS = Object.freeze({ background:'#216b96', text:'#ffffff', day:'#ffffff', month:'#ffc400', time:'#e5f4fc' });
  var KEYS = Object.keys(DEFAULTS);
  var TYPOGRAPHY_DEFAULTS = Object.freeze({ daySize:100, dayWeight:800, monthSize:100, monthWeight:800, timeSize:100, timeWeight:700 });
  var TYPOGRAPHY_KEYS = Object.keys(TYPOGRAPHY_DEFAULTS);
  function validTypography(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === TYPOGRAPHY_KEYS.length && TYPOGRAPHY_KEYS.every(function (key) {
        var n = value[key];
        return Number.isInteger(n) && (key.endsWith('Size') ? n >= 70 && n <= 130 && n % 5 === 0 :
          n >= 300 && n <= 800 && n % 100 === 0);
      });
  }
  function colors(value) {
    var input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var out = {};
    KEYS.forEach(function (key) { out[key] = /^#[0-9a-f]{6}$/i.test(input[key] || '') ? input[key] : DEFAULTS[key]; });
    if (validTypography(input.typography)) out.typography = Object.assign({}, input.typography);
    return out;
  }
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (Object.keys(value).length !== KEYS.length && Object.keys(value).length !== KEYS.length + 1) ||
        KEYS.some(function (key) { return typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key]); }) ||
        Object.keys(value).some(function (key) { return KEYS.indexOf(key) < 0 && key !== 'typography'; }) ||
        (Object.prototype.hasOwnProperty.call(value, 'typography') && !validTypography(value.typography))) {
      throw new Error('Escolha cores e tipografia válidas para a data.');
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
    if (c.typography) {
      var typo = c.typography;
      css += '--sp-date-day-scale:' + (typo.daySize / 100) + ';--sp-date-day-weight:' + typo.dayWeight + ';' +
        '--sp-date-month-scale:' + (typo.monthSize / 100) + ';--sp-date-month-weight:' + typo.monthWeight + ';' +
        '--sp-date-time-scale:' + (typo.timeSize / 100) + ';--sp-date-time-weight:' + typo.timeWeight + ';';
    }
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
    var daysApart = m.end ? (Date.UTC(Number(m.end.year), m.end.month - 1, m.end.day) -
      Date.UTC(Number(m.start.year), m.start.month - 1, m.start.day)) / 86400000 : 0;
    // Acima de uma semana, os horários de abertura/fechamento não são uma grade
    // diária. O card exibe só as datas para não sugerir "19h às 23h" todos os dias.
    var extendedRange = daysApart > 7;
    var dateMarkup = m.kind === 'cross-month'
      ? '<div class="sp-date-cross-grid"><span class="sp-date-cross-item"><span class="sp-date-day">' + m.start.day + '</span><span class="sp-date-month">' + MONTHS[m.start.month - 1] + '</span></span><span class="sp-date-join">a</span><span class="sp-date-cross-item"><span class="sp-date-day">' + m.end.day + '</span><span class="sp-date-month">' + MONTHS[m.end.month - 1] + '</span></span></div>'
      : '<div class="sp-date-days">' + dateLine + '</div><div class="sp-date-month-line">' + monthLine + '</div>';
    var spoken = m.start.day + ' de ' + MONTHS[m.start.month - 1] + (m.end ? ' a ' + m.end.day + ' de ' + MONTHS[m.end.month - 1] : '') + (extendedRange ? '' : ', ' + time);
    return '<div class="sp-date-card sp-date-card--' + m.kind + (extendedRange ? ' sp-date-card--extended-range' : '') + (c.typography ? ' sp-date-card--custom-typography' : '') + '" style="' + css + '" aria-label="' + escapeAttribute(spoken) + '">' + dateMarkup + (extendedRange ? '' : '<div class="sp-date-time">' + time + '</div>') + '</div>';
  }
  var api = { DEFAULTS:DEFAULTS, TYPOGRAPHY_DEFAULTS:TYPOGRAPHY_DEFAULTS, validTypography:validTypography, colors:colors, validate:validate, model:model, render:render };
  root.ScorePlaceDateCard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
