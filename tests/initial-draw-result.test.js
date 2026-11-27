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
  _documentGenerationStamp() { return 'Gerado em 27/11/2026 às 12:04:05 (Brasília)'; },
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
assert.strictEqual(link.download, 'resultado-sorteio-camis-no-beyond-com-horarios.pdf');
assert.strictEqual(pdfBlob.type, 'application/pdf');
assert.strictEqual(canvases.length, 3, 'as três categorias entram no mesmo PDF');
assert(canvases.every(c => c.width === 1500 && c.height > 500));
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo A1'));
assert.strictEqual(calls.filter(c => c[0] === 'text' && c[1] === 'Gerado em 27/11/2026 às 12:04:05 (Brasília)').length,
  3, 'todas as páginas do resultado recebem a mesma chancela');
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
calls.length = 0;
window._initialDrawPdfPage({ name:'CULT. Sol & Saque', coverColor:'#ffffff', coverGradientEnabled:false,
  titleColor:'#ffffff', brandColor:'#ffffff' }, model.categories[0], model.categories[0].groups, [], 1, 1, null);
assert(calls.some(c => c[0] === 'rect' && c[5] === '#ffffff'), 'cartão claro mantém a cor de fundo configurada');
assert(calls.some(c => c[0] === 'text' && c[1] === 'Grupo A1' && c[5] === '#334155'), 'título do grupo tem contraste sobre cartão claro');
assert(calls.some(c => c[0] === 'text' && String(c[1]).includes('atleta 1a') && c[6] === '#172033'), 'nomes ficam legíveis sobre cartão claro');
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
assert.strictEqual((publishedHtml.match(/data-draw-pdf/g) || []).length, 2, 'duas versões do resultado');
assert(!publishedHtml.includes('Arte PNG'));
assert(!publishedHtml.includes('placar'));
const manyGroups = { kind:'initial', draft:{ matches:[] } };
for (let group = 0; group < 5; group++) for (let game = 1; game <= 3; game++) {
  manyGroups.draft.matches.push({ id:`g${group}-j${game}`, category:'Fem Ouro', isMonarch:true,
    monarchGroup:group, round:1, label:`R1 Grupo ${String.fromCharCode(65 + group)} • Jogo ${game}`,
    team1:[`Atleta ${group}A`, `Atleta ${group}B`], team2:[`Atleta ${group}C`, `Atleta ${group}D`] });
}
const manyHtml = window._renderPendingDrawPreview({ id:'many', pendingDraw:manyGroups });
assert.strictEqual((manyHtml.match(/data-draw-pdf/g) || []).length, 2);
calls.length = 0;
const countBefore = canvases.length;
assert((await window._downloadInitialDrawPdf({ name:'Torneio' }, manyGroups)).url);
assert.strictEqual(link.download, 'resultado-sorteio-torneio-com-horarios.pdf');
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
  // A identidade global deve vir do mesmo helper da classificação/TV.
  const bracketSource=fs.readFileSync(path.join(__dirname,'../js/views/bracket.js'),'utf8');
  const groupStart=bracketSource.indexOf('window._super8StandingsGroups = function (t, sourceMatches)');
  const groupEnd=bracketSource.indexOf('// ── Rei/Rainha da Praia Rendering',groupStart);
  assert(groupStart>=0&&groupEnd>groupStart,'assinatura real do helper central');
  vm.runInContext(bracketSource.slice(groupStart,groupEnd),sandbox);
  const rows=[['A','Categoria B',0],['B','Categoria B',1],['C','Categoria C',0],['D','Categoria C',1],['E','Categoria C',2],['F','Categoria C',3]];
  const official={id:'synthetic-official',name:'Conferência',combinedCategories:['Categoria B','Categoria C'],matches:[],
    phases:[{kind:'classification',classification:{partnerRotation:'groups',rotationCategoryRules:['Categoria B','Categoria C'].map(category=>({category,groupFormation:{mode:'size',value:8}}))}}],
    scheduleWindow:{interleavedPlan:{groupAssignments:rows.map(([label,category,idx])=>({label,category,phaseIndex:0,groupNumber:idx+1}))}}};
  for(const [label,category,idx] of rows.slice(2).concat(rows.slice(0,2)))for(let round=1;round<=7;round++)for(let lane=0;lane<2;lane++){
    const players=Array.from({length:4},(_,i)=>label+' Pessoa '+(lane*4+i));
    official.matches.push({id:label+'-'+round+'-'+lane,category,isMonarch:true,phaseIndex:0,groupIdx:idx,monarchGroup:round*2+lane,round,
      groupName:'Grupo '+String.fromCharCode(65+idx),label:'Grupo '+String.fromCharCode(65+idx)+' • Rodada '+round+' • Jogo '+(lane+1),
      team1:players.slice(0,2),team2:players.slice(2),team1SlotIds:players.slice(0,2).map(n=>'manual:'+n),team2SlotIds:players.slice(2).map(n=>'manual:'+n)});
  }
  official._nJogos=84;
  const officialDraft={kind:'initial',draft:{matches:structuredClone(official.matches),rounds:[]}};
  const beforeOfficial=JSON.stringify({official,officialDraft});
  const composition=window._initialDrawGroupsModel(official,officialDraft);
  assert.deepEqual(Array.from(composition.categories,c=>c.name),['Categoria B','Categoria C']);
  assert.deepEqual(Array.from(composition.categories.flatMap(c=>c.groups),g=>g.name),['Grupo A','Grupo B','Grupo C','Grupo D','Grupo E','Grupo F']);
  assert.equal(composition.groupCount,6);assert.equal(composition.playerCount,48);assert.equal(composition.gameCount,84);
  assert(composition.categories.every(c=>c.groups.every(g=>g.players.length===8)));
  const officialHtml=window._renderPendingDrawPreview({...official,pendingDraw:officialDraft});
  assert.equal((officialHtml.match(/data-draw-pdf/g)||[]).length,1);
  assert(!officialHtml.includes('sp-draw-result-match')&&!officialHtml.includes('horários'));
  for(const label of ['A','B','C','D','E','F'])for(let i=0;i<8;i++)assert.equal(officialHtml.split(label+' Pessoa '+i).length-1,1);
  calls.length=0;const countOfficial=canvases.length;
  sandbox.Image=FakeImage;assert((await window._downloadInitialDrawPdf(official,officialDraft)).url);
  assert.equal(link.download,'resultado-sorteio-conferencia-grupos.pdf');assert.equal(canvases.length-countOfficial,2);
  const resultTexts=calls.filter(c=>c[0]==='text').map(c=>String(c[1]));
  assert(!resultTexts.some(x=>/^J\d+$/.test(x)||x==='×'||!x.startsWith('Gerado em ')&&/\d{2}:\d{2}/.test(x)));
  assert.equal(resultTexts.filter(x=>/Pessoa/.test(x)).length,48);
  assert.equal(JSON.stringify({official,officialDraft}),beforeOfficial,'exportação não muda o sorteio');
  const central=window._super8StandingsGroups;delete window._super8StandingsGroups;
  assert.equal(await window._downloadInitialDrawPdf(official,officialDraft),false);
  assert(!window._renderPendingDrawPreview({...official,pendingDraw:officialDraft}).includes('data-draw-pdf'),'ausência do helper falha antes do botão');
  window._super8StandingsGroups=central;
  for(const alter of [
    t=>{t._faltamPesados=true},
    t=>{t.matches=t.matches.slice(1)},
    t=>{t.matches[0].scheduledGroupLabel='Z'},
    t=>{t.matches.forEach(m=>{if(m.category==='Categoria C'&&m.groupIdx===0){m.team1SlotIds=m.team1.map(()=>null);m.team2SlotIds=m.team2.map(()=>null);m.team1=m.team1.map(()=>'Mesmo nome');m.team2=m.team2.map(()=>'Mesmo nome')}})}
  ]){
    const invalid=structuredClone(official);alter(invalid);
    assert.equal(await window._downloadInitialDrawPdf(invalid,{draft:{matches:invalid.matches}}),false);
  }
  const homonyms=structuredClone(official);
  homonyms.matches.forEach(m=>{if(m.groupIdx===0)m.team1[0]='Nome igual'});
  const homonymModel=window._initialDrawGroupsModel(homonyms,{draft:{matches:homonyms.matches}});
  assert.equal(homonymModel.playerCount,48,'pessoas com identidades distintas não somem');
  const genericHomonyms={draft:{matches:[{id:'h1',category:'Categoria X',isMonarch:true,monarchGroup:0,team1:['Nome igual','Pessoa 2'],team2:['Pessoa 3','Pessoa 4']},{id:'h2',category:'Categoria Y',isMonarch:true,monarchGroup:0,team1:['Nome igual','Pessoa 5'],team2:['Pessoa 6','Pessoa 7']}]}};
  assert.equal(window._initialDrawResultModel(genericHomonyms).categories.length,2,'fallback genérico não funde homônimos entre categorias');
  console.log('Composição oficial: helper central real,6grupos48atletas,categorias na ordem,PDF2páginas,recusas e pureza OK.');
  console.log('Resultado do sorteio: grupos, ordem e PDF único OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
