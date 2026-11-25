'use strict';
// Arquivo imutável + referência pequena por torneio. Nunca regrava o documento-pai.
const crypto=require('crypto');
const {computeAdminUids}=require('./cohost-core');
const testMode=require('./test-mode-core');
const {canReadTournamentData}=require('./result-history-visibility-core');
const LIMIT=5*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readFile(input,HttpsError){
 const bad=()=>new HttpsError('invalid-argument','Envie um PDF ou JPEG de até 5 MB.');
 const value=input&&input.dataUrl;
 if(typeof value!=='string'||value.length>Math.ceil(LIMIT/3)*4+40)throw bad();
 const m=/^data:(application\/pdf|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!m)throw bad();
 const bytes=Buffer.from(m[2],'base64');
 if(!bytes.length||bytes.length>LIMIT||bytes.toString('base64')!==m[2])throw bad();
 if(m[1]==='application/pdf'?!bytes.subarray(0,5).equals(Buffer.from('%PDF-')):!bytes.subarray(0,3).equals(Buffer.from([255,216,255])))throw bad();
 const ext=m[1]==='application/pdf'?'pdf':'jpg';
 let fileName=String(input.fileName||('Regulamento.'+ext)).split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,150);
 if(!fileName)fileName='Regulamento.'+ext;
 return {bytes,contentType:m[1],ext,fileName,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function makeService({db,storage,HttpsError,authorizeAdministrative,now=()=>new Date()}){
 const fail=(code,message)=>{throw new HttpsError(code,message);};
 async function publish(input,principal){
  const uid=principal&&principal.uid,admin=principal&&principal.kind==='administrative';
  if(!uid||admin&&!authorizeAdministrative)fail('unauthenticated','Entre na sua conta.');
  const tid=String(input.tournamentId||''),sandbox=tid.startsWith('sb_');
  if(!(sandbox?/^sb_[A-Za-z0-9_-]{1,240}$/:/^tour_[0-9]{13}_[a-f0-9]{32}$/).test(tid)||input.sandbox!==sandbox)fail('invalid-argument','Torneio inválido.');
  const revision=String(input.requestId||'');
  if(!UUID.test(revision)||typeof input.expectedRevision!=='string'||input.expectedRevision!==''&&!UUID.test(input.expectedRevision))fail('invalid-argument','Versão do regulamento inválida.');
  const file=readFile(input,HttpsError);
  const parent=db.collection(sandbox?'sandboxes':'tournaments').doc(tid);
  const current=parent.collection('regulations').doc('current');
  const receipt=parent.collection('regulationRevisions').doc(revision);
  const actor={kind:admin?'administrative':'user',uid,...(admin?{reason:String(principal.reason||'').slice(0,200)}:{})};
  function authorize(t){
   if(admin){if(authorizeAdministrative(t,tid,principal)!==true)fail('permission-denied','Operação administrativa fora do escopo.');return;}
   if(!testMode.canAccess(t,uid))fail('not-found','Torneio não encontrado.');
   if(sandbox?(t.isSandbox!==true||t.sandboxOwnerUid!==uid):!computeAdminUids(t).includes(uid))fail('permission-denied','Só a organização pode enviar o regulamento.');
  }
  async function inspect(tx){
   const [parentSnap,activeSnap,oldSnap]=await Promise.all([tx.get(parent),tx.get(current),tx.get(receipt)]);
   if(!parentSnap.exists)fail('not-found','Torneio não encontrado.');
   authorize(parentSnap.data());
   const active=activeSnap.exists?activeSnap.data():null;
   if(oldSnap.exists){const old=oldSnap.data();
    if(old.actor.uid!==actor.uid||old.actor.kind!==actor.kind||old.regulation.sha256!==file.sha256||old.regulation.fileName!==file.fileName)fail('already-exists','Este envio já foi usado para outro arquivo.');
    return {done:true,result:{ok:true,regulation:active,appliedRevision:revision,superseded:!active||active.revision!==revision}};
   }
   if((active&&active.revision||'')!==input.expectedRevision)fail('aborted','O regulamento mudou em outra janela. Reabra a página antes de substituir.');
   return {done:false};
  }
  const first=await db.runTransaction(inspect);if(first.done)return first.result;
  const bucket=storage.bucket(),storagePath='tournamentRegulations/'+tid+'/'+revision+'.'+file.ext;
  const object=bucket.file(storagePath);let created=false;
  const uploadedAt=now().toISOString();
  const uploaderKey=crypto.createHash('sha256').update(actor.kind+'\0'+actor.uid).digest('hex');
  const regulation={version:1,revision,storagePath,
   contentType:file.contentType,fileName:file.fileName,sizeBytes:file.bytes.length,sha256:file.sha256,uploadedAt};
  try{
   try{await object.save(file.bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:file.contentType,contentDisposition:"inline; filename*=UTF-8''"+encodeURIComponent(file.fileName),cacheControl:'private, no-store',metadata:{sha256:file.sha256,tournamentId:tid,requestId:revision,uploadedAt,uploaderKey,fileName:file.fileName}}});created=true;}
   catch(error){if(Number(error.code)!==412)throw error;
    const [metadata]=await object.getMetadata();
    if(!metadata.metadata||metadata.metadata.sha256!==file.sha256||metadata.metadata.uploaderKey!==uploaderKey||metadata.metadata.fileName!==file.fileName||metadata.metadata.tournamentId!==tid||metadata.metadata.requestId!==revision)fail('already-exists','Identificador de envio já utilizado.');
   }
   // A referência só é publicada depois de conferir os bytes que o Storage devolve.
   const [download]=await object.download();
   if(!download.equals(file.bytes))fail('data-loss','O arquivo enviado não passou na conferência.');
   return await db.runTransaction(async tx=>{const state=await inspect(tx);if(state.done)return state.result;
    tx.set(current,regulation);tx.create(receipt,{regulation,actor,createdAt:uploadedAt});
    return {ok:true,regulation,appliedRevision:revision,superseded:false};
   });
  }catch(error){
   // Em falha ambígua preservamos o objeto; jamais apagamos uma revisão confirmada.
   if(created){try{if(!(await receipt.get()).exists)await object.delete({ignoreNotFound:true});}catch(_){} }
   throw error;
  }
 }
 async function upload(request){return publish(request.data||{},{kind:'user',uid:request.auth&&request.auth.uid});}
 // O binário segue a mesma permissão do torneio, sem URL permanente de acesso.
 async function getFile(request){
  if(request.rawRequest && request.rawRequest.res && request.rawRequest.res.setHeader)request.rawRequest.res.setHeader('Cache-Control','no-store');
  const input=request.data||{},tid=String(input.tournamentId||''),sandbox=tid.startsWith('sb_'),uid=request.auth&&request.auth.uid;
  if(!(sandbox?/^sb_[A-Za-z0-9_-]{1,240}$/:/^tour_[0-9]{13}_[a-f0-9]{32}$/).test(tid)||input.sandbox!==sandbox||!UUID.test(input.revision||''))fail('not-found','Regulamento não encontrado.');
  const parent=db.collection(sandbox?'sandboxes':'tournaments').doc(tid),current=parent.collection('regulations').doc('current');
  async function authorized(tx){
   const [p,c]=await Promise.all([tx.get(parent),tx.get(current)]);
   const t=p.exists?p.data():null;
   const permitted=t && testMode.canAccess(t,uid) && (sandbox?t.isSandbox===true&&!!uid&&t.sandboxOwnerUid===uid:canReadTournamentData(t,uid));
   if(!permitted||!c.exists)fail('not-found','Regulamento não encontrado.');
   const r=c.data(),ext=r.contentType==='application/pdf'?'pdf':'jpg';
   if(r.revision!==input.revision)fail('failed-precondition','O regulamento foi atualizado. Reabra esta página.');
   if(r.version!==1||!['application/pdf','image/jpeg'].includes(r.contentType)||!Number.isInteger(r.sizeBytes)||r.sizeBytes<1||r.sizeBytes>LIMIT||! /^[0-9a-f]{64}$/.test(r.sha256||'')||r.storagePath!=='tournamentRegulations/'+tid+'/'+r.revision+'.'+ext)fail('failed-precondition','Regulamento inválido.');
   return r;
  }
  const regulation=await db.runTransaction(authorized);
  const [bytes]=await storage.bucket().file(regulation.storagePath).download();
  if(bytes.length!==regulation.sizeBytes||crypto.createHash('sha256').update(bytes).digest('hex')!==regulation.sha256)fail('data-loss','O arquivo não passou na conferência.');
  const fresh=await db.runTransaction(authorized);
  if(fresh.sha256!==regulation.sha256||fresh.storagePath!==regulation.storagePath)fail('failed-precondition','O regulamento foi atualizado. Reabra esta página.');
  return {regulation:fresh,base64:bytes.toString('base64')};
 }
 return {upload,publish,getFile};
}
module.exports={LIMIT,readFile,makeService};
