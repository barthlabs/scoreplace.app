'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cut = require('./recorte.js');
const root = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const report = fs.readFileSync(path.join(root, 'js/views/tournaments-enrollment-report.js'), 'utf8');
let count = 0;
function ok(value, why) { assert.ok(value, why); count++; }
function extract(src, marker) { const at = src.indexOf(marker); assert.ok(at >= 0, marker); return cut.ateOFim(src, at); }

const callbacks = [], bars = [], indices = [], empties = [], optsSeen = [];
function element(tid, instance, external) {
  const el = { parentNode: { removeChild(node) { node.parentNode = null; } },
    getAttribute(k) { return k === 'data-bracket-bar-tid' ? tid : k === 'data-bracket-bar-instance' ? instance : ''; },
    closest() { return external ? null : {}; } };
  return el;
}
const document = { querySelectorAll(sel) {
  const list = sel === '#fbwrap-chaves' ? bars : sel === '#bracket-competitor-index' ? indices : empties;
  return list.filter(e => e.parentNode);
} };
const context = { window: null, document, setTimeout(fn) { callbacks.push(fn); } };
context.window = context;
context._filterBarState = {};
context._inscritosFilterBar = (opts) => { optsSeen.push(opts); return '<div id="fbwrap-chaves"></div>'; };
context._safeHtml = String;
context._t = (key) => key;
context._bracketApplyFilter = () => {};
vm.createContext(context);
vm.runInContext(extract(store, 'window._bracketBar = function'), context);

const a = { id: 'A', skillCategories: ['Light', 'Power'] };
const b = { id: 'B', skillCategories: ['Extreme'] };
let html = context._bracketBar(a, true);
ok(optsSeen[0].sticky && !optsSeen[0].searchOnly && optsSeen[0].sortId === 'bracket-sort' && optsSeen[0].genderId === 'bracket-gender' && optsSeen[0].skillId === 'bracket-skill', 'chave recebe barra canônica completa');
ok(html.includes('bracket-competitor-index') && html.includes('bracket-search-empty'), 'índice e vazio são irmãos da barra');
ok(context._filterBarState.chaves.sort === 'order-asc', 'primeiro torneio inicia pela ordem de inscrição');
context._filterBarState.chaves.sort = 'name-desc';
context._bracketBar(a, true);
ok(context._filterBarState.chaves.sort === 'name-desc', 'mesmo torneio preserva ordenação escolhida');
html = context._bracketBar(b, true);
ok(context._filterBarState.chaves.sort === 'order-asc' && context._filterBarState.chaves.sortFor === 'B', 'troca de torneio reinicia o estado');
ok(html.includes('data-bracket-bar-tid="B"'), 'emissão marca torneio e instância');
bars.push(element('A', '1', true), element('B', '3', true), element('B', '4', false));
indices.push(element('A', '1', true), element('B', '3', true), element('B', '4', false));
empties.push(element('A', '1', true), element('B', '3', true), element('B', '4', false));
callbacks[0](); callbacks[2](); callbacks[1](); // ordem invertida: render antigo chega depois
ok(bars.filter(e => e.parentNode).length === 1 && bars[1].parentNode, 'só a barra B externa sobrevive a callbacks atrasados');
ok(indices.filter(e => e.parentNode).length === 1 && indices[1].parentNode, 'índice segue a instância da barra');
ok(empties.filter(e => e.parentNode).length === 1 && empties[1].parentNode, 'vazio segue a instância da barra');
context._bracketBar({ id: 'C' }, true);
callbacks[3]();
ok(bars[1].parentNode && bars.filter(e => e.parentNode).length === 1, 'callback sem DOM do torneio novo não remove a barra anterior');
ok(/_bracketBar\(visible\[0\], true\)/.test(tournaments) && /_bracketBar\(t, true\)/.test(bracket), 'ficha inline e fallback passam o torneio correto');
ok(/data-er-gender="/.test(report) && /data-er-skill="/.test(report) && /er-mx-competitor-index/.test(report), 'matriz expõe metadados e índice sem mover chips');
ok(/\[data-bracket-tab-category\]\[hidden\]/.test(fs.readFileSync(path.join(root, 'css/bracket.css'), 'utf8')), 'aba estrutural oculta prevalece sobre display inline');
console.log('✅ barra-global-competidores: ' + count + ' verificações');
