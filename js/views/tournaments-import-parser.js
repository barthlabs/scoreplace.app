/* External roster sources are suggestions, never identities or writes. */
(function (root) {
  'use strict';
  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function folded(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function categoryFor(value, categories) {
    var source = folded(value);
    if (!source) return '';
    var labels = (categories || []).map(function (item) { return { id: item.id, label: folded(item.label || item.name || '') }; });
    var direct = labels.find(function (item) { return item.label && source.indexOf(item.label) !== -1; });
    if (direct) return direct.id;
    var skill = ['light', 'power', 'extreme'].find(function (part) { return source.indexOf(part) !== -1; });
    var gender = /feminin|\bfem\b/.test(source) ? 'fem' : (/masculin|\bmasc\b/.test(source) ? 'masc' : '');
    if (!skill || !gender) return '';
    var found = labels.find(function (item) { return item.label.indexOf(skill) !== -1 && item.label.indexOf(gender) !== -1; });
    return found ? found.id : '';
  }
  function splitPair(value) {
    var match = clean(value).replace(/^\d+[.)]\s*/, '').match(/^(.+?)\s+\+\s+(.+)$/);
    return match && clean(match[1]).length > 1 && clean(match[2]).length > 1
      ? [clean(match[1]), clean(match[2])] : null;
  }
  function parsePhotoText(raw, categories) {
    var currentCategory = '', rows = [], ignored = [];
    var lines = String(raw || '').split(/\r?\n/);
    lines.forEach(function (line) {
      var value = clean(line);
      if (!value) return;
      var category = categoryFor(value, categories);
      if (category && !splitPair(value)) { currentCategory = category; return; }
      var pair = splitPair(value);
      if (pair) rows.push({ categoryId: currentCategory, ordinal: Number((value.match(/^(\d+)[.)]/) || [])[1]) || null,
        people: pair.map(function (name) { return { name: name, uid: undefined }; }), source: value });
      else ignored.push(value);
    });
    return { rows: rows, ignored: ignored };
  }
  function parseMatrix(matrix, categories) {
    var rows = [], ignored = [], currentCategory = '';
    (matrix || []).forEach(function (row) {
      var cells = (Array.isArray(row) ? row : []).map(clean).filter(Boolean);
      if (!cells.length) return;
      if (cells.filter(function (cell) { return /^(categoria|pessoa\s*[12]|jogador\s*[12]|participante\s*[12]|nome\s*[12])$/i.test(cell); }).length >= 2) return;
      var joined = cells.join(' '), category = categoryFor(joined, categories);
      if (category) currentCategory = category;
      var pair = cells.map(splitPair).find(Boolean);
      if (!pair) {
        var names = cells.filter(function (cell) { return !/^\d+$/.test(cell) && !categoryFor(cell, categories) &&
          !/^(dupla|equipe|categoria|atleta|jogador|participante|nome|partner|player)\b/i.test(cell); });
        if (names.length >= 2 && names[0].length > 1 && names[1].length > 1) pair = names.slice(0, 2);
      }
      if (pair) rows.push({ categoryId: category || currentCategory, ordinal: Number((joined.match(/^(\d+)[.)]/) || [])[1]) || null,
        people: pair.map(function (name) { return { name: name, uid: undefined }; }), source: joined });
      else ignored.push(joined);
    });
    return { rows: rows, ignored: ignored };
  }
  var api = { categoryFor: categoryFor, splitPair: splitPair, parsePhotoText: parsePhotoText, parseMatrix: parseMatrix };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TournamentImportParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
