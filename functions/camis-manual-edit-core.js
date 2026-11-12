'use strict';

// Ações de nomes digitados do único torneio CAMIS de ensaio. Planejamento puro:
// o handler valida UID e grava raiz, inscrições, jogos e fotografia numa transação.
const crypto = require('node:crypto');
const mutations = require('./registration-mutations-core');
const boundary = require('./canonical-registration-boundary-core');
const { normalizeName } = require('./manual-name-unique-core');
const { replaceStrings, hasOldLabel } = require('./rename-canonical-participant-core');

const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const OWNER = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const fail = message => { throw new Error(message); };

// Mesmo contrato de hash do checkpoint em functions-autodraw/tournament-rehearsal.js.
function canonical(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { $type:'bytes', value:Buffer.from(value).toString('base64') };
  if (value instanceof Date) return { $type:'date', value:value.toISOString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object') return value;
  if (typeof value.toDate === 'function' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds))
    return { $type:'timestamp', seconds:value.seconds, nanoseconds:value.nanoseconds };
  if (typeof value.path === 'string' && value.firestore && typeof value.get === 'function')
    return { $type:'reference', path:value.path };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number')
    return { $type:'geopoint', latitude:value.latitude, longitude:value.longitude };
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonical(value[key]);
  return result;
}
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex');
function projectedSize(value) {
  const json = JSON.stringify(canonical(value));
  const fields = (json.match(/"[^"\\]*(?:\\.[^"\\]*)*"\s*:/g) || []).length;
  return Buffer.byteLength(json, 'utf8') * 2 + fields * 32 + 4096;
}
const baselinePayload = base => ({ root:base.root, tree:base.tree, summary:base.summary || null });
const same = (a,b) => normalizeName(a) === normalizeName(b);
const text = value => typeof value === 'string' ? value.trim() : '';

function replaceFutureEmbedded(value,oldName,newName) {
  if (Array.isArray(value)) return value.map(item => replaceFutureEmbedded(item,oldName,newName));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  // Algumas fases guardam também partidas dentro da raiz. O histórico concluído
  // continua da formação que jogou; só a vaga futura recebe a nova atleta.
  if ((typeof value.p1 === 'string' || typeof value.p2 === 'string') &&
      hasOldLabel(value,oldName)) {
    const state = gameState(value);
    if (state === 'playing') fail('termine ou cancele a partida em andamento antes da troca');
    if (state === 'completed') return value;
    return replaceStrings(value,oldName,newName);
  }
  return Object.fromEntries(Object.entries(value).map(([key,part]) =>
    [key,replaceFutureEmbedded(part,oldName,newName)]));
}

function clearFormerPresence(root,manualId,oldName) {
  const keys = new Set(['manual:' + manualId,manualId,oldName]);
  for (const field of ['checkedIn','checkedInConfirmed','absent']) {
    if (!root[field] || typeof root[field] !== 'object' || Array.isArray(root[field])) continue;
    root[field] = Object.fromEntries(Object.entries(root[field]).filter(([key]) => !keys.has(key)));
  }
  return root;
}

function gameState(game) {
  if (!game || typeof game !== 'object') fail('partida sem dados');
  if (game.winner != null || game.wo || game.resultAt || game.completedAt) return 'completed';
  if (game.startedAt || game.liveScored || game.pendingResult || game.scoreP1 != null ||
      game.scoreP2 != null || (Array.isArray(game.sets) && game.sets.length)) return 'playing';
  return 'future';
}

function plan({ tournament, baseline, registrations, matches, action, oldName, newName,
  manualParticipantId, newManualParticipantId, now }) {
  const t = tournament || {}, b = baseline || {};
  oldName = text(oldName); newName = text(newName); manualParticipantId = text(manualParticipantId);
  if (t.id !== ID || t.creatorUid !== OWNER || t.name !== 'Camis no Beyond' ||
      t.isPublic !== false || t.organizerOnly !== true || t.isSandbox === true)
    fail('ação limitada ao torneio privado CAMIS');
  if (!['rename','replace'].includes(action) || !oldName || !manualParticipantId ||
      newName.length < 2 || newName.length > 120 || /[<>\x00-\x1f]/.test(newName) || same(oldName,newName))
    fail('nome ou ação inválida');
  if (t.rehearsal?.state !== 'active' || t.rehearsal?.mode !== 'postDraw' ||
      b.state !== 'active' || b.mode !== 'postDraw' || b.hash !== t.rehearsal.hash ||
      b.epoch !== t.rehearsal.epoch || !Array.isArray(b.tree) || fingerprint(baselinePayload(b)) !== b.hash)
    fail('fotografia pós-sorteio indisponível ou divergente');
  // Depois de lançar um placar a raiz pode divergir da foto, mas a foto precisa
  // continuar íntegra e a identidade estrutural da inscrição deve ser única.
  if (!Array.isArray(registrations) || !Array.isArray(matches) || registrations.length > 400 || matches.length > 400)
    fail('elenco ou jogos fora do limite seguro');
  boundary.verifiedRoster(t, registrations.map(item => item.data));
  if (registrations.some(item => item.id !== item.data.registrationId))
    fail('identidade física da inscrição diverge do registro canônico');
  const targetRows = registrations.filter(item => item.data.status === 'confirmed' &&
    item.data.participantKind === 'manual' && item.data.manualParticipantId === manualParticipantId);
  if (targetRows.length !== 1 || !same(targetRows[0].data.manualDisplayName,oldName))
    fail('inscrição mudou; atualize a tela');
  const target = targetRows[0];
  if (registrations.some(item => item.id !== target.id && item.data.status === 'confirmed' &&
      same(item.data.manualDisplayName,newName))) fail('já existe atleta com esse nome');
  if (registrations.some(item => item.id !== target.id && item.data.status === 'confirmed' &&
      same(item.data.manualDisplayName,oldName))) fail('nome anterior ambíguo');
  const category = (t.categoryDefinitions || []).find(item => item.id === target.data.categoryId)?.label;
  const official = t.camisOfficialGroups || {};
  const locations = Object.entries(official).flatMap(([label,groups]) =>
    (Array.isArray(groups) ? groups : []).flatMap((group,gi) =>
      (Array.isArray(group) ? group : []).flatMap((name,slot) => same(name,oldName) ? [{label,gi,slot}] : [])));
  if (locations.length !== 1 || locations[0].label !== category ||
      Object.values(official).some(groups => groups.some(group => group.some(name => same(name,newName)))))
    fail('grupo oficial ausente, duplicado ou alterado');
  const { gi, slot } = locations[0];
  const nextGroups = { ...official, [category]:official[category].map((group,i) =>
    i === gi ? group.map((name,j) => j === slot ? newName : name) : group) };
  const touched = matches.filter(item => hasOldLabel(item.data,oldName));
  if (!touched.length) fail('a atleta não aparece nos jogos publicados');
  const liveMatches = [];
  let completedGames = 0;
  for (const item of touched) {
    const game = item.data.jogo || item.data;
    if (game.category && game.category !== category && game.category !== target.data.categoryId &&
        game.categoryId !== target.data.categoryId) fail('nome encontrado em outra categoria');
    if (game.isMonarch === true && Number(game.monarchGroup) !== gi)
      fail('nome encontrado fora do quarteto esperado');
    const state = gameState(game);
    if (action === 'replace' && state === 'playing') fail('termine ou cancele a partida em andamento antes da troca');
    if (action === 'replace' && state === 'completed') { completedGames++; continue; }
    liveMatches.push({ id:item.id, data:replaceStrings(item.data,oldName,newName) });
  }
  const oldRegPath = `registrations/${target.id}`;
  if (b.tree.filter(item => item.path === oldRegPath && same(item.data.manualDisplayName,oldName)).length !== 1)
    fail('inscrição da fotografia não corresponde à vaga atual');
  const nextReg = action === 'rename'
    ? { ...target.data, manualDisplayName:newName, updatedAt:now }
    : (() => {
        if (!newManualParticipantId) fail('identidade da nova atleta ausente');
        const created = mutations.enroll(ID,registrations.map(item => item.data),{ manualParticipantId:newManualParticipantId },
          [target.data.categoryId],{ status:'confirmed',validationState:'approved',manualDisplayName:newName }).creates[0];
        if (!created) fail('identidade da nova atleta já existe');
        return { ...target.data, ...created, enrollSeq:target.data.enrollSeq,
          createdAt:now,updatedAt:now };
      })();
  if (action === 'replace' && registrations.some(item => item.id === nextReg.registrationId))
    fail('inscrição de destino já existe');
  const nextRegistrations = action === 'rename'
    ? registrations.map(item => item.id === target.id ? nextReg : item.data)
    : registrations.map(item => item.id === target.id
      ? { ...item.data,status:'withdrawn',withdrawnReason:'replaced',updatedAt:now } : item.data).concat(nextReg);
  // É uma troca da mesma vaga: a quantidade ativa na categoria e a lista de
  // espera permanecem idênticas, inclusive quando o teto já foi atingido.
  if (action === 'replace') {
    const countActive = rows => rows.filter(item => item.categoryId === target.data.categoryId &&
      item.status === 'confirmed').length;
    if (countActive(nextRegistrations) !== countActive(registrations.map(item => item.data)) ||
        nextRegistrations.filter(item => item.status === 'waitlisted').length !==
          registrations.filter(item => item.data.status === 'waitlisted').length)
      fail('substituição alteraria capacidade ou lista de espera');
  }
  const nextMigration = { ...t.canonicalRegistrationMigration, registrationCount:nextRegistrations.length };
  boundary.verifiedRoster({ ...t,canonicalRegistrationMigration:nextMigration },nextRegistrations);
  const nextRoot = action === 'rename' ? replaceStrings(t,oldName,newName)
    : { ...t,camisOfficialGroups:nextGroups,canonicalRegistrationMigration:nextMigration };
  if (action === 'replace') {
    for (const key of ['matches','rounds','phaseRounds','groups','grupos','rodadas']) {
      if (key in t) nextRoot[key] = replaceFutureEmbedded(t[key],oldName,newName);
    }
    clearFormerPresence(nextRoot,manualParticipantId,oldName);
  }
  nextRoot.camisOfficialGroups = nextGroups;
  const baseRegData = action === 'rename'
    ? { ...b.tree.find(item => item.path === oldRegPath).data,manualDisplayName:newName }
    : nextReg;
  const nextBaseTree = b.tree.filter(item => action !== 'replace' || item.path !== oldRegPath)
    .map(item => item.path === oldRegPath ? { path:item.path,data:baseRegData }
      : { path:item.path,data:replaceStrings(item.data,oldName,newName) });
  if (action === 'replace') nextBaseTree.push({ path:`registrations/${nextReg.registrationId}`,data:nextReg });
  nextBaseTree.sort((a,b) => a.path.localeCompare(b.path));
  const nextBaseRoot = replaceStrings(b.root,oldName,newName);
  nextBaseRoot.camisOfficialGroups = nextGroups;
  if (action === 'replace') clearFormerPresence(nextBaseRoot,manualParticipantId,oldName);
  const payload = { root:nextBaseRoot,tree:nextBaseTree,summary:b.summary || null };
  if (projectedSize(payload) > 900 * 1024) fail('fotografia próxima do limite do Firestore');
  const hash = fingerprint(payload);
  nextRoot.rehearsal = { ...t.rehearsal,hash };
  const nextBaseline = { ...b,root:nextBaseRoot,tree:nextBaseTree,hash };
  if (action === 'replace' && completedGames && hasOldLabel(nextRoot.camisOfficialGroups,oldName))
    fail('quarteto atual não foi atualizado');
  return { target, nextReg, nextRoot, nextBaseline, liveMatches, completedGames,
    group:gi + 1, category,hash };
}

module.exports = { ID, OWNER, plan, fingerprint, projectedSize, gameState };
