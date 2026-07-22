// REPRODUZ o bug do dono (jul/2026), medido no doc REAL tour_1784727218055_sb:
//   "marcelo x luigi esta duplicado. se enfrentam no jogo 7 e 8" (rodada 1 sup)
//
// O QUE O BANCO MOSTRAVA — o MESMO confronto, duas vezes, na mesma rodada:
//   JOGO 7  id …lj-…-0     "Jogador sem perfil (aL7U) / (EABk)" vs "… (N618) / (Q480)"
//                          team1Uids=[aL7U,EABk]  team2Uids=[N618,Q480]
//   JOGO 8  id …-rep7      "Marcello Martins de Souza / Karla Fernandes" vs "Luigi Perri / Adriana Zalaf"
//                          team1Uids=null         team2Uids=null
//   (aL7U=Marcello, EABk=Karla, N618=Luigi, Q480=Adriana — confirmado na coleção users)
//
// CAUSA-RAIZ: o jogo 8 nasceu SEM os uids. Sem identidade, NENHUMA checagem de "esse confronto já
// existe" funciona — nem por uid (o lado sem uid cai no fallback de nome) nem por rótulo (os nomes
// estavam resolvidos num e crus no outro). Aí o mesmo par entrou por um segundo caminho e o jogo
// duplicou. Duas checagens minhas passaram batido pelo MESMO motivo — é o cânone do uid.
//
// REGRAS TRAVADAS:
//   (1) jogo sem uid é REPARÁVEL: a identidade é reposta a partir do elenco (nome → uid);
//   (2) confronto repetido é detectado POR UID, nunca por rótulo, e o jogo duplicado SEM RESULTADO
//       é removido — o que tem placar nunca é tocado.
// [[project_uid_identity_canon_locked]] / [[project_match_slot_uid_identity]]
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const MAR = 'aL7U', KAR = 'EABk', LUI = 'N618', ADR = 'Q480';
function mkT() {
  return {
    id: 'IDDUP', format: 'Dupla Eliminatória', teamSize: 2, enrollmentMode: 'teams',
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {},
    participants: [
      { p1Uid: MAR, p1Name: 'Marcello Martins de Souza', p2Uid: KAR, p2Name: 'Karla Fernandes',
        displayName: 'Marcello Martins de Souza / Karla Fernandes', name: 'Marcello Martins de Souza / Karla Fernandes' },
      { p1Uid: LUI, p1Name: 'Luigi Perri', p2Uid: ADR, p2Name: 'Adriana Zalaf',
        displayName: 'Luigi Perri / Adriana Zalaf', name: 'Luigi Perri / Adriana Zalaf' }
    ],
    matches: [
      // JOGO 7 — rótulo cru, COM uids
      { id: 'lj-0', round: 0, bracket: 'upper',
        p1: 'Jogador sem perfil (aL7U) / Jogador sem perfil (EABk)', team1Uids: [MAR, KAR],
        p2: 'Jogador sem perfil (N618) / Jogador sem perfil (Q480)', team2Uids: [LUI, ADR],
        winner: null },
      // JOGO 8 — mesmo confronto, rótulo resolvido, SEM uids (o defeito)
      { id: 'rep7', round: 0, bracket: 'upper',
        p1: 'Marcello Martins de Souza / Karla Fernandes', team1Uids: null,
        p2: 'Luigi Perri / Adriana Zalaf', team2Uids: null,
        winner: null }
    ]
  };
}
const acha = (t, id) => (t.matches || []).filter(m => m.id === id)[0];

console.log('── identidade no jogo + confronto repetido detectado POR UID ──');

// (1) reposição de identidade: o jogo que nasceu sem uid é reparado pelo elenco
(function () {
  const t = mkT();
  ok(typeof W._stampMissingMatchUids === 'function', 'existe _stampMissingMatchUids');
  if (typeof W._stampMissingMatchUids !== 'function') return;
  W._stampMissingMatchUids(t);
  const j8 = acha(t, 'rep7');
  ok(j8 && Array.isArray(j8.team1Uids) && j8.team1Uids.slice().sort().join('+') === [MAR, KAR].sort().join('+'),
    'jogo 8 ganha team1Uids do elenco (got ' + JSON.stringify(j8 && j8.team1Uids) + ')');
  ok(j8 && Array.isArray(j8.team2Uids) && j8.team2Uids.slice().sort().join('+') === [LUI, ADR].sort().join('+'),
    'jogo 8 ganha team2Uids do elenco (got ' + JSON.stringify(j8 && j8.team2Uids) + ')');
})();

// (2) com a identidade reposta, o confronto repetido É detectado — e o duplicado sai
(function () {
  const t = mkT();
  ok(typeof W._dedupMatchesByUid === 'function', 'existe _dedupMatchesByUid');
  if (typeof W._dedupMatchesByUid !== 'function') return;
  W._stampMissingMatchUids(t);
  const removidos = W._dedupMatchesByUid(t);
  ok(removidos === 1, 'exatamente 1 jogo duplicado removido (got ' + removidos + ')');
  ok((t.matches || []).length === 1, 'sobra 1 jogo para esse confronto (got ' + t.matches.length + ')');
  const resta = t.matches[0];
  ok(resta && Array.isArray(resta.team1Uids) && resta.team1Uids.length === 2, 'o que sobra carrega os uids');
})();

// (3) jogo COM PLACAR nunca é removido — o duplicado sem resultado é que sai
(function () {
  const t = mkT();
  acha(t, 'rep7').winner = 'Marcello Martins de Souza / Karla Fernandes';
  acha(t, 'rep7').scoreP1 = 6; acha(t, 'rep7').scoreP2 = 2;
  W._stampMissingMatchUids(t);
  W._dedupMatchesByUid(t);
  ok((t.matches || []).length === 1, 'sobra 1 jogo (got ' + t.matches.length + ')');
  ok(t.matches[0] && t.matches[0].id === 'rep7', 'o jogo PRESERVADO é o que tem placar (got ' + (t.matches[0] && t.matches[0].id) + ')');
})();

// (4) ambos com placar: NADA é removido — decisão do organizador, não do código
(function () {
  const t = mkT();
  acha(t, 'lj-0').winner = 'x'; acha(t, 'lj-0').scoreP1 = 6;
  acha(t, 'rep7').winner = 'y'; acha(t, 'rep7').scoreP1 = 6;
  W._stampMissingMatchUids(t);
  const rem = W._dedupMatchesByUid(t);
  ok(rem === 0 && t.matches.length === 2, 'dois jogos já disputados: código não apaga resultado (got ' + rem + ' removido(s))');
})();

// (5) confrontos DIFERENTES não são tocados
(function () {
  const t = mkT();
  acha(t, 'rep7').p2 = 'Outro / Par'; acha(t, 'rep7').team2Uids = ['zzz1', 'zzz2'];
  const rem = W._dedupMatchesByUid(t);
  ok(rem === 0 && t.matches.length === 2, 'confrontos diferentes ficam intactos');
})();

console.log('\n' + (fail === 0 ? '✅ match-identity-dedup: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
