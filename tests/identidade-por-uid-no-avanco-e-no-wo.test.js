/* NADA POR NOME — SÓ uid (a menos que seja digitado sem uid)
 *
 * Ordem do dono (24/ago/2026): _"nada por nome porra. só uid. a menos que seja digitado sem
 * uid."_ Dita olhando a leva 2.0.36 (avanço de fase), que ainda decidia identidade por nome
 * em dois pontos. Nos dois o defeito é REAL, não estilo:
 *
 * ① A decisão "Excluir definitivamente" precisa atingir só as entradas que o painel mostrou.
 *    O save STRIPA o nome de toda entrada com uid, então nome não pode ser a chave: dois
 *    nomes ausentes nunca podem remover todo o elenco por acidente.
 *
 * ② `_ligaWoDeactivate` procurava a pessoa no elenco pelo NOME EXIBIDO (que é resolvido do
 *    perfil vivo e MUDA quando ela se renomeia). Sem casar, o `else` empurrava uma entrada
 *    NOVA com o nome: a mesma pessoa duas vezes no elenco (uma só-uid, outra só-nome) —
 *    inscrito fantasma e +1 na contagem. Os 4 pontos de chamada já calculavam o uid
 *    (`_woAbsentUidOf`) antes de mexer no slot; agora ele viaja junto.
 *
 * A REGRA: tem uid → SÓ uid decide. Sem uid dos dois lados (nome digitado/fictício) → aí o
 * nome é a identidade. Nunca uid de um lado casando com nome do outro.
 */
const fs = require('fs'), path = require('path');
const { window: W, sandbox, load } = require('./headless');
const ROOT = path.join(__dirname, '..');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { style: {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };
sandbox.AppStore = { tournaments: [], currentUser: null, logAction: () => {}, sync: () => {} };
load('identity-core.js');
load('tournaments.js');
load('tournaments-draw-prep.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
console.log('──── identidade por uid: avanço de fase e W.O. ────');

// ── ① "Excluir definitivamente" remove SÓ quem o painel mostrou ───────────────────────
// Elenco no formato REAL de produção: entradas só-uid (nome stripado no save).
const t = { id: 'sb', currentPhaseIndex: 0, allowSelfDeactivation: true, phases: [{}, {}],
  standbyParticipants: [], participants: [
    { uid: 'u1' },                      // ativo, só-uid
    { uid: 'u2' },                      // ativo, só-uid
    { uid: 'u3', ligaActive: false },   // inativo por escolha
    { name: 'Zé Digitado', ligaActive: false },   // sem conta: aqui o nome É a identidade
  ] };
W._findTournamentById = () => t;
W.FirestoreDB = { saveTournament: () => Promise.resolve() };
W._advanceMultiPhase = () => {};
W._resolvePhaseInactives('sb', 'remove');
ok(t.participants.length === 2, 'os dois inativos saíram do roster (got ' + t.participants.length + ')');
ok(t.participants[0].uid === 'u1' && t.participants[1].uid === 'u2',
  '  → e os ativos só-uid não foram tocados');
ok(!t.participants.some((p) => p.uid === 'u3' || p.name === 'Zé Digitado'),
  '  → inclusive o fictício sem conta saiu pela referência correta');
ok(!t.phases[1]._includeInactive, '  → ninguém foi incluído na fase seguinte');

// ── ② o W.O. acha a pessoa pelo uid, mesmo com o nome trocado ────────────────────────
const liga = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
ok(/function _ligaWoDeactivate\(ft, absentName, absentUid\)/.test(liga),
  '_ligaWoDeactivate recebe o uid de quem levou W.O.');
const _nChamadas = (liga.match(/_ligaWoDeactivate\(ft, absentName, _absU/g) || []).length;
ok(_nChamadas === 4,
  '  → e os 4 pontos de aplicação passam o uid que já calcularam (got ' + _nChamadas + ')');
ok(/TEM uid → só o uid decide/.test(liga),
  '  → com uid, só o uid decide quem é');
ok(/if \(!_uidsDe\(_p\)\.length && _wlDisplay\(_p\) === absentName\)/.test(liga),
  '  → o nome só casa entre entradas SEM uid (digitado/fictício)');
ok(/if \(_u\) _nova\.uid = _u;/.test(liga),
  '  → e a entrada criada pra quem veio da fila nasce COM uid (senão conta 2× nos inscritos)');

// ── ③ ninguém no avanço de fase inventa uma segunda regra de "é a mesma pessoa" ──────
const eng = fs.readFileSync(path.join(ROOT, 'js', 'views', 'phases-engine.js'), 'utf8');
ok(/_waitlistPushBack\(t, tm\)/.test(eng), 'storePhase usa a porta canônica da espera');
ok(!/displayName \|\| tm\.name/.test(eng.slice(eng.indexOf('built.waitlist.forEach'), eng.indexOf('built.waitlist.forEach') + 900)),
  '  → e não tem dedup própria por nome ao lado dela');

console.log(fail === 0
  ? '\n✅ identidade-por-uid-no-avanco-e-no-wo: OK (' + pass + ')'
  : '\n❌ identidade-por-uid-no-avanco-e-no-wo: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
