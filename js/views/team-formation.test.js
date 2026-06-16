/* Teste headless da formação manual de duplas — node js/views/team-formation.test.js */
var tf = require('./team-formation.js');
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ')'); }

function mkT(extra) {
  var t = {
    id: 'x', teamSize: 2, manualPairing: 'open',
    participants: [
      { uid: 'a', name: 'Ana' }, { uid: 'b', name: 'Bia' },
      { uid: 'c', name: 'Cida' }, { uid: 'd', name: 'Duda' }
    ],
    teamOrigins: {}, pairRequests: []
  };
  Object.keys(extra || {}).forEach(function (k) { t[k] = extra[k]; });
  return t;
}
function names(t) { return t.participants.map(function (p) { return p.displayName || p.name; }); }

// 1) Organizador forma dupla: 2 indivíduos viram 1 dupla, origem 'formada'.
(function () {
  var t = mkT();
  var r = tf.formTeam(t, 'a', 'b');
  ok(r.ok, 'formTeam ok');
  eq(names(t).sort(), ['Ana / Bia', 'Cida', 'Duda'], 'Ana+Bia viram dupla; Cida/Duda seguem individuais');
  ok(t.teamOrigins['Ana / Bia'] === 'formada', "teamOrigins marca 'formada'");
  ok(r.team.p1Uid === 'a' && r.team.p2Uid === 'b' && r.team.fixedPair === true, 'dupla preserva uids + fixedPair');
})();

// 2) Não pode parear quem já está em dupla, nem a mesma pessoa.
(function () {
  var t = mkT();
  tf.formTeam(t, 'a', 'b');
  eq(tf.formTeam(t, 'a', 'c').error, 'ja-em-dupla', 'bloqueia parear quem já está em dupla');
  eq(tf.formTeam(t, 'c', 'c').error, 'mesma-pessoa', 'bloqueia parear a mesma pessoa');
  eq(tf.formTeam(t, 'c', 'z').error, 'inscrito-nao-encontrado', 'bloqueia uid inexistente');
})();

// 3) Desmontar: dupla volta a 2 individuais, origem some.
(function () {
  var t = mkT();
  tf.formTeam(t, 'a', 'b');
  var r = tf.dismantleTeam(t, 'Ana / Bia');
  ok(r.ok, 'dismantle ok');
  eq(names(t).sort(), ['Ana', 'Bia', 'Cida', 'Duda'], 'voltou a 4 individuais');
  ok(t.teamOrigins['Ana / Bia'] === undefined, 'origem removida');
  ok(r.members.length === 2 && r.members[0].uid === 'a' && r.members[1].uid === 'b', 'membros preservam uid');
})();

// 4) Participante pede pra parear → fica pendente (visível em t.pairRequests).
(function () {
  var t = mkT();
  var r = tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1000 });
  ok(r.ok && r.confirmed === false, 'requestPair cria pendência (não confirma)');
  eq(t.pairRequests.length, 1, '1 convite pendente');
  eq([t.pairRequests[0].inviterUid, t.pairRequests[0].inviteeUid], ['a', 'b'], 'convite a→b');
  eq(names(t).sort(), ['Ana', 'Bia', 'Cida', 'Duda'], 'ninguém pareado ainda (só pendente)');
})();

// 5) requestPair exige manualPairing='open'.
(function () {
  var t = mkT({ manualPairing: 'organizer_only' });
  eq(tf.requestPair(t, 'a', 'b', 'Ana', 'Bia').error, 'participante-sem-permissao', 'open obrigatório p/ participante');
  // organizador continua podendo formar
  ok(tf.formTeam(t, 'a', 'b').ok, 'organizador forma mesmo com organizer_only');
})();

// 6) 1 convite de saída por vez (trava o iniciante).
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });
  eq(tf.requestPair(t, 'a', 'c', 'Ana', 'Cida', { now: 2 }).error, 'ja-tem-convite-pendente', '2º convite de saída bloqueado');
})();

// 7) Aceitar: confirma dupla + cancela os OUTROS convites dos 2 membros.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });   // a→b
  tf.requestPair(t, 'c', 'b', 'Cida', 'Bia', { now: 2 });  // c→b (Bia tem 2 entrando)
  eq(t.pairRequests.length, 2, '2 convites entrando p/ Bia');
  var r = tf.acceptPair(t, 'a__b', 'b');
  ok(r.ok, 'acceptPair ok');
  eq(names(t).sort(), ['Ana / Bia', 'Cida', 'Duda'], 'Ana+Bia confirmados');
  eq(t.pairRequests.length, 0, 'convite c→b cancelado ao aceitar a→b');
})();

// 8) Aceitar só pelo convidado.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });
  eq(tf.acceptPair(t, 'a__b', 'a').error, 'nao-e-o-convidado', 'iniciante não pode auto-aceitar');
})();

// 9) Convite recíproco confirma direto.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 }); // a→b
  var r = tf.requestPair(t, 'b', 'a', 'Bia', 'Ana', { now: 2 }); // b→a (recíproco)
  ok(r.ok && r.confirmed === true, 'recíproco confirma direto');
  eq(names(t).sort(), ['Ana / Bia', 'Cida', 'Duda'], 'dupla formada pelo recíproco');
  eq(t.pairRequests.length, 0, 'convites limpos');
})();

// 10) Cancelar/recusar convite (iniciante OU alvo).
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });
  eq(tf.cancelPair(t, 'a__b', 'c').error, 'sem-permissao', 'terceiro não cancela');
  ok(tf.cancelPair(t, 'a__b', 'b').ok, 'alvo recusa');
  eq(t.pairRequests.length, 0, 'convite removido');
})();

// 11) Singles (teamSize 1) não permite formação manual.
(function () {
  var t = mkT({ teamSize: 1 });
  eq(tf.formTeam(t, 'a', 'b').error, 'nao-duplas', 'singles bloqueia formação manual');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' team-formation: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
