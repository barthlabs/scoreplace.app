'use strict';

// Importação assistida: uma fotografia revisada de duplas ocupa apenas vagas
// manuais existentes. Não escolhe contas por nome e não toca no Firestore.
const crypto = require('crypto');
const boundary = require('./canonical-registration-boundary-core');
const claims = require('./registration-claim-core');
const mutations = require('./registration-mutations-core');
const manualNames = require('./manual-name-unique-core');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function active(item) { return item && (item.status === 'confirmed' || item.status === 'pending'); }
function placeholder(item) {
  return active(item) && item.participantKind === 'manual' &&
    /^Jogador\s+\d+$/i.test(text(item.manualDisplayName));
}
function slots(registrations) {
  const pairs = new Map();
  (registrations || []).forEach((item) => {
    if (!text(item.fixedPairId)) return;
    if (!pairs.has(item.fixedPairId)) pairs.set(item.fixedPairId, []);
    pairs.get(item.fixedPairId).push(item);
  });
  return Array.from(pairs.entries()).filter(([, members]) => members.length === 2 && members.every(placeholder) &&
    members[0].categoryId === members[1].categoryId)
    .map(([pairId, members]) => ({
      pairId,
      categoryId: members[0].categoryId,
      members: members.slice().sort((a, b) => a.registrationId.localeCompare(b.registrationId))
        .map((item) => ({ registrationId: item.registrationId, manualParticipantId: item.manualParticipantId, name: item.manualDisplayName })),
    })).sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.pairId.localeCompare(b.pairId));
}
function fingerprint(tournament, registrations) {
  const rows = (registrations || []).map((item) => [item.registrationId, item.status, item.categoryId,
    item.fixedPairId || '', item.manualDisplayName || '', item.participantUid || '', item.importSlotCategory||'',item.importSlotOrdinal||0,item.isPlaceholder===true])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash('sha256').update(JSON.stringify([tournament.id, tournament.canonicalRegistrationMigration, rows])).digest('hex');
}
function individualMode(t) {
  return t?.enrollmentMode === 'individual' || ['rotation_groups','rei_rainha'].includes(t?.fmt2?.parceria) ||
    (t?.phases||[]).some(p=>p?.classification?.rotationPartners===true);
}
function individualImportError(t) {
  if (t?.status==='finished'||['capturing','resetting'].includes(t?.drawCheckpoint?.state)||
      ['capturing','resetting'].includes(t?.rehearsal?.state))return 'O torneio está encerrado ou em restauração.';
  const settings=t?.registrationSettings,pricing=settings?.pricing;
  if(settings?.source==='scoreplace'&&(Number(pricing?.cents)>0||Object.values(pricing?.centsByCategory||{}).some(n=>Number(n)>0)))
    return 'Este torneio tem cobrança configurada. Use o fluxo de inscrição com pagamento.';
  return '';
}
function individualId(categoryId,ordinal) {
  return 'importslot-'+crypto.createHash('sha256').update(categoryId+'\0'+ordinal).digest('hex').slice(0,32);
}
function individualRoster(registrations) {
  return (registrations||[]).filter(item=>active(item)&&item.participantKind==='manual'&&!item.fixedPairId&&
    item.manualParticipantId===individualId(item.categoryId,item.importSlotOrdinal)&&item.importSlotCategory===item.categoryId)
    .map(item=>({categoryId:item.categoryId,ordinal:item.importSlotOrdinal,name:item.manualDisplayName,
      placeholder:item.isPlaceholder===true,manualParticipantId:item.manualParticipantId}));
}
function normalizedIndividual(row) {
  const categoryId=text(row?.categoryId),ordinal=row?.ordinal,people=row?.people,placeholder=row?.placeholder===true;
  if(!categoryId||!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>10000||!Array.isArray(people)||people.length!==1)
    throw new Error('posição individual ou categoria inválida');
  if(people[0]?.uid)throw new Error('importação individual não vincula conta');
  const name=text(people[0]?.name).replace(/\s+/g,' ');
  if((!placeholder&&name.length<2)||name.length>120||/[<>\u0000-\u001f]/.test(name)||placeholder&&name)
    throw new Error('nome individual inválido');
  const expectedName=row.expectedName===undefined?null:text(row.expectedName);
  return {kind:'individual',categoryId,ordinal,placeholder,expectedName,people:[{name,uid:null}]};
}
function applyReviewedIndividuals(tournament,registrations,rawBlock) {
  if(!individualMode(tournament))throw new Error('O torneio não aceita esta importação individual.');
  const blocked=individualImportError(tournament);if(blocked)throw new Error(blocked);
  const block=normalizedBlock(rawBlock),original=boundary.verifiedRoster(tournament,registrations).registrations;
  const definitions=new Map((tournament.categoryDefinitions||[]).map(d=>[d.id,d.label||d.name||'']));
  const excluded=new Set(tournament.excludedCategories||[]);
  let current=original.slice(),nextNumber=Math.max(0,...current.map(r=>Number((text(r.manualDisplayName).match(/^Jogador\s+(\d+)$/i)||[])[1])||0));
  for(const row of block){
    if(row.kind!=='individual')throw new Error('Não misture duplas e pessoas no mesmo bloco.');
    const label=definitions.get(row.categoryId);
    if(!label||excluded.has(label)||Object.hasOwn(tournament.maxParticipantsByCategory||{},label)&&Number(tournament.maxParticipantsByCategory[label])===0)
      throw new Error('Categoria inexistente ou sem vagas.');
    const manualParticipantId=individualId(row.categoryId,row.ordinal);
    const source=current.find(r=>r.manualParticipantId===manualParticipantId);
    if(source&&(source.participantKind!=='manual'||!active(source)||source.fixedPairId||
      source.importSlotCategory!==row.categoryId||source.importSlotOrdinal!==row.ordinal))
      throw new Error('Posição alterada; atualize a prévia.');
    if(source&&(source.paymentState||source.paymentDueCents||source.proofPath))throw new Error('Inscrição com pagamento não pode ser substituída pela planilha.');
    if(source&&row.placeholder)continue; // A preliminary file can never erase a known name.
    const name=row.placeholder?'Jogador '+(++nextNumber):row.people[0].name;
    if(source){
      if(source.manualDisplayName===name)continue;
      if(row.expectedName!==source.manualDisplayName)throw new Error('O nome mudou; revise a substituição na prévia.');
      if(current.some(r=>active(r)&&r.participantKind==='account'))throw new Error('Edite este participante pela lista de inscritos antes de reimportar.');
      const virtual={...tournament,canonicalRegistrationMigration:{...tournament.canonicalRegistrationMigration,registrationCount:current.length}};
      const plan=require('./rename-canonical-participant-core').plan(virtual,current,
        {oldName:source.manualDisplayName,newName:name,manualParticipantId},[],[]);
      if(Object.keys(plan.rootPatch).length||plan.documents.length)throw new Error('Edite este participante pela lista de inscritos antes de reimportar.');
      current=current.map(r=>r.registrationId===source.registrationId?{...r,manualDisplayName:name,isPlaceholder:false}:r);
    }else{
      if(current.some(r=>active(r)&&r.participantKind==='manual'&&manualNames.normalizeName(r.manualDisplayName)===manualNames.normalizeName(name)))
        throw new Error('Nome já inscrito em outra posição; confira a categoria e a numeração da planilha.');
      const changes=mutations.enroll(tournament.id,current,{manualParticipantId},[row.categoryId],
        {status:'confirmed',validationState:'approved',manualDisplayName:name});
      changes.creates.forEach(r=>Object.assign(r,{isPlaceholder:row.placeholder,importSlotOrdinal:row.ordinal,importSlotCategory:row.categoryId}));
      current=current.concat(changes.creates);
    }
  }
  const cap=Number(tournament.maxParticipants);
  if(Number.isSafeInteger(cap)&&cap>0&&new Set(current.filter(active).map(r=>r.participantKey)).size>cap)throw new Error('A planilha ultrapassa o total de vagas.');
  for(const [id,label]of definitions){
    const raw=Object.hasOwn(tournament.maxParticipantsByCategory||{},label)?tournament.maxParticipantsByCategory[label]:tournament.maxParticipantsPerCategory;
    const limit=Number(raw);if(Number.isSafeInteger(limit)&&limit>0&&current.filter(r=>active(r)&&r.categoryId===id).length>limit)
      throw new Error('A planilha ultrapassa as vagas de '+label+'.');
  }
  const before=new Map(original.map(r=>[r.registrationId,r]));
  return {updates:current.filter(r=>before.has(r.registrationId)&&JSON.stringify(r)!==JSON.stringify(before.get(r.registrationId))),
    creates:current.filter(r=>!before.has(r.registrationId))};
}
function normalizedBlock(block) {
  if (!Array.isArray(block) || !block.length || block.length > 8) throw new Error('bloco exige de 1 a 8 duplas');
  if(block.some(row=>row&&row.kind==='individual')){
    if(block.some(row=>row?.kind!=='individual'))throw new Error('Não misture duplas e pessoas no mesmo bloco.');
    const keys=new Set();
    return block.map(row=>{const next=normalizedIndividual(row),key=next.categoryId+'|'+next.ordinal;
      if(keys.has(key))throw new Error('posição individual repetida');keys.add(key);return next;});
  }
  if(block.some(row=>row?.kind!==undefined&&row.kind!=='pairs'))throw new Error('tipo de importação desconhecido');
  const usedPairs = new Set(), usedUids = new Set();
  return block.map((row) => {
    const pairId = text(row && row.pairId), categoryId = text(row && row.categoryId);
    if (!pairId || !categoryId || usedPairs.has(pairId)) throw new Error('vaga de dupla inválida ou repetida');
    usedPairs.add(pairId);
    const people = row && row.people;
    if (!Array.isArray(people) || people.length !== 2) throw new Error('dupla exige duas pessoas');
    return { pairId, categoryId, people: people.map((person) => {
      const name = text(person && person.name).replace(/\s+/g, ' ');
      const uid = text(person && person.uid);
      if (name.length < 2 || name.length > 120 || /[<>\u0000-\u001f]/.test(name)) throw new Error('nome inválido');
      if (uid && (uid.length > 128 || usedUids.has(uid))) throw new Error('conta inválida ou repetida');
      if (uid) usedUids.add(uid);
      return { name, uid: uid || null }; // null é a escolha explícita “Nenhum destes”.
    }) };
  });
}
function payloadHash(block) {
  return crypto.createHash('sha256').update(JSON.stringify(normalizedBlock(block))).digest('hex');
}
function receiptNames(block) {
  return normalizedBlock(block).flatMap((row, pairIndex) => row.people.map((person, side) => ({
    pairIndex, side, name: person.name, uid: person.uid,
  })));
}
function applyReviewedBlock(tournament, registrations, rawBlock) {
  const block = normalizedBlock(rawBlock);
  const tid = text(tournament && tournament.id);
  if (!tid) throw new Error('torneio inválido');
  const original = boundary.verifiedRoster(tournament, registrations).registrations;
  let current = original.slice();
  for (const row of block) {
    const pair = current.filter((item) => item.fixedPairId === row.pairId && active(item));
    if (pair.length !== 2 || pair.some((item) => !placeholder(item) || item.categoryId !== pair[0].categoryId)) {
      throw new Error('vaga alterada; atualize a prévia');
    }
    const sorted = pair.slice().sort((a, b) => a.registrationId.localeCompare(b.registrationId));
    if (pair[0].categoryId !== row.categoryId) {
      const move = mutations.reclassify(tid, current,
        { manualParticipantId: sorted[0].manualParticipantId }, pair[0].categoryId, row.categoryId);
      current = boundary.applyChanges(Object.assign({}, tournament, {
        canonicalRegistrationMigration: Object.assign({}, tournament.canonicalRegistrationMigration, { registrationCount: current.length }),
      }), current, move.updates, move.creates).registrations;
    }
    for (let index = 0; index < 2; index++) {
      const source = current.find((item) => item.manualParticipantId === sorted[index].manualParticipantId &&
        item.categoryId === row.categoryId && active(item));
      if (!source) throw new Error('vaga reclassificada não encontrada');
      const person = row.people[index];
      let changes;
      if (person.uid) {
        changes = claims.claimManualParticipant(tid, current, source.manualParticipantId, person.uid);
      } else {
        changes = { updates: [Object.assign({}, source, { manualDisplayName: person.name })], creates: [] };
      }
      const next = boundary.applyChanges(Object.assign({}, tournament, {
        canonicalRegistrationMigration: Object.assign({}, tournament.canonicalRegistrationMigration, { registrationCount: current.length }),
      }), current, changes.updates, changes.creates);
      current = next.registrations;
    }
  }
  const names = current.filter((item) => active(item) && item.participantKind === 'manual')
    .map((item) => manualNames.normalizeName(item.manualDisplayName));
  if (new Set(names).size !== names.length) throw new Error('nomes manuais repetidos; revise antes de gravar');
  const before = new Map(original.map((item) => [item.registrationId, item]));
  return {
    updates: current.filter((item) => before.has(item.registrationId) && JSON.stringify(item) !== JSON.stringify(before.get(item.registrationId))),
    creates: current.filter((item) => !before.has(item.registrationId)),
  };
}
module.exports = { individualMode, individualImportError, individualRoster, individualId, applyReviewedIndividuals, slots, fingerprint, normalizedBlock, payloadHash, receiptNames, applyReviewedBlock };
