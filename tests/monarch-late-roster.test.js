// QUEM ENTRA NA CHAVE VIRA INSCRITO — Rei/Rainha, entrada tardia. node tests/monarch-late-roster.test.js
//
// BUG REAL (dono, 27/jul/2026, Confra SB tour_1785146858717_sb): 4 placeholders foram
// adicionados, formaram um grupo Rei/Rainha e estavam JOGANDO 3 jogos — mas o card dizia
// 104 INSCRITOS em vez de 108. O doc mostrou o porquê:
//
//   participants = 104 (103 uid + 1 fictício)   standbyParticipants = []   waitlist = []
//   e os "Jogador 01..04" existiam SÓ dentro de rounds[].monarchGroups
//
// `_expandMonarchFromWaitlist` era só uma PONTE: levava o nome da espera para a fila
// monarch e formava o grupo, sem nunca gravar ninguém em `t.participants`. Depois o
// `_sanitizeWaitlistVsGroups` (wlClean) removia da espera quem já estava em grupo. A
// pessoa ficava jogando sem ser inscrita — órfã de roster.
//
// O cânone é "INSCRITOS = participants[]. Ponto." (store.js). Quem passou a ocupar um
// lugar na chave TEM de estar no roster: é o que a contagem, a Análise de Inscritos e a
// presença leem. Ver [[project_formed_pair_roster_orphan]] e [[project_count_people_not_entries]].
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// Rei/Rainha com a rodada 1 em andamento (2 grupos de 4) e N avulsos na espera.
function mkT(nEspera) {
  const t = {
    id: 'RR', sport: 'Beach Tennis', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    teamSize: 1, enrollmentMode: 'individual', combinedCategories: [], currentPhaseIndex: 0,
    checkedIn: {}, absent: {}, newMatchups: true, lateEnrollment: 'expand',
    participants: [], standbyParticipants: [], waitlist: [], teamOrigins: [], matches: [], rounds: []
  };
  for (let i = 1; i <= 8; i++) { t.participants.push({ uid: 'u' + i, displayName: 'P' + i }); t.checkedIn['u' + i] = 1; }
  t.rounds = [{
    round: 1,
    matches: [{ id: 'm1', category: null, p1: 'P1 / P2', p2: 'P3 / P4' }],
    monarchGroups: [
      { players: ['P1', 'P2', 'P3', 'P4'], matches: [{ id: 'm1' }] },
      { players: ['P5', 'P6', 'P7', 'P8'], matches: [] }
    ]
  }];
  for (let i = 1; i <= nEspera; i++) {
    const n = 'Jogador 0' + i;
    t.standbyParticipants.push({ name: n, displayName: n, isPlaceholder: true });
    t.checkedIn[n] = Date.now();   // presença é pré-requisito pra formar no mesmo dia
  }
  return t;
}
const nomesNoRoster = (t) => t.participants.map((p) => (p.displayName || p.name || '')).filter(Boolean);

console.log('── 4 vagas na espera formam grupo → viram INSCRITOS ──');
(function () {
  const t = mkT(4);
  const antes = W._countCompetitors(t).people;
  ok(antes === 12, 'pré: 8 na chave + 4 na espera = 12 inscritos (got ' + antes + ')');

  const formed = W._expandMonarchFromWaitlist(t);
  ok(formed === 1, 'formou 1 grupo novo com as 4 vagas (got ' + formed + ')');

  ok(t.participants.length === 12, 'as 4 vagas entraram no ROSTER (participants=' + t.participants.length + ', esperado 12)');
  ok(t.participants.filter((p) => p.isPlaceholder).length === 4, '4 vagas gravadas com isPlaceholder');
  ok(W._countCompetitors(t).people === 12, 'INSCRITOS continua 12 depois de entrarem na chave (got ' + W._countCompetitors(t).people + ')');

  // está na chave XOR na espera — nunca nos dois
  ok(t.standbyParticipants.length === 0, 'saíram da espera (standby=' + t.standbyParticipants.length + ')');
  ok(t.waitlist.length === 0, 'waitlist vazia (got ' + t.waitlist.length + ')');

  // e o grupo novo existe com as 4
  const g = (t.rounds[0].monarchGroups || []).slice(-1)[0];
  const nomes = (g && g.players || []).slice().sort().join(',');
  ok(nomes === 'Jogador 01,Jogador 02,Jogador 03,Jogador 04', 'o grupo novo tem as 4 vagas (got ' + nomes + ')');

  // ninguém duplicado no roster
  const rs = nomesNoRoster(t);
  ok(new Set(rs).size === rs.length, 'nenhum nome duplicado no roster (' + rs.length + ' entradas)');
})();

console.log('── idempotente: rodar de novo não duplica nem infla ──');
(function () {
  const t = mkT(4);
  W._expandMonarchFromWaitlist(t);
  const depois1 = t.participants.length;
  W._expandMonarchFromWaitlist(t);
  W._expandMonarchFromWaitlist(t);
  ok(t.participants.length === depois1, 'roster estável em chamadas repetidas (' + depois1 + ' → ' + t.participants.length + ')');
  ok(W._countCompetitors(t).people === 12, 'INSCRITOS estável (got ' + W._countCompetitors(t).people + ')');
})();

console.log('── menos de 4 na espera: não forma, e ninguém é movido ──');
(function () {
  const t = mkT(3);
  const formed = W._expandMonarchFromWaitlist(t);
  ok(formed === 0, 'com 3 na espera não forma grupo (got ' + formed + ')');
  ok(t.participants.length === 8, 'roster intocado (got ' + t.participants.length + ')');
  ok(t.standbyParticipants.length === 3, 'os 3 seguem na espera (got ' + t.standbyParticipants.length + ')');
  ok(W._countCompetitors(t).people === 11, 'INSCRITOS = 8 + 3 na espera = 11 (got ' + W._countCompetitors(t).people + ')');
})();

console.log('── entrada COM uid entra pelo uid, não pelo nome ──');
(function () {
  const t = mkT(0);
  // ⭐ 2.1: a proporção agora é DITA em voz alta. Esta cena sempre dependeu do default do app
  // ser 25/75 ("no máximo 1 homem em 4") — o default virou 50/50 (ordem do dono, 22/ago), e
  // 1H+3M deixaria de formar grupo, derrubando uma asserção que nem é sobre gênero. Gravar a
  // proporção mantém a cena idêntica e deixa explícito de qual regra ela depende.
  t.genderRatio = '25/75';
  // v1.7.16: gênero DECLARADO nas 4 entradas. Esta cena mede MECÂNICA DE ROSTER (entrada
  // com uid vira inscrito) e o gênero é incidental — mas desde que "sem gênero determinado
  // não entra em grupo" (regra do dono, ago/2026), 4 pessoas reais sem o campo preenchido
  // legitimamente não formam grupo, e sem grupo não há roster pra medir. 1 homem + 3
  // mulheres respeita o teto e mantém a asserção medindo o que ela se propõe.
  const GEN = ['masculino', 'feminino', 'feminino', 'feminino'];
  for (let i = 1; i <= 4; i++) {
    const n = 'Novo ' + i;
    t.standbyParticipants.push({ uid: 'n' + i, displayName: n, gender: GEN[i - 1] });
    t.checkedIn['n' + i] = Date.now();
  }
  W._expandMonarchFromWaitlist(t);
  ok(t.participants.length === 12, '4 entradas com uid viraram inscritas (got ' + t.participants.length + ')');
  const comUid = t.participants.filter((p) => p.uid && String(p.uid).indexOf('n') === 0).length;
  ok(comUid === 4, 'a entrada ORIGINAL foi preservada, com uid (got ' + comUid + ')');
})();

console.log('\n' + (fail === 0 ? '✅ monarch-late-roster: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
