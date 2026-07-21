/* Migração sorteio client→CF (item #2): o CLIENTE não decide mais o sorteio.
 *
 * Prova o mecanismo central: generateDrawFunction, ANTES de despachar, RESTAURA o roster
 * ORIGINAL no doc (a partir do snapshot de draw-prep) → a CF sorteia SEMPRE de (roster
 * original + pacote de decisões), NEUTRALIZANDO qualquer mutação que o cliente tenha feito
 * na cadeia de resolução. Assim um app de loja desatualizado que mute o elenco de forma
 * DIFERENTE não muda o resultado — a CF é a única autoridade.
 *
 * Cenário: o cliente "sujou" o elenco (dropou metade dos inscritos em memória). O snapshot
 * guarda os 8 originais. Após generateDrawFunction, a chave tem que refletir os 8 ORIGINAIS
 * (R1 = 4 jogos), não os 4 sujos (que dariam R1 = 2).
 *
 * node tests/draw-client-restore-original.test.js
 */
const H = require('./render-harness');
const S = H.sandbox;

let pass = 0, fail = 0;
function ok(m, c, got) {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m + (got !== undefined ? ' (got ' + got + ')' : '')); }
}
const r1 = (t) => (t.matches || []).filter((m) => m.round === 1 && !m.isBye && !m.isSitOut).length;

// mutate SÍNCRONO (o harness não stuba): aplica o mutador no t em memória e devolve thenable
// síncrono — mantém generateDrawFunction síncrono (o drawRoundStub também é). Sem isto, o
// caminho de restauração seria pulado (mutate ausente) e o teste não exercitaria a restauração.
S.AppStore.mutate = function (id, fn) {
  var tt = S.AppStore.tournaments.find(function (x) { return String(x.id) === String(id); });
  if (tt) { try { fn(tt); } catch (e) {} }
  return { then: function (cb) { cb && cb(); return { catch: function () {} }; } };
};

console.log('\n== Restauração do roster original antes do despacho (migração→CF) ==');

// 8 inscritos individuais (elim). Original = P1..P8.
var original = [];
for (var i = 1; i <= 8; i++) original.push({ displayName: 'P' + i, name: 'P' + i, uid: 'u' + i });

var t = { id: 'RST', format: 'Eliminatórias Simples', status: 'open',
          participants: JSON.parse(JSON.stringify(original)) };
S.AppStore.tournaments = [t];

// snapshot de draw-prep = os 8 ORIGINAIS (o que _startDraw grava no início do ciclo).
S._drawPrepSnapshots = { RST: { participants: JSON.parse(JSON.stringify(original)) } };

// O cliente "sujou" o elenco: dropou P5..P8 em memória (simula uma mutação divergente de um
// app desatualizado). Sem a restauração, a CF sortearia esses 4 sujos.
t.participants = t.participants.slice(0, 4);
ok('pré-condição: doc sujo tem 4 inscritos', t.participants.length === 4, t.participants.length);

// Dispara o sorteio pelo caminho do cliente. A restauração é async (via mutate → Promise);
// o despacho roda num microtask. Asserta após 2 ticks (drena micro + macrotasks).
S.generateDrawFunction('RST');

setTimeout(function () {
  // A CF (stub → draw-core) deve ter sorteado os 8 ORIGINAIS, não os 4 sujos.
  var drawn = S.AppStore.tournaments.find(function (x) { return x.id === 'RST'; });
  ok('a chave reflete os 8 ORIGINAIS (R1 = 4 jogos), não os 4 sujos', r1(drawn) === 4, 'R1=' + r1(drawn));
  ok('elenco final tem 8 (restaurado antes do sorteio)',
     (drawn.participants || []).length === 8, 'parts=' + (drawn.participants || []).length);

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' draw-client-restore-original: ' + pass + ' ok, ' + fail + ' falharam\n');
  process.exit(fail === 0 ? 0 : 1);
}, 10);
