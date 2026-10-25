/* Dia operacional da partida: compartilhado pela TV e pelo progresso. */
(function (root) {
  'use strict';
  function timestamp(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'number') return value < 100000000000 ? value * 1000 : value;
    var n = Date.parse(value);
    return Number.isFinite(n) ? n : 0;
  }
  function localDay(ms, zone) {
    if (!ms) return '';
    try {
      var parts = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date(ms)).forEach(function (part) { parts[part.type] = part.value; });
      return parts.year + '-' + parts.month + '-' + parts.day;
    } catch (e) { return ''; }
  }
  function eventZone(t) {
    return typeof root._matchCardTimeZone === 'function' ? root._matchCardTimeZone(t) : 'America/Sao_Paulo';
  }
  function dayTimeMs(ymd, hm, zone) {
    var a = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var b = String(hm || '').match(/^(\d{2}):(\d{2})$/);
    if (!a || !b || +b[1] > 23 || +b[2] > 59) return NaN;
    var nominal = Date.UTC(+a[1], +a[2] - 1, +a[3], +b[1], +b[2]);
    if (new Date(nominal).toISOString().slice(0, 10) !== ymd) return NaN;
    try {
      var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      var parts = {};
      fmt.formatToParts(new Date(nominal)).forEach(function (part) { if (part.type !== 'literal') parts[part.type] = part.value; });
      var wallAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
      return nominal - (wallAsUtc - nominal);
    } catch (e) { return NaN; }
  }
  function matchDay(m, zone) {
    if (!m) return '';
    return /^\d{4}-\d{2}-\d{2}$/.test(String(m.requiredDay || ''))
      ? String(m.requiredDay) : localDay(timestamp(m.scheduledAt), zone);
  }
  var api = { timestamp: timestamp, localDay: localDay, eventZone: eventZone, matchDay: matchDay, dayTimeMs: dayTimeMs };
  root.ScoreplaceMatchDay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
