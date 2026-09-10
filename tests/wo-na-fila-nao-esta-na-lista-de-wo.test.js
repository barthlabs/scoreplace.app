/* A fila e o W.O. são estados mutuamente exclusivos quando a vaga foi preenchida. */
'use strict';
const { applyLigaAvailability } = require('../functions/liga-availability-core');
const win = require('../functions-autodraw/draw-core')._window;
let pass=0,fail=0;const ok=(v,m)=>{if(v){pass++;console.log('  ✓ '+m);}else{fail++;console.error('  ✗ '+m);}};
function mk(filled){return {participants:[{uid:'u-carol',displayName:'Carol',ligaActive:false,woDeactivatedAt:'2026-08-24T11:00:00Z'},{uid:'u-ina',displayName:'Ina',ligaActive:false}],standbyParticipants:[],waitlist:[],monarchWaitlist:{},rounds:[{monarchGroups:[{playersUids:filled?['u-sub']:['u-carol'],players:filled?['Sub']:['Carol'],woAbsent:'Carol',woAbsentUid:'u-carol',subStatus:filled?'filled':undefined}],matches:[{id:'wo',isSitOut:true,sitOutReason:'wo',p1Uid:'u-carol'},{id:'ina',isSitOut:true,sitOutReason:'inactive',p1Uid:'u-ina'}]}]};}
console.log('──── quem está na fila não está na lista de W.O. ────');
let t=mk(true);applyLigaAvailability(t,'u-carol',true,win);
ok(t.standbyParticipants.some(p=>p.uid==='u-carol'),'reativar depois do W.O. leva à lista de espera');
ok(!t.rounds[0].matches.some(m=>m.id==='wo'),'e o marcador de W.O. sai quando a vaga foi preenchida');
ok(t.rounds[0].monarchGroups[0].woAbsentUid==='u-carol'&&t.rounds[0].monarchGroups[0].subStatus==='filled','o histórico do grupo é preservado');
ok(t.rounds[0].matches.some(m=>m.id==='ina'),'a folga de outra inativa não é removida');
t=mk(false);applyLigaAvailability(t,'u-carol',true,win);
ok(t.rounds[0].matches.some(m=>m.id==='wo'),'com vaga aberta o marcador W.O. continua para registrar a rodada');
console.log('  '+pass+' ok, '+fail+' falha(s)');if(fail)process.exit(1);
