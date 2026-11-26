'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readFile,makeService,LIMIT}=require('../functions/tournament-regulation');
class E extends Error{constructor(code,message){super(message);this.code=code;}}
const tid='tour_1790000000000_0123456789abcdef0123456789abcdef';
const pdf=Buffer.from('%PDF-1.4\nsynthetic regulation\n%%EOF'),jpeg=Buffer.from([255,216,255,224,0,0,255,217]);
const payload=(buffer=pdf,type='application/pdf')=>({tournamentId:tid,sandbox:false,requestId:crypto.randomUUID(),expectedRevision:'',fileName:'Regulamento.'+(type==='application/pdf'?'pdf':'jpg'),dataUrl:'data:'+type+';base64,'+buffer.toString('base64')});
for(const dataUrl of ['data:image/svg+xml;base64,PHN2Zz4=','data:application/pdf;base64,aW52YWxpZA==','data:image/jpeg;base64,cGRm','data:application/pdf;base64,%%%%'])assert.throws(()=>readFile({dataUrl},E));
const limit=Buffer.alloc(LIMIT);pdf.copy(limit);assert.equal(readFile(payload(limit),E).bytes.length,LIMIT);assert.throws(()=>readFile(payload(Buffer.concat([limit,Buffer.from('x')])),E));
(async()=>{const docs=new Map([[`tournaments/${tid}`,{creatorUid:'owner',coHosts:[{uid:'cohost',status:'active'}],name:'Synthetic',matches:[{id:'existing'}]}]]),objects=new Map();let queue=Promise.resolve(),badDownload=false,onSaved=null,onDownloaded=null;
 const ref=p=>({path:p,collection:name=>({doc:id=>ref(p+'/'+name+'/'+id)}),get:async()=>({exists:docs.has(p),data:()=>structuredClone(docs.get(p))})});
 const db={collection:n=>({doc:id=>ref(n+'/'+id)}),runTransaction:fn=>{const job=queue.then(async()=>{const updates=[];const result=await fn({get:r=>r.get(),set:(r,v)=>updates.push([r.path,v]),create:(r,v)=>{assert(!docs.has(r.path));updates.push([r.path,v]);}});updates.forEach(([p,v])=>docs.set(p,structuredClone(v)));return result;});queue=job.catch(()=>{});return job;}};
 const storage={bucket:()=>({name:'scoreplace-app.firebasestorage.app',file:p=>({save:async(bytes,opts)=>{if(objects.has(p))throw Object.assign(new Error('exists'),{code:412});objects.set(p,{bytes,metadata:opts.metadata});if(onSaved){const hook=onSaved;onSaved=null;hook();}},getMetadata:async()=>[objects.get(p).metadata],download:async()=>{if(onDownloaded){const hook=onDownloaded;onDownloaded=null;hook();}return[badDownload?Buffer.from('corrupt'):objects.get(p).bytes];},delete:async()=>objects.delete(p)})})};
 const service=makeService({db,storage,HttpsError:E});
 const call=(data,uid='owner')=>service.upload({data,auth:uid?{uid}:null});
 const first=payload();await assert.rejects(call(first,null),e=>e.code==='unauthenticated');await assert.rejects(call(first,'outsider'),e=>e.code==='permission-denied');
 let result=await call(first);assert.equal(result.regulation.revision,first.requestId);assert.equal(docs.get('tournaments/'+tid).name,'Synthetic');assert.equal(objects.size,1);
 assert.deepEqual(await call(first),result,'retry é idempotente');await assert.rejects(call({...first,fileName:'outro.pdf'}),e=>e.code==='already-exists');await assert.rejects(call(first,'cohost'),e=>e.code==='already-exists');
 const second={...payload(jpeg,'image/jpeg'),expectedRevision:first.requestId};result=await call(second,'cohost');assert.equal(result.regulation.contentType,'image/jpeg');
 const retry=await call(first);assert(retry.superseded);assert.equal(retry.regulation.revision,second.requestId,'não ressuscita versão antiga');
 await assert.rejects(call(payload()),e=>e.code==='aborted');
 badDownload=true;const corrupt={...payload(),expectedRevision:second.requestId};await assert.rejects(call(corrupt),e=>e.code==='data-loss');assert.equal(objects.size,2,'remove somente objeto não confirmado');assert.equal((await ref('tournaments/'+tid+'/regulations/current').get()).data().revision,second.requestId);
 // Corrida entre upload e commit: a nova tentativa limpa só seu arquivo.
 badDownload=false;const currentPath='tournaments/'+tid+'/regulations/current',oldState=structuredClone(docs.get(currentPath));
 const losing={...payload(),expectedRevision:second.requestId};onSaved=()=>docs.set(currentPath,{...oldState,revision:crypto.randomUUID()});
 await assert.rejects(call(losing),e=>e.code==='aborted');assert.equal(objects.size,2);assert.notEqual(docs.get(currentPath).revision,losing.requestId);docs.set(currentPath,oldState);
 // Um objeto com identidade divergente não pode ser reutilizado, mesmo com bytes iguais.
 const collision={...payload(),expectedRevision:second.requestId},collisionPath='tournamentRegulations/'+tid+'/'+collision.requestId+'.pdf';
 objects.set(collisionPath,{bytes:pdf,metadata:{metadata:{sha256:readFile(collision,E).sha256,uploaderKey:crypto.createHash('sha256').update('user\0owner').digest('hex'),fileName:collision.fileName,tournamentId:'foreign',requestId:collision.requestId,firebaseStorageDownloadTokens:'foreign-token'}}});
 await assert.rejects(call(collision),e=>e.code==='already-exists');assert(objects.has(collisionPath),'objeto não criado pela tentativa não é apagado');objects.delete(collisionPath);
 const admin=makeService({db,storage,HttpsError:E,authorizeAdministrative:(_t,id,p)=>id===tid&&p.reason==='explicit-user-request'});badDownload=false;
 await assert.rejects(admin.publish({...payload(),expectedRevision:second.requestId},{kind:'administrative',uid:'service',reason:'wrong'}),e=>e.code==='permission-denied');
 const administrative=await admin.publish({...payload(),expectedRevision:second.requestId},{kind:'administrative',uid:'service',reason:'explicit-user-request'});assert(administrative.ok);assert.equal(administrative.regulation.url,undefined);
 const readInput={tournamentId:tid,sandbox:false,revision:administrative.regulation.revision};const readRequest={data:readInput,auth:{uid:'owner'}};
 const headers={};assert.deepEqual(Buffer.from((await service.getFile({...readRequest,rawRequest:{res:{setHeader:(k,v)=>headers[k]=v}}})).base64,'base64'),pdf);assert.equal(headers['Cache-Control'],'no-store');
 await assert.rejects(service.getFile({data:readInput}),e=>e.code==='not-found');
 const parentPath='tournaments/'+tid,original=structuredClone(docs.get(parentPath));docs.get(parentPath).isPublic=true;
 assert.deepEqual(Buffer.from((await service.getFile({data:readInput})).base64,'base64'),pdf);docs.set(parentPath,original);
 await assert.rejects(service.getFile({data:{...readInput,revision:first.requestId},auth:{uid:'owner'}}),e=>e.code==='failed-precondition');
 onDownloaded=()=>docs.delete(parentPath);await assert.rejects(service.getFile(readRequest),e=>e.code==='not-found','exclusão entre autorização e resposta é revalidada');docs.set(parentPath,original);

 console.log('PASS regulamento core: PDF/JPEG, limite, assinatura, autorização, CAS, idempotência, retry suplantado, falha e ator administrativo explícito.');
})().catch(e=>{console.error(e);process.exitCode=1});

// O uploader administrativo mantém o pin em preview/apply e nunca toca no pai.
(async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
 const code=fs.readFileSync(path.join(__dirname,'../scripts/anexar-regulamento-cult.cjs'),'utf8');
 const exact=crypto.createHash('sha256').update(pdf).digest('hex');
 const scriptTid='tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
 async function cli(args,options={}){
  const files=new Map(),logs=[],errors=[];let initialized=0,published=0,writes=0;
  const file='/tmp/'+(options.name||'Novo regulamento á ..pdf'),planPath='/tmp/plan.json';
  files.set(file,pdf);files.set('/tmp/credential.json',JSON.stringify({project_id:'scoreplace-app',client_email:'synthetic-service@example.invalid'}));
  let active={revision:'old',fileName:'Old.pdf'},good=pdf;
  const plan={version:1,tournamentId:scriptTid,filePath:file,fileName:readFile({fileName:path.basename(file),dataUrl:'data:application/pdf;base64,'+pdf.toString('base64')},E).fileName,approvedSha256:exact,sha256:exact,sizeBytes:pdf.length,creatorUid:'org',reason:'explicit-user-request',requestId:'00000000-0000-4000-8000-000000000001',expectedRevision:'old',previous:{revision:'old',fileName:'Old.pdf'},...options.plan};
  files.set(planPath,JSON.stringify(plan));
  const parent={get:async()=>({exists:true,data:()=>({creatorUid:'org',testModeEnabled:options.testModeEnabled!==false}),updateTime:{toDate:()=>new Date(0)}}),collection:name=>({doc:()=>name==='regulations'?current:{}})};
  const current={get:async()=>({exists:true,data:()=>active})};
  const db={collection:()=>({doc:()=>parent}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>active}),set:(_r,v)=>{active=v;writes++},delete:()=>{writes++}})};
  const bucket={iam:{getPolicy:async()=>[{bindings:[]}]},file:()=>({download:async()=>[good],delete:async()=>{writes++}})};
  const admin={initializeApp:()=>initialized++,firestore:()=>db,storage:()=>({bucket:()=>bucket})};
  function requireStub(name){
   if(name==='node:fs')return {readFileSync:(f)=>{if(String(f).endsWith('.manifest.json'))return JSON.stringify({pdfSha256:options.manifestSha||exact});if(!files.has(f))throw Error('unexpected read '+f);return files.get(f)},writeFileSync:(f,v)=>files.set(f,v)};
   if(name==='node:path')return path;if(name==='node:crypto')return crypto;
   if(name==='node:module')return {createRequire:()=>()=>({HttpsError:E})};
   if(name.includes('firebase-admin'))return admin;
   if(name==='../functions/tournament-regulation')return {readFile,makeService:()=>({publish:async data=>{published++;active={revision:plan.requestId,fileName:data.fileName,storagePath:'synthetic'};if(options.badDownload)good=Buffer.from('bad');return {regulation:active,superseded:false}}})};
   throw Error('Unexpected require '+name);
  }
  const argv=args(file,planPath);
  try{vm.runInNewContext(code,{require:requireStub,__dirname:path.join(__dirname,'../scripts'),Buffer,process:{argv:['node','script',...argv],env:{GOOGLE_APPLICATION_CREDENTIALS:'/tmp/credential.json'},exitCode:0},console:{log:x=>logs.push(x),error:x=>errors.push(x)}})}catch(e){errors.push(e.message)}
  for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
  return {initialized,published,writes,files,logs,errors,planPath,active};
 }
 const malformed=await cli((f,p)=>['--preview',f,p,'--sha256=bad']);assert.equal(malformed.initialized,0);assert.match(malformed.errors[0],/Pin inválido/);
 const differentManifest=await cli((f,p)=>['--preview',f,p],{manifestSha:'0'.repeat(64)});assert.equal(differentManifest.published,0);assert.match(differentManifest.errors[0],/PDF diferente/);
 const matchingWrongManifest=await cli((f,p)=>['--preview',f,p,'--sha256='+'0'.repeat(64)],{manifestSha:'0'.repeat(64)});assert.equal(matchingWrongManifest.published,0);assert.match(matchingWrongManifest.errors[0],/PDF diferente/);
 const wrong=await cli((f,p)=>['--preview',f,p,'--sha256='+'0'.repeat(64)],{manifestSha:'1'.repeat(64)});assert.equal(wrong.initialized,0);assert.equal(wrong.published,0);assert.match(wrong.errors[0],/PDF diferente/);
 for(const override of [{approvedSha256:undefined},{approvedSha256:'0'.repeat(64)},{fileName:'different.pdf'}]){
  const r=await cli((f,p)=>['--apply',f,p,'--sha256='+exact],{plan:override});assert.equal(r.published,0);assert.match(r.errors[0],/Arquivo ou torneio diverge da prévia/);
 }
 const preview=await cli((f,p)=>['--preview',f,p]);assert.deepEqual(preview.errors,[]);const recorded=JSON.parse(preview.files.get(preview.planPath));assert.equal(recorded.approvedSha256,exact);assert.equal(recorded.fileName,'Novo regulamento á ..pdf');assert(preview.files.has(preview.planPath+'.backup.json'));assert.equal(preview.published,0);
 for(const mode of ['--preview','--apply']){const off=await cli((f,p)=>[mode,f,p,'--sha256='+exact],{testModeEnabled:false});assert.equal(off.published,0);assert.match(off.errors[0],/modo de teste/);}
 const applied=await cli((f,p)=>['--apply',f,p,'--sha256='+exact]);assert.deepEqual(applied.errors,[]);assert.equal(applied.published,1);assert(applied.files.has(applied.planPath+'.receipt.json'));
 const rollback=await cli((f,p)=>['--apply',f,p,'--sha256='+exact],{badDownload:true});assert.equal(rollback.active.revision,'old');assert(rollback.writes>=2);assert.match(rollback.errors[0],/Bytes baixados divergem do PDF aprovado/);
 console.log('PASS uploader CULT: pin explícito/default, flag inválida, plano antigo recusado, filename, preview+backup, apply e rollback.');
})().catch(e=>{console.error(e);process.exitCode=1});
