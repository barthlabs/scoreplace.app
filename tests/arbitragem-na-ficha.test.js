'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { sandbox: W } = require('./render-harness');

const index = fs.readFileSync('index.html', 'utf8');
assert(index.indexOf('js/domain/referee-roster.js?v=') >= 0);
assert(index.indexOf('js/domain/referee-roster.js?v=') < index.indexOf('js/views/tournaments.js?v='));

function show(arbitros, viewer) {
  const t = { id: 'arb-test', name: 'Torneio', sport: 'Beach Tennis', status: 'open',
    creatorUid: 'org-uid', organizerName: 'Organizador', isPublic: true,
    participants: [], rounds: [], matches: [], groups: [], arbitros };
  const el = { innerHTML: '', style: {}, dataset: {}, appendChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, classList: { add() {}, remove() {}, contains() { return false; } } };
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = viewer ? { uid: viewer, displayName: 'Visitante' } : null;
  W._userProfileCache = { ref1: { displayName: 'Nome Atual' } };
  W.renderTournaments(el, t.id);
  return el.innerHTML;
}

assert(!show([]).includes('>ARBITRAGEM<'), 'sem árbitro não há seção vazia');
const invited = [{ uid: 'ref1', name: 'Nome Antigo', status: 'invited', email: 'nao-publicar@example.test' }];
assert(!show(invited, 'viewer-uid').includes('>ARBITRAGEM<'), 'visitante não vê convite pendente');
const organizerHtml = show(invited, 'org-uid');
assert(organizerHtml.includes('>ARBITRAGEM<') && organizerHtml.includes('Convite pendente'), 'organização vê convite pendente');
assert(!organizerHtml.includes('nao-publicar@example.test'), 'dado privado não aparece');
const confirmedHtml = show([{ uid: 'ref1', name: 'Nome Antigo', status: 'confirmed' }], 'viewer-uid');
assert(confirmedHtml.includes('>ARBITRAGEM<'), 'árbitro confirmado aparece para visitantes');
assert(confirmedHtml.includes('Nome Atual') && !confirmedHtml.includes('Nome Antigo'), 'nome atual do perfil prevalece');
assert(confirmedHtml.indexOf('>ORGANIZAÇÃO<') < confirmedHtml.indexOf('>ARBITRAGEM<'), 'arbitragem depois da organização');
assert(confirmedHtml.indexOf('>ARBITRAGEM<') < confirmedHtml.indexOf('data-detail-participants="1"') || !confirmedHtml.includes('data-detail-participants="1"'), 'arbitragem antes do elenco');
const rosterModule = W.ScoreplaceRefereeRoster;
W.ScoreplaceRefereeRoster = undefined;
try {
  assert(!show([{ uid: 'ref1', name: 'Nome Antigo', status: 'confirmed' }], 'viewer-uid').includes('>ARBITRAGEM<'), 'ficha continua aberta se o módulo falhar');
} finally {
  W.ScoreplaceRefereeRoster = rosterModule;
}
console.log('✅ arbitragem condicional, privada quando pendente e abaixo da organização');
