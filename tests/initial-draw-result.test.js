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
  font:'', fillStyle:'', fillRect(...args) { calls.push(['rect', ...args, this.fillStyle]); },
  fillText(...args) { calls.push(['text', ...args, this.textAlign, this.fillStyle]); },
  drawImage(...args) { calls.push(['logo', ...args]); },
  measureText(value) { return { width:String(value).length * 11 }; },
  createLinearGradient(...args) { calls.push(['gradient-line', ...args]); return { addColorStop(stop, color) { calls.push(['gradient', stop, color]); } }; }
};
let downloaded = false;
const canvases = [];
function makeCanvas() {
  const canvas = { width:0, height:0, getContext() { return context2d; },
    toDataURL() { return 'data:image/jpeg;base64,AAAA'; } };
  canvases.push(canvas);
  return canvas;
}
const link = { click() { downloaded = true; }, remove() {} };
const notices = [];
const window = { _groupName(index) { return 'Grupo ' + String.fromCharCode(65 + index); },
  showNotification(...args) { notices.push(args); },
  _tourLogoSrc(t) { return t.logoUrl || t.logoData || ''; } };
class FakeImage {
  constructor() { this.naturalWidth = 100; this.naturalHeight = 50; }
  set src(value) { this.source = value; this.onload(); }
}
let pdfBlob;
const sandbox = { window, Blob, TextEncoder, Uint8Array, atob, Image:FakeImage, setTimeout() {}, clearTimeout() {},
  URL:{ createObjectURL(blob) { pdfBlob = blob; return 'blob:pdf'; }, revokeObjectURL() {} },
  document:{ createElement(tag) { return tag === 'canvas' ? makeCanvas() : link; }, body:{ appendChild() {} } } };
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);
vm.runInContext(source.slice(end, endPublished), sandbox);

(async function () {
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
assert.deepStrictEqual(Array.from(model.categories[0].groups[0].matches[0].onePlayers), ['Fem Diamante atleta 1a', 'Fem Diamante atleta 1b']);
assert.deepStrictEqual(Array.from(model.categories[0].groups[0].matches[0].twoPlayers), ['Fem Diamante atleta 1c', 'Fem Diamante atleta 1d']);
assert((await window._downloadInitialDrawPdf({ name:'Camis no Beyond', coverColor:'#ab301e', coverGradientColor:'#f2d7cb', coverGradientEnabled:true,
  logoData:'data:image/png;base64,AAAA' }, draft)).url);
assert(downloaded);
assert.strictEqual(link.download, 'resultado-sorteio-camis-no-beyond.pdf');
assert.strictEqual(pdfBlob.type, 'application/pdf');
assert.strictEqual(canvases.length, 3, 'as três categorias entram no mesmo PDF');
assert(canvases.every(c => c.width === 1500 && c.height > 500));
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo A1'));
assert(calls.some(c => c[0] === 'text' && String(c[1]).includes('atleta 3d')));
assert(calls.some(c => c[0] === 'gradient' && c[2] === '#ab301e'), 'o PDF usa a primeira cor exata do torneio');
assert(calls.some(c => c[0] === 'gradient' && c[2] === '#f2d7cb'), 'o PDF usa a segunda cor exata do torneio');
assert.strictEqual(calls.filter(c => c[0] === 'logo').length, 3, 'o logo transparente aparece em todas as páginas sem moldura');
assert(calls.filter(c => c[0] === 'logo').every(c => c[4] > 82 && Math.abs(c[2] + c[4] - 1452) < .01 && c[3] >= 0 && c[3] + c[5] <= 170),
  'logo maior, na direita dos cards e dentro do cabeçalho em todas as páginas');
const headerTitle = calls.find(c => c[0] === 'text' && c[1] === 'Camis no Beyond');
const headerResult = calls.find(c => c[0] === 'text' && String(c[1]).startsWith('RESULTADO DO SORTEIO'));
assert(headerTitle && headerResult && headerTitle[2] === 48 && headerResult[2] === 48,
  'título e resultado permanecem alinhados à esquerda');
assert([headerTitle, headerResult].every(c => c[2] + c[4] <= 1320 - 28),
  'o texto do cabeçalho reserva espaço para o logo maior');
const athlete1a = calls.find(c => c[0] === 'text' && String(c[1]).includes('atleta 1a'));
const athlete1b = calls.find(c => c[0] === 'text' && String(c[1]).includes('atleta 1b'));
const athlete1c = calls.find(c => c[0] === 'text' && String(c[1]).includes('atleta 1c'));
assert(athlete1a && athlete1b && athlete1c && athlete1b[3] > athlete1a[3] && athlete1c[2] > athlete1a[2], 'arte: parceira abaixo e adversárias à direita');
assert.strictEqual(athlete1c[2] - athlete1a[2], 600, 'a coluna da direita fica afastada do ×');
assert.strictEqual(athlete1c[5], 'right', 'nomes da direita alinhados à borda direita do card');
assert(!calls.some(c => c[0] === 'text' && String(c[1]).includes('placar')));
calls.length = 0;
window._initialDrawPdfPage({ name:'Camis no Beyond', coverColor:'#000000', coverGradientColor:'#242424',
  coverGradientEnabled:true, coverGradientAngle:135, coverGradientBalance:60, coverGradientBlend:20,
  titleColor:'#FBFBFB', brandColor:'#FFBD4C' }, model.categories[0], model.categories[0].groups, [], 1, 1, null);
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo A1' && c[5] === '#FFBD4C'), 'os destaques usam o amarelo C6 do torneio');
assert(calls.some(c => c[0] === 'gradient' && c[2] === '#000000'), 'o fundo C6 começa em preto');
assert(calls.some(c => c[0] === 'gradient' && c[1] === .5 && c[2] === '#000000'), 'o início da mistura segue a proporção e largura configuradas');
assert(calls.some(c => c[0] === 'gradient' && c[1] === .7 && c[2] === '#242424'), 'o fim da mistura segue a proporção e largura configuradas');
assert(calls.some(c => c[0] === 'gradient-line' && c[1] < c[3] && c[2] < c[4]), 'o ângulo de 135° vai do canto superior esquerdo ao inferior direito');
assert(calls.some(c => c[0] === 'rect' && c[1] === 48 && c[5] === '#1f1f1f'), 'os cards mantêm a cor original');
assert(calls.some(c => c[0] === 'text' && c[1] === 'Página 1 de 1' && c[5] === '#ffffff'), 'o número da página continua legível sobre fundo escuro');
calls.length = 0;
window._initialDrawPdfPage({ name:'Camis no Beyond', coverColor:'#000000', coverGradientColor:'#ffffff',
  coverGradientEnabled:true, coverGradientAngle:135, coverGradientBalance:50, coverGradientBlend:30,
  titleColor:'#FBFBFB', brandColor:'#FFBD4C' }, model.categories[0], model.categories[0].groups, [], 1, 1, null);
assert(calls.some(c => c[0] === 'text' && c[1] === 'Página 1 de 1' && c[5] === '#000000'), 'o número da página é preto quando o gradiente deixa o rodapé branco');
const published = window._publishedInitialDrawData({ matches:draft.draft.matches, competitionTeams:[] });
assert(published && published.draft.matches.length === 9);
let visibleResult;
const closeResult = {};
const originalDocument = sandbox.document;
sandbox.document = {
  getElementById() { return null; },
  createElement() { return { querySelector() { return closeResult; }, querySelectorAll() { return []; } }; },
  body:{ appendChild(node) { visibleResult = node; } }
};
window._findTournamentById = () => ({ id:'camis', matches:draft.draft.matches, competitionTeams:[] });
window._openPublishedInitialDrawResult('camis');
assert(visibleResult.className.split(/\s+/).includes('active'), 'resultado publicado precisa ser visível e clicável');
assert(visibleResult.innerHTML.includes('Grupo A1'), 'o modal visível contém os confrontos publicados');
sandbox.document = originalDocument;
const publishedHtml = window._renderPendingDrawPreview({ id:'published:camis', pendingDraw:published });
assert(publishedHtml.includes('Grupo A1') && publishedHtml.includes('Grupo A2') && publishedHtml.includes('Grupo A3'));
assert(publishedHtml.includes('<span class="sp-draw-player">Fem Diamante atleta 1a</span><span class="sp-draw-player">Fem Diamante atleta 1b</span>'));
assert(publishedHtml.includes('<span class="sp-draw-player">Fem Diamante atleta 1c</span><span class="sp-draw-player">Fem Diamante atleta 1d</span>'));
assert.strictEqual((publishedHtml.match(/data-draw-pdf/g) || []).length, 1, 'há um botão para o PDF completo');
assert(!publishedHtml.includes('Arte PNG'));
assert(!publishedHtml.includes('placar'));
const manyGroups = { kind:'initial', draft:{ matches:[] } };
for (let group = 0; group < 5; group++) for (let game = 1; game <= 3; game++) {
  manyGroups.draft.matches.push({ id:`g${group}-j${game}`, category:'Fem Ouro', isMonarch:true,
    monarchGroup:group, round:1, label:`R1 Grupo ${String.fromCharCode(65 + group)} • Jogo ${game}`,
    team1:[`Atleta ${group}A`, `Atleta ${group}B`], team2:[`Atleta ${group}C`, `Atleta ${group}D`] });
}
const manyHtml = window._renderPendingDrawPreview({ id:'many', pendingDraw:manyGroups });
assert.strictEqual((manyHtml.match(/data-draw-pdf/g) || []).length, 1);
calls.length = 0;
const countBefore = canvases.length;
assert((await window._downloadInitialDrawPdf({ name:'Torneio' }, manyGroups)).url);
assert.strictEqual(link.download, 'resultado-sorteio-torneio.pdf');
assert.strictEqual(canvases.length - countBefore, 2, 'cinco grupos formam duas páginas no mesmo arquivo');
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo E'));
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo A'));
const bytes = await pdfBlob.arrayBuffer();
  const pdf = Buffer.from(bytes).toString('latin1');
  assert(pdf.startsWith('%PDF-1.4'));
  assert(pdf.includes('/Count 2'), 'o PDF contém as duas páginas');
  assert(pdf.includes('xref\n0 9\n'), 'o índice contém todos os objetos');
  sandbox.Image = class BrokenImage { set src(_value) { this.onerror(); } };
  downloaded = false;
  assert((await window._downloadInitialDrawPdf({ name:'Torneio', logoUrl:'https://example.test/logo.png' }, manyGroups)).url,
    'falha do logo não impede baixar o resultado');
  assert(downloaded, 'o PDF é baixado mesmo sem logo');
  assert(notices.some(n => n[0] === 'Logo não carregado'), 'a ausência do logo é informada');
  const originalBlob = window._initialDrawPdfBlob;
  window._initialDrawPdfBlob = () => { throw new Error('pdf'); };
  assert.strictEqual(await window._downloadInitialDrawPdf({ name:'Torneio' }, manyGroups), false);
  assert(notices.some(n => n[0] === 'Erro ao gerar PDF'), 'falha do PDF aparece na tela');
  window._initialDrawPdfBlob = originalBlob;
  console.log('Resultado do sorteio: grupos, ordem e PDF único OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
