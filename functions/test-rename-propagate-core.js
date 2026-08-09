/* Propagação de nome — o módulo PURO, contra o dado REAL do Confra.
 * Trava as duas metades: reescreve TUDO da pessoa certa, e NÃO ENCOSTA em
 * ninguém mais (homônimo, dupla do lado, jogador fictício sem uid).
 */
const fs = require('fs');
const path = require('path');
const { planRename } = require('./rename-propagate-core');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── rename-propagate-core ────');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', '_confra-monarch-fixture.json'), 'utf8'));
const gms = FIX.matches.filter(m => m.monarchGroup === 0);
const UID = gms[0].team1Uids[0];
const VELHO = gms[0].team1[0];
const PARCEIRA = gms[0].team1[1];

function mkT() {
  const ms = JSON.parse(JSON.stringify(gms));
  const players = [], puids = [];
  ms.forEach(m => {
    (m.team1 || []).concat(m.team2 || []).forEach(n => { if (players.indexOf(n) < 0) players.push(n); });
    (m.team1Uids || []).concat(m.team2Uids || []).forEach(u => { if (puids.indexOf(u) < 0) puids.push(u); });
  });
  return {
    id: 'tour_1780009816637',
    rounds: [{ round: 1, matches: ms, monarchGroups: [{ name: 'R1 Grupo A', players, playersUids: puids, matches: ms }] }],
    standings: [{ uid: UID, name: VELHO, points: 9 }, { uid: 'outro-uid', name: PARCEIRA, points: 6 }]
  };
}

// ─── (1) reescreve tudo da pessoa ─────────────────────────────────────────────
let t = mkT();
const r = planRename(t, UID, 'Nome Novo');
ok(r.total > 0, 'o plano encontra os rótulos velhos da pessoa');

const g = t.rounds[0].monarchGroups[0];
const iMe = g.playersUids.indexOf(UID);
ok(g.players[iMe] === 'Nome Novo', 'monarchGroups.players na posição do MEU uid vira o nome novo');
ok(t.standings[0].name === 'Nome Novo', 'standings.name da linha com o meu uid é atualizado');

const m0 = t.rounds[0].matches[0];
ok(m0.team1[0] === 'Nome Novo', 'matches.team1 na posição do meu uid é atualizado');
ok(m0.p1 === ['Nome Novo', PARCEIRA].join(' / '),
  'o rótulo composto p1 é RECONSTRUÍDO do team1 (senão o card mostra o nome velho)');

// nenhum resquício do nome velho onde o uid é meu
const blob = JSON.stringify(t);
const sobrou = t.rounds[0].matches.some((m, i) =>
  (m.team1 || []).some((n, j) => m.team1Uids[j] === UID && n === VELHO) ||
  (m.team2 || []).some((n, j) => m.team2Uids[j] === UID && n === VELHO));
ok(!sobrou, 'não sobra nenhum slot MEU com o rótulo velho');

// ─── (2) NÃO encosta em mais ninguém ──────────────────────────────────────────
ok(t.standings[1].name === PARCEIRA, 'a linha de OUTRO uid na classificação não é tocada');
ok(g.players.filter(n => n === 'Nome Novo').length === 1,
  'só UMA posição do grupo virou o nome novo (não renomeou o grupo inteiro)');
ok(blob.indexOf(PARCEIRA) !== -1, 'a parceira de dupla continua com o nome dela');

// ─── (3) HOMÔNIMO: mesmo nome, uid diferente → intocado ───────────────────────
let tH = mkT();
tH.standings.push({ uid: 'uid-do-xara', name: VELHO, points: 3 });
planRename(tH, UID, 'Nome Novo');
const xara = tH.standings.find(s => s.uid === 'uid-do-xara');
ok(xara.name === VELHO,
  'HOMÔNIMO com outro uid NÃO é renomeado (casar por nome renomearia a pessoa errada)');

// ─── (4) fictício (sem uid) nunca entra ───────────────────────────────────────
let tF = mkT();
tF.rounds[0].matches[0].team2 = ['Jogador Fictício', 'Outro'];
tF.rounds[0].matches[0].team2Uids = [null, null];
const antes = JSON.stringify(tF.rounds[0].matches[0].team2);
planRename(tF, UID, 'Nome Novo');
ok(JSON.stringify(tF.rounds[0].matches[0].team2) === antes,
  'slot SEM uid (jogador fictício) fica intocado');

// ─── (5) idempotência: rodar de novo não gera mudança ─────────────────────────
const r2 = planRename(t, UID, 'Nome Novo');
ok(r2.total === 0, '2ª passada não muda nada (idempotente — não vira escrita à toa)');

// ─── (6) guardas ──────────────────────────────────────────────────────────────
ok(planRename(null, UID, 'X').total === 0, 'torneio nulo não quebra');
ok(planRename(mkT(), UID, '').total === 0, 'nome novo vazio não apaga rótulo nenhum');
ok(planRename(mkT(), '', 'X').total === 0, 'uid vazio não casa com slot sem uid');


// ─── (7) o PATH tem que ser completo (guia a escrita seletiva) ────────────────
let tP = mkT();
const rP = planRename(tP, UID, 'Nome Novo');
const { camposTocados } = require('./rename-propagate-core');
ok(rP.mudancas.every(c => /^(rounds|matches|groups|standings)\[/.test(c.path)),
  'todo path começa num campo REAL de topo (p1/p2 solto viraria escrita em campo inexistente)');
ok(camposTocados(rP.mudancas).every(c => ['rounds','matches','groups','standings'].indexOf(c) !== -1),
  'camposTocados devolve só campos de topo que existem no doc');


// ─── (8) ARRAYS DESALINHADOS: não adivinha, não grava ─────────────────────────
// Caso REAL (Confra, 08/ago/2026): a saída da Denise Mamesso tirou o uid dela de
// playersUids/team2Uids e DEIXOU o nome → 4 nomes pra 3 uids. Casar por índice
// nesse estado renomeia OUTRA PESSOA.
let tD = mkT();
const gD = tD.rounds[0].monarchGroups[0];
gD.playersUids = gD.playersUids.slice(0, -1);      // some 1 uid, nome fica
const nomesAntes = JSON.stringify(gD.players);
const rD = planRename(tD, gD.playersUids[0], 'Renomeado');
ok(JSON.stringify(gD.players) === nomesAntes,
  'array de nomes MAIOR que o de uids → NÃO reescreve nada (não renomeia a pessoa errada)');
ok((rD.avisos || []).some(a => /players/.test(a.path)),
  'o desalinhamento é REPORTADO em avisos (silêncio esconderia dado corrompido)');

// meio do array: o caso que renomearia o vizinho
let tM2 = mkT();
const gM = tM2.rounds[0].monarchGroups[0];
const alvoUid = gM.playersUids[3];
gM.playersUids.splice(1, 1);                        // tira o do MEIO
const antesM = JSON.stringify(gM.players);
planRename(tM2, alvoUid, 'Renomeado');
ok(JSON.stringify(gM.players) === antesM,
  'uid removido do MEIO → nada é reescrito (era aqui que o vizinho seria renomeado)');

console.log(`  ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
