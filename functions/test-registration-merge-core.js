'use strict';
const C = require('./registration-merge-core'); let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
const defs = { t1: [
  { id: 'skill-b', exclusivityGroup: 'skill' }, { id: 'skill-c', exclusivityGroup: 'skill' },
  { id: 'age-50', exclusivityGroup: 'age' },
] };
let conflicts = C.findExclusiveConflicts({ definitionsByTournament: defs,
  keepRegistrations: [{ tournamentId: 't1', categoryId: 'skill-b', participantKind: 'account', status: 'confirmed' }],
  dropRegistrations: [{ tournamentId: 't1', categoryId: 'age-50', participantKind: 'account', status: 'pending' }],
});
ok('categorias paralelas não bloqueiam fusão', conflicts.length === 0);
conflicts = C.findExclusiveConflicts({ definitionsByTournament: defs,
  keepRegistrations: [{ tournamentId: 't1', categoryId: 'skill-b', participantKind: 'account', status: 'confirmed' }],
  dropRegistrations: [{ tournamentId: 't1', categoryId: 'skill-c', participantKind: 'account', status: 'confirmed' }],
});
ok('categorias distintas do mesmo grupo vão à revisão do organizador antes do sorteio', conflicts.length === 1 && conflicts[0].exclusivityGroup === 'skill' && conflicts[0].requiresOrganizerReview && conflicts[0].blocksDraw);
conflicts = C.findExclusiveConflicts({ definitionsByTournament: defs,
  keepRegistrations: [{ tournamentId: 't1', categoryId: 'skill-b', participantKind: 'account', status: 'confirmed' }],
  dropRegistrations: [{ tournamentId: 't1', categoryId: 'skill-b', participantKind: 'account', status: 'pending' }],
});
ok('mesma categoria duplicada não cria conflito de exclusividade', conflicts.length === 0);
conflicts = C.findExclusiveConflicts({ definitionsByTournament: defs,
  keepRegistrations: [{ tournamentId: 't1', categoryId: 'skill-b', participantKind: 'deleted_account', status: 'withdrawn' }],
  dropRegistrations: [{ tournamentId: 't1', categoryId: 'skill-c', participantKind: 'account', status: 'confirmed' }],
});
ok('histórico retirado não participa da decisão', conflicts.length === 0);
console.log((fail ? '❌' : '✅') + ' registration-merge-core: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(fail ? 1 : 0);
