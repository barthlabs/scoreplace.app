'use strict';
const fs=require('fs');let bad=0;const ok=(v,m)=>{console.log((v?'✓ ':'✗ ')+m);if(!v)bad++;};
const ui=fs.readFileSync('js/views/tournaments-draw.js','utf8'),a=ui.indexOf('window._undoMergeParticipant = function'),b=ui.indexOf('/**\n * v1.8.1-beta',a),part=ui.slice(a,b);
ok(/_callFn\('undoTournamentParticipantMerge'/.test(part),'cliente apenas despacha o desfazimento da mesclagem');
ok(!/commitTournamentTx|AppStore\.mutate|_applyUndoParticipantMergeFresh\(t, personName/.test(part),'cliente não altera participante nem chave antes da confirmação');
const fn=fs.readFileSync('functions-autodraw/index.js','utf8'),x=fn.indexOf('exports.undoTournamentParticipantMerge'),y=fn.indexOf('// ─── Integração de TARDIOS',x),srv=fn.slice(x,y);
ok(/db\.runTransaction/.test(srv)&&/_leTorneio/.test(srv)&&/_gravaTorneio/.test(srv),'Function lê e grava a mesclagem em transação');
ok(/_isTournamentAdmin/.test(srv)&&/_applyUndoParticipantMergeFresh/.test(srv),'Function autoriza e executa o motor canônico');
process.exitCode=bad?1:0;
