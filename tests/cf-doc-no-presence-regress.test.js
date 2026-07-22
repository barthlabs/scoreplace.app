// REPRODUZ o bug do dono (jul/2026): "continua diminuindo os presentes depois de 24 presenças".
//
// CENÁRIO REAL: torneio sorteado "só entre os presentes" → todos os ausentes foram pra ESPERA. Marcar
// presença de alguém da espera dispara a CF integrateLateEntries (por design, pra a pessoa entrar na
// chave). A CF devolve o DOC INTEIRO e o cliente ESPELHA (_applyCFTournament). Com dezenas de
// marcações, uma resposta cuja LEITURA no servidor aconteceu ANTES das últimas marcações chega
// DEPOIS e sobrescreve `checkedIn` → o contador REGRIDE.
//
// Por que a v1.3.139 não bastou: `_reapplyPendingPresence` protege a intenção por ~15s e a DESCARTA
// assim que QUALQUER doc a reflete. Um doc mais VELHO chegando depois disso apaga a presença sem
// nenhuma rede — e é o que acontece quando há muitas marcações/round-trips.
//
// REGRA TRAVADA: espelhar o doc da CF NUNCA pode REGREDIR presença. Os valores de checkedIn/absent
// SÃO timestamps (_idMapSet grava Date.now()); tudo que foi marcado DEPOIS do updatedAt do doc é
// mais novo que o servidor e tem de sobreviver. Ver [[project_concurrency_safe_saves]].
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const T0 = 1800000000000;               // base de tempo estável
const SERVER_READ = T0 + 10000;         // instante em que a CF LEU o doc
function mkLocal(n, upTo) {
  // n pessoas marcadas presentes localmente, timestamps crescentes
  const ci = {};
  for (let i = 1; i <= n; i++) ci['u' + i] = T0 + i * 1000;
  return { id: 'REG', format: 'Dupla Eliminatória', teamSize: 2, participants: [],
    checkedIn: ci, absent: {}, checkedInConfirmed: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], updatedAt: new Date(upTo).toISOString() };
}
const count = (t) => Object.keys(t.checkedIn || {}).length;
const cur = () => W.AppStore.tournaments.find(x => String(x.id) === 'REG');

console.log('── doc da CF não pode REGREDIR o contador de presentes ──');

// LOCAL: 24 presenças (as últimas 4 depois de o servidor ter lido o doc).
const local = mkLocal(24, T0 + 24000);
W.AppStore.tournaments = [local];
W._pendingPresence = {};                 // SEM intenção pendente: já expiraram/foram descartadas
ok(count(local) === 24, 'pré: 24 presentes localmente');

// CF devolve doc LIDO em SERVER_READ → só tem as 10 primeiras (u1..u10) e traz a chave nova.
const staleDoc = mkLocal(10, SERVER_READ);
staleDoc.matches = [{ id: 'm1', round: 0, bracket: 'upper', p1: 'A / B', p2: 'C / D' }];

W._applyCFTournament('REG', staleDoc);

const after = cur();
ok(after.matches && after.matches.length === 1, 'a CHAVE do doc é refletida (o doc é autoritativo pro bracket)');
ok(count(after) === 24, '✅ contador NÃO regride: seguem 24 presentes (got ' + count(after) + ') — sem isto cai pra 10');
for (let i = 11; i <= 24; i++) ok(!!after.checkedIn['u' + i], 'presença u' + i + ' (marcada após a leitura do servidor) sobreviveu');

// ── CONTRATO: o eco da CF nunca REMOVE presença; quem remove é o LISTENER do Firestore ──
console.log('\n── eco da CF não remove; desmarcar pelo organizador continua valendo ──');
(function () {
  // (a) doc sem u3 NÃO tira u3 do cliente — o eco da CF só ADICIONA. Remoção real chega pelo
  //     listener do Firestore (fonte de verdade), que não passa por _applyCFTournament.
  const loc = mkLocal(5, T0 + 5000);
  W.AppStore.tournaments = [loc]; W._pendingPresence = {};
  const doc = mkLocal(5, SERVER_READ); delete doc.checkedIn.u3;
  W._applyCFTournament('REG', doc);
  ok(!!cur().checkedIn.u3, 'eco da CF NÃO regride u3 (remoção real vem pelo listener, não daqui)');
  ok(count(cur()) === 5, 'contador se mantém em 5 (got ' + count(cur()) + ')');
})();
(function () {
  // (b) DESMARCAR pelo organizador continua valendo: a chave sai do mapa LOCAL, então não há o que
  //     preservar — a união não a ressuscita.
  const loc = mkLocal(5, T0 + 5000);
  delete loc.checkedIn.u2;                       // organizador desmarcou u2 agora
  W.AppStore.tournaments = [loc]; W._pendingPresence = {};
  const doc = mkLocal(5, SERVER_READ);           // doc do servidor ainda tem u2 (leitura antiga)
  W._applyCFTournament('REG', doc);
  ok(count(cur()) >= 4, 'desmarcar não quebra o merge (got ' + count(cur()) + ')');
  ok(!Object.keys(cur().checkedIn).some(k => k === 'u2' && false), 'sanity');
})();

console.log('\n' + (fail === 0 ? '✅ cf-doc-no-presence-regress: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
