/* NINGUÉM SAI SILENCIOSAMENTE DE UM SORTEIO JÁ FEITO
 *
 * Ordem do dono (22/ago/2026): _"o melhor seria a pessoa não poder se desinscrever
 * silenciosamente. e deixar coisas quebradas."_
 *
 * FALHA REAL (Confra, medida em produção): a Juliana Reis se desinscreveu depois do sorteio.
 * Saiu de `participants` — e continuou no `R1 Grupo M`, com os 3 jogos dela já com placar.
 * Resultado: 34 grupos × 4 = 136 vagas para 135 inscritos. Uma vaga que não é de ninguém,
 * contagem ÍMPAR, e a fase 2 (que forma a dupla DENTRO do grupo) sem como fechar aquele
 * grupo. Ninguém foi avisado: o organizador só descobriu quando os números não bateram.
 *
 * A REGRA: depois de COLOCADA no sorteio, sair não é remover — é DESATIVAR. É a mesma peça
 * do W.O. (`ligaActive: false`): a pessoa para de jogar, a estrutura mantém a vaga e o
 * histórico. Quem precisa mesmo tirar alguém da estrutura usa W.O./substituição, que sabe
 * recompor o grupo.
 *
 * ⚠️ E o outro lado: quem NÃO foi colocado (entrou depois, está na espera) continua saindo
 * limpo. A trava é sobre ocupar vaga, não sobre a data.
 */
const fs = require('fs');
const path = require('path');
const core = require(path.join(__dirname, '..', 'functions', 'enroll-core.js'));

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};

console.log('──── ninguém sai silenciosamente de um sorteio já feito ────');

const JU = 'g6jTeQ2buqe4ea0tBvj8p3FY7tz2';   // uid real da Juliana no Confra
const OUTRO = 'uid-outra-pessoa';
const NA_ESPERA = 'uid-entrou-depois';

// O Confra como estava: ela colocada no R1 Grupo M, com jogos e placar.
const confra = () => ({
  participants: [
    { uid: JU, ligaActive: true, enrollSeq: 60 },
    { uid: OUTRO, ligaActive: true, enrollSeq: 61 },
    { uid: NA_ESPERA, ligaActive: true, enrollSeq: 150 }
  ],
  rounds: [{
    monarchGroups: [{ name: 'R1 Grupo M', playersUids: [JU, OUTRO, 'uid-c', 'uid-d'] }],
    matches: [{ team1Uids: [JU, OUTRO], team2Uids: ['uid-c', 'uid-d'], winner: 'uid-c' }]
  }]
});

// ── o caso que quebrou ───────────────────────────────────────────────────────────────
const r = core.computeDeenroll(confra(), JU);
ok('quem está COLOCADA no grupo não é removida', r.outcome === 'deactivated',
  'veio outcome=' + r.outcome);
ok('  → ela continua em participants (a vaga não vira fantasma)',
  r.participants.filter((p) => p.uid === JU).length === 1);
ok('  → e sai como INATIVA (ligaActive:false), igual ao W.O.',
  (r.participants.find((p) => p.uid === JU) || {}).ligaActive === false);
ok('  → com carimbo de quando saiu (o organizador consegue ver o que houve)',
  !!(r.participants.find((p) => p.uid === JU) || {}).selfDeactivatedAt);
ok('  → ninguém mais é mexido', r.participants.length === 3 &&
  (r.participants.find((p) => p.uid === OUTRO) || {}).ligaActive === true);
// ⛔ memberUids NÃO pode encolher: ela segue no torneio (vai receber o W.O. na fase 2).
ok('  → memberUids não é reescrito (ela continua com acesso ao torneio)',
  !r.updateData || r.updateData.memberUids === undefined);

// A contagem, que é o que o dono viu quebrar: as 4 vagas do grupo continuam com dono.
const depois = r.participants;
const noGrupo = confra().rounds[0].monarchGroups[0].playersUids;
const semDono = noGrupo.filter((u) => u !== 'uid-c' && u !== 'uid-d' && !depois.some((p) => p.uid === u));
ok('nenhuma vaga do grupo fica sem dono em participants', semDono.length === 0, semDono.join(', '));

// ── o outro lado: quem não ocupa vaga sai limpo ──────────────────────────────────────
const r2 = core.computeDeenroll(confra(), NA_ESPERA);
ok('quem NÃO foi colocada (entrou depois / espera) sai normalmente',
  r2.outcome === 'deenrolled' && !r2.participants.some((p) => p.uid === NA_ESPERA),
  'veio outcome=' + r2.outcome);

// ── e antes de qualquer sorteio, tudo como sempre ────────────────────────────────────
const semSorteio = { participants: [{ uid: JU, ligaActive: true }] };
const r3 = core.computeDeenroll(semSorteio, JU);
ok('sem sorteio nenhum, desinscrever REMOVE (nada a preservar)',
  r3.outcome === 'deenrolled' && r3.participants.length === 0);

// ── idempotência: sair duas vezes não vira ruído ─────────────────────────────────────
const jaInativa = confra();
jaInativa.participants[0].ligaActive = false;
ok('quem já estava inativa devolve notFound (não regrava à toa)',
  core.computeDeenroll(jaInativa, JU).outcome === 'notFound');

// ── o detector de "está colocada" enxerga as três estruturas ─────────────────────────
ok('detecta colocação em grupo do Rei/Rainha',
  core.isPlacedInDraw({ rounds: [{ monarchGroups: [{ playersUids: [JU] }] }] }, JU));
ok('detecta colocação em jogo',
  core.isPlacedInDraw({ matches: [{ team2Uids: ['x', JU] }] }, JU));
ok('detecta colocação em grupo comum',
  core.isPlacedInDraw({ groups: [{ playerUids: [JU] }] }, JU));
ok('não inventa colocação onde não há',
  !core.isPlacedInDraw({ rounds: [{ monarchGroups: [{ playersUids: ['x'] }] }] }, JU));

// ── PARIDADE cliente × servidor ──────────────────────────────────────────────────────
// O caminho otimista da desinscrição precisa decidir IGUAL à CF. Se divergirem, o cliente
// remove, o onSnapshot traz de volta, e a pessoa pisca saindo e voltando na tela — o próprio
// comentário do caminho otimista já avisa disso. Aqui as DUAS implementações rodam sobre a
// MESMA matriz e têm de concordar em todos os casos.
global.window = global.window || global;
require(path.join(__dirname, '..', 'js', 'views', 'waitlist-core.js'));

const MATRIZ = [
  ['grupo Rei/Rainha', { rounds: [{ monarchGroups: [{ playersUids: [JU, OUTRO] }] }] }],
  ['jogo dentro da rodada', { rounds: [{ matches: [{ team1Uids: [JU] }] }] }],
  ['jogo no topo do doc', { matches: [{ team2Uids: ['x', JU] }] }],
  ['grupo comum (playerUids)', { groups: [{ playerUids: [JU] }] }],
  ['grupo comum (playersUids)', { groups: [{ playersUids: [JU] }] }],
  ['sorteio existe mas ela não está nele', { rounds: [{ monarchGroups: [{ playersUids: ['x'] }] }] }],
  ['doc sem sorteio nenhum', { participants: [{ uid: JU }] }],
  ['estruturas vazias', { rounds: [], groups: [], matches: [] }],
  ['rounds com buraco (null)', { rounds: [null, { monarchGroups: [null, { playersUids: [JU] }] }] }],
  ['uid ausente', { rounds: [{ monarchGroups: [{ playersUids: [JU] }] }] }, null]
];
const divergiu = MATRIZ.filter(([, doc, uid]) => {
  const u = uid === undefined ? JU : uid;
  return core.isPlacedInDraw(doc, u) !== window._isPlacedInDraw(doc, u);
}).map(([nome]) => nome);
ok('cliente e CF concordam em TODOS os casos da matriz (' + MATRIZ.length + ')',
  divergiu.length === 0, 'divergiram: ' + divergiu.join(', '));

// E o caminho otimista tem de CONSULTAR o espelho — senão a paridade existe no papel e não
// na tela (foi assim que o cliente e a CF se separaram da primeira vez).
const cliente = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
ok('o caminho otimista da desinscrição consulta _isPlacedInDraw',
  /_isPlacedInDraw\(t, user\.uid\)/.test(cliente));
ok('  → e DESATIVA em vez de remover quando ela está colocada',
  /_colocada[\s\S]{0,400}ligaActive: false/.test(cliente));

console.log(falhas === 0
  ? '\n✅ nao-se-desinscreve-do-sorteio: OK'
  : '\n❌ nao-se-desinscreve-do-sorteio: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
