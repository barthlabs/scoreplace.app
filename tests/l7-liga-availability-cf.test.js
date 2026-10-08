'use strict';
const { applyLigaAvailability, allowsLigaAvailability } = require('../functions/liga-availability-core');
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
// Regressão: quem liga/desliga é localizado pelo UID; retirar "Ana" por nome também
// removia uma Ana homônima da fila. A conta real precisa sair sozinha.
t={participants:[],standbyParticipants:[{uid:'u-ana-1',displayName:'Ana',ligaActive:true},{uid:'u-ana-2',displayName:'Ana',ligaActive:true}],waitlist:[],monarchWaitlist:{},rounds:[]}; applyLigaAvailability(t,'u-ana-1',true,win);
ok(t.participants.some(p=>p.uid==='u-ana-1') && t.standbyParticipants.length===1 && t.standbyParticipants[0].uid==='u-ana-2','reativar Ana remove da espera somente pelo UID');
ok(!allowsLigaAvailability({format:'Liga',phases:[{kind:'elimination',elimination:{bracketType:'single'}}],currentPhaseIndex:0}),'fase eliminatória bloqueia disponibilidade mesmo quando o topo legado diz Liga');
ok(allowsLigaAvailability({format:'Eliminatórias Simples',phases:[{kind:'classification',classification:{structure:'round_robin'}}],currentPhaseIndex:0}),'fase classificatória canônica libera disponibilidade sem depender do rótulo do torneio');
ok(!allowsLigaAvailability({format:'Liga',phases:[{kind:'classification',classification:{structure:'groups'}}],currentPhaseIndex:0}),'classificação por grupos não recebe controle de disponibilidade de liga');
ok(allowsLigaAvailability({format:'Ranking'}),'documento legado sem fases preserva o controle de disponibilidade');
const client=require('fs').readFileSync(require('path').join(__dirname,'../js/views/tournaments-enrollment.js'),'utf8');
const a=client.indexOf('window._toggleLigaActive = function'),b=client.indexOf('window._buildLigaActiveToggleHtml',a),body=client.slice(a,b);
ok(/_callCF\('setLigaAvailability'/.test(body) && !/saveTournament|AppStore\.mutate/.test(body),'cliente do toggle só despacha a CF');
const toggleBuilder=client.slice(client.indexOf('window._buildLigaActiveToggleHtml'), client.indexOf('window._buildLigaActiveToggleHtml') + 1200);
ok(/_faseCorrenteEhLiga/.test(toggleBuilder),'cliente mostra o toggle pela fase atual, não pelo rótulo do torneio');
const cf=require('fs').readFileSync(require('path').join(__dirname,'../functions/index.js'),'utf8');
const cfBody=cf.slice(cf.indexOf('exports.setLigaAvailability'),cf.indexOf('/* ═══ RENOMEAR PARTICIPANTE'));
ok(/allowsLigaAvailability\(t\)/.test(cfBody),'CF rejeita disponibilidade fora da fase classificatória canônica');
console.log('OK '+n+' assertions');
