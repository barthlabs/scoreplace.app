/* O W.O. CHEGA NAS SUBCOLEÇÕES — reconciliação do torneio dividido
 * node tests/wo-chega-nas-subcolecoes.test.js
 *
 * O QUE ACONTECEU (Confra ao vivo, 30/ago/2026). `mutateTournament` roda o mutator sobre o
 * documento CRU. Num torneio DIVIDIDO isso é o documento MAGRO — `participants: []` e
 * nenhum jogo. Três estragos, todos vistos na tela do dono:
 *   ① a Nathalya Calil seguiu escalada nos 3 jogos do R1 Grupo H2 DEPOIS do W.O. dela: a
 *      troca entrou no `woLog` e nunca chegou na subcoleção `matches`;
 *   ② Fábio Ruggiero, Tiago Lima e Erika Benedet se inscreveram, viraram substitutos e
 *      sumiram do elenco — o mutator os empurrava pra um array vazio do doc, que a leitura
 *      seguinte sobrescreve com a subcoleção;
 *   ③ os ausentes não eram desativados, e voltariam a ser sorteados na rodada seguinte.
 *
 * ⛔ E O CLIENTE NÃO PODE CONSERTAR: `firestore.rules` nega escrita dele em `inscritos` e
 * `matches`. Por isso quem reconcilia é o GATILHO — que ainda por cima vê a escrita do app
 * NATIVO antigo, que nunca vai chamar CF nenhuma.
 *
 * ⛔ POR QUE OS DADOS AQUI SÃO OS REAIS: nomes, ids de grupo e o formato do jogo (a trinca
 * `p1`/`team1`/`team1Uids`) saíram do documento de produção. Fixture inventada foi
 * exatamente o que deixou um congelador passar verde enquanto gravava zero
 * ([[feedback_congelador_cego_procurava_o_jogo_no_escopo_errado]]).
 */
const path = require('path');
const C = require(path.join(__dirname, '..', 'functions', 'wo-split-reconcile-core.js'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const DIVIDIDO = { _semPesados: ['matches', 'participants', 'opponentHistory'], _nPartes: { participants: 4, matches: 3 }, memberUids: [] };
const woNathalya = {
  id: 'wo-0-R1_Grupo_H2-ufIkpAo880X3LRWSxaOgXZS0Aph2-16', status: 'active', roundIndex: 0,
  groupName: 'R1 Grupo H2', absentName: 'Nathalya Calil', absentUid: 'ufIkpAo880X3LRWSxaOgXZS0Aph2',
  subName: 'Jogador X', subUid: null, at: '2026-08-30T20:45:37.454Z'
};
// os 3 jogos REAIS do R1 Grupo H2, com a trinca completa
const jogosH2 = [1, 2, 3].map((n) => ({
  _id: 'match-rr-r1-wl33-' + (n - 1) + '-1787018209475-0',
  _loc: { tipo: 'rounds', ri: 0, mi: n - 1 }, _chave: 'k' + n,
  jogo: {
    label: 'R1 Grupo H2 • Jogo ' + n, roundIndex: 0, scoreP1: null, scoreP2: null,
    p1: n === 1 ? 'Luigi Perri / Nathalya Calil' : (n === 2 ? 'Luigi Perri / Romy Brock' : 'Luigi Perri / Angel Bueno'),
    team1: n === 1 ? ['Luigi Perri', 'Nathalya Calil'] : (n === 2 ? ['Luigi Perri', 'Romy Brock'] : ['Luigi Perri', 'Angel Bueno']),
    team1Uids: n === 1 ? ['N618', 'ufIkpAo880X3LRWSxaOgXZS0Aph2'] : (n === 2 ? ['N618', 'y1dl'] : ['N618', 'Mfbc']),
    p2: n === 1 ? 'Romy Brock / Angel Bueno' : (n === 2 ? 'Nathalya Calil / Angel Bueno' : 'Nathalya Calil / Romy Brock'),
    team2: n === 1 ? ['Romy Brock', 'Angel Bueno'] : (n === 2 ? ['Nathalya Calil', 'Angel Bueno'] : ['Nathalya Calil', 'Romy Brock']),
    team2Uids: n === 1 ? ['y1dl', 'Mfbc'] : (n === 2 ? ['ufIkpAo880X3LRWSxaOgXZS0Aph2', 'Mfbc'] : ['ufIkpAo880X3LRWSxaOgXZS0Aph2', 'y1dl'])
  }
}));
const inscritosH2 = [
  { _id: 'uN618', _k: 'uN618', _idx: 0, item: { uid: 'N618', ligaActive: true, enrollSeq: 10 } },
  { _id: 'uufIkpAo880X3LRWSxaOgXZS0Aph2', _k: 'uufIkpAo880X3LRWSxaOgXZS0Aph2', _idx: 1, item: { uid: 'ufIkpAo880X3LRWSxaOgXZS0Aph2', ligaActive: true, enrollSeq: 11 } },
  { _id: 'uy1dl', _k: 'uy1dl', _idx: 2, item: { uid: 'y1dl', ligaActive: true, enrollSeq: 12 } },
  { _id: 'uMfbc', _k: 'uMfbc', _idx: 3, item: { uid: 'Mfbc', ligaActive: true, enrollSeq: 13 } }
];
const antes = Object.assign({}, DIVIDIDO, { woLog: [] });
const depois = Object.assign({}, DIVIDIDO, { woLog: [woNathalya] });

console.log('\n① o caso da Nathalya: W.O. por VAGA (Jogador X)\n');
const p = C.planejar(antes, depois, inscritosH2, jogosH2);
ok(!p.nada, 'há o que reconciliar');
ok(p.patchesDeJogo.length === 3, '⭐ os 3 jogos do grupo são corrigidos (era o que não chegava)');
const j1 = p.patchesDeJogo.find((x) => /Jogo 1/.test(x.label)).jogo;
ok(j1.p1 === 'Luigi Perri / Jogador X', '   a string `p1` troca');
ok(JSON.stringify(j1.team1) === JSON.stringify(['Luigi Perri', 'Jogador X']), '   ⭐ o array `team1` troca JUNTO — foi o campo que eu esqueci no reparo manual');
ok(j1.team1Uids[1] === null, '   e o uid vira null (vaga não é pessoa)');
ok(p.desativar.length === 1 && p.desativar[0].item.ligaActive === false, 'a ausente é desativada — senão volta a ser sorteada');
ok(p.desativar[0].item.woDeactivatedAt === woNathalya.at, '   com o carimbo do W.O.');
ok(p.novosInscritos.length === 0, '⛔ "Jogador X" NÃO entra no elenco — é vaga, não pessoa');

console.log('\n② substituto que é PESSOA entra no elenco\n');
const woErika = { id: 'wo-C-1', status: 'active', roundIndex: 0, groupName: 'R1 Grupo C',
  absentName: 'marcia andrade', absentUid: 'tXnX', subName: 'Erika Benedet', subUid: 'K9QZ', at: '2026-08-30T20:25:50.129Z' };
const p2 = C.planejar(antes, Object.assign({}, DIVIDIDO, { woLog: [woErika] }), inscritosH2, []);
ok(p2.novosInscritos.length === 1, '⭐ o substituto entra no elenco (era o que fazia 3 pessoas sumirem)');
ok(p2.novosInscritos[0].item.uid === 'K9QZ' && p2.novosInscritos[0].item.ligaActive === true, '   ativo, como qualquer inscrito');
ok(p2.novosInscritos[0]._idx === 4 && p2.novosInscritos[0].item.enrollSeq === 14, '   com `_idx` e `enrollSeq` na sequência (não colide com quem já está)');
ok(p2.novosInscritos[0].item.woSubstituteForUid === 'tXnX', '   e com o rastro do W.O., como os 10 substitutos pré-divisão têm');

console.log('\n③ os guards\n');
const comPlacar = jogosH2.map((m) => ({ ...m, jogo: { ...m.jogo, scoreP1: 6, scoreP2: 3 } }));
const p3 = C.planejar(antes, depois, inscritosH2, comPlacar);
ok(p3.patchesDeJogo.length === 0 && p3.recusados.length === 3,
  '⛔ jogo COM PLACAR não é reescrito — quem jogou, jogou (no reparo manual isso barrou 9 jogos)');
ok(C.planejar(depois, depois, inscritosH2, jogosH2).nada,
  '⭐ IDEMPOTENTE: sem entrada nova no woLog, não há o que fazer (o gatilho roda a cada escrita)');
ok(C.planejar(antes, Object.assign({}, depois, { _semPesados: [] }), inscritosH2, jogosH2).nada,
  'torneio INTEIRO (não dividido) não é tocado — lá o mutator já acerta sozinho');
const outroGrupo = [{ _id: 'x', _loc: {}, _chave: 'x', jogo: { label: 'R1 Grupo A • Jogo 1', roundIndex: 0, p1: 'Nathalya Calil / Z', team1: ['Nathalya Calil', 'Z'], team1Uids: ['ufIkpAo880X3LRWSxaOgXZS0Aph2', 'z'], p2: 'A / B', team2: ['A', 'B'], team2Uids: ['a', 'b'] } }];
ok(C.planejar(antes, depois, inscritosH2, outroGrupo).patchesDeJogo.length === 0,
  '⛔ jogo de OUTRO grupo não é tocado — W.O. é do grupo onde aconteceu');
ok(!C.planejar(antes, Object.assign({}, DIVIDIDO, { woLog: [Object.assign({}, woNathalya, { status: 'reverted' })] }), inscritosH2, jogosH2).patchesDeJogo.length,
  'entrada de W.O. já revertida não é aplicada');

console.log('\n④ o delta, que é o que impede reabrir decisão antiga\n');
const woVelho = { id: 'wo-antigo', status: 'active', roundIndex: 0, groupName: 'R1 Grupo M',
  absentName: 'Fábio Simão', absentUid: 'tqlM', subName: 'Jogador X', subUid: null, at: '2026-08-24T22:18:20.160Z' };
const comVelho = Object.assign({}, DIVIDIDO, { woLog: [woVelho] });
const comVelhoENovo = Object.assign({}, DIVIDIDO, { woLog: [woVelho, woNathalya] });
const p4 = C.planejar(comVelho, comVelhoENovo, inscritosH2.concat([{ _id: 'utqlM', _k: 'utqlM', _idx: 4, item: { uid: 'tqlM', ligaActive: true, enrollSeq: 14 } }]), jogosH2);
ok(!p4.desativar.some((d) => d.item.uid === 'tqlM'),
  '⭐ o W.O. ANTIGO não é reprocessado — no Confra, um daqueles ausentes tinha sido REATIVADO à mão pelo dono');
ok(p4.desativar.some((d) => d.item.uid === 'ufIkpAo880X3LRWSxaOgXZS0Aph2'), '   e o novo é, normalmente');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exit(fail ? 1 : 0);
