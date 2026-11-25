'use strict';
const crypto=require('node:crypto');
const CULT_ID='tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
const labels={B1:'A',B2:'B',C1:'C',C2:'D',C3:'E',C4:'F'};
function canonical(value) {
  if(value===undefined)return null;
  if(value===null||typeof value!=='object')return value;
  if(typeof value.seconds==='number'&&typeof value.nanoseconds==='number')return {$timestamp:[value.seconds,value.nanoseconds]};
  if(value instanceof Date)return {$date:value.toISOString()};
  if(Buffer.isBuffer(value))return {$bytes:value.toString('base64')};
  if(typeof value.path==='string'&&typeof value.get==='function')return {$reference:value.path};
  if(Array.isArray(value))return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
}
const stable=value=>JSON.stringify(canonical(value));
const hash=value=>crypto.createHash('sha256').update(stable(value)).digest('hex');
function rootHash(data) {const copy=canonical(data);delete copy.updatedAt;copy.scheduleWindow.interleavedPlan.groupAssignments.forEach(r=>delete r.label);return hash(copy);}
function gameHash(data) {const copy=canonical(data);delete copy.jogo.scheduledGroupLabel;return hash(copy);}
function proposal(parent,records) {
  const t=parent.data,rows=t.scheduleWindow?.interleavedPlan?.groupAssignments;
  if(t.id!==CULT_ID||Number(t.currentPhaseIndex||0)!==0||!Array.isArray(rows)||rows.length!==6||records.length!==84)throw Error('Censo/torneio/fase diverge do CULT autorizado');
  const seen=new Set(),groups=rows.map(row=>{
    const tier=/Categoria B$/.test(row.category)?'B':/Categoria C$/.test(row.category)?'C':'';
    const old=tier+row.groupNumber,target=labels[old],key=JSON.stringify([row.phaseIndex,row.category,row.groupNumber]);
    if(!target||row.phaseIndex!==0||seen.has(key)||!['category','courts','entry','groupNumber','label','phaseIndex'].every(k=>Object.hasOwn(row,k))||Object.keys(row).length!==6||![old,target].includes(row.label))throw Error('Distribuição/rótulo fora do mapa fechado');
    seen.add(key);return {category:row.category,groupNumber:row.groupNumber,from:old,to:target,key,count:0};
  });
  if(new Set(groups.map(g=>g.from)).size!==6)throw Error('Os seis grupos não estão completos');
  const ids=new Set();
  const games=records.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(record=>{
    const m=record.data.jogo,g=m&&groups.find(g=>g.category===m.category&&g.groupNumber===Number(m.groupIdx)+1);
    if(!m||Number(m.phaseIndex||0)!==0||!m.isMonarch||!g||ids.has(record.id)||![g.from,g.to].includes(m.scheduledGroupLabel))throw Error('Partida sem grupo canônico correspondente');
    ids.add(record.id);g.count++;
    return {id:record.id,time:{...record.time},before:m.scheduledGroupLabel,after:g.to,protectedHash:gameHash(record.data)};
  });
  if(groups.some(g=>g.count!==14))throw Error('Cada grupo deve conservar suas14partidas');
  const after=rows.map(row=>({...canonical(row),label:groups.find(g=>g.category===row.category&&g.groupNumber===row.groupNumber).to}));
  return {schema:1,tournamentId:CULT_ID,parentTime:{...parent.time},parentProtectedHash:rootHash(t),
    beforeAssignments:canonical(rows),afterAssignments:after,updatedAtExisted:Object.hasOwn(t,'updatedAt'),beforeUpdatedAt:canonical(t.updatedAt),
    groups:groups.map(({key,...g})=>g),games};
}
function applied(expected,parent,records) {
  if(rootHash(parent.data)!==expected.parentProtectedHash||stable(parent.data.scheduleWindow.interleavedPlan.groupAssignments)!==stable(expected.afterAssignments)||records.length!==expected.games.length)return false;
  const byId=new Map(records.map(r=>[r.id,r]));
  return expected.games.every(g=>{const current=byId.get(g.id);return current&&current.data.jogo.scheduledGroupLabel===g.after&&gameHash(current.data)===g.protectedHash;});
}
module.exports={CULT_ID,labels,canonical,stable,hash,rootHash,gameHash,proposal,applied};
