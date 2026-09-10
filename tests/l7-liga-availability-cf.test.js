'use strict';
const { applyLigaAvailability } = require('../functions/liga-availability-core');
const win = require('../functions-autodraw/draw-core')._window;
let n=0; function ok(v,m){n++;if(!v)throw new Error(m);console.log('✓ '+m);}
function fixture(filled) { return { participants:[{uid:'u-carol',displayName:'Carol',ligaActive:false,woDeactivatedAt:'x'},{uid:'u-ina',displayName:'Ina',ligaActive:false}], standbyParticipants:[],waitlist:[],monarchWaitlist:{}, rounds:[{monarchGroups:[{playersUids:filled?['u-sub']:['u-carol'],players:filled?['Sub']:['Carol'],subStatus:filled?'filled':undefined}],matches:[{id:'wo',isSitOut:true,sitOutReason:'wo',p1Uid:'u-carol'},{id:'ina',isSitOut:true,sitOutReason:'inactive',p1Uid:'u-ina'}]}]}; }
let t=fixture(true); applyLigaAvailability(t,'u-carol',true,win);
ok(!t.participants.some(p=>p.uid==='u-carol') && t.standbyParticipants.some(p=>p.uid==='u-carol'),'reativar após W.O. move a pessoa para a fila no servidor');
ok(!t.rounds[0].matches.some(m=>m.id==='wo') && t.rounds[0].matches.some(m=>m.id==='ina'),'remove só o marcador W.O. de vaga preenchida e preserva a folga alheia');
t=fixture(false); applyLigaAvailability(t,'u-carol',true,win);
ok(t.rounds[0].matches.some(m=>m.id==='wo'),'preserva o marcador W.O. enquanto a vaga ainda está aberta');
t={participants:[{uid:'u-a',displayName:'Ana',ligaActive:true}],standbyParticipants:[],waitlist:[],monarchWaitlist:{},rounds:[]}; applyLigaAvailability(t,'u-a',false,win);
ok(t.participants[0].ligaActive===false,'desativar permanece disponível pela mesma porta canônica');
const client=require('fs').readFileSync(require('path').join(__dirname,'../js/views/tournaments-enrollment.js'),'utf8');
const a=client.indexOf('window._toggleLigaActive = function'),b=client.indexOf('window._buildLigaActiveToggleHtml',a),body=client.slice(a,b);
ok(/_callCF\('setLigaAvailability'/.test(body) && !/saveTournament|AppStore\.mutate/.test(body),'cliente do toggle só despacha a CF');
console.log('OK '+n+' assertions');
