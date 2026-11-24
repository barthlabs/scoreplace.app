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
const rotation = { enabled:true, mode:'interleaved', mainDurationSeconds:1, slides:[
  { id:'slide', name:'Clube', durationSeconds:3600, assets:[] }] };
const art = 'https://firebasestorage.googleapis.com/v0/b/scoreplace-app.firebasestorage.app/o/tournamentTvArt%2Ftorneio%2Farte.png?alt=media&token=';
const maxURL = art.padEnd(2048,'a');
rotation.slides[0].assets = [maxURL, 'https://storage.googleapis.com/scoreplace-app.firebasestorage.app/tournamentTvArt/torneio/a.gif'];
for (const core of [browser,server,callable]) {
  assert.deepEqual(core.normalizeRotation(rotation,'torneio'),rotation);
  assert.deepEqual(core.normalizeRotation(rotation,'clone',rotation),rotation);
  assert.throws(() => core.normalizeRotation(rotation,'clone'));
  for (const bad of [maxURL+'x', art.replace('https:','http:'),art.replace('googleapis.com','googleapis.com.other.test'),
    art.replace('firebasestorage.app','another.app'),art.replace('torneio','outro'), art.replace('tournamentTvArt','tournaments'),
    art.replace('arte.png','%2e%2e%2Farte.png'),art.replace('.png','.svg'), 'data:image/png;base64,AAA']) {
    assert.throws(() => core.normalizeRotation({...rotation,slides:[{...rotation.slides[0],assets:[bad]}]},'torneio'));
  }
  for (const patch of [{mode:'manual'},{enabled:1},{html:'<b>'},{mainDurationSeconds:0},{mainDurationSeconds:3601},
    {mainDurationSeconds:1.5},{slides:Array(13).fill(rotation.slides[0])},{slides:[rotation.slides[0],rotation.slides[0]]},
    {slides:[{...rotation.slides[0],assets:Array(13).fill(art)}]},
    {slides:Array.from({length:12},(_,i)=>({...rotation.slides[0],id:String(i),assets:Array(12).fill(maxURL)}))}]) {
    assert.throws(() => core.normalizeRotation({...rotation,...patch},'torneio'));
  }
}
const { readArt } = require('../functions-autodraw/tournament-tv-art');
class MediaError extends Error {}
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
for (const [type,header,extension] of [['png',pngSignature,'png'],['jpeg',Buffer.from([255,216,255]),'jpg'],
  ['gif',Buffer.from('GIF89a'),'gif'],['webp',Buffer.from('RIFF1234WEBP'),'webp']]) {
  assert.equal(readArt('data:image/'+type+';base64,'+header.toString('base64'),MediaError).ext,extension);
}
const maxFile = Buffer.alloc(5 * 1024 * 1024);
pngSignature.copy(maxFile);
assert.equal(readArt('data:image/png;base64,'+maxFile.subarray(0,-1).toString('base64'),MediaError).bytes.length,maxFile.length-1);
for(const bad of ['data:image/png;base64,'+maxFile.toString('base64'),'data:image/gif;base64,','data:image/jpeg;base64,'+pngSignature.toString('base64'),
  'data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PHN2Zz4=']) assert.throws(()=>readArt(bad,MediaError));
const original = browser.defaults();
const reordered = { card: Object.fromEntries(Object.entries(original.card).reverse()), sections: Object.fromEntries(Object.entries(original.sections).reverse()), background: '#ABCDEF', version: 1 };
assert.deepEqual(server.normalize(reordered), browser.normalize(reordered), 'browser e servidor usam a mesma ordem canônica');
assert.equal(server.normalize(reordered).background, '#abcdef');
const second = browser.defaults(); second.background = '#123456';
const screens = [{ phaseIndex: 0, layout: original }, { phaseIndex: 1, layout: second }];
assert.deepEqual(server.normalizeScreens(screens), browser.normalizeScreens(screens));
assert.equal(browser.forPhase(screens, 1, original).background, '#123456');
assert.equal(browser.forPhase(screens, 2, original).background, original.background, 'fase sem tela usa o layout anterior');
assert.equal(original.backgroundMode, 'tournament', 'a tela nova acompanha a paleta do torneio');
assert.equal(original.sections.logo.visible, false, 'logo independente começa oculto para preservar telas antigas');
assert.equal(original.sections.qr.visible, true, 'QR começa visível');
const qrHidden = browser.defaults(); qrHidden.sections.qr.visible = false;
assert.equal(browser.normalize(qrHidden).sections.qr.visible, true, 'QR antigo removido volta ao carregar');
const finalLayout = browser.finalsPreset(browser.defaults(), [
  { id: 'gf', bracket: 'gold', round: 3 }, { id: 'gt', bracket: 'gold', round: 3, isThirdPlace: true },
  { id: 'sf', bracket: 'silver', round: 4 }, { id: 'st', bracket: 'silver', round: 4, isThirdPlace: true }
]);
assert.deepEqual(['live1','live2','live3','live4'].map(id => finalLayout.sections[id].source), ['gf','gt','sf','st']);
assert.deepEqual(['standing1','standing2'].map(id => finalLayout.sections[id].source), ['gold','silver']);
assert.equal(finalLayout.sections.courts.visible, false);
assert.equal(finalLayout.sections.qr.visible, true);
const legacy = { ...original, backgroundMode: undefined, sections: { ...original.sections } };
delete legacy.backgroundMode;
delete legacy.sections.logo;
assert.equal(browser.normalize(legacy).sections.logo.visible, false, 'layout salvo antes do controle de logo continua válido');
assert.equal(browser.normalize({ ...legacy, background: '#123456' }).backgroundMode, 'custom', 'fundo manual antigo permanece manual');
assert.deepEqual(browser.snapBox({ x: 48.9, y: 10, w: 20, h: 20 }, [{ x: 50, y: 10, w: 20, h: 20 }], false),
  { x: 50, y: 10, w: 20, h: 20 }, 'arrastar encaixa em borda vizinha');
assert.equal(browser.snapBox({ x: 1, y: 1, w: 98.2, h: 20 }, [], true).w, 99, 'redimensionar encaixa na borda da tela');
assert.throws(() => server.normalizeScreens([screens[0], screens[0]]), 'uma fase não aceita duas telas concorrentes');
assert.throws(() => server.normalizeScreens([{ phaseIndex: 12, layout: original }]));
assert.throws(() => server.normalizeScreens([{ phaseIndex: 1, layout: { ...original, background: 'red' } }]));
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
assert.match(form, /tvScreens: \(typeof window\._tvEditorReadScreens/);
const tv = fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8');
assert.match(tv, /function customBodyHtml/);
assert.match(tv, /snapshot\.tvLayout/);
assert.match(tv, /cardHtml\(card, layout\.card\)/);
console.log('✓ layout TV: esquema fechado, limites, ordem canônica e integração de leitura/gravação');
