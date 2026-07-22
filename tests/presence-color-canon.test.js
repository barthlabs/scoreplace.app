// TRAVA DO CÂNONE DE CORES DE PRESENÇA (dono, jul/2026, com print):
//   "as cores dos presentes e ausentes (especialmente das duplas) está muito parecido. vamos adotar
//    tons de verde para presentes e tons de azul para ausentes. tons mais escuros para duplas, e mais
//    claros para individuais. isso está canonizado e precisa se manter canonizado ... sempre
//    consistente para qualquer torneio que use esses cards."
//
// Este teste TRAVA a regra pra ela não regredir em nenhum renderer:
//   • PRESENTE = verde   • AUSENTE = azul   • NUNCA vermelho pra ausente
//   • DUPLA ('pair') = tom ESCURO   • INDIVIDUAL ('solo') = tom CLARO   • os dois SÃO diferentes
//   • dupla só é VERDE quando os DOIS estão presentes; qualquer outro estado = AZUL (rótulo e cor
//     concordam — era a raiz do print: dupla "Ausente" aparecia VERDE por não pintar o pendente)
// Fonte única: window._PRESENCE_TONES / _presenceCardStyle / _presenceTextColor (store.js).
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('participants.js');   // _rollCallPresenceCtx

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const RED = /239\s*,\s*68\s*,\s*68|#ef4444|#f87171|#dc2626|127\s*,\s*29\s*,\s*29/;
const GREEN = /16\s*,\s*185\s*,\s*129|52\s*,\s*211\s*,\s*153|6\s*,\s*78\s*,\s*59|6\s*,\s*95\s*,\s*70/;
const BLUE = /59\s*,\s*130\s*,\s*246|96\s*,\s*165\s*,\s*250|30\s*,\s*58\s*,\s*138|23\s*,\s*37\s*,\s*84/;

// ── 1. a fonte única existe e respeita verde/azul ──
console.log('── fonte única de cores (store.js) ──');
ok(typeof W._presenceCardStyle === 'function', '_presenceCardStyle existe');
ok(typeof W._presenceTextColor === 'function', '_presenceTextColor existe');
['solo', 'pair'].forEach(scope => {
  const g = W._presenceCardStyle('present', scope);
  const b = W._presenceCardStyle('absent', scope);
  ok(GREEN.test(g) && !BLUE.test(g), 'PRESENTE/' + scope + ' é VERDE (e não azul)');
  ok(BLUE.test(b) && !GREEN.test(b), 'AUSENTE/' + scope + ' é AZUL (e não verde)');
  ok(!RED.test(b), 'AUSENTE/' + scope + ' NUNCA é vermelho');
  ok(!RED.test(g), 'PRESENTE/' + scope + ' NUNCA é vermelho');
});
// PARCIAL (dupla com 1 presente) = ÂMBAR, distinto de verde E de azul
const AMBER = /245\s*,\s*158\s*,\s*11|251\s*,\s*191\s*,\s*36|120\s*,\s*53\s*,\s*15|180\s*,\s*83\s*,\s*9/;
(function () {
  const pt = W._presenceCardStyle('partial', 'pair');
  ok(AMBER.test(pt), 'PARCIAL/pair é ÂMBAR');
  ok(!GREEN.test(pt) && !BLUE.test(pt), 'PARCIAL não se confunde com verde nem azul');
  ok(!RED.test(pt), 'PARCIAL nunca é vermelho');
  ok(pt !== W._presenceCardStyle('present', 'pair') && pt !== W._presenceCardStyle('absent', 'pair'),
     'PARCIAL é um tom PRÓPRIO (≠ presente e ≠ ausente)');
})();

// dupla ESCURA ≠ individual CLARA
ok(W._presenceCardStyle('present', 'pair') !== W._presenceCardStyle('present', 'solo'), 'PRESENTE: dupla (escuro) ≠ individual (claro)');
ok(W._presenceCardStyle('absent', 'pair') !== W._presenceCardStyle('absent', 'solo'), 'AUSENTE: dupla (escuro) ≠ individual (claro)');
// tom da dupla é de fato mais ESCURO (alpha do fundo maior / cor base mais fechada)
const _lum = (s) => { const m = s.match(/rgba\((\d+),(\d+),(\d+)/); return m ? (+m[1] + +m[2] + +m[3]) : 999; };
ok(_lum(W._presenceCardStyle('present', 'pair')) < _lum(W._presenceCardStyle('present', 'solo')), 'PRESENTE: tom da dupla é mais ESCURO que o individual');
ok(_lum(W._presenceCardStyle('absent', 'pair')) < _lum(W._presenceCardStyle('absent', 'solo')), 'AUSENTE: tom da dupla é mais ESCURO que o individual');

// ── 2. o factory de chamada aplica o cânone nos cards reais ──
console.log('\n── factory _rollCallPresenceCtx (cards reais) ──');
function mkT(checkedIn, absent) {
  return {
    id: 'COR1', format: 'Dupla Eliminatória', teamSize: 2, enrollmentMode: 'teams',
    participants: [], checkedIn: checkedIn || {}, absent: absent || {}, checkedInConfirmed: {},
    standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [],
  };
}
const PAIR = { p1Uid: 'a1', p1Name: 'A1', p2Uid: 'b1', p2Name: 'B1', displayName: 'A1 / B1', name: 'A1 / B1' };
const SOLO = { uid: 's1', displayName: 'S1', name: 'S1' };
const ctxOf = (t) => W._rollCallPresenceCtx(t, { isOrg: true, active: true });

// dupla com os DOIS presentes → VERDE escuro
let t = mkT({ a1: 1, b1: 1 });
let st = ctxOf(t).cardPresence(PAIR).styleExtra;
ok(GREEN.test(st) && !BLUE.test(st), 'dupla com os DOIS presentes → VERDE');
ok(st === W._presenceCardStyle('present', 'pair'), 'dupla presente usa o tom ESCURO de dupla');

// dupla com UM presente e outro ausente → ÂMBAR (parcial) — o caso do print
t = mkT({ a1: 1 }, { b1: 1 });
st = ctxOf(t).cardPresence(PAIR).styleExtra;
ok(st === W._presenceCardStyle('partial', 'pair'), '✅ dupla com 1 presente → ÂMBAR (parcial), não azul');
ok(st !== W._presenceCardStyle('absent', 'pair'), 'parcial NÃO é igual a "nenhum presente" (era o bug do print)');

// dupla com um ausente → AZUL escuro
t = mkT({}, { a1: 1, b1: 1 });
st = ctxOf(t).cardPresence(PAIR).styleExtra;
ok(BLUE.test(st) && !RED.test(st), 'dupla com os DOIS ausentes → AZUL (nunca vermelho)');

// dupla PENDENTE (ninguém marcado) → AZUL (era o bug do print: ficava VERDE)
t = mkT({}, {});
st = ctxOf(t).cardPresence(PAIR).styleExtra;
ok(BLUE.test(st), 'dupla NÃO marcada → AZUL (antes ficava sem cor e herdava o fundo VERDE do card)');
ok(st === W._presenceCardStyle('absent', 'pair'), 'dupla não marcada usa o tom ESCURO de ausente');

// individual presente → VERDE claro; ausente → AZUL claro.
// (a presença do SOLO é resolvida por _pName → chaveia pelo NOME neste mock; com uid o card
//  passa o uid e o _idMapHas resolve igual — o que importa aqui é o TOM aplicado por estado.)
t = mkT({ S1: 1 }); t.participants = [SOLO];
st = ctxOf(t).cardPresence(SOLO).styleExtra;
ok(st === W._presenceCardStyle('present', 'solo'), 'individual presente → VERDE tom CLARO');
ok(GREEN.test(st) && !BLUE.test(st), 'individual presente é VERDE mesmo');
t = mkT({}, { S1: 1 }); t.participants = [SOLO];
st = ctxOf(t).cardPresence(SOLO).styleExtra;
ok(st === W._presenceCardStyle('absent', 'solo'), 'individual ausente → AZUL tom CLARO');
ok(BLUE.test(st) && !RED.test(st), 'individual ausente é AZUL (nunca vermelho)');

// o texto do rótulo também segue o cânone (nada de vermelho)
t = mkT({}, { S1: 1 }); t.participants = [SOLO];
const row = ctxOf(t).cardPresence(SOLO).rowHtml;
ok(!RED.test(row.replace(/_woBtn[\s\S]*/, '')), 'rótulo "Ausente" não usa vermelho (o vermelho fica só no botão W.O.)');

console.log('\n' + (fail === 0 ? '✅ presence-color-canon: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
