'use strict';
const fs=require('fs'); const win=require('../functions/liga-availability-window.js');
let fail=0; const ok=(v,m)=>{console.log((v?'✓ ':'✗ ')+m);if(!v)fail++;};
const src=fs.readFileSync('functions/index.js','utf8');
ok(src.includes('liga-availability-window.js')&&!src.includes('const _ligaDrawWindow = require("../functions-autodraw'), 'codebase principal não exige diretório externo no boot');
const t={participants:[{uid:'u',displayName:'Ana',ligaActive:false}],standbyParticipants:[],waitlist:[],rounds:[]};
ok(win._participantUids(t.participants[0])[0]==='u'&&win._getWaitlist(t).length===0, 'adaptador local preserva identidade e espera');
process.exit(fail?1:0);
