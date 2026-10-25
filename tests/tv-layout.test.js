'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const browser = require('../js/tv-layout-core');
const server = require('../functions-autodraw/tv-layout-core');
const callable = require('../functions/vendor/tv-layout-core');
assert.deepEqual(browser.defaults(), server.defaults());
assert.deepEqual(browser.defaults(), callable.defaults());
const original = browser.defaults();
const reordered = { card: Object.fromEntries(Object.entries(original.card).reverse()), sections: Object.fromEntries(Object.entries(original.sections).reverse()), background: '#ABCDEF', version: 1 };
assert.deepEqual(server.normalize(reordered), browser.normalize(reordered), 'browser e servidor usam a mesma ordem canônica');
assert.equal(server.normalize(reordered).background, '#abcdef');
for (const corrupt of [
  { ...original, background: 'url(https://example.com)' },
  { ...original, sections: { ...original.sections, courts: { ...original.sections.courts, x: 90 } } },
  { ...original, sections: { ...original.sections, courts: { ...original.sections.courts, w: 0 } } },
  { ...original, card: { ...original.card, score: 'true' } },
  { ...original, athleteNames: ['private'] }
]) assert.throws(() => server.normalize(corrupt));
const form = fs.readFileSync(path.join(root, 'js/views/create-tournament.js'), 'utf8');
assert.match(form, /id="tv-personalization"/);
assert.match(form, /id="tv-layout-editor"/);
assert.match(form, /tvLayout: \(typeof window\._tvEditorReadLayout/);
const tv = fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8');
assert.match(tv, /function customBodyHtml/);
assert.match(tv, /snapshot\.tvLayout/);
assert.match(tv, /cardHtml\(card, layout\.card\)/);
console.log('✓ layout TV: esquema fechado, limites, ordem canônica e integração de leitura/gravação');
