'use strict';
const fs=require('fs');let bad=0;const ok=(v,m)=>{console.log((v?'✓ ':'✗ ')+m);if(!v)bad++;};
const ui=fs.readFileSync('js/views/tournaments-draw.js','utf8'),a=ui.indexOf('window._resetTournamentToEnrollment = function'),b=ui.indexOf('// v2.7.62:',a),part=ui.slice(a,b);
ok(/_callFn\('resetTournamentToEnrollment'/.test(part),'cliente só despacha o reset confirmado');
ok(!/AppStore\.mutate|commitTournamentTx|_clearTournamentDraw\(ft\)/.test(part),'cliente não limpa nem persiste o torneio');
const fn=fs.readFileSync('functions-autodraw/index.js','utf8'),x=fn.indexOf('exports.resetTournamentToEnrollment'),y=fn.indexOf('// ─── Rodada extra manual',x),srv=fn.slice(x,y);
ok(/db\.runTransaction/.test(srv)&&/_leTorneio/.test(srv)&&/_gravaTorneio/.test(srv),'Function reseta o documento fresco em transação');
ok(/_isTournamentAdmin/.test(srv)&&/_clearTournamentDraw/.test(srv)&&/drawFirstDate/.test(srv),'Function autoriza, usa limpeza canônica e reagenda auto-draw vencido');
process.exitCode=bad?1:0;
