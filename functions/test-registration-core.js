'use strict';

const C = require('./registration-core');
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
const slash = C.registrationsForEntry('torneio-1', { uid: 'ana', category: 'A/B' })[0];
ok('id do documento não contém barra de rótulo legado', slash.registrationId.indexOf('/') === -1);

const census = C.dryRunLegacyRoster('torneio-1', [
  { uid: 'ana', categories: ['Fem A', 'Masc B'] },
  { manualParticipantId: 'manual-1', displayName: 'Convidada' },
  { uid: 'ana', category: 'Fem A' },
  { p1Uid: 'u1', p2Uid: 'u2', category: 'Mista' },
  { displayName: 'Sem identidade' },
]);
ok('dry-run gera uma inscrição por categoria', census.registrations.length === 3);
ok('dry-run aponta duplicata sem apagá-la', census.conflicts.length === 1);
ok('dry-run bloqueia equipe composta e entrada sem identidade', census.unsupported.length === 2);

console.log((fail ? '❌' : '✅') + ' registration-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
