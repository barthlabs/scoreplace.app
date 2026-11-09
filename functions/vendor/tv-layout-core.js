/* Configuração declarativa da tela No ar. Compartilhada com a porta de escrita. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoreplaceTvLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var IDS = ['header', 'courts', 'upcoming', 'rankings', 'results', 'qr', 'logo'];
  var CARD_IDS = ['court', 'number', 'category', 'teams', 'players', 'score', 'timer'];
  var DEFAULT_BOXES = {
    header: { x: 0, y: 0, w: 100, h: 9 },
    courts: { x: 1, y: 10, w: 48, h: 72 },
    upcoming: { x: 1, y: 83, w: 48, h: 16 },
    rankings: { x: 50, y: 10, w: 49, h: 55 },
    results: { x: 50, y: 66, w: 39, h: 33 },
    qr: { x: 90, y: 66, w: 9, h: 33 },
    logo: { x: 79, y: 1, w: 12, h: 8 }
  };
  function fail() { throw new Error('Configuração da tela No ar inválida.'); }
  function plain(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null); }
  function exactKeys(o, allowed) { if (!plain(o) || Object.keys(o).some(function (key) { return allowed.indexOf(key) < 0; })) fail(); }
  function number(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && Math.round(v * 10) === v * 10; }
  function normalize(input) {
    if (input == null) return null;
    exactKeys(input, ['version', 'background', 'backgroundMode', 'sections', 'card']);
    if (input.version !== 1 || !/^#[0-9a-fA-F]{6}$/.test(input.background)) fail();
    var backgroundMode = input.backgroundMode == null
      ? (input.background.toLowerCase() === '#060d1a' ? 'tournament' : 'custom') : input.backgroundMode;
    if (backgroundMode !== 'tournament' && backgroundMode !== 'custom') fail();
    exactKeys(input.sections, IDS);
    exactKeys(input.card, CARD_IDS);
    var sections = {};
    IDS.forEach(function (id) {
      var s = input.sections[id];
      if (!s && id === 'logo') s = { visible: false, x: DEFAULT_BOXES.logo.x,
        y: DEFAULT_BOXES.logo.y, w: DEFAULT_BOXES.logo.w, h: DEFAULT_BOXES.logo.h };
      exactKeys(s, ['visible', 'x', 'y', 'w', 'h']);
      if (typeof s.visible !== 'boolean' || !number(s.x) || !number(s.y) || !number(s.w) || !number(s.h) || s.w < 5 || s.h < 5 || s.x + s.w > 100 || s.y + s.h > 100) fail();
      sections[id] = { visible: s.visible, x: s.x, y: s.y, w: s.w, h: s.h };
    });
    var card = {};
    CARD_IDS.forEach(function (id) { if (typeof input.card[id] !== 'boolean') fail(); card[id] = input.card[id]; });
    var out = { version: 1, background: input.background.toLowerCase(), backgroundMode: backgroundMode,
      sections: sections, card: card };
    if (JSON.stringify(out).length > 4096) fail();
    return out;
  }
  function defaults() {
    var sections = {};
    IDS.forEach(function (id) { var b = DEFAULT_BOXES[id]; sections[id] = { visible: id !== 'logo', x: b.x, y: b.y, w: b.w, h: b.h }; });
    var card = {};
    CARD_IDS.forEach(function (id) { card[id] = true; });
    return normalize({ version: 1, background: '#060d1a', backgroundMode: 'tournament', sections: sections, card: card });
  }
  function snapBox(box, others, resize, threshold) {
    var limit = Number.isFinite(threshold) ? threshold : 1.4;
    var out = { x: box.x, y: box.y, w: box.w, h: box.h };
    function nearest(value, targets) {
      var best = value, distance = limit;
      targets.forEach(function (target) {
        var delta = Math.abs(target - value);
        if (delta < distance) { best = target; distance = delta; }
      });
      return best;
    }
    var xs = [0, 100], ys = [0, 100];
    (others || []).forEach(function (other) {
      if (!other || other.visible === false) return;
      xs.push(other.x, other.x + other.w);
      ys.push(other.y, other.y + other.h);
    });
    if (resize) {
      out.w = Math.max(5, Math.min(100 - out.x, nearest(out.x + out.w, xs) - out.x));
      out.h = Math.max(5, Math.min(100 - out.y, nearest(out.y + out.h, ys) - out.y));
    } else {
      out.x = Math.max(0, Math.min(100 - out.w, nearest(out.x, xs.concat(xs.map(function (x) { return x - out.w; })))));
      out.y = Math.max(0, Math.min(100 - out.h, nearest(out.y, ys.concat(ys.map(function (y) { return y - out.h; })))));
    }
    ['x', 'y', 'w', 'h'].forEach(function (key) { out[key] = Math.round(out[key] * 10) / 10; });
    return out;
  }
  function normalizeScreens(input) {
    if (input == null) return null;
    if (!Array.isArray(input) || !input.length || input.length > 12) fail();
    var phases = new Set();
    var screens = input.map(function (item) {
      exactKeys(item, ['phaseIndex', 'layout']);
      if (!Number.isInteger(item.phaseIndex) || item.phaseIndex < 0 || item.phaseIndex > 11 || phases.has(item.phaseIndex)) fail();
      phases.add(item.phaseIndex);
      return { phaseIndex: item.phaseIndex, layout: normalize(item.layout) };
    });
    if (JSON.stringify(screens).length > 50000) fail();
    return screens;
  }
  function forPhase(screens, phaseIndex, fallback) {
    var index = Number.isInteger(Number(phaseIndex)) ? Number(phaseIndex) : 0;
    var found = Array.isArray(screens) && screens.find(function (screen) { return screen.phaseIndex === index; });
    return found ? found.layout : fallback || null;
  }
  return { IDS: IDS, CARD_IDS: CARD_IDS, normalize: normalize, normalizeScreens: normalizeScreens,
    forPhase: forPhase, defaults: defaults, snapBox: snapBox };
});
