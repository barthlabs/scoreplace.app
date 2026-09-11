'use strict';
// L7: snapshots de preparação são somente UI. O cliente não pode restaurar
// participantes no Firestore antes de pedir o sorteio canônico à Function.
const fs=require('fs');let bad=0;const ok=(v,m)=>{console.log((v?'✓ ':'✗ ')+m);if(!v)bad++;};
const src=fs.readFileSync('js/views/tournaments-draw.js','utf8');
const a=src.indexOf('window.generateDrawFunction = function'),b=src.indexOf('// Build nextMatchId links',a),part=src.slice(a,b);
ok(/delete window\._drawPrepSnapshots/.test(part),'prévia de preparação é descartada após a decisão de UI');
ok(!/AppStore\.mutate\(String\(tId\)/.test(part) && !/_prepSnap\.participants|_prepSnap\.waitlist|_prepSnap\.teamOrigins/.test(part),'cliente não restaura elenco antes do sorteio');
ok(/_callDrawRound\(\{ tournamentId: String\(tId\), allowRedraw: _redraw, decisions: _decisions \}\)/.test(part),'cliente envia apenas a intenção declarativa ao drawRound');
process.exitCode=bad?1:0;
