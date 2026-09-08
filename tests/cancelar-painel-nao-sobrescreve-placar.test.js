const fs=require('fs'),vm=require('vm'),src=fs.readFileSync('js/views/tournaments-draw-prep.js','utf8');
const a=src.indexOf('window._cancelPowerOf2Panel = function'),b=src.indexOf('// (Check-in functions moved',a);let fail=0;
const local={id:'T',status:'suspended',_suspendedByPanel:true,_previousStatus:'open'},fresh={id:'T',status:'suspended',_suspendedByPanel:true,_previousStatus:'open',matches:[{scoreP1:6,scoreP2:4}]};
const w={AppStore:{mutate:(id,fn)=>{fn(local);fn(fresh);}},_findTournamentById:()=>local,location:{hash:'#tournaments/T'},showNotification(){},_t:k=>k};w.window=w;
const s={window:w,document:{getElementById:()=>null},renderTournaments(){},showNotification:w.showNotification,_t:w._t};vm.createContext(s);vm.runInContext(src.slice(a,b),s);w._cancelPowerOf2Panel('T');
function ok(v,m){if(v)console.log('✓ '+m);else{fail++;console.error('✗ '+m)}}ok(fresh.status==='open'&&!fresh._suspendedByPanel,'restaura somente estado fresco');ok(fresh.matches[0].scoreP1===6,'preserva placar concorrente');ok(!/AppStore\.sync\(/.test(src.slice(a,b)),'não usa sync');if(fail)process.exit(1);
