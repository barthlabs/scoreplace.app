'use strict';
const fs=require('fs');let f=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const fn=fs.readFileSync('functions-autodraw/index.js','utf8');
function part(name,next){const a=fn.indexOf('exports.'+name);const b=next?fn.indexOf('exports.'+next,a):fn.length;return a<0?'':fn.slice(a,b);}
const start=part('startTournament','resetTournamentCheckIn'), reset=part('resetTournamentCheckIn','setDefaultTournamentScoring');
ok(start.includes('db.runTransaction')&&start.includes('_isTournamentAdmin')&&start.includes("t.status = 'in_progress'")&&start.includes('t.tournamentStarted')&&start.includes("timeZone:'America/Sao_Paulo'"),'início é autorizado e gravado pelo servidor em transação com data civil BRT');
ok(reset.includes('db.runTransaction')&&reset.includes('_isTournamentAdmin')&&reset.includes('t.checkedIn = {}; t.absent = {}; t.checkedInConfirmed = {};'),'limpeza de chamada é autorizada e gravada pelo servidor em transação');
const ui=fs.readFileSync('js/views/participants.js','utf8');
const rs=ui.slice(ui.indexOf('window._resetCheckIn'),ui.indexOf('// ════════════════════════════════════════════════════════════════════════════',ui.indexOf('window._resetCheckIn')));
const ss=ui.slice(ui.indexOf('window._startTournament'),ui.indexOf('window._setCheckInFilter',ui.indexOf('window._startTournament')));
ok(rs.includes("_callCF('resetTournamentCheckIn'")&&!rs.includes('AppStore.mutate'),'limpar chamada só despacha a Function');
ok(ss.includes("_callCF('startTournament'")&&!ss.includes('AppStore.mutate'),'iniciar torneio só despacha a Function');
process.exit(f?1:0);
