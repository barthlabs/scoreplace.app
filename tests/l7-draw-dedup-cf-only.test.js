'use strict';
const fs=require('fs');let bad=0;const ok=(v,m)=>{console.log((v?'✓ ':'✗ ')+m);if(!v)bad++;};
const ui=fs.readFileSync('js/views/tournaments-draw.js','utf8'),a=ui.indexOf('window.generateDrawFunction'),b=ui.indexOf('// Build nextMatchId links',a),part=ui.slice(a,b);
ok(!/commitTournamentTx\(tId, function\(ft\).*_deduplicateParticipants/s.test(part),'cliente não persiste a deduplicação antes do sorteio');
ok(/duplicatesRemoved/.test(part),'cliente só apresenta a contagem devolvida pela Function');
const fn=fs.readFileSync('functions-autodraw/index.js','utf8'),a2=fn.indexOf('exports.drawRound'),b2=fn.indexOf('// ─── Rodada extra manual',a2),srv=fn.slice(a2,b2);
ok(/_deduplicateParticipants\(t\)/.test(srv)&&/duplicatesRemoved/.test(srv),'drawRound deduplica o documento fresco e devolve a contagem');
ok(/db\.runTransaction/.test(srv)&&/_gravaTorneio/.test(srv),'deduplicação e sorteio compartilham a mesma transação');
process.exitCode=bad?1:0;
