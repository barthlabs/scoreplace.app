/* W.O. do PARTICIPANTE: identidade por ESTRUTURA, nunca por t.participants.
 *
 * FALHA REAL QUE ESTE TESTE REPRODUZ (Confra BT Alta da Clínica 2026, ago/2026):
 * os dois claims de W.O. gravados em produção têm `"absentUids": []` — quem levou o
 * W.O. ficou sem identidade no claim.
 *
 * CAUSA: `_resolveCtx` (escopo GRUPO) montava os `members` com `_nameUids`, que procura
 * o nome em `t.participants`. Só que o save passa por `identity-core._stripUidEntryNames`
 * e REMOVE o nome de toda entrada cujo uid resolve. Medido no doc de produção:
 * 111 inscritos, 111 COM uid, ZERO com nome → `_nameUids` devolve [] pra todo jogador
 * real. Daí saíam, em cascata:
 *   · `absentUids: []` no claim (o sintoma gravado no banco);
 *   · `_allCtxUids` vazio → `iAmPlayer` FALSO no chip → o participante do grupo não via
 *     o botão de apontar W.O.; só o organizador via.
 * O escopo de JOGO nunca teve o bug (`_matchMembers` usa `_slotUids`).
 *
 * O fixture tem o shape EXATO do doc: participante SÓ com uid (sem displayName), grupo
 * com players/playersUids pareados e jogos com team1Uids/team2Uids.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'wo-claim.js'), 'utf8'),
  sandbox, { filename: 'wo-claim.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── wo-claim: uid por estrutura ────');

const UID = { marj: 'u-marjorie', cyn: 'u-cynthia', arn: 'u-arnaldo', mari: 'u-mariana', org: 'u-org' };

function mkT() {
  const players = ['Marjorie CILONE', 'Cynthia', 'Arnaldo Menezes', 'Mariana C'];
  const uids = [UID.marj, UID.cyn, UID.arn, UID.mari];
  const mk = (i, a, b, c, d) => ({
    id: 'm' + i, isMonarch: true, round: 1, roundIndex: 0, monarchGroup: 0,
    p1: players[a] + ' / ' + players[b], p2: players[c] + ' / ' + players[d],
    team1: [players[a], players[b]], team2: [players[c], players[d]],
    team1Uids: [uids[a], uids[b]], team2Uids: [uids[c], uids[d]],
    winner: null, scoreP1: null, scoreP2: null
  });
  const matches = [mk(0, 0, 1, 2, 3), mk(1, 0, 2, 1, 3), mk(2, 0, 3, 1, 2)];
  return {
    id: 'T1', name: 'Confra-like', format: 'Liga', drawMode: 'rei_rainha',
    status: 'active', creatorUid: UID.org, creatorEmail: 'org@x.com',
    // como no Confra: participante pode lançar → pode ACUSAR falta (`_playersEnter`).
    // Sem isto o chip não aparece por CONFIGURAÇÃO, não por identidade.
    resultEntry: ['organizer', 'players'],
    // ⚠️ O CORAÇÃO DO FIXTURE: inscritos SÓ com uid — nome strippado pelo save.
    participants: uids.concat([UID.org]).map(u => ({ uid: u, addedAt: 1 })),
    rounds: [{
      round: 1, format: 'rei_rainha', status: 'active', matches: matches,
      monarchGroups: [{ name: 'R1 Grupo L', players: players, playersUids: uids, matchIds: matches.map(m => m.id), matches: matches }]
    }]
  };
}

const t = mkT();
W.AppStore.tournaments = [t];
W._findTournamentById = (id) => (String(id) === String(t.id) ? t : null);
W.showNotification = () => {};
W._collectAllMatches = (tt) => (tt.rounds || []).reduce((a, r) => a.concat(r.matches || []), []);

// o fixture é o que se pensa que é
ok(t.participants.every(p => !p.displayName && !p.name), 'fixture: NENHUM inscrito tem nome (o strip do save)');
ok(t.participants.every(p => !!p.uid), 'fixture: todos têm uid');

const g = t.rounds[0].monarchGroups[0];
const ctx = { scope: 'group', roundIndex: 0, groupName: g.name, players: g.players.slice(), matches: g.matches, matchIds: g.matchIds.slice() };

// ─── (1) o chip aparece pro JOGADOR do grupo ──────────────────────────────────
// Antes do fix `_allCtxUids` era [] e `iAmPlayer` ficava falso: só o organizador via.
W.AppStore.currentUser = { uid: UID.cyn, displayName: 'Cynthia' };
const chipCyn = W._woClaimChip(t, ctx);
ok(!!chipCyn, 'participante do grupo VÊ o chip de W.O. (antes: vazio, porque nenhum uid resolvia)');

W.AppStore.currentUser = { uid: 'u-estranho', displayName: 'De Fora' };
const chipEstranho = W._woClaimChip(t, ctx);
ok(!chipEstranho, 'quem não é do grupo (nem organizador) NÃO vê o chip');

// ─── (2) o claim guarda o UID do ausente ──────────────────────────────────────
W.AppStore.currentUser = { uid: UID.cyn, displayName: 'Cynthia' };
W._woClaimChip(t, ctx);                 // registra o ctx (acontece antes de qualquer return)
W._woDeclare(t.id, 'g|0|R1 Grupo L', 'Arnaldo Menezes', '');   // SEM uid: o caso real do Confra

const claim = (t.woClaims || []).slice(-1)[0];
ok(!!claim, 'claim criado pelo participante');
ok(!!claim && claim.absentName === 'Arnaldo Menezes', 'claim aponta o ausente certo');
ok(!!claim && Array.isArray(claim.absentUids) && claim.absentUids.length === 1,
  'absentUids NÃO fica vazio (o sintoma gravado em produção: "absentUids": [])');
ok(!!claim && (claim.absentUids || [])[0] === UID.arn,
  'absentUids traz o uid do elenco do grupo (players[i] ↔ playersUids[i]), não um lookup por nome');

// ─── (3) o uid vem do SLOT quando a pessoa não está mais no elenco ────────────
// É o caso do ausente já substituído (`_rewriteSlot` trocou o nome no elenco).
const t2 = mkT();
const g2 = t2.rounds[0].monarchGroups[0];
g2.players[2] = 'Suplente';                 // Arnaldo saiu do elenco…
g2.playersUids[2] = 'u-suplente';
// …mas o slot do jogo ainda carrega a identidade dele
W.AppStore.tournaments = [t2];
W._findTournamentById = () => t2;
W.AppStore.currentUser = { uid: UID.cyn, displayName: 'Cynthia' };
const ctx2 = { scope: 'group', roundIndex: 0, groupName: g2.name, players: g2.players.slice(), matches: g2.matches, matchIds: g2.matchIds.slice() };
W._woClaimChip(t2, ctx2);
W._woDeclare(t2.id, 'g|0|R1 Grupo L', 'Arnaldo Menezes', '');
const claim2 = (t2.woClaims || []).slice(-1)[0];
ok(!!claim2 && (claim2.absentUids || [])[0] === UID.arn,
  'fora do elenco, o uid vem do SLOT do jogo (team*Uids) — nunca de t.participants');

// ─── (4) fictício sem uid continua só com nome ────────────────────────────────
const t3 = mkT();
const g3 = t3.rounds[0].monarchGroups[0];
g3.players.push('Jogador X'); g3.playersUids.push(null);
W.AppStore.tournaments = [t3];
W._findTournamentById = () => t3;
W.AppStore.currentUser = { uid: UID.cyn, displayName: 'Cynthia' };
const ctx3 = { scope: 'group', roundIndex: 0, groupName: g3.name, players: g3.players.slice(), matches: g3.matches, matchIds: g3.matchIds.slice() };
W._woClaimChip(t3, ctx3);
W._woDeclare(t3.id, 'g|0|R1 Grupo L', 'Jogador X', '');
const claim3 = (t3.woClaims || []).slice(-1)[0];
ok(!!claim3 && (claim3.absentUids || []).length === 0,
  'fictício (sem uid em lugar nenhum) fica sem absentUids — nome é tudo que ele tem');

console.log(pass + ' asserts OK, ' + fail + ' falhas');
if (fail) process.exit(1);
