/* O UID NÃO SOME DO SLOT — E QUEM TEM UID NÃO CARREGA NOME CONGELADO.
 *
 * RELATO DO DONO (23/ago/2026): _"o Rodrigo Unger havia diminuído o nome para Rodrigo Unger
 * apenas e está aparecendo nome completo (Rodrigo Unger Pires da Silva). Isso me faz crer
 * que não está vindo do uid os nomes dos participantes."_ E, quando eu mostrei a causa:
 * _"não pode sumir o uid do slot porra!"_ · _"não tem que ter nome congelado se tiver uid."_
 *
 * MEDIDO no documento REAL (SB do Confra, tour_1787432776949_sb, leitura de 23/ago):
 *   • o PERFIL dele já estava curto — users/ALTkIdda…, displayName "Rodrigo Unger";
 *   • o uid estava em todo lugar, inclusive em `monarchGroups[6].playersUids[2]`;
 *   • o que sobrou velho foi o NOME em `monarchGroups[6].players[2]`;
 *   • `_buildNameToUid` lia SÓ `t.participants` — que o save STRIPA (uid sem nome: 145
 *     inscritos, zero nomes). Então o nome velho não casava com chave nenhuma;
 *   • sem uid, a linha da classificação nasceu `key:'name:RODRIGO…', uid:null`, o gerador de
 *     fase carregou o null pro slot, e `team2Uids` ficou com UM uid pra DOIS nomes;
 *   • sem uid no slot, o card cai no rótulo GRAVADO — o nome velho, pra sempre.
 *
 * A CURA, nos dois lados:
 *   ① `_buildNameToUid` passa a conhecer TODO par nome↔uid que o documento já tem — elenco
 *      dos grupos (players[i]↔playersUids[i], onde o nome velho mora), slots de jogo e
 *      classificação congelada. Cura o que for GERADO daqui pra frente.
 *   ② `_slotUidsPositional(m, side, t)` completa a posição vazia pelo nome que está ali do
 *      lado. Cura o que JÁ ESTÁ GRAVADO, na leitura, sem migrar nada.
 *
 * Números do doc real depois da cura: slots com uid faltando 2 → 0.
 *
 * Roda com: node tests/uid-do-slot-nao-some.test.js
 */
const H = require('./render-harness');
const W = H.window;

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (obtido: ' + JSON.stringify(a) + ')'); }

const UID_R = 'ALTkIddamHMtxZl0ZDBzB2iJYJa2';   // conta real (anonimizada só nos nomes)
const UID_A = '2YhooYD2GtdhRaSDqwwdxnNyW7i2';
const NOME_VELHO = 'FULANO DE TAL SOBRENOME COMPLETO';
const NOME_VIVO = 'Fulano de Tal';

// A FORMA EXATA do doc real: inscritos STRIPADOS (uid, sem nome nenhum), elenco do grupo
// com o nome VELHO ao lado do uid certo, e o jogo de fase com o slot pela metade.
function docComoNaProducao() {
  return {
    id: 'T1', name: 'Torneio', sport: 'Beach Tennis',
    participants: [{ uid: UID_R }, { uid: UID_A }],       // ← sem nome: é assim que o save grava
    rounds: [{
      matches: [],
      monarchGroups: [{
        name: 'Grupo 7',
        players: ['Adriana', NOME_VELHO],
        playersUids: [UID_A, UID_R],                       // ← o uid SEMPRE esteve aqui
        matchIds: []
      }]
    }],
    matches: [{
      id: 'ph-T1-1-silver-VC-R1-P1', round: 1, phaseIndex: 1, bracket: 'silver',
      p1: 'Outra Dupla', p2: NOME_VELHO + ' / Adriana',
      team1Uids: ['uX1', 'uX2'],
      team2Uids: [UID_A],                                  // ← UM uid pra DOIS nomes
      p2Uid: UID_A,
      team2Obj: {
        name: NOME_VELHO + ' / Adriana', displayName: NOME_VELHO + ' / Adriana',
        p1Name: NOME_VELHO, p1Uid: null,                   // ← o buraco
        p2Name: 'Adriana', p2Uid: UID_A,
        participants: [
          { name: NOME_VELHO, uid: null, key: 'name:' + NOME_VELHO },
          { name: 'Adriana', uid: UID_A, key: 'uid:' + UID_A }
        ]
      }
    }]
  };
}

/* ── ① o resolvedor conhece o nome velho ─────────────────────────────────────────── */
(function () {
  console.log('\n① _nameToUidRecovery — o par nome↔uid que o doc já tem');
  const t = docComoNaProducao();
  const map = W._nameToUidRecovery(t);
  ok(map[NOME_VELHO] === UID_R,
    'o nome VELHO do elenco resolve pro uid certo (era isto que faltava)');
  ok(map['Adriana'] === UID_A, 'e os outros seguem resolvendo');
  // sem inscrito com nome, o mapa antigo era vazio — prova de que a fonte nova é a que salva
  ok(W._buildNameToUid(t)[NOME_VELHO] === undefined,
    '⛔ e o mapa do MOTOR (_buildNameToUid) segue intocado — mexer nele mudaria o chaveamento, e isso é leva própria');
})();

/* ── ② o slot furado se completa na leitura ──────────────────────────────────────── */
(function () {
  console.log('\n② _slotUidsPositional — a posição vazia volta a ter dono');
  const t = docComoNaProducao();
  const m = t.matches[0];
  eq(W._slotUidsPositional(m, 'p2'), ['', UID_A],
    'SEM o torneio (comportamento de antes): a 1ª posição fica vazia — o defeito');
  eq(W._slotUidsPositional(m, 'p2', t), [UID_R, UID_A],
    'COM o torneio: as duas posições têm uid');
  // e não inventa uid pra quem não tem conta
  const t2 = docComoNaProducao();
  t2.matches[0].p2 = 'Convidado do Zé / Adriana';
  t2.matches[0].team2Obj.p1Name = 'Convidado do Zé';
  eq(W._slotUidsPositional(t2.matches[0], 'p2', t2), ['', UID_A],
    '⛔ jogador sem conta continua sem uid — a cura resolve NOME CONHECIDO, não chuta');
})();

/* ── ③ a classificação volta a ser por uid ───────────────────────────────────────── */
(function () {
  console.log('\n③ _computeMonarchStandings — linha por uid, nome do PERFIL');
  const t = docComoNaProducao();
  // perfil vivo, como no app (o harness não tem Firestore)
  const antes = W._nameForUid, antesD = W._displayNameForUid;
  W._nameForUid = function (u) { return u === UID_R ? NOME_VIVO : (u === UID_A ? 'Adriana' : ''); };
  W._displayNameForUid = function (u, fb) { return W._nameForUid(u) || fb || ''; };
  const g = t.rounds[0].monarchGroups[0];
  const rows = W._computeMonarchStandings({ name: g.name, players: g.players, playersUids: g.playersUids, matches: [] }, t) || [];
  const linha = rows.find(function (r) { return r.uid === UID_R; });
  ok(!!linha, 'existe linha para ele, chaveada pelo uid (o elenco já traz playersUids)');
  ok(rows.every(function (r) { return String(r.key).indexOf('name:') !== 0; }),
    '⛔ nenhuma linha chaveada por NOME — era isso que vazava o null pro slot da fase');
  ok(linha && linha.name === NOME_VIVO,
    'e o nome da linha é o do PERFIL, não o congelado: "' + (linha && linha.name) + '"');
  W._nameForUid = antes; W._displayNameForUid = antesD;
})();

/* ── ④ o card: com uid, nome congelado não aparece ───────────────────────────────── */
(function () {
  console.log('\n④ O card do jogo — "não tem que ter nome congelado se tiver uid"');
  const t = docComoNaProducao();
  const antes = W._nameForUid, antesD = W._displayNameForUid;
  W._nameForUid = function (u) { return u === UID_R ? NOME_VIVO : (u === UID_A ? 'Adriana' : ''); };
  W._displayNameForUid = function (u, fb) { return W._nameForUid(u) || fb || ''; };
  W.AppStore = { tournaments: [t], currentUser: { uid: 'org' }, isOrganizer: function () { return true; } };
  W._currentBracketTournament = t;
  W._currentBracketTournamentId = 'T1';
  const html = W.renderMatchCard(t.matches[0], true, 'T1', 1) || '';
  ok(html.indexOf(NOME_VIVO) !== -1, 'o card mostra o nome VIVO do perfil');
  ok(html.indexOf(NOME_VELHO) === -1, '⛔ e NÃO mostra o nome congelado em lugar nenhum do card');
  // o span de hidratação leva o uid — é ele que se cura sozinho quando o perfil chega
  ok(html.indexOf('data-uid-name="' + UID_R + '"') !== -1,
    'e o nome dele nasce ligado ao uid (data-uid-name), pronto pra hidratar');
  W._nameForUid = antes; W._displayNameForUid = antesD;
})();

console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
process.exit(falhas ? 1 : 0);
