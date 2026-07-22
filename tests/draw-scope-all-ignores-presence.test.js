// REPRODUZ o bug do dono (jul/2026): "fiz outro teste de sortear entre todos (nao só entre os
// presentes) e o resultado foi apenas entre os presentes."
//
// CÂNONE (palavras do dono): "se quer sortear entre todos os inscritos, a presença deve ser
// IGNORADA e TODOS entram na chave."
//
// CAUSA-RAIZ: escolher "🎲 Sortear com todos" não gravava decisão nenhuma — o pacote ia VAZIO.
// Aí o passo de REGRA `_autoMoveAbsentToStandby` (que roda sempre, cliente e CF) tirava do elenco
// quem estava marcado ausente, e a chave saía só com os presentes. A escolha do organizador era
// silenciosamente sobrescrita por uma regra que ele acabara de dispensar.
//
// REGRA TRAVADA: com scope:'all' NADA relacionado a presença mexe no elenco — nem o move de
// ausentes, nem o present-only. Só scope:'present' (ou a chamada `absentees`) filtra.
// [[project_numeric_resolution_canon]]
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('draw-decisions.js');
require('./headless').load('tournaments-draw-prep.js');   // _soloMoveOut
require('./headless').load('tournaments-draw.js');        // _formDoublesTeams

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkT() {
  return {
    id: 'SCOPE', format: 'Eliminatórias Simples', teamSize: 1,
    enrollmentMode: 'individual',
    participants: [
      { uid: 'a', displayName: 'Ana' },
      { uid: 'b', displayName: 'Bruno' },
      { uid: 'c', displayName: 'Carla' },
      { uid: 'd', displayName: 'Diego' }
    ],
    checkedIn: { a: 1, b: 1 },     // só 2 presentes
    absent: { c: 1 },              // 1 marcado AUSENTE pelo organizador
    waitlist: [], standbyParticipants: [], teamOrigins: {}, matches: []
  };
}
const nomes = (arr) => (arr || []).map(p => (p && (p.displayName || p.name)) || String(p)).sort().join(',');

console.log('── "Sortear com todos" ignora presença (ninguém sai do elenco) ──');

// (1) scope:'all' — TODOS os 4 seguem no elenco, inclusive o marcado ausente
(function () {
  const t = mkT();
  W._applyDrawDecisions(t, { scope: 'all' });
  ok(t.participants.length === 4, 'scope:all mantém os 4 inscritos no elenco (era o bug: o ausente saía)');
  ok(nomes(t.participants) === 'Ana,Bruno,Carla,Diego', 'scope:all mantém TODOS, inclusive o ausente e os sem check-in');
  ok((t.standbyParticipants || []).length === 0, 'scope:all não manda ninguém pra espera por presença');
  ok((t.waitlist || []).length === 0, 'scope:all não manda ninguém pra lista de espera por presença');
})();

// (2) scope:'present' — segue filtrando (não pode regredir)
(function () {
  const t = mkT();
  W._applyDrawDecisions(t, { scope: 'present' });
  ok(nomes(t.participants) === 'Ana,Bruno', 'scope:present continua sorteando só entre os presentes');
  ok((t.waitlist || []).length === 2, 'scope:present manda os não-presentes pra espera');
})();

// (3) chamada explícita (absentees) — segue valendo
(function () {
  const t = mkT();
  W._applyDrawDecisions(t, { absentees: 'waitlist' });
  ok(nomes(t.participants) === 'Ana,Bruno', 'chamada absentees:waitlist continua filtrando');
})();

// (4) SEM decisão de escopo (pacote vazio) — o move de ausentes segue sendo regra
(function () {
  const t = mkT();
  W._applyDrawDecisions(t, {});
  ok(nomes(t.participants) === 'Ana,Bruno,Diego', 'sem escopo escolhido, ausente marcado continua saindo (regra antiga preservada)');
  ok(nomes(t.standbyParticipants) === 'Carla', 'o ausente vai pra standby como antes');
})();

// (5) idempotência: aplicar scope:'all' 3× não muda nada
(function () {
  const t = mkT();
  W._applyDrawDecisions(t, { scope: 'all' });
  W._applyDrawDecisions(t, { scope: 'all' });
  W._applyDrawDecisions(t, { scope: 'all' });
  ok(t.participants.length === 4, 'scope:all aplicado 3× segue com os 4 (idempotente)');
})();

// (6) CÂNONE (dono): scope:'all' dispensa a PRESENÇA — e SÓ ela. As resoluções numéricas
// (sem-dupla, flexibilizar, resto, potência de 2) continuam valendo: é justamente elas que
// absorvem o elenco maior, com menos resto ou nenhum.
(function () {
  // sem-dupla: com "todos", os avulsos seguem sendo resolvidos (não viram problema silencioso)
  const t = mkT();
  t.teamSize = 2; t.enrollmentMode = 'time';
  const r = W._applyDrawDecisions(t, { scope: 'all', solo: 'waitlist' });
  const passos = (r.applied || []).map(x => x.step);
  ok(passos.indexOf('solo') >= 0, 'scope:all NÃO desliga a resolução de sem-dupla');
  ok(passos.indexOf('autoAbsent') < 0, 'scope:all segue sem mover ausente');
})();

(function () {
  // flexibilizar: continua formando duplas normalmente sob "todos"
  const t = mkT();
  t.teamSize = 2; t.enrollmentMode = 'time';
  const r = W._applyDrawDecisions(t, { scope: 'all', flexibilize: true });
  const passos = (r.applied || []).map(x => x.step);
  ok(passos.indexOf('flexibilize') >= 0, 'scope:all NÃO desliga o flexibilizar (menos resto / nenhum resto)');
})();

(function () {
  // resto: a remoção de excedente continua disponível sob "todos"
  const t = mkT();
  const r = W._applyDrawDecisions(t, { scope: 'all', remainder: { mode: 'standby', method: 'last' } });
  const passos = (r.applied || []).map(x => x.step);
  ok(passos.indexOf('remainder') >= 0 || passos.indexOf('resto') >= 0,
    'scope:all NÃO desliga a resolução de resto');
})();

console.log('\n' + (fail === 0 ? '✅ draw-scope-all-ignores-presence: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
