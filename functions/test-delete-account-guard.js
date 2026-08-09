/* Jogo pendente BLOQUEIA a exclusão de conta.
 *
 * CASO REAL que originou a regra (Confra, 08/ago/2026): a Denise Mamesso apagou a
 * conta estando SORTEADA no R1 Grupo A, com 3 jogos marcados e nenhum placar. O
 * cascade tirou o uid dela de dentro da chave, deixou o nome, os outros 3 do
 * grupo ficaram sem adversária e o organizador não recebeu aviso nenhum.
 * Ordem do dono: "nao deveria permitir... ela precisa se desinscrever do torneio
 * antes e com isso recebe o wo, e dai pode apagar a conta."
 *
 * Metade deste teste existe pra travar o que NÃO pode bloquear — uma porta que
 * prende gente sem motivo vira suporte e faz a pessoa achar que não consegue sair.
 */
const { temJogoPendente, torneiosQueBloqueiam, mensagemBloqueio } = require('./delete-account-guard-core');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── delete-account-guard ────');

const U = 'uidDenise';
const grupoConfra = () => ({
  id: 'tour_1780009816637', name: 'Confra BT Alta da Clínica 2026', status: 'active',
  rounds: [{ round: 1, matches: [
    { id: 'a', team1: ['Eduardo', 'Claudia'], team1Uids: ['u1', 'u2'], team2: ['Fe', 'Denise'], team2Uids: ['u3', U] },
    { id: 'b', team1: ['Eduardo', 'Fe'], team1Uids: ['u1', 'u3'], team2: ['Claudia', 'Denise'], team2Uids: ['u2', U] },
    { id: 'c', team1: ['Eduardo', 'Denise'], team1Uids: ['u1', U], team2: ['Claudia', 'Fe'], team2Uids: ['u2', 'u3'] }
  ] }]
});

// ─── (1) o caso real: bloqueia ────────────────────────────────────────────────
let t = grupoConfra();
ok(temJogoPendente(t, U), 'sorteada com 3 jogos sem placar → BLOQUEIA');
const lista = torneiosQueBloqueiam([t], U);
ok(lista.length === 1 && lista[0].jogos === 3, 'conta os 3 jogos pendentes dela');
ok(lista[0].name === 'Confra BT Alta da Clínica 2026', 'a mensagem sabe o nome do torneio');
const msg = mensagemBloqueio(lista);
ok(/Confra/.test(msg) && /3 jogos pendentes/.test(msg), 'a mensagem diz ONDE e QUANTOS');
ok(/W\.O\./.test(msg) && /organizador/i.test(msg), 'a mensagem diz o CAMINHO (sair → W.O. → organizador avisado)');

// ─── (2) o que NÃO pode bloquear ──────────────────────────────────────────────
let tFim = grupoConfra(); tFim.rounds[0].matches.forEach(m => { m.winner = m.p1 || 'x'; });
ok(!temJogoPendente(tFim, U), 'todos os jogos decididos → LIBERA');

let tPlacar = grupoConfra(); tPlacar.rounds[0].matches.forEach(m => { m.sets = [{ gamesP1: 6, gamesP2: 3 }]; });
ok(!temJogoPendente(tPlacar, U), 'jogos com placar lançado → LIBERA (o resultado fica, é a regra do dono)');

let tEnc = grupoConfra(); tEnc.status = 'finished';
ok(!temJogoPendente(tEnc, U), 'torneio encerrado não prende ninguém');

let tFolga = { status: 'active', rounds: [{ matches: [{ id: 'f', isSitOut: true, team1Uids: [U] }] }] };
ok(!temJogoPendente(tFolga, U), 'FOLGA não é jogo dela → LIBERA');

let tBye = { status: 'active', rounds: [{ matches: [{ id: 'y', isBye: true, team1Uids: [U], team2Uids: [] }] }] };
ok(!temJogoPendente(tBye, U), 'BYE não é jogo → LIBERA');

let tSemSorteio = { status: 'open', participants: [{ uid: U }], rounds: [], matches: [] };
ok(!temJogoPendente(tSemSorteio, U), 'inscrita mas SEM SORTEIO → LIBERA (a inscrição sai limpa)');

let tOutros = grupoConfra();
ok(!temJogoPendente(tOutros, 'uid-de-outra-pessoa'), 'jogo dos OUTROS não prende quem não joga');

// ─── (3) eliminatória (t.matches) e 3º lugar também contam ────────────────────
ok(temJogoPendente({ status: 'active', matches: [{ id: 'e', p1: 'A', p2: 'B', p1Uid: U, p2Uid: 'u9' }] }, U),
  'jogo em t.matches (eliminatória, slot solo p1Uid) também bloqueia');
ok(temJogoPendente({ status: 'active', thirdPlaceMatch: { id: '3', p1Uid: U, p2Uid: 'u9' } }, U),
  'disputa de 3º lugar também bloqueia');

// ─── (4) guardas ──────────────────────────────────────────────────────────────
ok(!temJogoPendente(null, U), 'torneio nulo não quebra');
ok(!temJogoPendente(grupoConfra(), ''), 'uid vazio nunca casa');
ok(torneiosQueBloqueiam([], U).length === 0, 'lista vazia → nada bloqueia');
ok(/e /.test(mensagemBloqueio([{ name: 'A', jogos: 1 }, { name: 'B', jogos: 2 }])), 'dois torneios são ligados por "e"');

console.log(`  ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
