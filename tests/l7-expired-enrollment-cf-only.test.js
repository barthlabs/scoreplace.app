'use strict';
const fs=require('fs');let f=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const fn=fs.readFileSync('functions-autodraw/index.js','utf8');const start=fn.indexOf('exports.closeExpiredEnrollment');const end=fn.indexOf('exports.setTournamentCategoryConfig',start);const a=fn.slice(start,end);
ok(start>=0&&a.includes('db.runTransaction')&&a.includes('_isTournamentAdmin')&&a.includes('registrationLimit')&&a.includes('hasDrawnBracket'),'fechamento por prazo é autorizado e validado pela Function');
const ui=fs.readFileSync('js/views/tournaments.js','utf8');const b=ui.slice(ui.indexOf('// Auto-close: if deadline passed'),ui.indexOf('// Self-heal:',ui.indexOf('// Auto-close: if deadline passed')));
ok(b.includes("_callCF('closeExpiredEnrollment'")&&!b.includes('saveTournament'),'render apenas solicita o fechamento por prazo');
process.exit(f?1:0);
