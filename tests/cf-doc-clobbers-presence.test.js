// REPRODUZ o bug do dono (jul/2026): "Presentes chega em 24 e volta a cair e dá pulinhos nas
// presenças das duplas."
//
// CAUSA-RAIZ: o organizador marca presença → a intenção otimista é carimbada
// (_stampPresenceIntent, v1.3.82) e o write vai pro Firestore. Se _triggerLateIntegration dispara
// e a CF leu o doc ANTES do write landar, ela devolve um doc com checkedIn VELHO. O
// _applyCFTournament troca o torneio INTEIRO por esse doc (_list[i] = doc) e NUNCA reaplica as
// intenções pendentes — diferente do listener do Firestore (store.js), que chama
// _reapplyPendingPresence. Resultado: a presença recém-marcada SOME (contador cai) e volta quando
// o snapshot real chega → "pulinho".
//
// A camada de intenção JÁ existe e é a defesa canônica contra doc stale; só faltava o caminho da
// CF passar por ela. Ver [[project_concurrency_safe_saves]] / [[project_formed_pair_roster_orphan]].
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// torneio com 2 duplas (4 pessoas por uid)
function mkT() {
  return {
    id: 'CFCLOB', format: 'Dupla Eliminatória', teamSize: 2, enrollmentMode: 'teams',
    participants: [
      { p1Uid: 'a1', p1Name: 'A1', p2Uid: 'b1', p2Name: 'B1', displayName: 'A1 / B1', name: 'A1 / B1' },
      { p1Uid: 'a2', p1Name: 'A2', p2Uid: 'b2', p2Name: 'B2', displayName: 'A2 / B2', name: 'A2 / B2' },
    ],
    checkedIn: {}, absent: {}, checkedInConfirmed: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], combinedCategories: [], currentPhaseIndex: 0,
  };
}
const presentCount = (t) => Object.keys(t.checkedIn || {}).length;
const cur = () => W.AppStore.tournaments.find(x => String(x.id) === 'CFCLOB');

console.log('── doc da CF não pode APAGAR presença recém-marcada (otimista) ──');

// estado: 3 pessoas já presentes e confirmadas no servidor
const t = mkT();
t.checkedIn = { a1: 1, b1: 1, a2: 1 };
W.AppStore.tournaments = [t];
W._pendingPresence = {};

// o organizador marca a 4ª pessoa (b2) — otimista + intenção carimbada (o write ainda está em voo)
W._idMapSet(t, t.checkedIn, { uid: 'b2', displayName: 'B2' }, Date.now());
W._stampPresenceIntent('CFCLOB', { uid: 'b2', displayName: 'B2' }, 'present');
ok(presentCount(t) === 4, 'pré: 4 presentes localmente (a marca otimista entrou)');

// a CF responde com um doc STALE — lido ANTES do write da 4ª presença landar (só 3 presentes)
const staleDoc = mkT();
staleDoc.checkedIn = { a1: 1, b1: 1, a2: 1 };   // b2 AUSENTE do doc da CF
staleDoc.matches = [{ id: 'm1', round: 0, bracket: 'upper', p1: 'A1 / B1', p2: 'A2 / B2' }];

W._applyCFTournament('CFCLOB', staleDoc);

const after = cur();
ok(!!after, 'o torneio segue no AppStore após aplicar o doc da CF');
ok(after.matches && after.matches.length === 1, 'a chave da CF foi refletida (o doc é autoritativo pro bracket)');
// ESTE é o assert do bug: a presença otimista NÃO pode ser engolida pelo doc stale
ok(W._idMapHas(after, after.checkedIn, { uid: 'b2', displayName: 'B2' }),
   '✅ a presença recém-marcada (B2) SOBREVIVE ao doc stale da CF — sem isto o contador cai (o "pulinho")');
ok(presentCount(after) === 4, 'contador segue em 4 presentes (got ' + presentCount(after) + ') — não regride pra 3');
// e não pode inventar presença de quem não foi marcado
ok(!W._idMapHas(after, after.checkedIn, { uid: 'zz', displayName: 'ZZ' }), 'não inventa presença de terceiros');

// quando o doc JÁ reflete a intenção, o pendente é dropado (não fica preso pra sempre)
const freshDoc = mkT();
freshDoc.checkedIn = { a1: 1, b1: 1, a2: 1, b2: 1 };
W._applyCFTournament('CFCLOB', freshDoc);
ok(presentCount(cur()) === 4, 'doc fresco (já com B2) mantém os 4 presentes');

console.log('\n' + (fail === 0 ? '✅ cf-doc-clobbers-presence: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
