// REPRODUZ o bug do dono com os DADOS REAIS do SB "Torneio de Férias só Casais"
// (tour_1784660138198_sb): o MESMO par de uids apareceu em DOIS jogos da R0, com NOMES DIFERENTES —
//   EABk…|aL7U…  →  "Jogador sem perfil (aL7U) / Jogador sem perfil (EABk)"   (jogo p0-lj-…)
//   EABk…|aL7U…  →  "Marcello Martins de Souza / Karla Fernandes"             (jogo xr1-…)
// Um render resolveu o perfil, o outro caiu no fallback. TODOS os guards de "já está na chave" eram
// por NOME → nenhum casou → o par entrou 2×. Dono: "marcelo/karla em 2 jogos sem REP esta errado."
//
// REGRA TRAVADA: pertencer à chave é decidido por UID (nome só vale pra guest sem conta).
// [[project_uid_identity_canon_locked]]
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const U1 = 'aL7U57xBLMQSNZJS15lTs9Pc2Ni2', U2 = 'EABk9CjTjqVHlCemhygiDZs6NNC2';

// chave onde o par JÁ está, gravado com o nome de FALLBACK
const t = {
  id: 'UIDID', format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams',
  participants: [], combinedCategories: [], currentPhaseIndex: 0,
  checkedIn: {}, absent: {}, checkedInConfirmed: {}, standbyParticipants: [], waitlist: [],
  teamOrigins: {}, newMatchups: true, lateEnrollment: 'expand',
  matches: [
    { id: 'g1', round: 0, bracket: 'main', p1: 'A / B', p2: 'C / D' },
    { id: 'g2', round: 0, bracket: 'main',
      p1: 'Jogador sem perfil (aL7U) / Jogador sem perfil (EABk)', team1Uids: [U1, U2],
      p2: 'E / F', team2Uids: ['e1', 'f1'] },
  ],
};
t.checkedIn[U1] = 1; t.checkedIn[U2] = 1;

// a MESMA dupla, agora com o nome do PERFIL resolvido (é o que o outro caminho grava)
const mesmaDupla = { p1Uid: U1, p1Name: 'Marcello Martins de Souza', p2Uid: U2, p2Name: 'Karla Fernandes',
                     displayName: 'Marcello Martins de Souza / Karla Fernandes', name: 'Marcello Martins de Souza / Karla Fernandes' };

console.log('── pertencer à chave é por UID, não por nome ──');
ok(typeof W._entryInBracket === 'function', '_entryInBracket existe');
// PROVA do furo antigo: o guard por NOME não reconheceria este par (nome do jogo é o fallback,
// o nome da entrada é o do perfil). Este assert documenta POR QUE o uid é obrigatório.
const nameSet = {};
(t.matches || []).forEach(m => { if (m.p1) nameSet[m.p1] = 1; if (m.p2) nameSet[m.p2] = 1; });
ok(!nameSet[mesmaDupla.displayName],
   'guard por NOME NÃO reconheceria o par (nomes divergem) — era exatamente o furo que duplicou');
ok(W._entryInBracket(t, mesmaDupla) === true,
   '✅ par reconhecido na chave MESMO com nome diferente (uid bate) — era o furo que duplicou');
// guest sem uid continua casando por nome
ok(W._entryInBracket(t, { displayName: 'A / B', name: 'A / B' }) === true, 'guest sem uid ainda casa por NOME');
ok(W._entryInBracket(t, { p1Uid: 'zz1', p2Uid: 'zz2', displayName: 'Z / W', name: 'Z / W' }) === false,
   'quem NÃO está na chave segue fora (não vira falso-positivo)');

// e o coletor não a recolhe pra criar um 2º jogo
t.waitlist = [Object.assign({ _lateJoin: true }, mesmaDupla)];
const before = t.matches.length;
try { W._createExtraGamesFromWaitlist(t); } catch (e) { ok(false, 'createExtra lançou: ' + e.message); }
try { W._fillRepFillWithLateDuplas(t); } catch (e) { ok(false, 'fillRep lançou: ' + e.message); }
try { W._placeLateEntriesSurgically(t); } catch (e) { ok(false, 'placeLate lançou: ' + e.message); }
const mine = (W._collectAllMatches(t) || []).filter(m => {
  const u = [].concat(m.team1Uids || [], m.team2Uids || []);
  return u.indexOf(U1) !== -1 || u.indexOf(U2) !== -1;
});
ok(mine.length === 1, '✅ o par continua em UM jogo só (got ' + mine.length + ') — nenhum criador abriu 2º');
ok(t.matches.length === before, 'nenhum jogo novo foi criado pra quem já está na chave');

console.log('\n' + (fail === 0 ? '✅ late-entry-uid-identity: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
