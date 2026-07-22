// REPRODUZ o bug do dono (jul/2026): "presença continua pulando e regredindo depois de 24... com as
// cores para presença parcial ficou ainda mais evidente. muda cor, apaga presença, depois apaga a
// outra, dai liga uma e liga a outra. instabilidade total."
//
// CAUSA: a integração tardia era disparada 1× POR TOGGLE de presença de quem está na espera. Numa
// chamada de 24 pessoas isso vira ~24 chamadas de CF; cada uma devolve o DOC INTEIRO que o cliente
// ESPELHA (_applyCFTournament) e re-renderiza. Docs lidos ANTES das últimas marcações chegam depois
// → cor muda, presença some e volta. O volume é o que faz aparecer "depois de 24".
//
// REGRA TRAVADA: marcações em RAJADA coalescem numa ÚNICA chamada (debounce). Quem precisa de
// resposta imediata (formar dupla / ligar "aceitar entradas") passa opts.immediate.
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// timers controláveis (o harness deixa setTimeout como noop)
let timers = [], seq = 1;
W.setTimeout = function (fn, ms) { const id = seq++; timers.push({ id, fn, ms }); return id; };
W.clearTimeout = function (id) { timers = timers.filter(x => x.id !== id); };
const flush = () => { const due = timers.slice(); timers = []; due.forEach(x => x.fn()); };

// conta os DISPAROS reais pra CF
let calls = 0;
W._callIntegrateLate = function () { calls++; return { then: function (cb) { try { cb({ data: { changed: false } }); } catch (e) {} return { catch: function () { return null; } }; }, catch: function () { return null; } }; };

const t = { id: 'DEB', format: 'Eliminatórias Simples', teamSize: 2, participants: [], matches: [{ id: 'm', round: 0, p1: 'A / B', p2: 'C / D' }],
  standbyParticipants: [{ p1Uid: 'x', p1Name: 'X', p2Uid: 'y', p2Name: 'Y', displayName: 'X / Y', name: 'X / Y', _lateJoin: true }],
  waitlist: [], checkedIn: {}, absent: {}, teamOrigins: {}, newMatchups: true, lateEnrollment: 'expand' };
W.AppStore.tournaments = [t];
W._findTournamentById = function (id) { return String(id) === 'DEB' ? t : null; };

console.log('── rajada de presenças coalesce numa ÚNICA chamada de CF ──');

// 24 toggles em rajada (o número que o dono reportou)
calls = 0; timers = []; W._lateIntegrateInflight = {}; W._lateIntegrateLastSig = {};
for (let i = 0; i < 24; i++) W._triggerLateIntegration(t, { force: true, debounce: true });
ok(calls === 0, 'durante a rajada NÃO dispara nada (got ' + calls + ') — antes eram ~24 chamadas');
ok(timers.length === 1, 'fica UM timer agendado, não 24 (got ' + timers.length + ')');
flush();
ok(calls === 1, '✅ depois que o organizador para, dispara UMA vez só (got ' + calls + ')');

// caminho IMEDIATO (formar dupla / ligar "aceitar entradas") continua sem atraso
calls = 0; timers = []; W._lateIntegrateInflight = {}; W._lateIntegrateLastSig = {};
W._triggerLateIntegration(t, { force: true });
ok(calls === 1, 'sem debounce: dispara NA HORA (formar dupla / ligar entrada não podem esperar)');

// debounce + immediate → imediato
calls = 0; timers = []; W._lateIntegrateInflight = {}; W._lateIntegrateLastSig = {};
W._triggerLateIntegration(t, { force: true, debounce: true, immediate: true });
ok(calls === 1, 'opts.immediate vence o debounce');

// um disparo imediato CANCELA o debounce pendente (não dispara 2×)
calls = 0; timers = []; W._lateIntegrateInflight = {}; W._lateIntegrateLastSig = {};
W._triggerLateIntegration(t, { force: true, debounce: true });
W._triggerLateIntegration(t, { force: true });
flush();
ok(calls === 1, 'disparo imediato cancela o debounce pendente (1 chamada, não 2)');

console.log('\n' + (fail === 0 ? '✅ late-integration-debounce: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
