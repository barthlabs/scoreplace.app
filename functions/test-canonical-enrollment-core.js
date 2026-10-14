'use strict';
const C = require('./canonical-enrollment-core');
const R = require('./registration-core');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
ok('sentinela canônica de categoria está exportada e é estável', R.UNCATEGORIZED_CATEGORY_ID === '__uncategorized__');
const base = { id: 't1', status: 'open', categoryDefinitions: [{ id: 'fem-a', label: 'Fem A', dimension: 'skill', exclusivityGroup: 'skill', criteria: {} }], enrollmentRigor: 'casual' };
const input = { tournament: base, registrations: [], participant: { uid: 'u1', categoryIds: ['fem-a'] }, nowMs: Date.UTC(2026, 0, 1) };
let result = C.decide(input);
ok('aceita inscrição tipada e cria registro confirmado', result.outcome === 'enrolled' && result.enrollment.creates.length === 1 && result.enrollment.creates[0].participantUid === 'u1');
const confirmed = result.enrollment.creates[0];
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, { matches: [{ id: 'm1' }], format: 'liga', ligaOpenEnrollment: true }) }));
ok('fase sorteada com inscrição tardia manda para espera', result.outcome === 'waitlisted' && result.enrollment.creates[0].status === 'waitlisted');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, { maxParticipants: 1 }), registrations: [confirmed], participant: { uid: 'u2', categoryIds: ['fem-a'] } }));
ok('capacidade confirmada bloqueia entrada antes do sorteio', result.outcome === 'capacityFull');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, { maxParticipants: 1 }), registrations: [confirmed] }));
ok('repetição idêntica vence teto de vagas e continua idempotente', result.outcome === 'alreadyRegistered');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, {
  maxParticipants: 3, maxParticipantsPerCategory: 1, maxParticipantsByCategory: { 'Fem A': 1 }
}), registrations: [confirmed], participant: { uid: 'u2', categoryIds: ['fem-a'] } }));
ok('capacidade da categoria bloqueia mesmo com vagas no total', result.outcome === 'capacityFull' && result.categoryId === 'fem-a');
const parallel = Object.assign({}, base, {
  maxParticipants: 1,
  categoryDefinitions: base.categoryDefinitions.concat([{ id: 'fem-b', label: 'Fem B', dimension: 'custom', criteria: {} }]),
});
const firstAtLimit = C.decide(Object.assign({}, input, { tournament: parallel }));
ok('primeira pessoa entra com teto geral de uma', firstAtLimit.outcome === 'enrolled');
const firstRegistration = firstAtLimit.enrollment.creates[0];
result = C.decide(Object.assign({}, input, {
  tournament: parallel, registrations: [firstRegistration], participant: { uid: 'u1', categoryIds: ['fem-b'] },
}));
ok('mesma pessoa acrescenta categoria sem ocupar segunda vaga geral', result.outcome === 'enrolled');
result = C.decide(Object.assign({}, input, {
  tournament: parallel, registrations: [firstRegistration], participant: { uid: 'u2', categoryIds: ['fem-a'] },
}));
ok('segunda pessoa é barrada quando a única vaga geral está ocupada', result.outcome === 'capacityFull');
result = C.decide(Object.assign({}, input, {
  tournament: parallel, participant: { uid: 'u1', categoryIds: ['fem-a', 'fem-b'] },
}));
ok('uma chamada com duas categorias ocupa uma única vaga geral', result.outcome === 'enrolled' && result.enrollment.creates.length === 2);
const twoCategoriesOnePerson = result.enrollment.creates;
result = C.decide(Object.assign({}, input, {
  tournament: Object.assign({}, parallel, { maxParticipants: 2 }), registrations: twoCategoriesOnePerson,
  participant: { uid: 'u2', categoryIds: ['fem-a'] },
}));
ok('dois registros da primeira pessoa deixam a segunda vaga geral livre', result.outcome === 'enrolled');
result = C.decide(Object.assign({}, input, {
  tournament: parallel, registrations: [Object.assign({}, firstRegistration, { status: 'withdrawn' })], participant: { uid: 'u2', categoryIds: ['fem-a'] },
}));
ok('inscrição retirada não ocupa vaga geral', result.outcome === 'enrolled');
const returned = Object.assign({}, firstRegistration, { status: 'withdrawn', withdrawnReason: 'left' });
result = C.decide(Object.assign({}, input, { tournament: parallel, registrations: [returned] }));
ok('reinscrição retirada volta pelo mesmo ID sob o limite', result.outcome === 'enrolled' && result.enrollment.creates.length === 0 && result.enrollment.updates.length === 1);
result = C.decide(Object.assign({}, input, { tournament: parallel, registrations: [returned, Object.assign({}, firstRegistration, { registrationId: R.registrationId('uid:u2', 'fem-a'), participantUid: 'u2', participantKey: 'uid:u2', status: 'confirmed' })] }));
ok('reinscrição não ganha vaga geral reservada depois da saída', result.outcome === 'capacityFull');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, parallel, { maxParticipants: 3, maxParticipantsPerCategory: 1 }), registrations: [returned, Object.assign({}, firstRegistration, { registrationId: R.registrationId('uid:u2', 'fem-a'), participantUid: 'u2', participantKey: 'uid:u2', status: 'confirmed' })] }));
ok('reinscrição respeita limite atual da categoria', result.outcome === 'capacityFull' && result.categoryId === 'fem-a');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, parallel, { maxParticipants: 1 }), registrations: [returned, Object.assign({}, firstRegistration, { registrationId: R.registrationId('uid:u1', 'fem-b'), categoryId: 'fem-b', status: 'confirmed' })] }));
ok('reinscrição noutra categoria não ocupa segunda vaga geral da mesma pessoa', result.outcome === 'enrolled' && result.enrollment.updates.length === 1);
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, { matches: [{ id: 'm1' }], format: 'liga', ligaOpenEnrollment: true }), registrations: [returned] }));
ok('reinscrição após sorteio volta somente para espera', result.outcome === 'waitlisted' && result.enrollment.updates.length === 1 && result.enrollment.updates[0].status === 'waitlisted');
result = C.decide(Object.assign({}, input, {
  tournament: parallel, registrations: [Object.assign({}, firstRegistration, { status: 'waitlisted' })], participant: { uid: 'u2', categoryIds: ['fem-a'] },
}));
ok('lista de espera não ocupa vaga geral', result.outcome === 'enrolled');
result = C.decide(Object.assign({}, input, {
  tournament: Object.assign({}, parallel, { enrollmentLimitMode: 'draw' }), registrations: [firstRegistration],
  participant: { uid: 'u3', categoryIds: ['fem-a'] },
}));
ok('modo sorteio não bloqueia nova pessoa pelo teto geral', result.outcome === 'enrolled');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, {
  maxParticipants: 3, maxParticipantsPerCategory: 1, maxParticipantsByCategory: { 'Fem A': 2 }
}), registrations: [confirmed], participant: { uid: 'u2', categoryIds: ['fem-a'] } }));
ok('exceção de capacidade permite entrada até o limite configurado', result.outcome === 'enrolled');
result = C.decide(Object.assign({}, input, {
  tournament: Object.assign({}, base, { status: 'closed', maxParticipants: 1, maxParticipantsPerCategory: 1 }),
  registrations: [confirmed], participant: { uid: 'u2', categoryIds: ['fem-a'] }, organizerManual: true
}));
ok('organizador pode incluir acima da lotação com inscrições fechadas', result.outcome === 'enrolled' && result.enrollment.creates[0].status === 'confirmed');
result = C.decide(Object.assign({}, input, {
  tournament: Object.assign({}, base, { status: 'closed', maxParticipants: 1 }),
  registrations: [confirmed], participant: { manualParticipantId: 'manual-2', displayName: 'Pessoa 2' }, organizerManual: true
}));
ok('organizador inclui sem categoria para atribuir na Análise', result.outcome === 'enrolled' &&
  result.enrollment.creates[0].categoryId === R.UNCATEGORIZED_CATEGORY_ID);
try { C.decide(Object.assign({}, input, { participant: { uid: 'u2' } })); ok('inscrição comum ainda exige categoria', false); }
catch (_) { ok('inscrição comum ainda exige categoria', true); }
result = C.decide(Object.assign({}, input, {
  tournament: Object.assign({}, base, { status: 'finished' }), participant: { uid: 'u2', categoryIds: ['fem-a'] }, organizerManual: true
}));
ok('inclusão manual não reabre torneio encerrado', result.outcome === 'closed');
try { C.decide(Object.assign({}, input, { participant: { uid: 'u1', categories: ['Fem A'] } })); ok('nunca usa rótulo legado na porta canônica', false); } catch (_) { ok('nunca usa rótulo legado na porta canônica', true); }
try { C.decide(Object.assign({}, input, { participant: { uid: 'u1', p2Uid: 'u2', categoryIds: ['fem-a'] } })); ok('dupla não entra pela porta solo', false); } catch (_) { ok('dupla não entra pela porta solo', true); }
console.log((fail ? '❌' : '✅') + ' canonical-enrollment-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
