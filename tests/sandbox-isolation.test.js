/* Sandbox (SB) — rede de isolamento (Etapa 1). O SB roda o MESMO código do original; as
 * únicas diferenças são (1) notificações mudas, (2) stats/resultados não vazam, (3) invisível
 * pra não-dev. Este teste trava (2) e (3) + os helpers canônicos.
 *
 * Reproduz a falha: no código VELHO não havia isSandbox nem filtro → o SB (com participantes
 * reais espelhados) apareceria em "Participando"/"Visíveis" pros participantes e as partidas
 * do SB entrariam nas stats globais. NOVO: helper + filtros escondem e excluem.
 */
const { sandbox: W } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── sandbox-isolation ────');

const AS = W.AppStore;
ok(typeof W._isSandboxTournament === 'function', '_isSandboxTournament existe (falha no velho)');
ok(typeof W._tournamentNotificationsMuted === 'function', '_tournamentNotificationsMuted existe');
ok(typeof W._statsEligibleTournaments === 'function', '_statsEligibleTournaments existe');

// helpers puros
ok(W._isSandboxTournament({ isSandbox: true }) === true, 'isSandbox true → sandbox');
ok(W._isSandboxTournament({ isSandbox: false }) === false, 'sem flag → não sandbox');
ok(W._tournamentNotificationsMuted({ isSandbox: true }) === true, 'sandbox → notif mudas');
ok(W._tournamentNotificationsMuted({ notificationsMuted: true }) === true, 'killswitch explícito → notif mudas');
ok(W._tournamentNotificationsMuted({}) === false, 'torneio normal → notif ligadas');

// dados: 1 normal + 1 sandbox, ambos com o mesmo participante real espelhado.
var normal = { id: 'N1', isPublic: false, creatorUid: 'uORG', memberUids: ['uORG', 'uP'], participants: [{ uid: 'uP', displayName: 'Pedro' }] };
var sb = { id: 'N1_SB', isSandbox: true, isPublic: false, sandboxOf: 'N1', creatorUid: 'uDEV', memberUids: ['uDEV', 'uP'], participants: [{ uid: 'uP', displayName: 'Pedro' }] };
AS.tournaments = [normal, sb];

// (A) stats globais excluem o SB.
var elig = W._statsEligibleTournaments();
ok(elig.length === 1 && elig[0].id === 'N1', 'A: _statsEligibleTournaments exclui o SB');

// (B) participante REAL (não-dev) NÃO vê o SB.
AS.currentUser = { uid: 'uP', email: 'pedro@x.com', displayName: 'Pedro' };
ok(!W._isTestIdentity(), 'B: Pedro não é dev');
var visP = AS.getVisibleTournaments().map(function (t) { return t.id; });
ok(visP.indexOf('N1_SB') === -1, 'B: SB fora dos torneios visíveis do participante');
var partP = AS.getMyParticipations().map(function (t) { return t.id; });
ok(partP.indexOf('N1') !== -1, 'B: participante VÊ o torneio normal');
ok(partP.indexOf('N1_SB') === -1, 'B: participante NÃO vê o SB em "Participando"');

// (C) o DEV vê o SB.
AS.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
ok(W._isTestIdentity(), 'C: rstbarth é dev');
var visD = AS.getVisibleTournaments().map(function (t) { return t.id; });
ok(visD.indexOf('N1_SB') !== -1, 'C: dev VÊ o SB');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-isolation FALHOU'); process.exit(1); }
console.log('✅ sandbox-isolation: OK');
