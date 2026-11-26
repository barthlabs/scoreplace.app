'use strict';
const rename=require('../functions/rename-canonical-participant-core');
const {fingerprint}=require('../functions-autodraw/tournament-rehearsal');
const {gamePins}=require('../functions-autodraw/tournament-draw-checkpoint');
const {normalizeName}=require('../functions/manual-name-unique-core');
function rootHash(root){const copy={...root};delete copy.updatedAt;delete copy._phaseReadCertificate;delete copy.drawCheckpoint;delete copy.preserveDrawOnTestReset;return fingerprint(copy);}
function build(root,registrations,documents,changes,accountNames){
 if(changes.length!==5||registrations.length!==48||documents.filter(d=>d.collection==='matches').length!==84)throw Error('Escopo diferente de cinco trocas, 48 vagas e 84 jogos.');
 if(root.testModeEnabled!==true||root.drawCheckpoint||(root.rehearsal?.state&&!(root.rehearsal.state==='active'&&root.rehearsal.mode==='preDraw'))||root.pendingDraw)throw Error('Torneio fora do estado autorizado.');
 if(documents.some(d=>d.collection==='matches'&&(d.data.jogo?.winner||d.data.jogo?.courtCalledAt||d.data.jogo?.startedAt||
  Number(d.data.jogo?.scoreP1)||Number(d.data.jogo?.scoreP2))))throw Error('Há chamada ou placar; operação recusada.');
 let t={...root},regs=registrations.map(r=>({...r})),docs=documents.map(d=>({...d})),targets=[];
 if(new Set(changes.flatMap(c=>[normalizeName(c.oldName),normalizeName(c.newName)])).size!==10)throw Error('Nomes ambíguos.');
 for(const change of changes){
  const candidates=regs.filter(r=>normalizeName(r.manualDisplayName)===normalizeName(change.oldName));
  if(candidates.length!==1)throw Error('Origem ausente ou ambígua.');
  const target=candidates[0];
  if(target.participantKind!=='manual'||target.participantUid||target.status!=='confirmed'||target.fixedPairId||
   target.paymentState||target.paymentDueCents||target.proofPath)throw Error('Vaga não é manual livre de vínculo/pagamento.');
  const definition=(t.categoryDefinitions||[]).find(d=>d.id===target.categoryId);
  if(normalizeName(definition?.label)!==normalizeName(change.category))throw Error('Categoria difere do pedido.');
  const games=docs.filter(d=>d.collection==='matches').map(d=>d.data.jogo);
  const appearances=games.filter(m=>[...(m.team1||[]),...(m.team2||[])].some(n=>normalizeName(n)===normalizeName(change.oldName)));
  if(appearances.some(m=>![...(m.team1SlotIds||[]),...(m.team2SlotIds||[])].includes(target.participantKey)))throw Error('Identidade da vaga difere do sorteio.');
  if(appearances.length!==7||appearances.some(m=>m.scheduledGroupLabel ? String(m.scheduledGroupLabel).replace(/^Grupo\s+/,'')!==change.group : !String(m.groupName||'').endsWith('Grupo '+change.group)))throw Error('Grupo ou número de aparições difere do sorteio oficial.');
  const planned=rename.plan(t,regs,{oldName:target.manualDisplayName,newName:change.newName,manualParticipantId:target.manualParticipantId},accountNames||[],docs);
  const byPath=new Map(planned.documents.map(d=>[d.ref.path,d.data]));
  docs=docs.map(d=>byPath.has(d.ref.path)?{...d,data:byPath.get(d.ref.path)}:d);
  t={...t,...planned.rootPatch};
  regs=regs.map(r=>r.registrationId===target.registrationId?{...r,manualDisplayName:change.newName}:r);
  targets.push({registrationId:target.registrationId,manualParticipantId:target.manualParticipantId,oldName:target.manualDisplayName,newName:change.newName,appearances:appearances.length});
 }
 function reverse(value){for(const c of [...changes].reverse())value=rename.replaceStrings(value,c.newName,c.oldName);return value;}
 if(fingerprint(reverse(t))!==fingerprint(root))throw Error('A reversão dos campos de raiz diverge.');
 for(let i=0;i<docs.length;i++)if(fingerprint(reverse(docs[i].data))!==fingerprint(documents[i].data))throw Error('A reversão dos documentos materializados diverge.');
 const changedDocs=docs.filter((d,i)=>fingerprint(d.data)!==fingerprint(documents[i].data));
 const writes=targets.length+changedDocs.length+2;
 if(writes>400)throw Error('Mais de 400 escritas; operação recusada sem lotes.');
 const rootPatch={};
 Object.keys(t).forEach(key=>{if(fingerprint(t[key])!==fingerprint(root[key]))rootPatch[key]=t[key];});
 const entries=docs.filter(d=>d.collection==='matches').map(d=>({path:'matches/'+d.id,data:d.data}));
 return {rootPatch,changedDocs,targets,writes,gamePins:gamePins(t,entries),rootHash:rootHash(t),
  docsHash:fingerprint(docs.map(d=>({path:d.ref.path,data:d.data})))};
}
module.exports={build,rootHash};
