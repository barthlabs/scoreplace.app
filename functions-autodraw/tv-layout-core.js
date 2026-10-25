/* Configuração declarativa da tela No ar. Compartilhada com a porta de escrita. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoreplaceTvLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var IDS = ['header', 'courts', 'upcoming', 'rankings', 'results', 'qr'];
  var CARD_IDS = ['court', 'number', 'category', 'teams', 'players', 'score', 'timer'];
  var DEFAULT_BOXES = {
    header: { x: 0, y: 0, w: 100, h: 9 },
    courts: { x: 1, y: 10, w: 48, h: 72 },
    upcoming: { x: 1, y: 83, w: 48, h: 16 },
    rankings: { x: 50, y: 10, w: 49, h: 55 },
    results: { x: 50, y: 66, w: 39, h: 33 },
    qr: { x: 90, y: 66, w: 9, h: 33 }
  };
  function fail() { throw new Error('Configuração da tela No ar inválida.'); }
  function plain(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null); }
  function exactKeys(o, allowed) { if (!plain(o) || Object.keys(o).some(function (key) { return allowed.indexOf(key) < 0; })) fail(); }
  function number(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && Math.round(v * 10) === v * 10; }
  function normalize(input) {
    if (input == null) return null;
    exactKeys(input, ['version', 'background', 'sections', 'card']);
    if (input.version !== 1 || !/^#[0-9a-fA-F]{6}$/.test(input.background)) fail();
    exactKeys(input.sections, IDS);
    exactKeys(input.card, CARD_IDS);
    var sections = {};
    IDS.forEach(function (id) {
      var s = input.sections[id]; exactKeys(s, ['visible', 'x', 'y', 'w', 'h']);
      if (typeof s.visible !== 'boolean' || !number(s.x) || !number(s.y) || !number(s.w) || !number(s.h) || s.w < 5 || s.h < 5 || s.x + s.w > 100 || s.y + s.h > 100) fail();
      sections[id] = { visible: s.visible, x: s.x, y: s.y, w: s.w, h: s.h };
    });
    var card = {};
    CARD_IDS.forEach(function (id) { if (typeof input.card[id] !== 'boolean') fail(); card[id] = input.card[id]; });
    var out = { version: 1, background: input.background.toLowerCase(), sections: sections, card: card };
    if (JSON.stringify(out).length > 4096) fail();
    return out;
  }
  function defaults() {
    var sections = {};
    IDS.forEach(function (id) { var b = DEFAULT_BOXES[id]; sections[id] = { visible: true, x: b.x, y: b.y, w: b.w, h: b.h }; });
    var card = {};
    CARD_IDS.forEach(function (id) { card[id] = true; });
    return normalize({ version: 1, background: '#060d1a', sections: sections, card: card });
  }
  return { IDS: IDS, CARD_IDS: CARD_IDS, normalize: normalize, defaults: defaults };
});
