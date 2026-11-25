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
