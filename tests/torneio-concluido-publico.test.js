/* O encerramento muda a ficha para leitura pública e retira ações operacionais.
 * Exercita o render real com visitante, participante e organizador. */
'use strict';
const assert = require('assert');
const H = require('./render-harness');
const W = H.sandbox;

function box() {
  return { innerHTML: '', style: {}, dataset: {}, appendChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, addEventListener() {}, classList: {
      add() {}, remove() {}, contains() { return false; }
    } };
}
function show(t, role) {
  W.AppStore.tournaments = [t];
  W.AppStore.getVisibleTournaments = () => [t];
  W._findTournamentById = () => t;
  W.AppStore.currentUser = role === 'visitor' ? null : {
    uid: role, email: role === 'org' ? 'org@scoreplace.test' : 'player@scoreplace.test', _profileLoaded: true
  };
  W.AppStore.isCreator = () => role === 'org';
  const c = box();
  W.renderTournaments(c, t.id);
  return c.innerHTML;
}

const t = H.simulate(H.buildDupla(6));
Object.assign(t, { id: 'finished-fixture', name: 'Torneio concluído', sport: 'Beach Tennis',
  organizerEmail: 'org@scoreplace.test', status: 'finished', tournamentStarted: 123,
  allowPrePublicationRestore: true, rulesContractVersion: 2,
  titleAwards: [{ scope:'overall', winnerName:'Campeão' }] });
for (const role of ['visitor', 'player', 'org']) {
  const html = show(t, role);
  assert(html.length > 10000, `${role}: detalhe carregado`);
  assert(html.includes('Classificação geral'), `${role}: classificação final pública`);
  assert(/<details(?![^>]*\bopen\b)[^>]*><summary[^>]*>[^<]*Classificação geral/.test(html),
    `${role}: classificação final recolhida, com seta para expandir`);
  assert(!html.includes('Voltar ao estado antes do sorteio'), `${role}: sem restauração`);
  assert(!html.includes('Resetar (manter inscritos)'), `${role}: sem reset`);
  assert(!html.includes('Avançar de Fase'), `${role}: sem avanço`);
}

W.AppStore.tournaments = [t];
W.AppStore.currentUser = { uid: 'org', email: 'org@scoreplace.test', _profileLoaded: true };
const bracket = box();
W.renderBracket(bracket, t.id, false);
assert(bracket.innerHTML.length > 10000, 'chave histórica carregada');
assert(!bracket.innerHTML.includes('operational-schedule-'), 'sem faixa de operação');
assert(!bracket.innerHTML.includes('Jogos Prontos'), 'sem chamada para quadra');
assert(!bracket.innerHTML.includes('Avançar</button>'), 'sem avanço de fase na chave');

const started = H.buildDupla(6);
Object.assign(started, { id: 'started-fixture', name: 'Torneio em andamento', sport: 'Beach Tennis',
  organizerEmail: 'org@scoreplace.test', status: 'active', tournamentStarted: 123,
  allowPrePublicationRestore: true });
assert(!show(started, 'org').includes('Voltar ao estado antes do sorteio'),
  'torneio iniciado não oferece restauração, mesmo com autorização antiga');

let dialogs = 0;
W.showAlertDialog = () => { dialogs++; };
W.AppStore.tournaments = [started];
W._resetTournamentToEnrollment(started.id);
W._restoreTournamentPrePublication(started.id);
assert.strictEqual(dialogs, 0, 'comandos antigos não abrem reset em torneio real iniciado');
W._isTestIdentity = () => true;
const matchesBefore = JSON.stringify(started.matches);
W._devSimulateCurrentPhase(started.id);
assert.strictEqual(JSON.stringify(started.matches), matchesBefore,
  'simulação de teste também não altera torneio real');

// O ensaio no torneio real fica restrito ao período privado de teste.
const devUid = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const rehearsed = H.buildDupla(6);
Object.assign(rehearsed, { id:'rehearsal-fixture', name:'Ensaio publicado',
  sport:'Beach Tennis', creatorUid:devUid, status:'active', isPublic:true,
  organizerOnly:false, rehearsal:{ state:'active', epoch:'x', hash:'y' } });
W.AppStore.tournaments = [rehearsed];
W.AppStore.getVisibleTournaments = () => [rehearsed];
W._findTournamentById = () => rehearsed;
W.AppStore.currentUser = { uid:devUid, email:'dev@scoreplace.test', _profileLoaded:true };
W.AppStore.isCreator = () => true;
const remoteCalls = [];
W.FirestoreDB = { _callFn(name) { remoteCalls.push(name); return Promise.resolve({}); } };
W._falhouCalado = () => () => {};
const published = box();
W.renderTournaments(published, rehearsed.id);
assert(!published.innerHTML.includes('Resetar teste'), 'torneio público não oferece reset de ensaio');
const dialogsBefore = dialogs;
W._realTournamentRehearsalAction(rehearsed.id, 'reset');
assert.strictEqual(dialogs, dialogsBefore, 'ação antiga não abre reset após publicação');
assert(!remoteCalls.includes('resetTournamentToEnrollment'), 'ação antiga não chama reset remoto');
rehearsed.isPublic = false; rehearsed.organizerOnly = true;
const privateTest = box();
W.renderTournaments(privateTest, rehearsed.id);
assert(!privateTest.innerHTML.includes('_realTournamentRehearsalAction'), 'ensaio ativo não oferece reset antigo');
W._isDeveloperIdentity = () => true;
rehearsed.rehearsal.state = 'resetting';
W.renderTournaments(privateTest, rehearsed.id);
assert(privateTest.innerHTML.includes('_realTournamentRehearsalAction'), 'reset interrompido no teste privado pode ser retomado');
rehearsed.isPublic = true;
W.renderTournaments(privateTest, rehearsed.id);
assert(!privateTest.innerHTML.includes('_realTournamentRehearsalAction'), 'torneio público mantém a restrição da callable de recuperação');

console.log('✅ torneio concluído: classificação pública e operação encerrada');
