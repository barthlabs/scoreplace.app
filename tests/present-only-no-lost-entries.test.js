// "SÓ ENTRE OS PRESENTES" NÃO PODE PERDER/DUPLICAR NINGUÉM (dono, SB Casais 20/jul: "escolhi só
// entre os presentes e meteu os ausentes na chave — e pior, uns ausentes entraram e outros sumiram").
// RAIZ: entrada FICTÍCIA {p1Name:'X'} (nome em p1Name, SEM displayName nem uid) → _entryIdKey='' e
// _soloNameOf='' → (a) pill de nome VAZIA no painel de sem-dupla; (b) o move por CHAVE tinha guard
// `if(k)` que pulava a chave vazia → a entrada NÃO saía de participants MAS ia pra waitlist →
// DUPLICADA → o ausente entrava na chave. Fix v1.3.90: move por REFERÊNCIA + _nameOf/_soloNameOf/
// _entryIdKey resolvem p1Name/uid. Este teste trava as 3 coisas.
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
load('identity-core.js');
load('draw-decisions.js');
load('tournaments-draw-prep.js');
sandbox._displayNameForUid = (u, fb) => u ? ('Perfil_' + u) : (fb || '');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

// ── nomes resolvem (nada de pill vazia) ──
ok(W._soloNameOf({ uid: 'u1' }) === 'Perfil_u1', 'nome de solo só-uid resolve pelo perfil (got ' + W._soloNameOf({ uid: 'u1' }) + ')');
ok(W._soloNameOf({ p1Name: 'Fic A' }) === 'Fic A', 'nome de fictício {p1Name} resolve (got ' + W._soloNameOf({ p1Name: 'Fic A' }) + ')');
ok(W._soloNameOf({ displayName: 'D' }) === 'D', 'nome por displayName resolve');
ok(W._entryIdKey({ p1Name: 'Fic A' }) !== '', 'chave de identidade do fictício NÃO é vazia (got ' + JSON.stringify(W._entryIdKey({ p1Name: 'Fic A' })) + ')');
ok(W._entryIdKey({ uid: 'u1' }) === 'uid:u1', 'chave de solo só-uid = uid');

// ── move: só-uid + fictícios misturados, presentes ficam, ausentes vão, TOTAL preservado ──
function build() {
  return { id: 'T', checkedIn: {}, absent: {}, waitlist: [], participants: [
    { uid: 'u1' }, { uid: 'u2' },                       // 2 reais
    { p1Name: 'Fic A' }, { p1Name: 'Fic B' }, { p1Name: 'Fic C' } // 3 fictícios (nome em p1Name)
  ] };
}
var t = build();
t.checkedIn.u1 = 1; t.checkedIn.u2 = 1; // só os 2 reais presentes
var before = t.participants.length;
var moved = W._moveAbsentToWaitlistForPresentDraw(t);
ok(moved === 3, 'moveu os 3 não-presentes (got ' + moved + ')');
ok(t.participants.length === 2, 'participants = só os 2 presentes (got ' + t.participants.length + ')');
ok(t.waitlist.length === 3, 'waitlist = os 3 fictícios (got ' + t.waitlist.length + ')');
ok((t.participants.length + t.waitlist.length) === before, 'TOTAL preservado — ninguém sumiu/duplicou (got ' + (t.participants.length + t.waitlist.length) + '/' + before + ')');
// nenhum fictício ficou nos DOIS lugares
var inParts = t.participants.map(p => W._soloNameOf(p));
ok(inParts.indexOf('Fic A') === -1 && inParts.indexOf('Fic B') === -1, 'nenhum fictício sobrou em participants (não vai pra chave)');

// ── idempotente: 2ª passada não move nem duplica ──
var m2 = W._moveAbsentToWaitlistForPresentDraw(t);
ok(m2 === 0, '2ª passada não move mais (idempotente)');
ok(t.waitlist.length === 3, 'waitlist NÃO duplicou na 2ª passada (got ' + t.waitlist.length + ')');

// ── dupla estrutural {p1Uid,p2Uid} sem nome (doc real): presença por membro, move certo ──
var t2 = { id: 'T2', checkedIn: {}, absent: {}, waitlist: [], participants: [
  { p1Uid: 'a1', p2Uid: 'b1' }, { p1Uid: 'a2', p2Uid: 'b2' }, { p1Uid: 'a3', p2Uid: 'b3' }
] };
t2.checkedIn.a1 = 1; t2.checkedIn.b1 = 1; // dupla1 presente; dupla2 sem marca; dupla3 sem marca
var mv2 = W._moveAbsentToWaitlistForPresentDraw(t2);
ok(mv2 === 2 && t2.participants.length === 1 && t2.waitlist.length === 2, 'duplas só-uid: 1 presente fica, 2 vão pra espera, total preservado (parts=' + t2.participants.length + ' wl=' + t2.waitlist.length + ')');

console.log('\n' + (fail === 0 ? '✅ present-only-no-lost-entries: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
