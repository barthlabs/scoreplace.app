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

/* ── ENTREGA: A GARANTIA MUDOU DE LUGAR (2.1.88) ──────────────────────────────
 * A falha de 25/jul/2026 era real: o listener é `tournaments where memberUids
 * array-contains <meu uid>`, então enquanto o uid do participante real estivesse no
 * memberUids do sandbox o Firestore ENTREGAVA o doc no aparelho dele. A resposta da época
 * foi trocar o memberUids do sandbox pelos uids do dev — e ESTE BLOCO travava essa troca.
 *
 * ⛔ HOJE ELA É PROIBIDA. O sandbox saiu de `tournaments` e vive em `sandboxes/{id}`, com
 * permissão por `sandboxOwnerUid`: a COLEÇÃO é o isolamento, e nenhum listener de torneio
 * real a alcança — com ou sem os uids reais dentro do documento. E o invariante do dono é
 * explícito: _"não é permitido substituir participants, inscritos, memberUids, coHosts,
 * adminUids"_. Manter aqueles ramos apagaria, na primeira gravação do cliente, a membership
 * que a Function copia byte a byte.
 *
 * ⚠️ E O BLOCO ANTIGO PASSAVA MEIO POR ACIDENTE: os uids da amostra ('uP', 'uQ', 'uCO')
 * têm menos de 4 caracteres, e `push` descarta uid curto — então duas das asserções não
 * mediam o ramo de sandbox, mediam a guarda de tamanho. Aqui os uids são realistas.
 *
 * ⭐ Onde o isolamento é provado AGORA: `tests/sandbox-cf-emulador.test.js`, contra Rules,
 * Firestore e Function de verdade — inclusive "o listener de `tournaments` nunca entrega o
 * sandbox" e "o participante REAL não lê parent nem subcoleção nenhuma". */
var sbRaw = {
  id: 'sb_N1_1', isSandbox: true, isPublic: false, sandboxOf: 'N1',
  creatorUid: 'uid_organizador_real', sandboxOwnerUid: 'uid_dev_teste',
  organizerEmail: 'dono@original.com',
  memberUids: ['uid_organizador_real', 'uid_pedro', 'uid_quel'],
  coHosts: [{ uid: 'uid_cohost', status: 'active', email: 'co@x.com' }],
  participants: [{ uid: 'uid_pedro', displayName: 'Pedro' }, { p1Uid: 'uid_quel', p2Uid: 'uid_rafa' }]
};
var mu = W._computeMemberUids(sbRaw);
ok(mu.indexOf('uid_pedro') !== -1 && mu.indexOf('uid_quel') !== -1 && mu.indexOf('uid_rafa') !== -1,
   'D: ⭐⭐ memberUids do sandbox é derivado IGUAL ao de um torneio normal (os reais entram)');
ok(mu.indexOf('uid_cohost') !== -1, 'D: e o co-host do original também — nada é filtrado por ser sandbox');
ok(sbRaw.participants.length === 2, 'D: participants[] do sandbox permanece intacto');
// merge no limite de escrita: união, igual a qualquer torneio — não há mais caso especial
var merged = W._mergeMemberUids(sbRaw, ['uid_organizador_real', 'uid_pedro'], mu);
ok(merged.indexOf('uid_pedro') !== -1,
   'D: ⭐⭐ _mergeMemberUids NÃO encolhe no sandbox (o ramo que substituía saiu)');
var mergedN = W._mergeMemberUids({ id: 'N1' }, ['uORGx', 'uPedro'], ['uORGx']);
ok(mergedN.indexOf('uPedro') !== -1, 'D: torneio normal continua NUNCA encolhendo (união)');
// admin: mesma regra dos dois lados
ok(W._computeAdminUids(sbRaw).join(',') === 'uid_organizador_real,uid_cohost',
   'D: ⭐⭐ adminUids do sandbox = os do ORIGINAL (criador + co-host ativo)');
ok(W._computeAdminEmails(sbRaw).join(',') === 'dono@original.com,co@x.com',
   'D: ⭐⭐ adminEmails idem — o e-mail do dev não substitui o do organizador');
/* CONTROLE VERMELHO: as três funções não podem ter NENHUM ramo por `isSandbox` — é a única
 * forma de garantir que ninguém reintroduza a troca "só pra esconder o sandbox". */
var _fsPC = require('fs'), _pathPC = require('path');
var _pc = _fsPC.readFileSync(_pathPC.join(__dirname, '..', 'js', 'views', 'persist-core.js'), 'utf8');
['_mergeMemberUids', '_computeAdminEmails', '_computeAdminUids', '_computeMemberUids'].forEach(function (fn) {
  var i = _pc.indexOf('window.' + fn + ' = function');
  var corpo = _pc.slice(i, _pc.indexOf('\n};', i));
  ok(i > 0 && corpo.indexOf('_isSandboxData') === -1,
     'D: ⛔ CONTROLE: `' + fn + '` não tem ramo por sandbox (membership não se adultera)');
});

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
