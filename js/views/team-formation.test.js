/* Teste headless da máquina de pendência de duplas — node js/views/team-formation.test.js
 * (a formação real vive em tournaments.js _formDuplaByUids; aqui só o fluxo de convites) */
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
    pairRequests: []
  };
  Object.keys(extra || {}).forEach(function (k) { t[k] = extra[k]; });
  return t;
}
function names(t) { return t.participants.map(function (p) { return p.displayName || p.name; }); }

// 1) requestPair cria pendência — NUNCA muta participants.
(function () {
  var t = mkT();
  var r = tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1000 });
  ok(r.ok && r.action === 'pending', 'requestPair → pending');
  eq(t.pairRequests.length, 1, '1 convite registrado');
  eq([t.pairRequests[0].inviterUid, t.pairRequests[0].inviteeUid], ['a', 'b'], 'convite a→b');
  eq(names(t).sort(), ['Ana', 'Bia', 'Cida', 'Duda'], 'participants intactos (não formou)');
})();

// 2) requestPair exige manualPairing='open'.
(function () {
  var t = mkT({ manualPairing: 'organizer_only' });
  eq(tf.requestPair(t, 'a', 'b').error, 'participante-sem-permissao', 'open obrigatório');
})();

// 3) Não pode convidar quem já está em dupla, nem a si mesmo, nem singles.
(function () {
  var t = mkT();
  t.participants[1] = { uid: 'b', name: 'Bia / Duda', p1Name: 'Bia', p1Uid: 'b', p2Name: 'Duda', p2Uid: 'd' };
  eq(tf.requestPair(t, 'a', 'b', 'Ana', 'Bia').error, 'alvo-ja-em-dupla', 'alvo já em dupla');
  eq(tf.requestPair(t, 'a', 'a').error, 'mesma-pessoa', 'mesma pessoa');
  eq(tf.requestPair(mkT({ teamSize: 1 }), 'a', 'c').error, 'nao-duplas', 'singles bloqueia');
})();

// 4) 1 convite de saída por vez.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });
  eq(tf.requestPair(t, 'a', 'c', 'Ana', 'Cida', { now: 2 }).error, 'ja-tem-convite-pendente', '2º convite bloqueado');
})();

// 5) Recíproco → action:'confirm' na ordem do 1º proponente, limpa convites.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });   // a→b
  var r = tf.requestPair(t, 'b', 'a', 'Bia', 'Ana', { now: 2 }); // b→a
  ok(r.ok && r.action === 'confirm', 'recíproco → confirm');
  eq([r.inviterUid, r.inviteeUid], ['a', 'b'], 'confirm na ordem do 1º proponente (a,b)');
  eq(t.pairRequests.length, 0, 'convites limpos');
  eq(names(t).sort(), ['Ana', 'Bia', 'Cida', 'Duda'], 'módulo não forma (quem forma é tournaments.js)');
})();

// 6) Aceitar → confirm + cancela os OUTROS convites dos 2.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });   // a→b
  tf.requestPair(t, 'c', 'b', 'Cida', 'Bia', { now: 2 });  // c→b
  eq(t.pairRequests.length, 2, '2 convites entrando p/ Bia');
  var r = tf.acceptPair(t, 'a__b', 'b');
  ok(r.ok && r.action === 'confirm', 'acceptPair → confirm');
  eq([r.inviterUid, r.inviteeUid], ['a', 'b'], 'confirm a+b');
  eq(t.pairRequests.length, 0, 'convite c→b cancelado junto');
})();

// 7) Aceitar só pelo convidado.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });
  eq(tf.acceptPair(t, 'a__b', 'a').error, 'nao-e-o-convidado', 'iniciante não auto-aceita');
})();

// 8) Cancelar/recusar (iniciante OU alvo; terceiro não).
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });
  eq(tf.cancelPair(t, 'a__b', 'c').error, 'sem-permissao', 'terceiro não cancela');
  ok(tf.cancelPair(t, 'a__b', 'b').ok, 'alvo recusa');
  eq(t.pairRequests.length, 0, 'removido');
})();

// 9) acceptPair barra se alguém já entrou em dupla nesse meio tempo.
(function () {
  var t = mkT();
  tf.requestPair(t, 'a', 'b', 'Ana', 'Bia', { now: 1 });
  t.participants[0] = { uid: 'a', name: 'Ana / Cida', p1Name: 'Ana', p1Uid: 'a', p2Name: 'Cida', p2Uid: 'c' };
  eq(tf.acceptPair(t, 'a__b', 'b').error, 'iniciante-ja-em-dupla', 'aceite barrado se iniciante já pareou');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' team-formation: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
