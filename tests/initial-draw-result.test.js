const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../js/views/bracket-logic.js'), 'utf8');
const start = source.indexOf('window._initialDrawResultModel = function');
const end = source.indexOf('window._renderPendingDrawPreview = function', start);
const endPublished = source.indexOf('// Agenda antes da publicação:', end);
assert(start >= 0 && end > start && endPublished > end);

const calls = [];
const context2d = {
  font:'', fillStyle:'', fillRect(...args) { calls.push(['rect', ...args]); },
  fillText(...args) { calls.push(['text', ...args]); },
  measureText(value) { return { width:String(value).length * 11 }; }
};
let downloaded = false;
const canvas = { width:0, height:0, getContext() { return context2d; }, toDataURL() { return 'data:image/png;base64,AAAA'; } };
const link = { click() { downloaded = true; }, remove() {} };
const window = { _groupName(index) { return 'Grupo ' + String.fromCharCode(65 + index); } };
const sandbox = { window, document:{ createElement(tag) { return tag === 'canvas' ? canvas : link; }, body:{ appendChild() {} } } };
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);
vm.runInContext(source.slice(end, endPublished), sandbox);

const draft = { draft:{ matches:[] } };
for (const [category, group] of [['Fem Diamante', 'A'], ['Fem Ouro', 'A'], ['Fem Prata', 'A']]) {
  for (const n of [3, 1, 2]) draft.draft.matches.push({
    id:category + n, category, isMonarch:true, monarchGroup:0, round:1,
    label:`R1 Grupo ${group} • Jogo ${n} (${category})`,
    team1:[`${category} atleta ${n}a`, `${category} atleta ${n}b`],
    team2:[`${category} atleta ${n}c`, `${category} atleta ${n}d`]
  });
}
const model = window._initialDrawResultModel(draft);
assert.strictEqual(model.gameCount, 9);
assert.strictEqual(model.categories.length, 3);
assert.deepStrictEqual(Array.from(model.categories, c => c.groups[0].name), ['Grupo A1', 'Grupo A2', 'Grupo A3']);
assert.deepStrictEqual(Array.from(model.categories[0].groups[0].matches, m => m.number), [1, 2, 3]);
assert.strictEqual(window._downloadInitialDrawArt({ name:'Camis no Beyond' }, draft, 0), true);
assert(downloaded);
assert.strictEqual(link.download, 'resultado-sorteio-fem-diamante.png');
assert(canvas.width === 1500 && canvas.height > 500);
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo A1'));
assert(calls.some(c => c[0] === 'text' && String(c[1]).includes('atleta 3d')));
assert(!calls.some(c => c[0] === 'text' && String(c[1]).includes('placar')));
const published = window._publishedInitialDrawData({ matches:draft.draft.matches, competitionTeams:[] });
assert(published && published.draft.matches.length === 9);
const publishedHtml = window._renderPendingDrawPreview({ id:'published:camis', pendingDraw:published });
assert(publishedHtml.includes('Grupo A1') && publishedHtml.includes('Grupo A2') && publishedHtml.includes('Grupo A3'));
assert(publishedHtml.includes('Arte PNG'));
assert(!publishedHtml.includes('placar'));
const manyGroups = { kind:'initial', draft:{ matches:[] } };
for (let group = 0; group < 5; group++) for (let game = 1; game <= 3; game++) {
  manyGroups.draft.matches.push({ id:`g${group}-j${game}`, category:'Fem Ouro', isMonarch:true,
    monarchGroup:group, round:1, label:`R1 Grupo ${String.fromCharCode(65 + group)} • Jogo ${game}`,
    team1:[`Atleta ${group}A`, `Atleta ${group}B`], team2:[`Atleta ${group}C`, `Atleta ${group}D`] });
}
const manyHtml = window._renderPendingDrawPreview({ id:'many', pendingDraw:manyGroups });
assert(manyHtml.includes('Arte PNG 1/2') && manyHtml.includes('Arte PNG 2/2'));
calls.length = 0;
assert.strictEqual(window._downloadInitialDrawArt({ name:'Torneio' }, manyGroups, 0, 1), true);
assert.strictEqual(link.download, 'resultado-sorteio-fem-ouro-2-de-2.png');
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo E'));
assert(!calls.some(c => c[0] === 'text' && c[1] === 'Grupo A'));
console.log('Resultado do sorteio: grupos, ordem e PNG OK');
