'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/views/tournaments.js'), 'utf8');
const start = source.indexOf('const calendarDateHtml = (content) => {');
const end = source.indexOf('\n        };', start);
assert(start > 0 && end > start, 'gatilho da data deve existir no detalhe');

function render(options = {}) {
  const context = {
    tournamentId: options.tournamentId === undefined ? 'tour-1' : options.tournamentId,
    isFinished: !!options.isFinished,
    t: { id: 'tour-1', name: 'Camis & Dia', startDate: options.startDate === undefined ? '2026-11-13T08:00' : options.startDate },
    window: { _safeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); } },
  };
  return vm.runInNewContext(source.slice(start, end + '\n        };'.length) + '\ncalendarDateHtml', context)('<span>13 NOV</span>');
}

const active = render();
assert.match(active, /role="button" tabindex="0"/);
assert.match(active, /aria-label="Adicionar Camis &amp; Dia à agenda"/);
assert.match(active, /_tournamentAddToCalendar\(this\.dataset\.tournamentId\)/);
assert.match(active, /event\.key==='Enter'\|\|event\.key===' '/);
assert.match(active, /event\.preventDefault\(\);event\.stopPropagation\(\)/);
assert.equal(render({ isFinished: true }), '<span>13 NOV</span>');
assert.equal(render({ startDate: '' }), '<span>13 NOV</span>');
assert.equal(render({ tournamentId: '' }), '<span>13 NOV</span>', 'dashboard não recebe gatilho');
assert(source.includes('calendarDateHtml(dateCardHtml)'), 'card principal tem gatilho');
assert(source.includes('calendarDateHtml(`<div style='), 'data alternativa tem gatilho');
assert(!source.includes('📅 Adicionar à agenda</button>'), 'botão duplicado removido');
assert(source.includes("window._devWhatsAppBtnHtml({ twoLine: true, extra: 'min-height:44px"), 'contato compacto conserva alvo');
console.log('✓ data do torneio abre agenda no card ou no fallback, com teclado e estados corretos');
