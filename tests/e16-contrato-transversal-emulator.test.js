'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('node:child_process');
  const fs = require('node:fs'), os = require('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e16-contract-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  { encoding:'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({firestore:{rules:path.join(root,'tests/concurrency/firestore.allow.rules')},
    emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}}));
  const r = spawnSync('firebase', ['emulators:exec','--only','firestore','--config',config,
    '--project','demo-scoreplace','node tests/e16-contrato-transversal-emulator.test.js'], {
    cwd:root, encoding:'utf8', timeout:300000,
    env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:' + process.env.PATH}
  });
  fs.rmSync(temp,{recursive:true,force:true});
  const output=(r.stdout||'')+(r.stderr||''); process.stdout.write(output);
  if(r.error) console.error(r.error);
  process.exit(r.status===0 || /Script exited successfully \(code 0\)/.test(output) ? 0 : 1);
}
process.env.GCLOUD_PROJECT='demo-scoreplace';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-scoreplace'});
const CF=require('../functions/index.js');
const Draw=require('../functions-autodraw/index.js');
const dc=require('../functions-autodraw/draw-core.js');
const split=require('../functions-autodraw/vendor/tournament-split-core.js');
const R=require('../functions/registration-core.js');
const admin=require('module').createRequire(path.join(root,'functions/index.js'))('firebase-admin');
const drawAdmin=require('module').createRequire(path.join(root,'functions-autodraw/index.js'))('firebase-admin');
if(!admin.apps.length) admin.initializeApp({projectId:'demo-scoreplace'});
const db=admin.firestore();
const call=(fn,data,uid='org')=>fn.run({data,auth:{uid,token:{uid}},rawRequest:{headers:{}},acceptsStreaming:false});
const rid=(uid,cat='a')=>R.registrationId('uid:'+uid,cat);
const defs=[{id:'a',label:'A',dimension:'custom',enabled:true},
  {id:'b',label:'B',dimension:'custom',enabled:true}];
const stamp=Date.now(); let serial=0;
const makeId=()=> 'tour_'+stamp+'_'+(++serial).toString(16).padStart(32,'0');
const reg=(id,uid,status='confirmed',cat='a',fp='e16')=>({registrationId:rid(uid,cat),
  tournamentId:id,categoryId:cat,participantKey:'uid:'+uid,participantKind:'account',
  participantUid:uid,status,validationState:'approved',migrationFingerprint:fp,fixedPairId:null});
const settled=async (a,b)=>Promise.allSettled([a(),b()]);
const outcome=(item)=>item.status==='fulfilled'
  ? {outcome:item.value.outcome,changed:item.value.changed,removed:item.value.removed,
    notFound:item.value.notFound,promoted:item.value.promoted}
  : {error:item.reason.code||item.reason.message};
const snapshot=async(ref)=>({parent:(await ref.get()).data(),
  regs:(await ref.collection('registrations').get()).docs.map(d=>d.data()),
  matches:(await ref.collection('matches').get()).docs.map(d=>d.data()),
  groups:(await ref.collection('grupos').get()).docs.map(d=>d.data())});
function assertCanonical(state) {
  assert.equal(state.parent.canonicalRegistrationMigration.registrationCount,state.regs.length);
  assert.deepEqual(state.parent.participants||[],[],'pai não vira segunda fonte');
  const pairs=new Map();
  state.regs.filter(r=>r.status!=='withdrawn'&&r.fixedPairId).forEach(r=>{
    const members=pairs.get(r.fixedPairId)||[];members.push(r);pairs.set(r.fixedPairId,members);
  });
  for(const members of pairs.values()) assert.equal(members.length,2,'fixedPairId não fica órfão');
}
async function makePair() {
  const id=makeId(),ref=db.doc('tournaments/'+id),fp='e16-pair-'+serial;
  await ref.set({id,creatorUid:'org',memberUids:['org','pair-a','pair-b'],status:'active',
    teamSize:2,enrollmentMode:'teams',manualPairing:'open',participants:[],
    categoryDefinitions:defs,canonicalRegistrationMigration:{fingerprint:fp,registrationCount:2}});
  for(const uid of ['pair-a','pair-b']) await ref.collection('registrations').doc(rid(uid))
    .set(reg(id,uid,'waitlisted','a',fp));
  const pair=()=>call(CF.formPair,{tournamentId:id,uid1:'pair-a',uid2:'pair-b',categoryId:'a'});
  const leave=()=>call(CF.leaveStandby,{tournamentId:id},'pair-a');
  return {ref,pair,leave};
}
async function checkPair(f,results) {
  const state=await snapshot(f.ref); assertCanonical(state);
  assert.equal(state.regs.find(r=>r.participantUid==='pair-a').status,'withdrawn');
  assert.equal(state.regs.find(r=>r.participantUid==='pair-b').fixedPairId,null);
  assert.equal(state.matches.length,0);
  assert(results.some(item=>item.status==='fulfilled'&&item.value.removed===true));
  const again=await f.leave();assert.equal(again.removed,false);
  assertCanonical(await snapshot(f.ref));
}
async function makeBatch() {
  const id=makeId(),ref=db.doc('tournaments/'+id),fp='e16-batch-'+serial;
  await ref.set({id,creatorUid:'org',memberUids:['org','alice'],status:'open',participants:[],
    categoryDefinitions:defs,canonicalRegistrationMigration:{fingerprint:fp,registrationCount:1}});
  await ref.collection('registrations').doc(rid('alice')).set(reg(id,'alice','confirmed','a',fp));
  const batch=()=>call(CF.assignCanonicalPlaceholderCategoryBatch,{tournamentId:id,sandbox:false,
    operationId:'e16_batch_'+serial+'_'+stamp,reservations:[],
    edits:[{userUid:'alice',fromCategoryId:'a',toCategoryId:'b'}]});
  const reclass=()=>call(CF.reclassifyCanonicalRegistration,{tournamentId:id,userUid:'alice',
    fromCategoryId:'a',toCategoryId:'b'});
  const leave=()=>call(CF.deenrollParticipant,{tournamentId:id,userUid:'alice'},'alice');
  return {ref,batch,reclass,leave};
}
async function checkBatch(f,results) {
  const state=await snapshot(f.ref); assertCanonical(state);
  assert(!state.regs.some(r=>r.participantUid==='alice'&&r.status==='confirmed'),
    'saída vence ou sucede lote; não sobra inscrição ativa');
  assert(results.some(item=>item.status==='fulfilled'&&item.value.notFound===false));
  assert.equal(state.matches.length,0);
  const again=await f.leave();assert.equal(again.notFound,true);
  assertCanonical(await snapshot(f.ref));
}
async function makeLate(prefix='') {
  const id=makeId(),ref=db.doc('tournaments/'+id),fp='e16-late-'+serial;
  const lateUid=prefix+'late';
  const players=Array.from({length:5},(_,i)=>({uid:prefix+'u'+i,displayName:'P'+i,name:'P'+i,
    categoryId:'a',category:'A',categories:['A']}));
  const t={id,name:'E16 synthetic',creatorUid:'org',memberUids:['org',...players.map(p=>p.uid)],
    status:'active',format:'Eliminatórias Simples',teamSize:1,enrollmentMode:'individual',
    participants:players,combinedCategories:['A'],categoryDefinitions:[defs[0]],currentPhaseIndex:0,
    lateEnrollment:'expand',newMatchups:true,checkedIn:{},absent:{},standbyParticipants:[],waitlist:[],
    teamOrigins:{},matches:[],sport:'Beach Tennis',startDate:'2026-06-01T09:00:00',
    endDate:'2026-06-01T20:00:00'};
  for(const p of players)t.checkedIn[p.uid]=Date.now();
  assert.equal(dc.drawInitial(t,{decisions:{}}).ok,true);
  const divided=split.dividir({...t,participants:[],canonicalRegistrationMigration:{fingerprint:fp,registrationCount:6}},['matches']);
  await ref.set({...divided.config,participants:[],waitlist:[],standbyParticipants:[],
    _semPesados:['matches','participants','opponentHistory'],_nPartes:{matches:divided.matches.length}});
  for(const m of divided.matches)await ref.collection('matches').doc(m._chave).set(m);
  for(const p of players)await ref.collection('registrations').doc(rid(p.uid))
    .set(reg(id,p.uid,'confirmed','a',fp));
  await ref.collection('registrations').doc(rid(lateUid)).set(reg(id,lateUid,'waitlisted','a',fp));
  await ref.update({checkedIn:{...t.checkedIn,[lateUid]:Date.now()}});
  for(const uid of [...players.map(p=>p.uid),lateUid])await db.doc('users/'+uid).set({displayName:uid,
    gender:uid===lateUid&&prefix!=='isoB-'?'feminino':'masculino'});
  const integrate=()=>call(Draw.integrateLateEntries,{tournamentId:id});
  const leave=()=>call(CF.leaveStandby,{tournamentId:id},lateUid);
  return {ref,integrate,leave,lateUid,initialMatches:divided.matches.length};
}
async function checkLate(f,results) {
  const state=await snapshot(f.ref);assertCanonical(state);
  const late=state.regs.find(r=>r.participantUid===f.lateUid);
  const placements=state.matches.filter(m=>JSON.stringify(m.jogo).includes(f.lateUid));
  assert(placements.length<=1,'jogo tardio não duplica');
  assert.equal(late.status==='confirmed',placements.length===1,
    'status confirmado equivale à vaga física');
  assert.equal(state.parent.waitlist.length,0);
  assert.equal(state.parent.standbyParticipants.length,0);
  assert(results.some(item=>item.status==='fulfilled'&&typeof item.value.removed==='boolean'));
  const before=state.matches.length;
  const again=await f.integrate();
  assert.equal(again.changed,false);
  assert.equal((await snapshot(f.ref)).matches.length,before,'retry não duplica jogo');
}
async function runCases(make,first,second,check,label) {
  const observed=[];
  for(const order of ['first','second',...Array(8).fill('parallel')]) {
    const f=await make();
    let r;
    if(order==='first') r=[await Promise.resolve().then(()=>f[first]()).then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason})),
      await Promise.resolve().then(()=>f[second]()).then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason}))];
    else if(order==='second') {
      const b=await Promise.resolve().then(()=>f[second]()).then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason}));
      const a=await Promise.resolve().then(()=>f[first]()).then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason}));
      r=[a,b];
    } else r=await settled(f[first],f[second]);
    if(label==='integração × espera'&&order==='first')
      assert.equal(r[0].status==='fulfilled'&&r[0].value.changed,true,
        'fixture tardia precisa oferecer promoção física antes da saída');
    await check(f,r);
    observed.push({order,results:r.map(outcome)});
  }
  console.log('✓ E16 '+label+': 2 ordens sequenciais e 8 disputas; desfechos='+JSON.stringify(observed));
}
async function injectedProfileRead() {
  const f=await makeLate('inject-');
  const drawDb=drawAdmin.firestore(),original=drawDb.runTransaction;
  const before=await snapshot(f.ref),globalBefore=dc._window._profByUid;
  let attempts=0,hits=0,rejected=false,readsAfterRejection=0;
  const otherReads=[];
  drawDb.runTransaction=function(fn,options){
    return original.call(this,async(tx)=>{
      attempts++;
      const get=tx.get.bind(tx);
      tx.get=(ref)=>{
        if(ref&&ref.path==='users/'+f.lateUid){
          hits++;
          rejected=true;
          return Promise.reject(Object.assign(new Error('synthetic profile read failure'),
            {code:'test-injected'}));
        }
        const read=get(ref);
        if(ref&&String(ref.path||'').startsWith('users/')){
          const observed=read.then(value=>{if(rejected)readsAfterRejection++;return value;},
            error=>{if(rejected)readsAfterRejection++;throw error;});
          otherReads.push(observed);
          return observed;
        }
        return read;
      };
      return fn(tx);
    },options);
  };
  let failure;const originalError=console.error,errors=[];
  console.error=(...args)=>{errors.push(args);};
  try { await f.integrate(); }
  catch(e){ failure=e; }
  finally { drawDb.runTransaction=original; console.error=originalError; }
  await Promise.allSettled(otherReads);
  assert(hits>0,'falha de tx.get do perfil foi injetada no callback real');
  assert(failure,'falha transacional não pode produzir sucesso');
  assert(errors.some(args=>String(args[1]).includes('synthetic profile read failure')),
    'classe e stack da falha original foram registrados');
  const after=await snapshot(f.ref);
  assert.equal(after.regs.find(r=>r.participantUid===f.lateUid).status,'waitlisted');
  assert.equal(after.matches.length,before.matches.length,'sem escrita física parcial');
  assert.deepEqual(after.parent.participants,before.parent.participants);
  assert.deepEqual(dc._window._profByUid,globalBefore,'transação não altera mapa global');
  const retry=await f.integrate();assert.equal(retry.changed,true);
  await checkLate(f,[{status:'fulfilled',value:{removed:false}}]);
  console.log('✓ E16 falha de perfil: tentativas='+attempts+', leituras injetadas='+hits+
    ', outras leituras concluídas após a rejeição='+readsAfterRejection+
    ', erro='+String(failure.code||failure.message));
}
async function isolatedProfiles() {
  const a=await makeLate('isoA-'),b=await makeLate('isoB-');
  const results=await Promise.all([a.integrate(),b.integrate()]);
  assert(results.every(result=>result.changed===true),'duas integrações independentes confirmadas');
  for(const [f,gender] of [[a,'feminino'],[b,'masculino']]){
    const state=await snapshot(f.ref);assertCanonical(state);
    const game=state.matches.find(m=>JSON.stringify(m.jogo).includes(f.lateUid));
    assert(game,'cada tardio ganhou vaga própria');
    assert(JSON.stringify(game.jogo).includes('"gender":"'+gender+'"'),
      'perfil da própria invocação chegou ao jogo físico');
    assert(!JSON.stringify(game.jogo).includes(f===a?b.lateUid:a.lateUid),
      'perfil de outra invocação não atravessou a chave');
  }
  console.log('✓ E16 perfis: duas integrações simultâneas no mesmo módulo mantiveram identidade e gênero');
}
(async()=>{
  if(!process.env.SP_E16_ONLY_LATE&&!process.env.SP_E16_ONLY_INJECTION){
    const unauthorized=await makePair();
    await assert.rejects(call(CF.formPair,{tournamentId:(await unauthorized.ref.get()).id,
      uid1:'pair-a',uid2:'pair-b',categoryId:'a'},'stranger'),e=>e&&e.code==='permission-denied');
    await runCases(makePair,'pair','leave',checkPair,'dupla × espera');
    await runCases(makeBatch,'batch','leave',checkBatch,'lote × saída');
    await runCases(makeBatch,'reclass','leave',checkBatch,'reclassificação × saída');
  }
  if(!process.env.SP_E16_ONLY_INJECTION)
    await runCases(makeLate,'integrate','leave',checkLate,'integração × espera');
  await injectedProfileRead();
  await isolatedProfiles();
  console.log('✓ E16 emulador: inscrições, recibos e partes físicas relidas');
})().catch(e=>{console.error(e);process.exitCode=1;});
