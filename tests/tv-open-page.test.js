'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'open.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js/lojas-config.js'), 'utf8');
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
const productionId = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
function load(query, flags) {
  const web = { href:'/' };
  const choices = { links: [], insertBefore(link, before) { assert.equal(before, web); this.links.push(link); } };
  const document = {
    getElementById(id) { return id === 'web-link' ? web : choices; },
    createElement(tag) { return { tag, appendChild(child) { this.child = child; }, setAttribute(key, value) { this[key] = value; } }; }
  };
  const window = {};
  const context = vm.createContext({ document, window, location: { search:query }, URLSearchParams, encodeURIComponent });
  vm.runInContext(config, context);
  if (flags) flags(window.SP_LOJAS);
  vm.runInContext(inline, context);
  return { web, links: choices.links };
}
const production = load('?t=' + productionId);
assert.equal(production.web.href, '/#tournaments/' + productionId);
assert.equal(production.links.length, 2);
assert.deepEqual(production.links.map(link => link.child.src), ['/assets/badge-app-store.svg', '/assets/badge-google-play.png']);
assert.equal(load('?t=sb_' + productionId).web.href, '/', 'sandbox não é divulgado por QR público');
assert.equal(load('?t=<script>').web.href, '/', 'ID inválido não altera URL');
assert.equal(load('?t=' + productionId, lojas => { lojas.play.on = false; }).links.length, 1,
  'ficha desligada some da escolha');
assert.equal(load('?t=' + productionId, lojas => { lojas.apple.selo = false; }).links.length, 1,
  'selo desligado some da escolha');
assert.match(html, /@media\(prefers-color-scheme:light\)/);
function luminance(hex) {
  const c = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); }
for (const [text, background] of [['#f8fafc','#10243a'],['#d6e6f2','#10243a'],['#0b2133','#ffffff'],['#344d60','#ffffff'],['#f8fafc','#10344b'],['#082c40','#e5f7fb']]) {
  assert.ok(contrast(text, background) >= 4.5, `contraste ${text}/${background}`);
}
const vite = fs.readFileSync(path.join(root, 'vite.config.mjs'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(vite, /join\(ROOT, 'open\.html'\)/);
for (const asset of ['/open.html', '/js/lojas-config.js', '/js/domain/next-match.js']) assert.ok(sw.includes(`'${asset}'`), `pré-cache ${asset}`);
console.log('✓ página do QR: destinos, flags, sandbox, contraste e pré-cache');
