'use strict';
/* O W.O. de uma conta pode EXIBIR nome, mas nunca deve persistir um nome como identidade.
 * Este contrato exercita o claim e o gravador usados pela Cloud Function e pelo cliente. */
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const { transition } = require('../functions-autodraw/wo-claim-core.js');
let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; console.log('  ✓ ' + message); }

const U = { reporter: 'uid-reporter-123456789', absent: 'uid-absent-123456789', partner: 'uid-partner-123456789', substitute: 'uid-substitute-123456789' };
const t = { woClaims: [] };
const ctx = { key: 'm|m-1', scope: 'match', matchId: 'm-1', memberUids: [U.reporter, U.absent, U.partner],
  members: [{ uid: U.reporter, name: 'Quem apontou' }, { uid: U.absent, name: 'Nome antigo' }, { uid: U.partner, name: 'Parceiro' }] };
const out = transition(t, { action: 'declare', uid: U.reporter, isAdmin: true, absentUid: U.absent, absentName: 'Texto adulterado', byName: 'Texto adulterado', context: ctx, claimId: 'c1', now: '2026-09-15T00:00:00Z' });
ok(out.ok, 'claim de conta é aceito pelo UID estrutural');
ok(JSON.stringify(out.claim).indexOf('Nome antigo') === -1 && JSON.stringify(out.claim).indexOf('Texto adulterado') === -1,
  'claim de conta não guarda nenhum nome de perfil');
ok(out.claim.absentUids[0] === U.absent && out.claim.byUid === U.reporter, 'claim mantém os UIDs que identificam os dois lados');

const source = fs.readFileSync('js/store.js', 'utf8');
const start = source.indexOf('window._woHistGet = function');
const end = source.indexOf('// v2.4.72-beta:', start);
assert.ok(start > 0 && end > start, 'funções de histórico localizadas');
const sandbox = { window: {} };
sandbox.window._idMapKey = (_t, who) => ({ uid: (who && who.uid) || '', name: (who && who.displayName) || (typeof who === 'string' ? who : '') });
sandbox.window._memberNameByUid = (_t, uid) => ({ [U.absent]: 'Nome atual do perfil' }[uid] || '');
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox, { filename: 'store-wo-history-contract.js' });
const histTournament = { woHistory: {} };
sandbox.window._woHistSet(histTournament, { uid: U.absent, displayName: 'Nome antigo' }, {
  name: 'Nome antigo', originalTeam: 'Nome antigo / Parceiro', partner: 'Parceiro', replacedBy: 'Substituto',
  partnerUid: U.partner, substituteUid: U.substitute, matchId: 'm-1', matchNum: 1
});
const meta = histTournament.woHistory[U.absent];
ok(meta && meta.partnerUid === U.partner && meta.substituteUid === U.substitute, 'histórico preserva as relações por UID');
ok(!('name' in meta) && !('originalTeam' in meta) && !('partner' in meta) && !('replacedBy' in meta),
  'histórico de conta remove nomes e times textuais');
ok(sandbox.window._woHistDisplayName(histTournament, U.absent, meta) === 'Nome atual do perfil', 'tela resolve o nome atual do perfil pelo UID');

sandbox.window._woHistSet(histTournament, 'Jogador X', { matchNum: 2 });
ok(histTournament.woHistory['Jogador X'].name === 'Jogador X', 'convidado sem conta permanece com nome, sua única identidade');

const woCore = fs.readFileSync('js/views/wo-core.js', 'utf8');
ok(woCore.includes('originalTeamUids') && woCore.includes('partnerUid') && woCore.includes('substituteUid'),
  'motor grava contexto de substituição por UID');

const identitySource = fs.readFileSync('js/views/identity-core.js', 'utf8');
const sanitizerStart = identitySource.indexOf('window._stripStoredOrganizationAccountLabels = function');
assert.ok(sanitizerStart >= 0, 'sanitizadores de organização e W.O. localizados');
const sanitizerSandbox = { window: { _participantUids: entry => [entry && entry.uid].filter(Boolean) } };
vm.createContext(sanitizerSandbox);
vm.runInContext(identitySource.slice(sanitizerStart), sanitizerSandbox, { filename: 'identity-wo-write-boundary.js' });
const dirty = { participants: [{ uid: U.absent }],
  woClaims: [{ absentUids: [U.absent], absentName: 'Nome velho', substituteName: 'Substituto', byName: 'Apontador', players: ['Nome velho'] }],
  absent: { [U.absent]: { name: 'Nome velho', displayName: 'Nome velho', email: 'x@y.z', phone: '55' } },
  woHistory: { [U.absent]: { name: 'Nome velho', originalTeam: 'Nome velho / Parceiro', partner: 'Parceiro', replacedBy: 'Substituto', partnerUid: U.partner } },
  coHosts: [{ uid: U.reporter, displayName: 'Organizador antigo', email: 'org@example.com' }],
  pendingTransfer: { targetUid: U.substitute, targetName: 'Sucessor antigo', targetEmail: 'next@example.com' } };
const sanitized = sanitizerSandbox.window._stripStoredWoAccountLabels(dirty);
ok(!('absentName' in sanitized.woClaims[0]) && !('byName' in sanitized.woClaims[0]) && !('players' in sanitized.woClaims[0]),
  'sanitizador remove textos do claim de conta');
ok(!('name' in sanitized.absent[U.absent]) && !('email' in sanitized.absent[U.absent]) && !('replacedBy' in sanitized.woHistory[U.absent]),
  'sanitizador remove textos da ausência e do histórico de conta');
const orgSanitized = sanitizerSandbox.window._stripStoredOrganizationAccountLabels(sanitized);
ok(!('displayName' in orgSanitized.coHosts[0]) && !('email' in orgSanitized.coHosts[0]) && !('targetName' in orgSanitized.pendingTransfer),
  'coorganização e transferência pendente guardam somente UIDs e estado');

const firebaseDb = fs.readFileSync('js/firebase-db.js', 'utf8');
const saveBody = firebaseDb.slice(firebaseDb.indexOf('async saveTournament('), firebaseDb.indexOf('async getTournament(', firebaseDb.indexOf('async saveTournament(')));
const mutateBody = firebaseDb.slice(firebaseDb.indexOf('async mutateTournament('), firebaseDb.indexOf('async mutateMatchResult(', firebaseDb.indexOf('async mutateTournament(')));
ok(saveBody.includes('cleanData = window._stripStoredWoAccountLabels(cleanData)'), 'saveTournament fecha a porta de regravação de rótulos W.O.');
ok(mutateBody.includes('_persist = window._stripStoredWoAccountLabels(_persist)'), 'mutateTournament fecha a porta transacional de rótulos W.O.');
ok(saveBody.includes('cleanData = window._stripStoredOrganizationAccountLabels(cleanData)') && mutateBody.includes('_persist = window._stripStoredOrganizationAccountLabels(_persist)'),
  'as portas centrais também bloqueiam rótulos de coorganização');
console.log('✅ ' + passed + ' asserções — contrato UID-only do W.O.');
