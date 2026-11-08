'use strict';

const { normalizeName, duplicateManualName } = require('./manual-name-unique-core');
const { verifiedRoster } = require('./canonical-registration-boundary-core');

const text = (value) => typeof value === 'string' ? value.trim() : '';
const same = (a, b) => normalizeName(a) === normalizeName(b);

function replaceLabel(value, oldName, newName) {
  if (typeof value !== 'string') return value;
  if (same(value, oldName)) return newName;
  if (!value.includes(' / ')) return value;
  return value.split(' / ').map((part) => same(part, oldName) ? newName : part.trim()).join(' / ');
}

function hasIdentity(value, manualId) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasIdentity(item, manualId));
  return Object.entries(value).some(([key, part]) =>
    ((key === 'manualParticipantId' || /ManualId$/.test(key)) && part === manualId) ||
    (part && typeof part === 'object' && hasIdentity(part, manualId)));
}

function hasOldLabel(value, oldName) {
  if (typeof value === 'string') return replaceLabel(value, oldName, '__probe__') !== value;
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, part]) =>
    replaceLabel(key, oldName, '__probe__') !== key || hasOldLabel(part, oldName));
}

function replaceStrings(value, oldName, newName) {
  if (typeof value === 'string') return replaceLabel(value, oldName, newName);
  if (Array.isArray(value)) return value.map((part) => replaceStrings(part, oldName, newName));
  if (!value || typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const next = {};
  Object.entries(value).forEach(([key, part]) => {
    next[replaceLabel(key, oldName, newName)] = replaceStrings(part, oldName, newName);
  });
  return next;
}

function plan(tournament, registrations, input, accountNames, physicalDocuments) {
  // verifiedRoster is the shared receipt boundary. Never fall through to a
  // legacy name writer when the canonical collection exists but is invalid.
  const checked = verifiedRoster(tournament, registrations);
  const oldName = text(input.oldName), newName = text(input.newName);
  const manualId = text(input.manualParticipantId);
  if (!manualId || !oldName || newName.length < 2 || newName.length > 160 || /[<>\x00-\x1f]/.test(newName)) {
    throw new Error('nome ou identidade inválidos');
  }
  const targets = checked.registrations.filter((item) => item.status === 'confirmed' &&
    item.participantKind === 'manual' && item.manualParticipantId === manualId);
  if (targets.length !== 1 || targets[0].participantUid) throw new Error('inscrição manual não encontrada ou ambígua');
  const target = targets[0];
  if (!same(target.manualDisplayName, oldName)) throw new Error('o nome mudou; atualize a tela');
  if (oldName === newName) return { changed: false, target, documents: [], rootPatch: {} };
  const others = checked.registrations.filter((item) => item.registrationId !== target.registrationId);
  const otherManual = others.filter((item) => item.participantKind === 'manual');
  const projection = { participants: otherManual.map((item) => ({ displayName: item.manualDisplayName })) };
  if (duplicateManualName(projection, { displayName: newName })) throw new Error('já há inscrito com esse nome');
  if (otherManual.some((item) => same(item.manualDisplayName, oldName))) throw new Error('nome antigo pertence a mais de um inscrito');
  const liveNames = Array.isArray(accountNames) ? accountNames : [];
  if (liveNames.some((name) => same(name, oldName))) throw new Error('nome antigo é ambíguo com uma conta');
  if (liveNames.some((name) => same(name, newName))) throw new Error('já há uma conta com esse nome');
  const documents = [];
  for (const doc of physicalDocuments || []) {
    const data = doc.data || {};
    const identified = hasIdentity(data, manualId);
    // A identidade do nome também foi provada contra todas as inscrições e
    // perfis acima. Assim um rótulo herdado sem ID pode acompanhar a correção.
    if (!identified && !hasOldLabel(data, oldName)) continue;
    const next = replaceStrings(data, oldName, newName);
    if (JSON.stringify(next) !== JSON.stringify(data)) documents.push({ ref: doc.ref, data: next });
  }
  const rootPatch = {};
  for (const key of ['classification', 'classificationEntries', 'checkedIn', 'absent', 'vips',
    'standings', 'waitlist', 'standbyParticipants', 'sorteioRealizado', 'monarchWaitlist']) {
    if (!Object.prototype.hasOwnProperty.call(tournament, key)) continue;
    const before = tournament[key];
    if (!hasOldLabel(before, oldName)) continue;
    rootPatch[key] = replaceStrings(before, oldName, newName);
  }
  return { changed: true, target, documents, rootPatch };
}

module.exports = { plan, hasIdentity, replaceLabel };
