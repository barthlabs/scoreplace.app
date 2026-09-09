'use strict';
const fs=require('fs'); let f=0; const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const fn=fs.readFileSync('functions-autodraw/index.js','utf8');
for (const name of ['setTournamentBranding','setTournamentFlyerPrefs']) {
  const start=fn.indexOf('exports.'+name); const end=fn.indexOf('\nexports.',start+8); const part=fn.slice(start,end<0?fn.length:end);
  ok(start>=0&&part.includes('db.runTransaction')&&part.includes('_isTournamentAdmin')&&part.includes('_gravaTorneio'),name+' é comando administrativo estreito e transacional');
}
const ui=fs.readFileSync('js/views/tournaments-sharing.js','utf8');
const logo=ui.slice(ui.indexOf('window._editTournamentLogoFromDetail'),ui.indexOf('// Abre a modal de detalhe',ui.indexOf('window._editTournamentLogoFromDetail')));
ok(logo.includes("_callCF('setTournamentBranding'")&&!logo.includes('saveTournament(t'),'logo só despacha a Function');
const flyer=ui.slice(ui.indexOf('window._flyerPersistPrefs'),ui.indexOf('// Fecha o diálogo',ui.indexOf('window._flyerPersistPrefs')));
ok(flyer.includes("_callCF('setTournamentFlyerPrefs'")&&!flyer.includes('saveTournament(t'),'preferências do flyer só despacham a Function');
process.exit(f?1:0);
