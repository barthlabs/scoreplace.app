/* TODOS OS W.O.s DO GRUPO SÃO INDICADOS — NÃO SÓ O ÚLTIMO (2.0.53)
 * node tests/todos-os-wos-do-grupo-indicados.test.js
 *
 * Ordem do dono (24/ago/2026, print do Grupo A do Confra — 3 substituições, UMA pílula):
 *   _"apliquei 2 wo num grupo e cade eles indicados. todos os wos num grupo devem ser
 *    indicados."_
 *
 * O estado do grupo (`woAbsent`/`subName`) é slot ÚNICO; a lista completa sai de
 * `_ligaGroupWoList`: traces `woSubstituteFor` de quem ENTROU + a CADEIA (o ausente de
 * hoje pode ter entrado ontem por W.O. de outro: Denise→Carol→Karla) + o estado atual
 * (cobre suplente sem trace — Jogador X). Cenário espelha o Grupo A real (anonimizado).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
win._nameForUid = (u) => ({ uc: 'Carol', ub: 'Bruna', uk: 'Karla' }[u] || '');
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
win.document = globalThis.document;
new Function('window', 'document', fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8'))(win, globalThis.document);

ok(typeof win._ligaGroupWoList === 'function', 'falta window._ligaGroupWoList');

// grupo com CADEIA: Denise→Carol (velho), Claudia→Bruna, Carol→Karla (estado atual)
const t = {
  participants: [
    { uid: 'ue' }, { uid: 'uf' },
    { uid: 'ub', woSubstituteFor: 'Claudia', woSubstituteAt: '2026-08-24T14:40:00.000Z' },
    { uid: 'uk', woSubstituteFor: 'Carol',   woSubstituteAt: '2026-08-24T14:50:00.000Z' },
    { uid: 'uc', woSubstituteFor: 'Denise',  woSubstituteAt: '2026-08-10T10:00:00.000Z', ligaActive: false },
  ],
  rounds: [{ matches: [
    { isSitOut: true, sitOutReason: 'wo', p1: 'Denise',  team1Uids: ['ud'] },
    { isSitOut: true, sitOutReason: 'wo', p1: 'Claudia', team1Uids: ['ucl'] },
    { isSitOut: true, sitOutReason: 'wo', p1: 'Carol',   team1Uids: ['uc'] },
  ] }],
};
const g = {
  name: 'R1 Grupo A',
  players: ['Edu', 'Bruna', 'Fê', 'Karla'], playersUids: ['ue', 'ub', 'uf', 'uk'],
  woAbsent: 'Carol', woAbsentUid: 'uc', subName: 'Karla', subUid: 'uk', subStatus: 'filled',
};
const lista = win._ligaGroupWoList(t, g);
const pares = lista.map((p) => p.absentName + '→' + p.subName);
ok(lista.length === 3, 'deviam ser 3 W.O.s indicados, vieram ' + lista.length + ' [' + pares.join(' | ') + ']');
ok(pares.indexOf('Denise→Carol') !== -1, 'a CADEIA devia alcançar Denise→Carol: ' + pares.join(' | '));
ok(pares.indexOf('Claudia→Bruna') !== -1, 'faltou Claudia→Bruna: ' + pares.join(' | '));
ok(pares.indexOf('Carol→Karla') !== -1, 'faltou Carol→Karla (o atual): ' + pares.join(' | '));
// mais antigo primeiro
ok(pares[0] === 'Denise→Carol', 'ordem: o mais antigo vem primeiro, veio ' + pares[0]);
// uid do ausente vem do marcador (uid-first)
const den = lista.find((p) => p.absentName === 'Denise');
ok(!!den && den.absentUid === 'ud', 'uid do ausente devia sair do marcador (ud): ' + JSON.stringify(den));

// suplente SEM trace (Jogador X) — só o estado do grupo o conhece
const g2 = {
  name: 'G2', players: ['A', 'B', 'C', 'Jogador X'], playersUids: ['ua2', 'ub2', 'uc2', null],
  woAbsent: 'Adele', woAbsentUid: 'uad', subName: 'Jogador X', subStatus: 'filled', subIsGuest: true,
};
const l2 = win._ligaGroupWoList({ participants: [], rounds: [] }, g2);
ok(l2.length === 1 && l2[0].absentName === 'Adele' && l2[0].subName === 'Jogador X',
  'estado sem trace (Jogador X) devia render 1 par Adele→Jogador X: ' + JSON.stringify(l2));

// grupo sem W.O. nenhum → lista vazia
ok(win._ligaGroupWoList(t, { name: 'X', players: ['Edu'], playersUids: ['ue'] }).length === 0,
  'grupo sem W.O. devia dar lista vazia');

console.log('\ntodos-os-wos-do-grupo-indicados: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
