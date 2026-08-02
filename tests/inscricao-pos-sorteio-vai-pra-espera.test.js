/* FASE SORTEADA → LISTA DE ESPERA — node tests/inscricao-pos-sorteio-vai-pra-espera.test.js
 *
 * BUG REAL (Confra BT Alta da Clínica 2026, 02/ago/2026 — medido em produção antes do fix):
 *   • sorteio (lastAutoDrawAt) .......... 2026-08-02T22:00:00.000Z  (19:00 BRT, agendado)
 *   • inscrição da Sandra (addedAt) ..... 2026-08-02T22:00:57.712Z  (57s DEPOIS)
 *   • resultado: 111 inscritos, 108 sorteados em 27 grupos Rei/Rainha, 3 fora — os 2 INATIVOS
 *     (ligaActive:false) e ela. Só que os 2 inativos são inativos DE PROPÓSITO, e ela ficou
 *     num limbo: `standbyParticipants: []`, `waitlist: []`, `monarchWaitlist: {_default_: []}`.
 *     Inscrita, fora dos grupos e fora dos TRÊS storages de espera. Ninguém a chamaria nunca.
 *
 * CAUSA (não era o sorteio, era o GATE DE INSCRIÇÃO): em Liga com `ligaOpenEnrollment !== false`
 * o `ligaAberta` dava true MESMO com o sorteio feito, então `inscricoesAbertas` era true e o
 * ramo de inscrição tardia — o ÚNICO que mandava alguém pra espera — era curto-circuitado.
 * A pessoa caía direto em t.participants. Valia igual no cliente (tournaments-enrollment.js),
 * na transação de fallback (firebase-db.js) e na CF (functions/enroll-core.js).
 *
 * REGRA (dono, ago/2026): "só quem entrar agora vai para a lista de espera" e "se os inativos
 * ativarem aí sim vão pra lista de espera, saindo dos inativos".
 *
 * O fixture tests/fixtures/confra-pos-sorteio.json é o doc REAL de produção com a estrutura,
 * as contagens e os timestamps preservados (111 inscritos, 27 grupos, 83 jogos, 0 placares);
 * só os uids e os nomes foram trocados por rótulos. Contra o código anterior este teste FALHA.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
// Uma seção que ESTOURA conta como falha e o resto continua rodando — assim o relatório
// contra o código antigo mostra TODOS os defeitos, não só o primeiro.
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

const FIX = path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json');
// load()      = o doc COMO ESTÁ na produção — com a Sandra já dentro de participants
//               (o inscrito fantasma que o bug criou).
// loadAntes() = o mesmo doc no instante 22:00:00Z, logo depois do sorteio e ANTES da
//               inscrição dela. É deste estado que a inscrição real partiu.
const load = () => JSON.parse(fs.readFileSync(FIX, 'utf8'));
const loadAntes = () => {
  const t = load();
  t.participants = t.participants.filter(p => p.uid !== 'uid_sandra');
  t.memberUids = t.memberUids.filter(u => u !== 'uid_sandra');
  return t;
};

// Ambiente do SERVIDOR (monta window global + vendor/ com waitlist-core).
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const enrollCore = require(path.join(ROOT, 'functions', 'enroll-core.js'));

const SANDRA = { uid: 'uid_sandra', displayName: 'Sandra', name: 'Sandra', ligaActive: true, selfEnrolled: true };
const NOW = Date.parse('2026-08-02T22:00:57.712Z');

// ── 0. O fixture É o caso do print (guarda contra fixture que "conserta" o bug) ──────
sec(function () {
  const t = load();
  ok(t.participants.length === 111, 'fixture devia ter os 111 inscritos reais, tem ' + t.participants.length);
  ok(t.rounds[0].monarchGroups.length === 27, 'fixture devia ter 27 grupos, tem ' + t.rounds[0].monarchGroups.length);
  ok(t.rounds[0].matches.length === 83, 'fixture devia ter 83 jogos, tem ' + t.rounds[0].matches.length);
  ok(t.rounds[0].matches.every(m => m.winner == null && m.scoreP1 == null), 'fixture devia estar com ZERO placar');
  const sorteados = new Set();
  t.rounds[0].monarchGroups.forEach(g => (g.playersUids || []).forEach(u => sorteados.add(u)));
  ok(sorteados.size === 108, '108 sorteados, achei ' + sorteados.size);
  ok(!sorteados.has('uid_sandra'), 'a Sandra NÃO pode estar nos grupos (ela entrou depois)');
  const espera = win._getWaitlist(t);
  ok(espera.length === 0, 'no estado de produção a espera está VAZIA (é o defeito) — achei ' + espera.length);
  // O FANTASMA, do jeito que está no banco: dentro de participants, fora dos grupos, fora da espera.
  ok(t.participants.some(p => p.uid === 'uid_sandra'), 'no doc real ela ESTÁ em participants (é o defeito)');
  ok(Date.parse(t.participants.find(p => p.uid === 'uid_sandra').addedAt) > Date.parse(t.lastAutoDrawAt),
    'o addedAt da Sandra tem que ser DEPOIS do lastAutoDrawAt — é a premissa do caso');
});

// ── 1. _phaseDrawDone: o predicado canônico ─────────────────────────────────────────
sec(function () {
  ok(typeof win._phaseDrawDone === 'function', 'servidor não define window._phaseDrawDone (guard typeof falharia em silêncio)');
  ok(win._phaseDrawDone(load()) === true, 'Confra pós-sorteio devia contar como fase SORTEADA');
  ok(win._phaseDrawDone({ rounds: [], matches: [], groups: [] }) === false, 'torneio sem sorteio não é sorteado');
  ok(win._phaseDrawDone({ matches: [{ id: 'm1' }] }) === true, 'matches[] preenchido = sorteado');
  ok(win._phaseDrawDone({ groups: [{ players: [] }] }) === true, 'groups[] preenchido = sorteado');
  ok(win._phaseDrawDone(null) === false, 'null não estoura');
});

// ── 2. O BUG: computeEnroll punha a Sandra em participants ───────────────────────────
sec(function () {
  const t = loadAntes();
  const antes = t.participants.length;
  ok(antes === 110, 'estado pré-inscrição devia ter 110 inscritos, tem ' + antes);
  const r = enrollCore.computeEnroll(t, SANDRA, null, NOW);

  ok(r.outcome === 'waitlisted', 'inscrição 57s depois do sorteio devia ser "waitlisted", veio "' + r.outcome + '"');
  ok(!r.updateData.participants, 'updateData NÃO pode tocar participants — o roster da rodada está fechado');
  ok(Array.isArray(r.updateData.standbyParticipants), 'updateData devia trazer standbyParticipants');
  ok(r.updateData.standbyParticipants.length === 1, 'devia ter 1 pessoa na espera, tem ' + r.updateData.standbyParticipants.length);
  ok(r.updateData.standbyParticipants[0].uid === 'uid_sandra', 'a pessoa na espera devia ser a Sandra');
  ok(r.participants.length === antes, 'participants não pode crescer (' + antes + ' → ' + r.participants.length + ')');

  // Aplicado o update, ela aparece na espera canônica (os 3 storages unidos).
  const depois = Object.assign({}, t, { standbyParticipants: r.updateData.standbyParticipants });
  ok(win._getWaitlist(depois).length === 1, 'depois do update ela tem que aparecer em _getWaitlist');
});

// ── 3. Quem está na espera CONTINUA VENDO o torneio (memberUids) ─────────────────────
sec(function () {
  const t = loadAntes();
  const r = enrollCore.computeEnroll(t, SANDRA, null, NOW);
  ok(Array.isArray(r.updateData.memberUids), 'updateData devia recomputar memberUids');
  ok(r.updateData.memberUids.indexOf('uid_sandra') !== -1,
    'uid da espera FORA do memberUids = a pessoa não vê o próprio torneio (listener é memberUids array-contains)');
  // O cânone do CLIENTE (js/views/persist-core.js, carregado aqui via vendor/) tem que
  // concordar com o do SERVIDOR (functions/enroll-core.js) — são dois códigos diferentes
  // pra mesma regra, e é exatamente aí que nasce drift.
  const cli = win._computeMemberUids(Object.assign({}, t, { standbyParticipants: r.updateData.standbyParticipants }));
  ok(cli.indexOf('uid_sandra') !== -1, 'cliente (_computeMemberUids) tem que incluir a espera igual ao servidor');
  ok(cli.slice().sort().join() === r.updateData.memberUids.slice().sort().join(),
    'cliente e servidor têm que produzir o MESMO memberUids [[feedback_functions_must_mirror_app]]');
});

// ── 4. Idempotência: inscrever de novo não duplica na espera ─────────────────────────
sec(function () {
  const t = loadAntes();
  const r1 = enrollCore.computeEnroll(t, SANDRA, null, NOW);
  const t2 = Object.assign({}, t, { standbyParticipants: r1.updateData.standbyParticipants });
  const r2 = enrollCore.computeEnroll(t2, SANDRA, null, NOW + 1000);
  ok(r2.outcome === 'alreadyWaitlisted', '2ª tentativa devia ser "alreadyWaitlisted", veio "' + r2.outcome + '"');
  ok(r2.updateData === null, 'não pode gravar nada na 2ª tentativa');
});

// ── 5. NÃO-REGRESSÃO: antes do sorteio nada muda ─────────────────────────────────────
sec(function () {
  const t = loadAntes();
  t.rounds = []; t.matches = []; t.groups = [];   // volta pro estado de inscrições
  const antes = t.participants.length;
  const r = enrollCore.computeEnroll(t, SANDRA, null, NOW);
  ok(r.outcome === 'enrolled', 'antes do sorteio a inscrição tem que ir pro ROSTER, veio "' + r.outcome + '"');
  ok(r.updateData.participants.length === antes + 1, 'participants devia crescer 1 antes do sorteio');
  ok(!r.updateData.standbyParticipants, 'não pode mexer na espera antes do sorteio');
});

// ── 6. NÃO-REGRESSÃO: quem já está no roster continua "already" ──────────────────────
sec(function () {
  const t = load();
  const jaInscrito = { uid: t.participants[0].uid, displayName: 'Já Inscrito' };
  const r = enrollCore.computeEnroll(t, jaInscrito, null, NOW);
  ok(r.outcome === 'already', 'quem já está no roster não vai pra espera, veio "' + r.outcome + '"');
});

// ── 7. NÃO-REGRESSÃO: torneio encerrado segue recusando ──────────────────────────────
sec(function () {
  const t = loadAntes();
  t.status = 'finished'; t.ligaOpenEnrollment = false;
  const r = enrollCore.computeEnroll(t, SANDRA, null, NOW);
  ok(r.outcome === 'closed', 'torneio encerrado devia recusar, veio "' + r.outcome + '"');
});

// ── 8. _isPlayingCurrentPhase — quem já joga não vai pra fila ────────────────────────
sec(function () {
  const t = load();
  ok(typeof win._isPlayingCurrentPhase === 'function', 'servidor não define window._isPlayingCurrentPhase');
  const noGrupo = t.rounds[0].monarchGroups[0].playersUids[0];
  ok(win._isPlayingCurrentPhase(t, { uid: noGrupo }) === true, 'quem está num grupo Rei/Rainha ESTÁ jogando');
  ok(win._isPlayingCurrentPhase(t, { uid: 'uid_sandra' }) === false, 'a Sandra NÃO está jogando a fase');
  ok(win._isPlayingCurrentPhase(t, { uid: 'uid_inativo_1' }) === false, 'inativo não sorteado NÃO está jogando');
  // uid manda: nome igual com uid diferente não pode dar match
  const nomeDoGrupo = t.rounds[0].monarchGroups[0].players[0];
  ok(win._isPlayingCurrentPhase(t, { uid: 'uid_intruso', displayName: nomeDoGrupo }) === false,
    'homônimo com uid diferente NÃO pode contar como jogando [[project_uid_identity_canon_locked]]');
  // sem uid (fictício/guest) cai no nome, que é a identidade dele
  ok(win._isPlayingCurrentPhase(t, { displayName: nomeDoGrupo }) === true, 'guest sem uid casa por nome');
  ok(win._isPlayingCurrentPhase(t, null) === false, 'entrada nula não estoura');
});

// ── 9. REATIVAR com a fase sorteada MOVE pra espera (função REAL, extraída do arquivo) ─
sec(function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const i = src.indexOf('window._toggleLigaActive = function');
  ok(i !== -1, 'não achei window._toggleLigaActive no arquivo');
  // recorta até o fechamento do bloco (a próxima linha que começa com "};" na coluna 0)
  const end = src.indexOf('\n};', i);
  const body = src.slice(i, end + 3);

  function run(t, uid, isActive) {
    const store = {
      tournaments: [t],
      currentUser: { uid: uid },
      isOrganizer: () => false,
    };
    const sandbox = {
      AppStore: store,
      _phaseDrawDone: win._phaseDrawDone,
      _isPlayingCurrentPhase: win._isPlayingCurrentPhase,
      _participantUids: win._participantUids,
      _userMatchesParticipant: (u, p) => !!(p && p.uid && u && u.uid && p.uid === u.uid),
      _warn: () => {},
      FirestoreDB: { saveTournament: () => Promise.resolve() },
      showNotification: () => {},
      _t: (k) => k,
    };
    sandbox.window = sandbox;
    sandbox.document = { querySelectorAll: () => [], getElementById: () => null };
    sandbox.renderTournaments = () => {};
    const fn = new Function('window', 'document', '_t', 'renderTournaments',
      'with (window) { ' + body + ' return window._toggleLigaActive; }'
    )(sandbox, sandbox.document, sandbox._t, sandbox.renderTournaments);
    fn(t.id, isActive);
    return sandbox;
  }

  // (a) inativo reativa com a fase sorteada → SAI dos participants, ENTRA na espera
  const t = load();
  const antes = t.participants.length;
  run(t, 'uid_inativo_1', true);
  ok(!t.participants.some(p => p.uid === 'uid_inativo_1'), 'reativado devia SAIR de participants (sai dos inativos)');
  ok(t.participants.length === antes - 1, 'participants devia perder exatamente 1');
  ok((t.standbyParticipants || []).some(p => p.uid === 'uid_inativo_1'), 'reativado devia ENTRAR na lista de espera');
  ok(t.standbyParticipants[0].ligaActive === true, 'na espera ele fica ATIVO (não é mais inativo)');
  ok(win._getWaitlist(t).length === 1, 'a espera canônica tem que enxergá-lo');

  // (b) DESATIVAR nunca mexe de lista — inativo continua inativo em participants
  const t2 = load();
  run(t2, t2.rounds[0].monarchGroups[0].playersUids[0], false);
  const alvo = t2.participants.find(p => p.uid === t2.rounds[0].monarchGroups[0].playersUids[0]);
  ok(alvo && alvo.ligaActive === false, 'desativar devia só marcar ligaActive:false');
  ok((t2.standbyParticipants || []).length === 0, 'desativar NÃO pode mandar ninguém pra espera');

  // (c) quem JÁ ESTÁ JOGANDO reativa e volta a jogar direto — sem fila
  const t3 = load();
  const jogando = t3.rounds[0].monarchGroups[0].playersUids[1];
  t3.participants.find(p => p.uid === jogando).ligaActive = false;
  run(t3, jogando, true);
  ok(t3.participants.some(p => p.uid === jogando), 'quem já tem jogo na rodada CONTINUA em participants');
  ok((t3.standbyParticipants || []).length === 0, 'quem já joga não entra na fila');

  // (d) ANTES do sorteio, reativar é só o toggle de sempre
  const t4 = load();
  t4.rounds = []; t4.matches = []; t4.groups = [];
  run(t4, 'uid_inativo_2', true);
  ok(t4.participants.some(p => p.uid === 'uid_inativo_2'), 'sem sorteio, reativar não move ninguém');
  ok((t4.standbyParticipants || []).length === 0, 'sem sorteio, nada vai pra espera');
});

// ── 10. O gate do cliente não pode voltar a curto-circuitar por Liga aberta ──────────
sec(function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const doEnroll = src.slice(src.indexOf('window._doEnrollCurrentUser = function'));
  const gate = doEnroll.indexOf('window._phaseDrawDone(t)');
  const push = doEnroll.indexOf('t.participants.push(participantObj)');
  ok(gate !== -1, '_doEnrollCurrentUser precisa consultar window._phaseDrawDone');
  ok(gate < push, 'o gate da espera tem que vir ANTES do push otimista em participants');

  const tx = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
  const txi = tx.indexOf('_enrollParticipantTx');
  const bloco = tx.slice(txi, txi + 12000);
  ok(bloco.indexOf('waitlisted: true') !== -1,
    'a transação de fallback (firebase-db) precisa do MESMO ramo de espera, senão o fallback recria o fantasma');
});

console.log((fail === 0 ? '✅' : '❌') + ' inscricao-pos-sorteio-vai-pra-espera: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
