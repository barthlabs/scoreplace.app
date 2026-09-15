'use strict';
/* A escala de arbitragem passa pela Function transacional; o navegador manda só intenção.
 * O contrato puro barra contato e impede duplicata, e a CF autoriza com estado fresco. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const roster = require(path.join(ROOT, 'js/domain/referee-roster.js'));
let ok = 0;
const must = (value, message) => { assert.ok(value, message); ok++; console.log('  ✓ ' + message); };

console.log('\n──── arbitragem transacional, sem contato no torneio ────\n');
const invite = roster.apply([], {
  action: 'invite', targetUid: 'ref-1', callerUid: 'org-1', now: '2026-09-14T12:00:00.000Z',
  profile: { displayName: 'Árbitra Pública', photoURL: 'https://example.test/a.png', email: 'nao-pode-ir@teste.com', phone: '+5511999999999' }
});
must(invite.changed && invite.arbitros.length === 1, '① convite cria uma única entrada');
must(JSON.stringify(invite.arbitros).indexOf('nao-pode-ir@teste.com') === -1 && JSON.stringify(invite.arbitros).indexOf('99999999') === -1,
  '① contato do perfil nunca entra em arbitros[]');
must(invite.arbitros[0].uid === 'ref-1' && invite.arbitros[0].status === 'invited', '① UID e status são a identidade persistida');
const duplicate = roster.apply(invite.arbitros, {
  action: 'invite', targetUid: 'ref-1', callerUid: 'org-1', now: '2026-09-14T12:01:00.000Z', profile: { displayName: 'Outro nome' }
});
must(!duplicate.changed && duplicate.arbitros.length === 1, '② convite repetido não duplica árbitro');
const confirmed = roster.apply(invite.arbitros, {
  action: 'self-confirm', targetUid: 'org-1', callerUid: 'org-1', now: '2026-09-14T12:02:00.000Z', profile: { displayName: 'Organizador' }
});
must(confirmed.arbitros.some((entry) => entry.uid === 'org-1' && entry.status === 'confirmed'), '③ autoconfirmação só produz status confirmado para o próprio UID');
assert.throws(() => roster.apply([], { action: 'self-confirm', targetUid: 'outra-pessoa', callerUid: 'org-1', now: '2026-09-14T12:02:00.000Z', profile: {} }));
ok++; console.log('  ✓ ③ contrato recusa autoconfirmação de outra pessoa');
const scrubbed = roster.apply([{ uid: 'legado', name: 'Legado', email: 'vazamento@teste.com', phone: '123' }], {
  action: 'remove', targetUid: 'ausente', callerUid: 'org-1', now: '2026-09-14T12:03:00.000Z', profile: null
});
must(scrubbed.changed && JSON.stringify(scrubbed.arbitros).indexOf('vazamento@teste.com') === -1, '④ qualquer alteração saneia contato legado');

const client = fs.readFileSync(path.join(ROOT, 'js/views/arbitros.js'), 'utf8');
const fn = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const actionBlock = client.slice(client.indexOf('function _callArbitro'), client.lastIndexOf('\n})();'));
must((actionBlock.match(/manageTournamentReferee\(tId, action, uid\)/g) || []).length === 1, '⑤ as três ações usam a única porta semântica de arbitragem');
must(!/\.update\(|arrayUnion|arrayRemove|usersPublic|firebase\.functions|_callFn\(/.test(actionBlock), '⑤ a aba não lê nem escreve a escala diretamente nem conhece o transporte Firebase');
must(/_tRef\(tId\)\.get\(\{ source: 'server' \}\)/.test(client) && /refQuery\.limit\(80\)\.get\(\{ source: 'server' \}\)/.test(client),
  '⑤ a abertura recusa fotografia de cache para escala e árbitros disponíveis');
must(!/collection\('users'\)/.test(client) && /_COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'/.test(client),
  '⑤ a lista de árbitros lê só o espelho público');
must(!/preferredLocations|venueLat|venueLon/.test(client),
  '⑤ coordenadas privadas não entram na escala');

const gateway = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
must(/async manageTournamentReferee\(tournamentId, action, uid\)/.test(gateway) && /_callFn\('manageTournamentReferee'/.test(gateway), '⑤ o gateway concentra nome e payload da callable');
must(/exports\.manageTournamentReferee = onCall\(/.test(fn) && /db\.runTransaction\(/.test(fn), '⑥ a Function altera a escala em transação');
must(/_isTournamentOrgCaller\(t, callerUid\)/.test(fn) && /collection\("usersPublic"\)\.doc\(targetUid\)/.test(fn), '⑥ autorização e perfil público são conferidos no servidor');
must(/_splitParts\.gravar\(tx, ref, before/.test(fn) && /arbitros: outcome\.arbitros/.test(fn), '⑥ a gravação preserva as partes do torneio');
must(/action === "self-confirm" \? callerUid : requestedUid/.test(fn), '⑥ o servidor ignora UID exibido ao autoconfirmar');

console.log('\n✅ ' + ok + ' verificações');
