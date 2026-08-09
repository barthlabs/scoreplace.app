/* Arrays pareados nome[i] ↔ uid[i] — a regra que a exclusão de conta violou.
 *
 * FALHA REAL (Confra, 08/ago/2026): `deleteAccount` → `_purgeUidEverywhere` rodava
 * `team1Uids.filter(x => x !== uid)`, tirando o uid e DEIXANDO o nome. O grupo da
 * Denise Mamesso ficou com 4 nomes / 3 uids e o app parou de reconhecê-la. Ela era
 * a ÚLTIMA do array — na PRIMEIRA posição, cada nome passaria a apontar pro uid do
 * vizinho, trocando identidade do grupo inteiro.
 */
const { paresParaRemover, removerPares } = require('./uid-sweep');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── uid-sweep-pares ────');

const UID = 'uidD';

// ─── (1) o caso real: ela é a ÚLTIMA ──────────────────────────────────────────
let g = { players: ['A', 'B', 'C', 'Denise'], playersUids: ['u1', 'u2', 'u3', UID] };
let r = removerPares(g, UID);
ok(JSON.stringify(r.playersUids) === JSON.stringify(['u1', 'u2', 'u3']), 'uid sai do array de uids');
ok(JSON.stringify(r.players) === JSON.stringify(['A', 'B', 'C']), 'o NOME do mesmo índice sai junto (sem isso vira fantasma)');
ok(r.players.length === r.playersUids.length, 'os dois arrays continuam do mesmo tamanho');

// ─── (2) o caso CATASTRÓFICO: ela é a PRIMEIRA ────────────────────────────────
let g2 = { players: ['Denise', 'A', 'B', 'C'], playersUids: [UID, 'u1', 'u2', 'u3'] };
let r2 = removerPares(g2, UID);
ok(JSON.stringify(r2.players) === JSON.stringify(['A', 'B', 'C']), 'primeira posição: nomes restantes corretos');
ok(JSON.stringify(r2.playersUids) === JSON.stringify(['u1', 'u2', 'u3']), 'primeira posição: uids restantes corretos');
r2.players.forEach((n, i) => ok(
  ({ A: 'u1', B: 'u2', C: 'u3' })[n] === r2.playersUids[i],
  'cada nome continua casado com o uid CERTO (' + n + ' ↔ ' + r2.playersUids[i] + ')'));

// ─── (3) times do jogo ────────────────────────────────────────────────────────
let m = { team1: ['X', 'Denise'], team1Uids: ['ux', UID], team2: ['Y', 'Z'], team2Uids: ['uy', 'uz'] };
let r3 = removerPares(m, UID);
ok(JSON.stringify(r3.team1) === JSON.stringify(['X']) && JSON.stringify(r3.team1Uids) === JSON.stringify(['ux']),
  'team1/team1Uids caem juntos');
ok(!('team2' in r3), 'o time que não tem a pessoa nem é tocado');

// ─── (4) o que NÃO pode ser mexido às cegas ───────────────────────────────────
ok(Object.keys(paresParaRemover({ team1Uids: ['ux', UID] }, UID)).length === 0,
  'uids SEM o array de nomes irmão → não mexe (folga só-uid seria destruída)');
ok(Object.keys(paresParaRemover({ team1: ['X'], team1Uids: ['ux', UID] }, UID)).length === 0,
  'arrays JÁ desalinhados → não mexe (não dá pra saber de quem é o nome sobrando)');
ok(Object.keys(paresParaRemover({ players: ['A'], playersUids: ['u1'] }, UID)).length === 0,
  'uid ausente → nada a remover');
ok(Object.keys(paresParaRemover(null, UID)).length === 0, 'nulo não quebra');
ok(Object.keys(paresParaRemover(['a', 'b'], UID)).length === 0, 'array cru não é objeto pareado');

// ─── (5) a pessoa repetida no mesmo array ─────────────────────────────────────
let g5 = { players: ['Denise', 'A', 'Denise'], playersUids: [UID, 'u1', UID] };
let r5 = removerPares(g5, UID);
ok(JSON.stringify(r5.players) === JSON.stringify(['A']) && JSON.stringify(r5.playersUids) === JSON.stringify(['u1']),
  'todas as ocorrências saem, e o alinhamento sobrevive');

console.log(`  ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
