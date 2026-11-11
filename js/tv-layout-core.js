/* Configuração declarativa da tela No ar. Compartilhada com a porta de escrita. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoreplaceTvLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var IDS = ['header', 'courts', 'upcoming', 'rankings', 'results', 'qr', 'logo',
    'live1', 'live2', 'live3', 'live4', 'standing1', 'standing2', 'standing3', 'standing4'];
  var CARD_IDS = ['court', 'number', 'category', 'teams', 'players', 'score', 'timer'];
  var DEFAULT_BOXES = {
    header: { x: 0, y: 0, w: 100, h: 9 },
    courts: { x: 1, y: 10, w: 48, h: 72 },
    upcoming: { x: 1, y: 83, w: 48, h: 16 },
    rankings: { x: 50, y: 10, w: 49, h: 55 },
    results: { x: 50, y: 66, w: 39, h: 33 },
    qr: { x: 90, y: 67, w: 9, h: 33 },
    logo: { x: 79, y: 1, w: 12, h: 8 },
    live1: { x: 1, y: 11, w: 23, h: 32 }, live2: { x: 25, y: 11, w: 23, h: 32 },
    live3: { x: 52, y: 11, w: 23, h: 32 }, live4: { x: 76, y: 11, w: 23, h: 32 },
    standing1: { x: 1, y: 44, w: 47, h: 55 }, standing2: { x: 52, y: 44, w: 47, h: 55 },
    standing3: { x: 1, y: 44, w: 23, h: 55 }, standing4: { x: 76, y: 44, w: 23, h: 55 }
  };
  function fail() { throw new Error('Configuração da tela No ar inválida.'); }
  function plain(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null); }
  function exactKeys(o, allowed) { if (!plain(o) || Object.keys(o).some(function (key) { return allowed.indexOf(key) < 0; })) fail(); }
  function number(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && Math.round(v * 10) === v * 10; }
  function normalize(input) {
    if (input == null) return null;
    exactKeys(input, ['version', 'background', 'backgroundMode', 'sections', 'card', 'bracketBoxes']);
    if (input.version !== 1 || !/^#[0-9a-fA-F]{6}$/.test(input.background)) fail();
    var backgroundMode = input.backgroundMode == null
      ? (input.background.toLowerCase() === '#060d1a' ? 'tournament' : 'custom') : input.backgroundMode;
    if (backgroundMode !== 'tournament' && backgroundMode !== 'custom') fail();
    exactKeys(input.sections, IDS);
    exactKeys(input.card, CARD_IDS);
    var sections = {};
    IDS.forEach(function (id) {
      var s = input.sections[id];
      if (!s && (id === 'logo' || id.indexOf('live') === 0 || id.indexOf('standing') === 0))
        s = Object.assign({ visible: false }, DEFAULT_BOXES[id]);
      exactKeys(s, ['visible', 'x', 'y', 'w', 'h'].concat(id.indexOf('live') === 0 || id.indexOf('standing') === 0 ? ['source'] : []));
      if (typeof s.visible !== 'boolean' || !number(s.x) || !number(s.y) || !number(s.w) || !number(s.h) || s.w < 5 || s.h < 5 || s.x + s.w > 100 || s.y + s.h > 100) fail();
      if (s.source != null && (typeof s.source !== 'string' || s.source.length > 160)) fail();
      sections[id] = { visible: id === 'qr' ? true : s.visible, x: s.x, y: s.y, w: s.w, h: s.h };
      if (s.source != null) sections[id].source = s.source;
    });
    var card = {};
    CARD_IDS.forEach(function (id) { if (typeof input.card[id] !== 'boolean') fail(); card[id] = input.card[id]; });
    var boxes = input.bracketBoxes == null ? [] : input.bracketBoxes;
    if (!Array.isArray(boxes) || boxes.length > 100) fail();
    var boxNames = new Set();
    boxes = boxes.map(function (box) {
      exactKeys(box, ['category', 'visible', 'x', 'y', 'w', 'h']);
      if (typeof box.category !== 'string' || !box.category.trim() || box.category.length > 120 ||
          boxNames.has(box.category) || typeof box.visible !== 'boolean' || !number(box.x) || !number(box.y) ||
          !number(box.w) || !number(box.h) || box.w < 5 || box.h < 5 || box.x + box.w > 100 || box.y + box.h > 100) fail();
      boxNames.add(box.category);
      return { category:box.category, visible:box.visible, x:box.x, y:box.y, w:box.w, h:box.h };
    });
    var out = { version: 1, background: input.background.toLowerCase(), backgroundMode: backgroundMode,
      sections: sections, card: card, bracketBoxes: boxes };
    if (JSON.stringify(out).length > 12000) fail();
    return out;
  }
  function defaults() {
    var sections = {};
    IDS.forEach(function (id) { var b = DEFAULT_BOXES[id]; sections[id] = { visible: IDS.indexOf(id) < 6, x: b.x, y: b.y, w: b.w, h: b.h }; });
    var card = {};
    CARD_IDS.forEach(function (id) { card[id] = true; });
    return normalize({ version: 1, background: '#060d1a', backgroundMode: 'tournament', sections: sections, card: card, bracketBoxes:[] });
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
  function finalsPreset(input, matches) {
    var layout = normalize(input || defaults());
    var preset = defaults();
    IDS.forEach(function (id) { layout.sections[id].visible = id === 'header' || id === 'qr'; });
    ['header', 'qr', 'live1', 'live2', 'live3', 'live4', 'standing1', 'standing2', 'standing3', 'standing4'].forEach(function (id) {
      ['x', 'y', 'w', 'h'].forEach(function (key) { layout.sections[id][key] = preset.sections[id][key]; });
      if (id.indexOf('live') === 0 || id.indexOf('standing') === 0) delete layout.sections[id].source;
    });
    var groups = {};
    (matches || []).forEach(function (m) {
      if (!m || !m.id) return;
      var key = String(m.bracket || 'main');
      (groups[key] || (groups[key] = [])).push(m);
    });
    var keys = Object.keys(groups).filter(function (key) { return key !== 'thirdplace' && key !== 'grandfinal' && key !== 'finalstage'; });
    keys.sort(function (a, b) {
      var order = ['gold', 'silver', 'main'];
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
    });
    keys.slice(0, 2).forEach(function (key, index) {
      var ms = groups[key], third = ms.find(function (m) { return m.isThirdPlace; });
      var finalists = ms.filter(function (m) { return !m.isThirdPlace && !m.isBye && !m.isSitOut; });
      var lastRound = Math.max.apply(null, finalists.map(function (m) { return Number(m.round || 0); }));
      var final = finalists.filter(function (m) { return Number(m.round || 0) === lastRound; }).slice(-1)[0];
      var first = layout.sections['live' + (index * 2 + 1)], second = layout.sections['live' + (index * 2 + 2)];
      if (final) { first.visible = true; first.source = String(final.id); }
      if (third) { second.visible = true; second.source = String(third.id); }
      var standing = layout.sections['standing' + (index + 1)];
      standing.visible = true; standing.source = key;
    });
    layout.sections.qr.x = 89; layout.sections.qr.y = 78; layout.sections.qr.w = 10; layout.sections.qr.h = 22;
    return normalize(layout);
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
    if (JSON.stringify(screens).length > 150000) fail();
    return screens;
  }
  function forPhase(screens, phaseIndex, fallback) {
    var index = Number.isInteger(Number(phaseIndex)) ? Number(phaseIndex) : 0;
    var found = Array.isArray(screens) && screens.find(function (screen) { return screen.phaseIndex === index; });
    return found ? found.layout : fallback || null;
  }
  return { IDS: IDS, CARD_IDS: CARD_IDS, normalize: normalize, normalizeScreens: normalizeScreens,
    forPhase: forPhase, defaults: defaults, finalsPreset: finalsPreset, snapBox: snapBox };
});
