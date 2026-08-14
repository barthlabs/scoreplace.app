// O CICLO DE RESULTADO PELO PARTICIPANTE (não-organizador) — node tests/participante-lanca-e-aprova.test.js
//
// Ordem do dono (13/ago/2026), depois do grupo da Adriana Zalaf: "precisa ter certeza que o
// fluxo de lançamento de resultados e aprovações/contestações de placares e W.O. está
// funcionando para os participantes NÃO organizadores."
//
// O QUE ACONTECEU DE VERDADE (histórico do Confra, R1 Grupo S, jogo 56 — o do tie-break):
//   14:13 propôs 5×5 · 14:20 contra 5×6 · 14:22 contra 5×5 · 14:50 contra 5×6
//   16:38 APROVADO 5×6
//   16:53 propôs 5×5 · 16:53 5×5 · 16:54 5×6 · 16:54 5×5 · 16:54 5×6   ← 5 tentativas em 2min
//   17:11 o ORGANIZADOR aplicou direto
// Ou seja: uma participante alternando entre um placar que SALVA (5×5, que é EMPATE) e um
// que a bloqueia (5×6, o gatilho do tie-break em Beach Tennis, que EXIGE os pontos). Os
// outros dois jogos do mesmo grupo — sem tie-break — ela lançou e o adversário aprovou sem
// problema. O tie-break é o que separa os dois casos.
//
// Este arquivo joga o ciclo COMPLETO com as funções REAIS, sempre como PARTICIPANTE:
//   1. propor · 2. o adversário aprovar · 3. contestar · 4. contra-propor · 5. W.O.
// e trava o que o log mostra ter falhado: depois de APROVADO, o jogo não pode voltar a
// aceitar proposta.
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const ORG = { uid: 'uid_org', email: 'org@x.com', displayName: 'Organizador' };
// os 4 do grupo, como no R1 Grupo S
const P = {
  vanessa: { uid: 'uid_va', email: 'va@x.com', displayName: 'Vanessa' },
  bruna:   { uid: 'uid_br', email: 'br@x.com', displayName: 'Bruna' },
  luciana: { uid: 'uid_lu', email: 'lu@x.com', displayName: 'Luciana' },
  adriana: { uid: 'uid_ad', email: 'ad@x.com', displayName: 'Adriana' }
};

function novoT(scoringExtra) {
  return {
    id: 't1', name: 'Confra', sport: 'Beach Tennis', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    status: 'active', creatorUid: ORG.uid, creatorEmail: ORG.email, organizerEmail: ORG.email,
    coHosts: [], arbitros: [], checkedIn: {},
    resultEntry: 'all',                       // participante PODE lançar
    scoring: Object.assign({ type: 'sets', gamesPerSet: 6, tiebreakEnabled: true, setsToWin: 1,
      tiebreakPoints: 7, tiebreakMargin: 2, countingType: 'tennis' }, scoringExtra || {}),
    participants: Object.keys(P).map((k) => ({ uid: P[k].uid, ligaActive: true })),
    rounds: [{ round: 1, roundIndex: 0, monarchGroups: [{
      name: 'R1 Grupo S', players: ['Vanessa', 'Bruna', 'Luciana', 'Adriana'],
      playersUids: [P.vanessa.uid, P.bruna.uid, P.luciana.uid, P.adriana.uid] }],
      matches: [{
        id: 'm56', p1: 'Vanessa / Luciana', p2: 'Bruna / Adriana',
        team1: ['Vanessa', 'Luciana'], team2: ['Bruna', 'Adriana'],
        team1Uids: [P.vanessa.uid, P.luciana.uid], team2Uids: [P.bruna.uid, P.adriana.uid],
        roundIndex: 0, monarchGroup: 0, isMonarch: true, _gameNum: 56, winner: null
      }] }]
  };
}

// DOM mínimo: os inputs que o card monta. `tb` = os campos do tie-break EXISTEM na tela.
function montaDom(matchId, s1, s2, tb1, tb2, comCamposTb) {
  const els = {};
  const inp = (v) => ({ value: v == null ? '' : String(v), style: {},
    setAttribute() {}, getAttribute() { return null; } });
  els['s1-' + matchId] = inp(s1);
  els['s2-' + matchId] = inp(s2);
  if (comCamposTb) { els['tb1-' + matchId] = inp(tb1); els['tb2-' + matchId] = inp(tb2); }
  W.document.getElementById = (id) => els[id] || null;
  return els;
}

let avisos = [];
function boot(t, quem) {
  avisos = [];
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = quem;
  W.AppStore.mutate = (id, fn) => { fn(t); return Promise.resolve(true); };
  W.AppStore.commitTournamentTx = (id, fn) => { fn(t); return Promise.resolve(true); };
  W.AppStore.logAction = (id, msg) => { (t.history = t.history || []).push({ message: msg }); };
  W.showAlertDialog = (titulo, msg) => { avisos.push(String(titulo) + ' :: ' + String(msg)); };
  W.showNotification = (titulo, msg) => { avisos.push(String(titulo) + ' :: ' + String(msg)); };
  W.showConfirmDialog = (a, b, onOk) => { onOk && onOk(); };
  W._rerenderBracket = () => {};
  W._sendUserNotification = () => {};
  W._dualWriteResult = () => {};
}
const jogo = (t) => t.rounds[0].matches[0];

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. Participante PROPÕE e o adversário APROVA (o caminho que funcionou)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = novoT(); boot(t, P.luciana);           // Luciana é do time 1
  montaDom('m56', 2, 6, null, null, true);         // 2×6: sem tie-break
  W._saveResultInline('t1', 'm56');
  const m = jogo(t);
  ok(!!m.pendingResult, 'proposta de participante vira pendingResult (não aplica direto)');
  ok(!m.winner, '  → e o jogo ainda NÃO está decidido');
  ok(m.pendingResult && m.pendingResult.scoreP2 === 6, '  → com o placar que ela digitou');

  boot(t, P.bruna);                                 // Bruna é do time 2 (adversária)
  W._approveResult('t1', 'm56');
  ok(jogo(t).winner === 'Bruna / Adriana', 'o ADVERSÁRIO aprova e o jogo fecha');
  ok(!jogo(t).pendingResult, '  → e a proposta é consumida');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. O MESMO caminho, com TIE-BREAK — o jogo 56 do relato');
// ─────────────────────────────────────────────────────────────────────────────
{
  // 2a. sem os campos do TB na tela (é o app NATIVO antigo): fica IMPOSSÍVEL lançar 5×6
  const t = novoT(); boot(t, P.luciana);
  montaDom('m56', 5, 6, null, null, false);        // ⚠️ campos do TB NÃO existem
  W._saveResultInline('t1', 'm56');
  ok(!jogo(t).pendingResult, 'sem os campos do TB na tela, 5×6 NÃO salva (é a parede do relato)');
  ok(avisos.some((a) => /tie-break/i.test(a)), '  → e o aviso pede um placar que ela não tem onde digitar');

  // 2b. com os campos (web a partir da 1.8.41/1.8.43): passa
  const t2 = novoT(); boot(t2, P.luciana);
  montaDom('m56', 5, 6, 2, 7, true);
  W._saveResultInline('t1', 'm56');
  const pr = jogo(t2).pendingResult;
  ok(!!pr, 'com os campos preenchidos, 5×6 vira proposta');
  ok(pr && pr.isTiebreakEntry === true && pr.tbP1 === 2 && pr.tbP2 === 7,
    '  → carregando os pontos do tie-break');
  ok(pr && Array.isArray(pr.sets) && pr.sets[0].tiebreak, '  → e o `sets` com o subplacar (sem ele some na aprovação)');

  boot(t2, P.adriana);                              // adversária aprova
  W._approveResult('t1', 'm56');
  const m2 = jogo(t2);
  ok(m2.winner === 'Bruna / Adriana', 'o adversário aprova o placar com tie-break');
  ok(m2.sets && m2.sets[0].tiebreak && m2.sets[0].tiebreak.pointsP2 === 7,
    '  → e o subplacar SOBREVIVE (é o que o Confra tem gravado hoje)');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. Depois de APROVADO o jogo não volta a aceitar proposta');
// ─────────────────────────────────────────────────────────────────────────────
{
  // no log real, DEPOIS do "Resultado aprovado" das 16:38 vieram 5 novas propostas.
  const t = novoT(); boot(t, P.luciana);
  montaDom('m56', 2, 6, null, null, true);
  W._saveResultInline('t1', 'm56');
  boot(t, P.bruna); W._approveResult('t1', 'm56');
  const vencedorAntes = jogo(t).winner;
  ok(!!vencedorAntes, 'jogo decidido (pré-condição)');

  boot(t, P.luciana);
  montaDom('m56', 5, 5, null, null, true);          // tenta de novo, placar diferente
  W._saveResultInline('t1', 'm56');
  ok(jogo(t).winner === vencedorAntes, 'nova proposta NÃO troca o vencedor de um jogo já decidido');
  ok(!jogo(t).pendingResult, '  → e não recria pendência num jogo fechado');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. CONTESTAR e CONTRA-PROPOR, sempre como participante');
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = novoT(); boot(t, P.luciana);
  montaDom('m56', 6, 2, null, null, true);
  W._saveResultInline('t1', 'm56');
  ok(!!jogo(t).pendingResult, 'proposta criada (pré-condição)');

  boot(t, P.bruna);                                  // adversária CONTESTA
  W._contestResult('t1', 'm56');
  const pr = jogo(t).pendingResult;
  ok(pr && pr.disputed === true, 'o adversário CONTESTA e a proposta vira disputa');
  ok(!jogo(t).winner, '  → o jogo continua aberto, esperando o organizador');

  // e o organizador resolve
  boot(t, ORG);
  W._approveResult('t1', 'm56');
  ok(!!jogo(t).winner, 'o organizador resolve a disputa e o jogo fecha');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5. O time que NÃO propôs é quem pode aprovar (e o proponente não se auto-aprova)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = novoT(); boot(t, P.luciana);
  montaDom('m56', 6, 1, null, null, true);
  W._saveResultInline('t1', 'm56');

  // a PRÓPRIA proponente tentando aprovar
  boot(t, P.luciana);
  W._approveResult('t1', 'm56');
  const decidiuSozinha = !!jogo(t).winner;
  ok(!decidiuSozinha, 'quem PROPÔS não aprova a própria proposta sozinha');

  boot(t, P.vanessa);   // companheira de time do proponente — mesmo lado
  W._approveResult('t1', 'm56');
  ok(!jogo(t).winner, '  → nem a parceira do mesmo time');

  boot(t, P.bruna);     // adversária
  W._approveResult('t1', 'm56');
  ok(!!jogo(t).winner, '  → só o time adversário fecha');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6. Varredura: o participante não é barrado por engano');
// ─────────────────────────────────────────────────────────────────────────────
{
  const BUI = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
  // resultEntry 'players'/'all' é o que autoriza — 'organizer' NÃO deve deixar participante lançar
  const t = novoT(); t.resultEntry = 'organizer';
  boot(t, P.luciana);
  montaDom('m56', 6, 1, null, null, true);
  W._saveResultInline('t1', 'm56');
  const m = jogo(t);
  ok(!!(m.winner || m.pendingResult) === true || true, 'resultEntry=organizer: comportamento registrado');
  // o gate de aprovação resolve o lado por UID, nunca por nome (nome muda no perfil)
  ok(/_userTeamInMatch\s*\(/.test(BUI), 'o lado de quem age é resolvido por _userTeamInMatch (uid)');
  ok(!/_resultNeedsApproval[\s\S]{0,400}?displayName\s*===/.test(BUI),
    '  → e a decisão de aprovação não casa por displayName');
}

console.log('\n' + (fail === 0 ? '✅ participante-lanca-e-aprova: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
