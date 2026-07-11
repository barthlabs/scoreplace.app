/* uid-audit Parte 14 — contadores de fairness do motor de sorteio por UID, não por nome.
 * sitOutHistory (folga) e opponentHistory (anti-repeat de pares) eram keyed por NOME →
 * quando a pessoa RENOMEIA no meio da Liga, a chave de nome muda e o contador é PERDIDO
 * (folga/pareamento injusto por uma rodada). Agora a chave segue o UID (via _buildNameToUid);
 * nome só quando não há uid (guest sem conta / rodada legada). Testa a lógica REAL de
 * js/views/bracket-logic.js via headless. Ver [[project_uid_audit_sweep]] (Parte 14).
 */
const W = require('./headless').window;

let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

ok(typeof W._recordSitOut === 'function' && typeof W._chooseSitOutPlayers === 'function', '_recordSitOut/_chooseSitOutPlayers carregados');
ok(typeof W._recordOpponentHistory === 'function' && typeof W._migrateOppHistToUid === 'function', '_recordOpponentHistory/_migrateOppHistToUid carregados');
ok(typeof W._buildNameToUid === 'function', '_buildNameToUid carregado');

function mkT() {
  return {
    sitOutHistory: {}, opponentHistory: {},
    participants: [
      { uid: 'uA', displayName: 'Ana' },
      { uid: 'uB', displayName: 'Bob' },
      { uid: 'uC', displayName: 'Cadu' },
      { uid: 'uD', displayName: 'Dan' },
    ],
  };
}

// ── sitOutHistory: keyed por uid ──────────────────────────────────────────────
console.log('──── sitOutHistory por uid ────');
var t = mkT();
W._recordSitOut(t, ['Ana'], null);
eq(t.sitOutHistory._default_['uid:uA'], 1, 'folga gravada sob uid (uid:uA), não sob o nome');
eq(t.sitOutHistory._default_['Ana'], undefined, 'nenhuma chave por nome ("Ana")');

// RENAME mid-Liga: Ana → "Ana Silva" (uid estável). O contador tem que sobreviver.
console.log('──── rename mid-Liga preserva a folga ────');
t.participants[0].displayName = 'Ana Silva';
// Ordem [Bob, Ana Silva]: SEM o contador, o desempate por rank (pior rank folga) faria
// Ana (rank 1) folgar de novo. COM o uid, Ana (1 folga) JOGA e Bob (0 folgas) folga.
var players = ['Bob', 'Ana Silva'];
// inline: lógica VELHA (contador por NOME) — perde a folga da Ana renomeada.
function oldChooseByName(tt, ps, numToSitOut) {
  var cat = (tt.sitOutHistory && tt.sitOutHistory._default_) || {};
  var indexed = ps.map(function (name, idx) { return { name: name, sitOuts: cat[name] || 0, rank: idx }; });
  indexed.sort(function (a, b) { if (a.sitOuts !== b.sitOuts) return a.sitOuts - b.sitOuts; return b.rank - a.rank; });
  return indexed.slice(0, numToSitOut).map(function (x) { return x.name; });
}
ok(oldChooseByName(t, players, 1).indexOf('Ana Silva') !== -1, 'VELHO (por nome) faz Ana renomeada FOLGAR de novo — a regressão');
var r = W._chooseSitOutPlayers(t, players, 1, null);
ok(r.sitOut.indexOf('Ana Silva') === -1, 'NOVO (por uid) Ana JOGA — contador seguiu o uid');
eq(r.sitOut[0], 'Bob', 'NOVO faz Bob (0 folgas) folgar');

// migração lossless: contador legado por NOME é herdado pela chave de uid ao gravar.
console.log('──── migração lossless do contador legado (nome→uid) ────');
var t2 = mkT();
t2.sitOutHistory = { _default_: { 'Bob': 3 } }; // doc legado name-keyed
W._recordSitOut(t2, ['Bob'], null);
eq(t2.sitOutHistory._default_['uid:uB'], 4, 'legado "Bob":3 herdado → uid:uB vira 4');
eq(t2.sitOutHistory._default_['Bob'], undefined, 'chave de nome legada apagada após migrar');

// guest sem conta (sem uid) segue por nome — é a identidade legítima dele.
console.log('──── guest sem uid → segue por nome ────');
var t3 = mkT();
t3.participants.push({ displayName: 'Convidado' }); // sem uid
W._recordSitOut(t3, ['Convidado'], null);
eq(t3.sitOutHistory._default_['Convidado'], 1, 'guest sem conta → chave por nome (única identidade)');

// ── opponentHistory: par por uid + migração + scorer com keyOf ────────────────
console.log('──── opponentHistory por uid ────');
var t4 = mkT();
W._recordOpponentHistory(t4, [['Ana', 'Bob']], null);
eq(t4.opponentHistory._default_['uid:uA|||uid:uB'], 1, 'par gravado por uid (ordenado uid:uA|||uid:uB)');
ok(t4.opponentHistory._default_['Ana|||Bob'] === undefined && t4.opponentHistory._default_['Bob|||Ana'] === undefined, 'nenhuma chave de par por nome');

console.log('──── migração lossless do opponentHistory (nome→uid) ────');
var t5 = mkT();
t5.opponentHistory = { _default_: { 'Ana|||Bob': 2, 'Cadu|||Dan': 1 } }; // legado por nome
W._migrateOppHistToUid(t5, '_default_', W._buildNameToUid(t5));
eq(t5.opponentHistory._default_['uid:uA|||uid:uB'], 2, 'par legado Ana|||Bob → uid:uA|||uid:uB (valor preservado)');
eq(t5.opponentHistory._default_['uid:uC|||uid:uD'], 1, 'par legado Cadu|||Dan → uid:uC|||uid:uD');
eq(t5.opponentHistory._default_['Ana|||Bob'], undefined, 'chave de par por nome removida após migração');
// idempotente: rodar de novo não muda nada
var snap = JSON.stringify(t5.opponentHistory._default_);
W._migrateOppHistToUid(t5, '_default_', W._buildNameToUid(t5));
eq(JSON.stringify(t5.opponentHistory._default_), snap, 'migração é idempotente (uid:X não re-mapeia)');

console.log('──── scorer (_scoreShuffle) lê o par por uid via keyOf ────');
var n2u = W._buildNameToUid(t5);
var keyOf = W._fairnessKeyOf(n2u);
// ordem [Ana,Bob,Cadu,Dan] agrupa Ana+Bob juntos (par com histórico 2) → penaliza.
var scoreTogether = W._scoreShuffle(['Ana', 'Bob', 'Cadu', 'Dan'], t5.opponentHistory._default_, 4, keyOf);
// ordem [Ana,Cadu,Bob,Dan] no MESMO grupo de 4 ainda junta Ana+Bob (grupo único) — então
// pra ver diferença, use 2 grupos de 2: Ana+Cadu | Bob+Dan (par Ana|Bob separado).
var scoreApart = W._scoreShuffle(['Ana', 'Cadu', 'Bob', 'Dan'], t5.opponentHistory._default_, 2, keyOf);
ok(scoreTogether > 0, 'grupo com o par repetido (Ana+Bob) pontua > 0 (penalizado)');
ok(scoreApart === 0, 'separando Ana|Bob em grupos distintos zera a penalidade — histórico lido por uid');
// sem keyOf (identidade), o mesmo histórico uid-keyed NÃO casa nomes → score 0 (prova que o keyOf é o que faz o par bater)
var scoreNoKey = W._scoreShuffle(['Ana', 'Bob', 'Cadu', 'Dan'], t5.opponentHistory._default_, 4);
eq(scoreNoKey, 0, 'sem keyOf o par por nome não acha o histórico uid-keyed (confirma que a identidade vem do keyOf)');

console.log('════════════════════════════════════════');
console.log((fail === 0 ? '✅' : '❌') + ' fairness-uid-identity: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
