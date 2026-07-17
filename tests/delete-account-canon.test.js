/* EXCLUSÃO DE CONTA — cânone no servidor. "Onde estiver o uid, exclui. TUDO" + "mantém
 * resultados com conta excluída" (regra do dono, jul/2026).
 *
 * A exclusão rodava no CLIENTE (auth.js), então cada pessoa executava a versão que tinha em
 * cache — e a de lá era solo-only (p.uid/p.email): quem estava em DUPLA não era removido, a
 * conta sumia e a inscrição ficava órfã (caso Michelle). Além disso o cliente depende das
 * RULES pra mexer em torneio de terceiro, e checkedIn/votos não estão em isEnrollmentOnlyDiff
 * → o Firestore negava, o catch engolia, a conta ia embora e o lixo ficava.
 *
 * Este teste exercita as funções REAIS de decisão da CF (extraídas de functions/index.js),
 * não uma réplica — o mesmo cuidado do merge-federated-wins (onde eu já caí no test-theater).
 *
 * node tests/delete-account-canon.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { findUidPaths, isPlainContainer } = require('../functions/uid-sweep');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (veio ' + JSON.stringify(a) + ')');

// ── Carrega os helpers REAIS da CF, sem executar index.js inteiro ─────────────
// (index.js registra onCall/secrets no import — não dá pra require. Extraímos as funções
// puras e as avaliamos com o _uidSweep real injetado.)
const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
function extrai(nome) {
  const i = src.indexOf('function ' + nome + '(');
  ok(i > 0, 'helper ' + nome + ' existe em functions/index.js');
  // acha o fim: primeira '}' na coluna 0 depois do início
  const m = /\n\}\n/.exec(src.slice(i));
  return src.slice(i, i + m.index + 2);
}
const sandbox = { _uidSweep: { findUidPaths, isPlainContainer }, module: {}, console };
vm.createContext(sandbox);
vm.runInContext(
  extrai('_tournamentHasPlayedMatches') + '\n' +
  extrai('_anonymizeEntries') + '\n' +
  extrai('_stripNamesInMatches') + '\n' +
  extrai('_purgeUidEverywhere') + '\n' +
  'module.exports = { _tournamentHasPlayedMatches, _anonymizeEntries, _stripNamesInMatches, _purgeUidEverywhere };',
  sandbox
);
const { _tournamentHasPlayedMatches, _anonymizeEntries, _stripNamesInMatches, _purgeUidEverywhere } = sandbox.module.exports;

const EU = 'uid_EU', OUTRO = 'uid_OUTRO';

// ── "Jogou?" decide entre sair inteiro e ser anonimizado ─────────────────────
const semSorteio = { participants: [{ uid: EU, enrollSeq: 3 }], rounds: [] };
ok(_tournamentHasPlayedMatches(semSorteio, EU) === false, 'torneio sem sorteio → não jogou');

const sorteadoSemResultado = { participants: [{ uid: EU }],
  rounds: [{ matches: [{ p1Uid: EU, p2Uid: OUTRO, p1: 'Eu', p2: 'Outro' }] }] };
ok(_tournamentHasPlayedMatches(sorteadoSemResultado, EU) === false,
  'sorteado mas SEM resultado → não jogou (a inscrição pode sair inteira)');

const comResultado = { participants: [{ uid: EU }],
  rounds: [{ matches: [{ p1Uid: EU, p2Uid: OUTRO, p1: 'Eu', p2: 'Outro', winner: 'Outro', scoreP1: 4, scoreP2: 6 }] }] };
ok(_tournamentHasPlayedMatches(comResultado, EU) === true,
  'jogo COM placar → jogou (o resultado do adversário depende disso)');

const soFolga = { participants: [{ uid: EU }],
  rounds: [{ matches: [{ isSitOut: true, p1Uid: EU, p1: 'Eu', p2: 'FOLGA', sitOutPoints: 0 }] }] };
ok(_tournamentHasPlayedMatches(soFolga, EU) === false, 'folga/sit-out não é jogo dela');

const byeSo = { participants: [{ uid: EU }],
  rounds: [{ matches: [{ isBye: true, p1Uid: EU, p1: 'Eu', p2: 'BYE', winner: 'Eu' }] }] };
ok(_tournamentHasPlayedMatches(byeSo, EU) === false, 'BYE não é jogo dela');

const jogoDeOutros = { participants: [{ uid: EU }],
  rounds: [{ matches: [{ p1Uid: OUTRO, p2Uid: 'uid_z', winner: 'X', scoreP1: 6, scoreP2: 0 }] }] };
ok(_tournamentHasPlayedMatches(jogoDeOutros, EU) === false, 'jogo COM resultado mas sem ela → não conta');

// ── Anonimização da entrada: fica o uid, some o dado pessoal ─────────────────
const t = { participants: [
  { uid: EU, enrollSeq: 15, category: 'C', displayName: 'Fulano', name: 'Fulano',
    email: 'f@x.com', phone: '+5511999998888', birthDate: '1980-01-01', gender: 'masculino',
    photoURL: 'https://x/foto.jpg', skillBySport: { 'Beach Tennis': 'C' } },
  { uid: OUTRO, displayName: 'Outro', email: 'o@x.com' },
]};
const a = _anonymizeEntries(t, EU);
const eu = a.participants[0];
eq(eu.uid, EU, 'anonimizada: uid PRESERVADO (âncora do jogo)');
eq(eu.deleted, true, 'anonimizada: marcada como deleted');
eq(eu.enrollSeq, 15, 'anonimizada: enrollSeq preservado (ordem de inscrição)');
eq(eu.category, 'C', 'anonimizada: categoria preservada (a classificação depende)');
['displayName','name','email','phone','birthDate','gender','photoURL','skillBySport'].forEach(function (k) {
  ok(eu[k] === undefined, 'anonimizada: ' + k + ' APAGADO (dado pessoal)');
});
eq(a.participants[1].displayName, 'Outro', 'a entrada dos OUTROS não é tocada');

// dupla: a pessoa é o p2
const dupla = { participants: [{ p1Uid: OUTRO, p1Name: 'Parceiro', p2Uid: EU, p2Name: 'Fulano', p2Seq: 10 }] };
const ad = _anonymizeEntries(dupla, EU).participants[0];
eq(ad.p2Uid, EU, 'dupla: p2Uid preservado');
eq(ad.p1Uid, OUTRO, 'dupla: p1Uid do parceiro preservado');
ok(ad.p2Name === undefined, 'dupla: p2Name (nome dela) apagado');
eq(ad.p2Seq, 10, 'dupla: p2Seq preservado');

// ── Nomes nos slots do jogo viram "Conta excluída" ───────────────────────────
const comJogo = {
  matches: [{ p1Uid: EU, p1: 'Fulano', p2Uid: OUTRO, p2: 'Outro', winner: 'Fulano', winnerUid: EU }],
  rounds: [{ matches: [{ team1Uids: [EU, 'uid_b'], team1: ['Fulano', 'Bia'],
                         team2Uids: [OUTRO, 'uid_c'], team2: ['Outro', 'Cid'], winner: 'Outro / Cid' }] }],
};
const sn = _stripNamesInMatches(comJogo, EU);
eq(sn.matches[0].p1, 'Conta excluída', 'slot p1: nome → "Conta excluída"');
eq(sn.matches[0].p1Uid, EU, 'slot p1Uid: uid MANTIDO (o placar do adversário depende)');
eq(sn.matches[0].p2, 'Outro', 'slot do adversário intacto');
eq(sn.matches[0].winner, 'Conta excluída', 'winner (era ela) → rótulo');
eq(sn.rounds[0].matches[0].team1, ['Conta excluída', 'Bia'], 'dupla: só o nome DELA vira rótulo');
eq(sn.rounds[0].matches[0].team1Uids, [EU, 'uid_b'], 'dupla: uids preservados');
eq(sn.rounds[0].matches[0].team2, ['Outro', 'Cid'], 'time adversário intacto');

// ── Purga: mapas por uid somem; slots de jogo ficam quando ela jogou ─────────
const doc = {
  memberUids: [EU, OUTRO],
  checkedIn: { [EU]: 123, [OUTRO]: 456 },
  absent: { [EU]: true },
  opinionPolls: [{ votes: { [EU]: ['o1'], [OUTRO]: ['o2'] } }],
  waitlist: [EU, OUTRO],
  rounds: [{ matches: [{ p1Uid: EU, team1Uids: [EU, 'uid_b'] }] }],
};
const p1 = _purgeUidEverywhere(doc, EU, true);   // jogou → mantém slots
ok(!(EU in p1.checkedIn) && p1.checkedIn[OUTRO] === 456, 'purga: chave de checkedIn some, a dos outros fica');
ok(!(EU in p1.absent), 'purga: chave de absent some');
ok(!(EU in p1.opinionPolls[0].votes), 'purga: voto dela some');
ok(EU in { x: 1 } === false && p1.opinionPolls[0].votes[OUTRO], 'purga: voto dos outros fica');
eq(p1.waitlist, [OUTRO], 'purga: sai da lista de espera');
eq(p1.rounds[0].matches[0].p1Uid, EU, 'purga(jogou): slot do JOGO preservado');
eq(p1.rounds[0].matches[0].team1Uids, [EU, 'uid_b'], 'purga(jogou): team1Uids preservado');

const p2 = _purgeUidEverywhere(doc, EU, false);  // não jogou → limpa tudo
ok(p2.rounds[0].matches[0].p1Uid === undefined, 'purga(não jogou): slot do jogo removido');
eq(p2.rounds[0].matches[0].team1Uids, ['uid_b'], 'purga(não jogou): uid sai do team1Uids');

// ── A CF existe e é onCall (o app só dispara) ────────────────────────────────
ok(/exports\.deleteAccount = onCall\(/.test(src), 'CF deleteAccount existe e é onCall');
const cfBloco = src.slice(src.indexOf('exports.deleteAccount = onCall('), src.indexOf('function _tournamentHasPlayedMatches'));
ok(/request\.auth && request\.auth\.uid/.test(cfBloco), 'CF exige auth (só a própria pessoa se exclui)');
ok(/deleted: true/.test(cfBloco), 'CF grava o tombstone { deleted: true }');
ok(/_uidSweep\.findUidPaths/.test(cfBloco), 'CF usa o cânone pra achar o uid');
ok(/arrayRemove\(uid\)/.test(cfBloco), 'CF tira o uid do friends[] de outras pessoas');
ok(/collection\("presences"\)/.test(cfBloco), 'CF apaga presenças');
ok(/admin\.auth\(\)\.deleteUser\(uid\)/.test(cfBloco), 'CF apaga a conta de Auth');

console.log(fail === 0
  ? '✅ delete-account-canon: ' + pass + ' ok, 0 falharam'
  : '❌ delete-account-canon: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
