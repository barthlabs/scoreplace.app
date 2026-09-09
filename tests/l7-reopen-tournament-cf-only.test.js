'use strict';
const fs=require('fs');let f=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const fn=fs.readFileSync('functions-autodraw/index.js','utf8');const c=fn.slice(fn.indexOf('exports.reopenTournament'),fn.indexOf('// ─── Entrada tardia',fn.indexOf('exports.reopenTournament')));
ok(c.includes('db.runTransaction')&&c.includes('_isTournamentAdmin')&&c.includes('autoClosedAt'),'reabertura valida organização e limpa o fechamento no servidor');
const ui=fs.readFileSync('js/views/tournaments-organizer.js','utf8');const start=ui.indexOf('window._reopenAbandonedTournament');const b=ui.slice(start,ui.indexOf('\n};',start)+4);
ok(b.includes("_callCF('reopenTournament'")&&!b.includes('AppStore.mutate(tId'),'tela de reabertura apenas despacha a intenção');
process.exit(f?1:0);
