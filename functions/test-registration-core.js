'use strict';

const C = require('./registration-core');
const B = require('./registration-category-bridge-core');
let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) pass++;
  else { fail++; console.error('✗ ' + name); }
}
function throws(name, fn) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  ok(name, threw);
}

ok('uid produz chave discriminada', C.participantKey({ uid: 'uid-ana' }) === 'uid:uid-ana');
ok('manualParticipantId produz chave discriminada', C.participantKey({ manualParticipantId: 'manual-ana' }) === 'manual:manual-ana');
throws('não aceita identidade dupla', () => C.participantKey({ uid: 'u', manualParticipantId: 'm' }));
throws('não usa nome como identidade', () => C.participantKey({ displayName: 'Ana' }));

const cats = C.categoryIds({ categories: ['Fem A', 'Masc B', 'Fem A', ' '] });
ok('categorias múltiplas são únicas e determinísticas', JSON.stringify(cats) === JSON.stringify(['Fem A', 'Masc B']));
ok('categoria ausente recebe sentinela explícita', C.categoryIds({})[0] === C.UNCATEGORIZED_CATEGORY_ID);
const mapLegacyCategory = B.categoryBridge([
  { id: 'fem-a', label: 'Fem A' }, { id: 'masc-b', label: 'Masc B' },
]);
ok('migração traduz rótulo legado para id tipado uma única vez', JSON.stringify(C.categoryIds({ categories: ['Fem A', 'Masc B'] }, mapLegacyCategory)) === JSON.stringify(['fem-a', 'masc-b']));
throws('migração recusa rótulo legado sem definição tipada', () => C.categoryIds({ category: 'Fem C' }, mapLegacyCategory));
throws('migração recusa rótulos tipados ambíguos', () => B.categoryBridge([{ id: 'a', label: 'Fem A' }, { id: 'b', label: ' fem a ' }]));
const slash = C.registrationsForEntry('torneio-1', { uid: 'ana', category: 'A/B' })[0];
ok('id do documento não contém barra de rótulo legado', slash.registrationId.indexOf('/') === -1);

const census = C.dryRunLegacyRoster('torneio-1', [
  { uid: 'ana', categories: ['Fem A', 'Masc B'] },
  { manualParticipantId: 'manual-1', displayName: 'Convidada' },
  { uid: 'ana', category: 'Fem A' },
  { p1Uid: 'u1', p2Uid: 'u2', category: 'Mista' },
  { displayName: 'Sem identidade' },
]);
ok('dry-run gera uma inscrição por categoria e por membro da dupla', census.registrations.length === 5);
ok('dry-run aponta duplicata sem apagá-la', census.conflicts.length === 1);
ok('dry-run preserva dupla formada como vínculo separado', census.formedPairs.length === 1 && census.formedPairs[0].memberKeys.length === 2);
ok('dry-run bloqueia nome sem chave física estável', census.unsupported.length === 1);
ok('fingerprint é estável apesar da ordem dos rótulos', census.fingerprint === C.dryRunLegacyRoster('torneio-1', [
  { uid: 'ana', categories: ['Masc B', 'Fem A'] },
  { manualParticipantId: 'manual-1', displayName: 'Outro rótulo' },
  { uid: 'ana', category: 'Fem A' },
  { p1Uid: 'u1', p2Uid: 'u2', category: 'Mista' },
  { displayName: 'Sem identidade' },
]).fingerprint);

const migratedGuests = C.projectLegacyRoster('torneio-1', [
  { sourceKey: 'part-ana', entry: { displayName: 'Ana', category: 'A' } },
  { sourceKey: 'pair-1', entry: { p1Name: 'Ana', p2Name: 'Ana', category: 'B' } },
]);
ok('convidado legado recebe id manual opaco a partir da chave física', migratedGuests.registrations[0].participantKey.indexOf('manual:legacy-manual-') === 0);
ok('convidado legado preserva nome apenas como rótulo de exibição', migratedGuests.registrations[0].manualDisplayName === 'Ana');
ok('homônimos de uma dupla não são fundidos pelo nome', migratedGuests.registrations.length === 3 && migratedGuests.formedPairs.length === 1);
ok('id manual derivado não depende do rótulo', C.derivedManualParticipantId('torneio-1', 'part-ana', 'solo') === C.derivedManualParticipantId('torneio-1', 'part-ana', 'solo'));

console.log((fail ? '❌' : '✅') + ' registration-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
