const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('js/views/tournaments-draw-prep.js', 'utf8');
const incStart = src.indexOf('window._handleIncompleteOption = function'), oddStart = src.indexOf('window._handleOddOption = function');
const inc = src.slice(incStart, src.indexOf('\n};', incStart) + 3);
const odd = src.slice(oddStart, src.indexOf('\n};', oddStart) + 3);
let fail = 0; function ok(v,m){ if(v) console.log('✓ '+m); else { fail++; console.error('✗ '+m); } }
function run(kind) {
  const local={id:'T',status:'active',participants:[{}]}, fresh={id:'T',status:'active',participants:[{}],matches:[{id:'M',scoreP1:6,scoreP2:4}]};
  const w={ AppStore:{ mutate:(id,fn)=>{fn(local);fn(fresh);}, logAction(){} }, _findTournamentById:()=>local,
    checkOddEntries:()=>({teamSize:1}), showNotification(){}, _t:k=>k, location:{hash:''} }; w.window=w;
  const d={getElementById:()=>null}; const s={window:w,document:d,showNotification:w.showNotification,_t:w._t,renderTournaments(){}};
  vm.createContext(s); vm.runInContext(kind==='inc'?inc:odd,s); kind==='inc'?w._handleIncompleteOption('T','reopen'):w._handleOddOption('T','reopen');
  return fresh;
}
const a=run('inc'); ok(a.status==='open'&&a.enrollmentStatus==='open','reabrir times altera só estado fresco'); ok(a.matches[0].scoreP1===6,'reabrir times preserva placar');
const b=run('odd'); ok(b.status==='open','reabrir ímpar altera estado fresco'); ok(b.matches[0].scoreP2===4,'reabrir ímpar preserva placar');
ok(!/AppStore\.sync\(/.test(inc+odd),'os dois handlers não chamam sync'); if(fail) process.exit(1);
