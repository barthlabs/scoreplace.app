const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const start = bracket.indexOf('var _bracketLiveScoreOriginal = new WeakMap();');
const end = bracket.indexOf('\nfunction renderMatchCard(', start);
assert(start >= 0 && end > start, 'o pintor do placar fica junto do card da chave');

const window = { _formatGamePoint(points, _other, _tb, cfg) {
  assert.equal(cfg.countingType, 'tennis');
  return ['0', '15', '30', '40'][points];
} };
vm.runInNewContext(bracket.slice(start, end), { window, WeakMap, Map, String, Number, Date });

const cells = [{ innerHTML:'<input value="">' }, { innerHTML:'<input value="">' }];
const attrs = {};
const panel = { hidden:true, textContent:'', getAttribute() { return 'final-ouro'; } };
const card = {
  querySelector() { return panel; },
  querySelectorAll() { return cells; },
  setAttribute(name, value) { attrs[name] = value; },
  removeAttribute(name) { delete attrs[name]; }
};
const dom = { querySelectorAll() { return [card]; } };
const point = (p1, p2, g1, g2) => [{ kind:'tournament', status:'live', matchId:'final-ouro',
  lastActivityAt:Date.now(), scoring:{countingType:'tennis'},
  state:{currentGameP1:p1, currentGameP2:p2, sets:[{gamesP1:g1, gamesP2:g2}]}}];

window._bracketPaintLiveMatchScores(point(1, 0, 0, 0), dom);
assert.match(cells[0].innerHTML, /sp-live-card-games[^>]*>0<\/span>.*sp-live-card-points[^>]*>15<\/span>/);
assert.match(cells[1].innerHTML, /sp-live-card-games[^>]*>0<\/span>.*sp-live-card-points[^>]*>0<\/span>/);
assert.match(panel.textContent, /GAMES 0 × 0 · PONTOS 15 × 0/);
assert.equal(panel.hidden, false);

window._bracketPaintLiveMatchScores(point(2, 1, 1, 2), dom);
assert.match(cells[0].innerHTML, />1<\/span>.*>30<\/span>/);
assert.match(cells[1].innerHTML, />2<\/span>.*>15<\/span>/);
assert.match(panel.textContent, /GAMES 1 × 2 · PONTOS 30 × 15/);

window._bracketPaintLiveMatchScores([], dom);
assert.equal(cells[0].innerHTML, '<input value="">', 'ao encerrar, restaura o card original');
assert.equal(cells[1].innerHTML, '<input value="">');
assert.equal(panel.hidden, true);
assert.equal(attrs['data-live-scoring'], undefined);

console.log('✓ card da chave: pontos e games ao vivo, restauração ao encerrar');
