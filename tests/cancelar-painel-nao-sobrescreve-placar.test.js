const fs=require('fs'),src=fs.readFileSync('js/views/tournaments-draw-prep.js','utf8');
let fail=0;
function ok(v,m){if(v)console.log('✓ '+m);else{fail++;console.error('✗ '+m)}}
const lateA=src.indexOf('window._lateConfrontosCancel = function'),lateB=src.indexOf('overlay.innerHTML =',lateA),late=src.slice(lateA,lateB);
const p2A=src.indexOf('window._cancelPowerOf2Panel = function'),p2B=src.indexOf('// (Check-in functions moved',p2A),p2=src.slice(p2A,p2B);
ok(/window\._cancelDrawResolution\(tId\)/.test(late),'cancelar confrontos tardios delega ao recibo canônico');
ok(/window\._cancelDrawResolution\(tId\)/.test(p2),'cancelar potência de 2 delega ao recibo canônico');
ok(!/AppStore\.(?:mutate|commitTournamentTx|sync)\s*\(/.test(late+p2),'cancelamentos legados não escrevem nem sincronizam no navegador');
if(fail)process.exit(1);
