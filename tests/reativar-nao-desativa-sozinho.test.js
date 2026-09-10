/* Reativação de Liga é servidor-autoritativa: uma aba não pode restaurar um snapshot. */
'use strict';
const { applyLigaAvailability } = require('../functions/liga-availability-core');
const win = require('../functions-autodraw/draw-core')._window;
let pass=0, fail=0; const ok=(v,m)=>{if(v){pass++;console.log('  ✓ '+m);}else{fail++;console.error('  ✗ '+m);}};
function fixture(){return {id:'T',participants:[{uid:'u-ana',displayName:'Ana',ligaActive:false},{uid:'u-bia',displayName:'Bia',ligaActive:true}],standbyParticipants:[],waitlist:[],monarchWaitlist:{},rounds:[{monarchGroups:[{playersUids:['u-bia'],players:['Bia']}],matches:[{id:'ana-folga',isSitOut:true,sitOutReason:'inactive',p1Uid:'u-ana'},{id:'jogo',p1Uid:'u-bia'}]}]};}
console.log('──── reativar não desativa sozinho ────');
let t=fixture(); applyLigaAvailability(t,'u-ana',true,win);
ok(!t.participants.some(p=>p.uid==='u-ana'),'quem reativa após fase sorteada não volta ao elenco sem grupo');
ok(t.standbyParticipants.filter(p=>p.uid==='u-ana').length===1,'entra uma única vez na lista de espera');
ok(t.standbyParticipants[0].ligaActive===true,'a entrada canônica permanece ativa');
ok(!t.rounds[0].matches.some(m=>m.id==='ana-folga'),'a folga de inativa sai no mesmo ato');
applyLigaAvailability(t,'u-ana',true,win);
ok(t.standbyParticipants.filter(p=>p.uid==='u-ana').length===1,'repetir a intenção é idempotente');
t=fixture(); applyLigaAvailability(t,'u-ana',false,win);
ok(t.participants.find(p=>p.uid==='u-ana').ligaActive===false,'desativar não remove a inscrição');
console.log('  '+pass+' ok, '+fail+' falha(s)'); if(fail)process.exit(1);
