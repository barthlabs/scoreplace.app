'use strict';
// Exercita a callable real contra transações Firestore no emulador. O relógio
// operacional é controlado para provar D e D+1 sem mudar o relógio do host.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const start = source.indexOf('const _OPERATION_REGIONS = new Set(');
const end = source.indexOf('exports.endMatchOnCourt = onCall(', start);
assert(start > 0 && end > start);
const handler = source.slice(start, end);
const driver = `
const assert=require('node:assert/strict');
const admin=require(${JSON.stringify(path.join(root, 'functions-autodraw/node_modules/firebase-admin'))});
const receipts=require(${JSON.stringify(path.join(root, 'functions-autodraw/operation-receipt-core'))});
admin.initializeApp({projectId:'demo-scoreplace'});
const db=admin.firestore();
let day='2026-10-22';
const context={exports:{},onCall:(_opts,fn)=>fn,db,_operationReceipt:receipts,
 _operationDay:{operationDay:async()=>day},
 _isTournamentAdmin:(_t,uid)=>uid==='owner',
 _isConfirmedTournamentReferee:()=>false,
 _isTournamentParticipant:(_t,uid)=>uid==='player',
 _assertSandboxDrawOwner:async()=>{},
 HttpsError:class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}};
new Function('context','with(context){'+${JSON.stringify(handler)}+'}')(context);
const fn=context.exports.tournamentOperationControl;
const ref=db.doc('tournaments/tour_control');
const call=(uid,action,extra={})=>fn({auth:{uid},data:Object.assign({tournamentId:'tour_control',action},extra)});
const selected=(region)=>({region,sourceDigest:'digest-123'});
(async()=>{
 await ref.set({creatorUid:'owner',memberUids:['player']});
 process.env.SP_SOURCE_DIGEST='digest-123';process.env.SP_OPERATION_REGION='us-east1';
 assert.equal((await call('player','current')).selected,false);
 await assert.rejects(call('player','select',selected('us-east1')),e=>e.code==='permission-denied');
 assert.equal((await ref.collection('operationControl').doc('_protocol').get()).exists,false);
 const first=await call('owner','select',selected('us-east1'));
 assert.equal(first.region,'us-east1');assert.equal(first.revision,1);
 assert.equal((await ref.collection('operationControl').doc('_protocol').get()).data().protocolVersion,2);
 assert.equal((await call('owner','select',selected('us-east1'))).adopted,true);
 await assert.rejects(call('stranger','current'),e=>e.code==='permission-denied');
 await assert.rejects(call('player','failover',{...selected('us-east4'),observedRevision:1,reason:'infrastructure'}),
  e=>e.code==='failed-precondition');
 process.env.SP_OPERATION_REGION='us-east4';
 const next=await call('player','failover',{...selected('us-east4'),observedRevision:1,reason:'infrastructure'});
 assert.equal(next.region,'us-east4');assert.equal(next.revision,2);
 await assert.rejects(call('owner','failover',{...selected('us-south1'),observedRevision:1,reason:'infrastructure'}),
  e=>e.code==='failed-precondition');
 day='2026-10-23';process.env.SP_OPERATION_REGION='us-east1';
 assert.equal((await call('player','current')).selected,false);
 assert.equal((await ref.collection('operationControl').doc('_protocol').get()).data().protocolVersion,2);
 await assert.rejects(call('player','select',selected('us-east1')),e=>e.code==='permission-denied');
 assert.equal((await call('owner','select',selected('us-east1'))).revision,1);
 assert.equal((await ref.collection('operationControl').doc('2026-10-22').get()).data().revision,2);
 const sb=db.doc('sandboxes/sb_control');await sb.set({isSandbox:true});
 const sandboxReply=await fn({auth:{uid:'sbOwner'},data:{tournamentId:'sb_control',sandbox:true,
  action:'select',...selected('us-east1')}});
 assert.equal(sandboxReply.region,'us-east1');
 assert.equal((await sb.collection('operationControl').doc('_protocol').get()).data().protocolVersion,2);
 console.log('__OK__');
})().catch(e=>{console.error(e);process.exitCode=1});
`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-control-tx-'));
const config = path.join(temp, 'firebase.json');
const script = path.join(temp, 'driver.js');
fs.writeFileSync(config, JSON.stringify({ emulators: { firestore: { port: 8132 }, ui: { enabled: false }, singleProjectMode: true } }));
fs.writeFileSync(script, driver);
const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--config', config, '--project', 'demo-scoreplace',
  'node ' + JSON.stringify(script)], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
assert(output.includes('__OK__'), output.slice(-1200));
console.log('✓ controle real: eleição diária, troca CAS, região própria e participante');
