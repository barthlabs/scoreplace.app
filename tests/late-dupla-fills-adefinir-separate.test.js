// INTEGRAÇÃO TARDIA (dono, SB Casais 20/jul): duas duplas PRÉ-FORMADAS que estavam AUSENTES (foram
// pra espera no sorteio "só entre os presentes") voltam PRESENTES — UMA DE CADA VEZ (cada render
// integra a que está presente). A 2ª deve PREENCHER o "a definir" (jogo sem adversário) que a 1ª
// abriu — NÃO abrir um 2º jogo "vs a definir". Regra do dono: "cria jogo novo sem adversário SÓ se
// não houver jogo sem adversário". Bug: _fillRepFillWithLateDuplas só pegava duplas `_lateJoin`
// (formadas TARDE); as pré-formadas ausentes-→-presentes (sem `_lateJoin`) escapavam → cada uma
// abria seu próprio "vs a definir". Fix v1.3.87: incluir duplas pré-formadas PRESENTES.
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {}, isOrganizer: () => true, isCreator: () => true, currentUser: { uid: 'org' } };
load('identity-core.js');
load('tournaments-draw.js');
sandbox._displayNameForUid = (uid, fb) => uid ? ('P_' + uid) : (fb || '');
sandbox._pName = (p, fb) => {
  if (!p) return fb || '';
  if (typeof p === 'string') return p;
  if (p.p1Name || p.p2Name) { const n1 = p.p1Name || '', n2 = p.p2Name || ''; if (n1 && n2) return n1 + ' / ' + n2; }
  return p.displayName || p.name || fb || '';
};

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

// base: 4 duplas reais → R0 com 2 jogos (chave limpa pow2), + final. Sem "a definir" no início.
function base() {
  const real = [];
  for (let i = 1; i <= 4; i++) real.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i });
  const dn = i => real[i - 1].displayName;
  return {
    id: 'T', format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams', lateEnrollment: 'expand',
    currentPhaseIndex: 0, combinedCategories: [],
    participants: real.slice(), teamOrigins: {},
    checkedIn: {}, absent: {},
    standbyParticipants: [], waitlist: [],
    matches: [
      { id: 'g0', round: 0, bracket: 'main', phaseIndex: 0, p1: dn(1), p2: dn(2), winner: null, nextMatchId: 'f', nextSlot: 'p1' },
      { id: 'g1', round: 0, bracket: 'main', phaseIndex: 0, p1: dn(3), p2: dn(4), winner: null, nextMatchId: 'f', nextSlot: 'p2' },
      { id: 'f', round: 1, bracket: 'main', phaseIndex: 0, p1: 'TBD', p2: 'TBD', winner: null }
    ]
  };
}
// integra o que está na espera E presente (mesma ordem/funções que a CF roda)
function integrate(t) {
  W._fillRepFillWithLateDuplas(t);
  W._createExtraGamesFromWaitlist(t);
}
function markPresent(t, pair) { [pair.p1Uid, pair.p2Uid].forEach(u => { t.checkedIn[u] = Date.now(); }); }
const BYE = W._t('bui.byeLabel');
const r0games = t => t.matches.filter(m => m && m.round === 0);
const isEmpty = v => !v || v === 'TBD' || v === BYE;

// ── cenário do dono: P1 chega, depois P2 chega (SEPARADO) ──
console.log('── duplas pré-formadas ausentes→presentes, uma de cada vez ──');
const t = base();
const P1 = { p1Uid: 'p1a', p1Name: 'Eduardo', p2Uid: 'p1b', p2Name: 'Ciça', displayName: 'Eduardo / Ciça', name: 'Eduardo / Ciça' };
const P2 = { p1Uid: 'p2a', p1Name: 'Marcello', p2Uid: 'p2b', p2Name: 'Karla', displayName: 'Marcello / Karla', name: 'Marcello / Karla' };
t.standbyParticipants.push(P1, P2); // ambas na espera (eram ausentes)

// 1) só P1 presente → integra
markPresent(t, P1);
integrate(t);
const afterP1_open = r0games(t).filter(m => (m.p1 === P1.displayName && isEmpty(m.p2)) || (m.p2 === P1.displayName && isEmpty(m.p1)));
ok(afterP1_open.length === 1, 'P1 sozinha presente → abre 1 jogo "P1 vs a definir" (got ' + afterP1_open.length + ')');

// 2) agora P2 presente → integra (deve PREENCHER o "a definir" da P1)
markPresent(t, P2);
integrate(t);

const bothTogether = r0games(t).filter(m => (m.p1 === P1.displayName && m.p2 === P2.displayName) || (m.p2 === P1.displayName && m.p1 === P2.displayName));
const p2Orphan = r0games(t).filter(m => (m.p1 === P2.displayName && isEmpty(m.p2)) || (m.p2 === P2.displayName && isEmpty(m.p1)));
const p1Orphan = r0games(t).filter(m => (m.p1 === P1.displayName && isEmpty(m.p2)) || (m.p2 === P1.displayName && isEmpty(m.p1)));

ok(bothTogether.length === 1, 'P2 PREENCHEU o "a definir" da P1 → 1 jogo "Eduardo/Ciça vs Marcello/Karla" (got ' + bothTogether.length + ')');
ok(p2Orphan.length === 0, 'NÃO abriu jogo novo "P2 vs a definir" (got ' + p2Orphan.length + ')');
ok(p1Orphan.length === 0, 'o "a definir" da P1 foi preenchido (0 órfão de P1, got ' + p1Orphan.length + ')');

// ambas viraram inscritas e saíram da espera
const names = (t.participants || []).map(p => p.displayName || p.name);
ok(names.indexOf(P1.displayName) !== -1 && names.indexOf(P2.displayName) !== -1, 'P1 e P2 viraram inscritas');
ok((t.standbyParticipants || []).length === 0 && (t.waitlist || []).length === 0, 'espera vazia (nenhuma re-processável)');

console.log('\n' + (fail === 0 ? '✅ late-dupla-fills-adefinir-separate: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
