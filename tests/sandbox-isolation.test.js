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

// ── ENTREGA (a falha REAL de 25/jul/2026) ────────────────────────────────────
// O listener é `tournaments where memberUids array-contains <meu uid>`. Enquanto o uid do
// participante real estivesse no memberUids do SB, o Firestore ENTREGAVA o doc no device
// dele — e a invisibilidade dependia de cada tela lembrar de filtrar (eram 2 de dezenas).
// A garantia é NÃO ENTREGAR: no SB, memberUids = só os uids do dev. participants[] intacto.
var sbRaw = {
  id: 'N1_sb', isSandbox: true, isPublic: false, sandboxOf: 'N1',
  creatorUid: 'uDEV', sandboxOwnerUid: 'uDEV', organizerEmail: 'rstbarth@gmail.com',
  memberUids: ['uDEV', 'uP', 'uQ'],                        // <- herdado da clonagem do original
  coHosts: [{ uid: 'uCO', status: 'active', email: 'co@x.com' }],
  participants: [{ uid: 'uP', displayName: 'Pedro' }, { p1Uid: 'uQ', p2Uid: 'uR' }]
};
var mu = W._computeMemberUids(sbRaw);
ok(mu.indexOf('uDEV') !== -1, 'D: memberUids do SB contém o dev');
ok(mu.indexOf('uP') === -1 && mu.indexOf('uQ') === -1 && mu.indexOf('uR') === -1,
   'D: memberUids do SB NÃO contém participante real (falha no velho → Firestore entregava o SB)');
ok(mu.indexOf('uCO') === -1, 'D: co-host do original não entra no memberUids do SB');
// o roster segue completo — é dele que o motor sorteia
ok(sbRaw.participants.length === 2, 'D: participants[] do SB permanece intacto');
// merge no limite de escrita: SB SUBSTITUI (sem união) — senão os uids ressuscitam a cada save
var merged = W._mergeMemberUids(sbRaw, ['uDEV', 'uP', 'uQ'], mu);
ok(merged.indexOf('uP') === -1 && merged.indexOf('uQ') === -1,
   'D: _mergeMemberUids no SB NÃO une com o valor antigo (uid real não ressuscita)');
// torneio normal continua nunca encolhendo
var mergedN = W._mergeMemberUids({ id: 'N1' }, ['uORG', 'uP'], ['uORG']);
ok(mergedN.indexOf('uP') !== -1, 'D: torneio normal continua NUNCA encolhendo (união)');
// admin do SB é só o dev
ok(W._computeAdminUids(sbRaw).join(',') === 'uDEV', 'D: adminUids do SB = só o dev');
ok(W._computeAdminEmails(sbRaw).join(',') === 'rstbarth@gmail.com', 'D: adminEmails do SB = só o dev');

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

// (B2) CINTO de ingestão: mesmo que um doc de SB chegue (legado / leitura por id), ele não
// entra no AppStore de quem não é dev — assim nenhum consumidor precisa lembrar de filtrar.
var ingP = W._dropSandboxForNonDev([normal, sb]).map(function (t) { return t.id; });
ok(ingP.indexOf('N1_SB') === -1, 'B2: ingestão descarta o SB pro não-dev');
ok(ingP.indexOf('N1') !== -1, 'B2: ingestão mantém o torneio normal');

// (C) o DEV vê o SB.
AS.currentUser = { uid: 'uDEV', email: 'rstbarth@gmail.com', displayName: 'Rodrigo' };
ok(W._isTestIdentity(), 'C: rstbarth é dev');
var visD = AS.getVisibleTournaments().map(function (t) { return t.id; });
ok(visD.indexOf('N1_SB') !== -1, 'C: dev VÊ o SB');
ok(W._dropSandboxForNonDev([normal, sb]).length === 2, 'C: ingestão mantém o SB pro dev');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-isolation FALHOU'); process.exit(1); }
console.log('✅ sandbox-isolation: OK');
